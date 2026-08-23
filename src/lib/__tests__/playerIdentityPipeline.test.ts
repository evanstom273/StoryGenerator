import { describe, expect, it } from "vitest";
import type { StoryMessage } from "../../types/models";
import {
	isValidPlayerSceneName,
	formatPlayerPrimaryAliasNamingPolicy,
	resolveEffectivePlayerIdentity,
	resolvePlayerCharacterSceneName,
	resolvePrimaryPlayerAlias,
} from "../playerCharacterPrompt";
import {
	inferExplicitPlayerSceneRenameFromDirectorNotes,
	inferPlayerSceneNameFromDirectorNotes,
} from "../storyText/playerSceneName";
import {
	mergeStoryLocalPlayerIdentityIntoState,
	repairCorruptedPlayerIdentityInStoryState,
} from "../storyStateV2";
import { formatPlayerCharacterIdentityForPrompt } from "../playerCharacterPrompt";

const jamieCharacter = {
	name: "James Peralta",
	aliases: ["Jamie"],
	pronouns: "he/him",
	gender: "male",
	species: "human",
	age: "15",
};

function directorNote(content: string, id = "dn"): StoryMessage {
	return {
		id,
		storyId: "story-1",
		role: "user",
		content,
		speakerType: "director",
		timestamp: "2026-08-22T00:00:00.000Z",
	};
}

describe("player identity pipeline", () => {
	describe("isValidPlayerSceneName", () => {
		it("rejects narration tokens used as pseudo-speakers", () => {
			expect(isValidPlayerSceneName("The")).toBe(false);
			expect(isValidPlayerSceneName("Saturday")).toBe(false);
			expect(isValidPlayerSceneName("Jamie")).toBe(true);
			expect(isValidPlayerSceneName("Lyra")).toBe(true);
		});
	});

	describe("corrupted story state recovery", () => {
		const corruptedState = {
			updatedAt: "2026-08-22T00:00:00.000Z",
			characters: {
				"James Peralta": {
					displayName: "The",
					pronouns: "he/him",
				},
			},
			worldFacts: [],
			unresolvedThreads: [],
		};

		it("ignores invalid displayName and resolves Jamie from the character sheet", () => {
			expect(
				resolvePlayerCharacterSceneName(jamieCharacter, {
					storyState: corruptedState,
				}),
			).toBe("Jamie");
		});

		it("repairs corrupted displayName from persisted story state", () => {
			const { state, changed } = repairCorruptedPlayerIdentityInStoryState(
				corruptedState,
				jamieCharacter,
			);
			expect(changed).toBe(true);
			expect(state?.characters?.["James Peralta"]?.displayName).toBeUndefined();
		});

		it("repairs legal-name-token displayName when the sheet alias is Jamie", () => {
			const { state, changed } = repairCorruptedPlayerIdentityInStoryState(
				{
					updatedAt: "2026-08-22T00:00:00.000Z",
					characters: {
						"James Peralta": {
							displayName: "James",
							pronouns: "he/him",
						},
					},
					worldFacts: [],
					unresolvedThreads: [],
				},
				jamieCharacter,
			);
			expect(changed).toBe(true);
			expect(state?.characters?.["James Peralta"]?.displayName).toBeUndefined();
		});

		it("prefers Jamie over story-state displayName James for James Peralta", () => {
			expect(
				resolvePlayerCharacterSceneName(jamieCharacter, {
					storyState: {
						updatedAt: "2026-08-22T00:00:00.000Z",
						characters: {
							"James Peralta": {
								displayName: "James",
								pronouns: "he/him",
							},
						},
						worldFacts: [],
						unresolvedThreads: [],
					},
				}),
			).toBe("Jamie");
		});

		it("prefers sheet primary alias over story-state aliases that are legal-name fragments", () => {
			expect(
				resolvePlayerCharacterSceneName(jamieCharacter, {
					storyState: {
						updatedAt: "2026-08-22T00:00:00.000Z",
						characters: {
							"James Peralta": {
								aliases: ["James"],
							},
						},
						worldFacts: [],
						unresolvedThreads: [],
					},
				}),
			).toBe("Jamie");
		});

		it("does not persist invalid scene names back into story state", () => {
			const merged = mergeStoryLocalPlayerIdentityIntoState(corruptedState, jamieCharacter, {
				sceneName: "The",
				pronouns: "he/him",
				hasInStoryTransition: true,
			});
			expect(merged).toBe(corruptedState);
		});

		it("keeps valid in-story renames in story state", () => {
			const merged = mergeStoryLocalPlayerIdentityIntoState(
				{
					...corruptedState,
					characters: {},
				},
				jamieCharacter,
				{
					sceneName: "Lyra",
					pronouns: "she/her",
					hasInStoryTransition: true,
				},
			);
			expect(merged?.characters?.["James Peralta"]?.displayName).toBe("Lyra");
		});
	});

	describe("director notes must not infer identity from prose", () => {
		it("keeps Jamie when director note opens with The", () => {
			const messages = [
				directorNote(
					"Director: *The front door bangs open violently. Jamie sprints in, breathing heavily.*",
				),
			];
			expect(
				resolveEffectivePlayerIdentity(jamieCharacter, { recentMessages: messages }).sceneName,
			).toBe("Jamie");
		});

		it("keeps Jamie when director note mentions Saturday afternoon", () => {
			const messages = [
				directorNote(
					"Director: *it's a Saturday afternoon. Jake, Amy and Mac are in the living room.*",
				),
			];
			expect(
				resolveEffectivePlayerIdentity(jamieCharacter, { recentMessages: messages }).sceneName,
			).toBe("Jamie");
		});

		it("keeps Jamie for ordinary director staging that names Jamie in prose", () => {
			const messages = [
				directorNote(
					'*Jamie catches his breath slightly, breathing deeply. He collapses towards Jake, a sob escaping his lips ("I... she... Took her...")*',
				),
			];
			expect(
				resolveEffectivePlayerIdentity(jamieCharacter, { recentMessages: messages }).sceneName,
			).toBe("Jamie");
		});

		it("does not infer scene name from protagonist-verb prose without explicit rename", () => {
			const messages = [
				directorNote(
					'*Lyra finally pulls back from her parents, wiping her eyes on her sleeve ("Mac. Come here...")*',
				),
			];
			expect(
				inferPlayerSceneNameFromDirectorNotes(messages, "James Peralta", "Jamie"),
			).toBeNull();
		});
	});

	describe("explicit rename events", () => {
		it("accepts call me Lyra from director notes", () => {
			const messages = [directorNote('*Jamie smiles.* "Call me Lyra."')];
			expect(
				inferExplicitPlayerSceneRenameFromDirectorNotes(messages, "James Peralta", "Jamie"),
			).toBe("Lyra");
		});

		it("accepts Lyra from coming-out transcript dialogue", () => {
			const messages: StoryMessage[] = [
				{
					id: "27",
					storyId: "story-1",
					role: "assistant",
					content:
						'Jamie: "Lyra... that\'s my... name."\nAmy: *She eases back to look at her daughter\'s face.*',
					speakerType: "assistant",
					timestamp: "2026-08-21T00:07:00.000Z",
				},
			];
			expect(
				resolveEffectivePlayerIdentity(jamieCharacter, { recentMessages: messages }).sceneName,
			).toBe("Lyra");
		});

		it("uses Lyra from valid story-state displayName on existing renamed stories", () => {
			expect(
				resolveEffectivePlayerIdentity(jamieCharacter, {
					storyState: {
						updatedAt: "2026-08-21T00:00:00.000Z",
						characters: {
							"James Peralta": {
								displayName: "Lyra",
								pronouns: "she/her",
							},
						},
						worldFacts: [],
						unresolvedThreads: [],
					},
				}).sceneName,
			).toBe("Lyra");
		});
	});

	describe("primary alias naming policy", () => {
		it("resolves Jamie as the primary alias from the character sheet", () => {
			expect(resolvePrimaryPlayerAlias(jamieCharacter)).toBe("Jamie");
		});

		it("documents legal-name reservation in prompt policy", () => {
			const policy = formatPlayerPrimaryAliasNamingPolicy(jamieCharacter, "Jamie");
			expect(policy).toContain('Primary alias (default): "Jamie"');
			expect(policy).toContain('Legal/full name: "James Peralta"');
			expect(policy).toContain("official documents");
			expect(policy).toContain("Director note realization");
		});
	});

	describe("prompt construction uses canonical identity", () => {
		it("sends Jamie in the player character prompt fragment, not The", () => {
			const identity = resolveEffectivePlayerIdentity(jamieCharacter, {
				storyState: {
					updatedAt: "2026-08-22T00:00:00.000Z",
					characters: {
						"James Peralta": { displayName: "The", pronouns: "he/him" },
					},
					worldFacts: [],
					unresolvedThreads: [],
				},
				recentMessages: [
					directorNote("*Jamie catches his breath slightly, breathing deeply.*"),
				],
			});

			const prompt = formatPlayerCharacterIdentityForPrompt(
				jamieCharacter,
				identity.sceneName,
				identity.pronouns,
			);

			expect(identity.sceneName).toBe("Jamie");
			expect(prompt).toContain("Jamie");
			expect(prompt).not.toContain("Player Character (preferred scene name): The");
		});
	});

	describe("multiple director notes", () => {
		it("stays Jamie across stacked ordinary director notes", () => {
			const messages = [
				directorNote(
					"Director: *The front door bangs open violently. Jamie sprints in.*",
					"1",
				),
				directorNote(
					"Director: *it's a Saturday afternoon. Jake, Amy and Mac are in the living room.*",
					"2",
				),
				directorNote(
					'*Jamie catches his breath slightly, breathing deeply. He collapses towards Jake.*',
					"3",
				),
			];
			expect(
				resolveEffectivePlayerIdentity(jamieCharacter, { recentMessages: messages }).sceneName,
			).toBe("Jamie");
		});
	});

	describe("fresh stories", () => {
		it("defaults to Jamie with no story state and no messages", () => {
			expect(resolveEffectivePlayerIdentity(jamieCharacter, {}).sceneName).toBe("Jamie");
		});
	});
});
