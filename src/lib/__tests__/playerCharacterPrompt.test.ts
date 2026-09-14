import { describe, expect, it } from "vitest";
import {
	formatPlayerCharacterAliasesForPrompt,
	formatPlayerCharacterIdentityForPrompt,
	formatPlayerPrimaryAliasNamingPolicy,
	formatPlayerCharacterKnownTiesForPrompt,
	formatPlayerCharacterPronounAndNamingRules,
	formatCharacterKnownTiesConstraint,
	formatAntiCanonSprawlGuidance,
	buildPlayerNameForValidation,
	getPlayerCharacterNameVariants,
	normalizePlayerCharacterAliases,
	normalizePlayerCharacterKnownTies,
	resolveEffectivePlayerIdentity,
	resolveEffectivePlayerPronouns,
	resolvePlayerCharacterPreferredSceneName,
} from "../playerCharacterPrompt";
import type { StoryMessage } from "../../types/models";

describe("resolvePlayerCharacterPreferredSceneName", () => {
	it("prefers the first alias over the legal name", () => {
		expect(
			resolvePlayerCharacterPreferredSceneName({
				name: "James Peralta",
				aliases: ["Jamie", "Static"],
			}),
		).toBe("Jamie");
	});

	it("uses the first name token when the legal name has multiple parts and no aliases exist", () => {
		expect(
			resolvePlayerCharacterPreferredSceneName({
				name: "James Peralta",
				aliases: [],
			}),
		).toBe("James");
	});

	it("uses Jamie as the default scene name for Jamie Peralta", () => {
		expect(
			resolvePlayerCharacterPreferredSceneName({
				name: "Jamie Peralta",
				aliases: [],
			}),
		).toBe("Jamie");
	});
});

describe("getPlayerCharacterNameVariants", () => {
	it("includes legal name, aliases, and name tokens", () => {
		expect(
			getPlayerCharacterNameVariants({
				name: "James Peralta",
				aliases: ["Jamie", "Static"],
			}),
		).toEqual(expect.arrayContaining(["James Peralta", "Jamie", "Static", "James", "Peralta"]));
	});
});

describe("buildPlayerNameForValidation", () => {
	it("includes sheet aliases for transcript validation", () => {
		expect(
			buildPlayerNameForValidation({
				name: "James Peralta",
				aliases: ["Jamie", "Static"],
			}),
		).toBe("James Peralta (Jamie, Static)");
	});
});

describe("resolveEffectivePlayerIdentity", () => {
	const jamieCharacter = {
		name: "James Peralta",
		aliases: ["Jamie"],
		pronouns: "he/him",
		gender: "male",
		species: "human",
		age: "15",
	};

	it("does not let unverified story-state identity override the character sheet", () => {
		const identity = resolveEffectivePlayerIdentity(jamieCharacter, {
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
		});

		expect(identity.sceneName).toBe("Jamie");
		expect(identity.pronouns).toBe("he/him");
		expect(identity.hasInStoryTransition).toBe(false);
	});

	it("ignores assistant identity dialogue and untargeted Director prose", () => {
		const messages: StoryMessage[] = [
			{
				id: "23",
				storyId: "story-1",
				role: "assistant",
				content: 'Jamie: "I know. I\'m trans. I\'m your daughter."',
				speakerType: "assistant",
				timestamp: "2026-08-21T00:06:00.000Z",
			},
			{
				id: "27",
				storyId: "story-1",
				role: "assistant",
				content:
					'Jamie: "Lyra... that\'s my... name."\nAmy: *She eases back to look at her daughter\'s face.*',
				speakerType: "assistant",
				timestamp: "2026-08-21T00:07:00.000Z",
			},
			{
				id: "34",
				storyId: "story-1",
				role: "assistant",
				content:
					'Lyra: *He takes a breath and looks Mac in the eye.* "I realized I\'m actually a big sister."',
				speakerType: "assistant",
				timestamp: "2026-08-21T00:20:00.000Z",
			},
			{
				id: "35",
				storyId: "story-1",
				role: "user",
				content: "*Lyra smiles at Ellie.*",
				speakerType: "director",
				timestamp: "2026-08-21T00:21:00.000Z",
			},
		];

		const identity = resolveEffectivePlayerIdentity(jamieCharacter, { recentMessages: messages });

		expect(identity.sceneName).toBe("Jamie");
		expect(identity.pronouns).toBe("he/him");
		expect(identity.hasInStoryTransition).toBe(false);
	});

	it("accepts explicit player-authored pronoun changes without requiring a name prefix", () => {
		const identity = resolveEffectivePlayerIdentity(jamieCharacter, {
			recentMessages: [{
				id: "36",
				storyId: "story-1",
				role: "user",
				speakerType: "player",
				content: "I want to use she/her now.",
				timestamp: "2026-08-22T00:00:00.000Z",
			}],
		});

		expect(identity.sceneName).toBe("Jamie");
		expect(identity.pronouns).toBe("she/her");
		expect(identity.hasInStoryTransition).toBe(true);
	});

	it("uses a provenance-tagged story-local identity override for long histories", () => {
		const identity = resolveEffectivePlayerIdentity(
			{ ...jamieCharacter, id: "player-1" },
			{
				storyState: {
					updatedAt: "2026-08-22T00:00:00.000Z",
					characters: {},
					worldFacts: [],
					unresolvedThreads: [],
					playerIdentityOverride: {
						playerCharacterId: "player-1",
						sourceMessageId: "message-9",
						source: "player_turn",
						sceneName: "Lyra",
						pronouns: "she/her",
					},
				},
			},
		);
		expect(identity.sceneName).toBe("Lyra");
		expect(identity.pronouns).toBe("she/her");
		expect(identity.sourceMessageId).toBe("message-9");
	});
});

describe("resolveEffectivePlayerPronouns", () => {
	it("prefers canonical profile pronouns over unverified story-state pronouns", () => {
		expect(
			resolveEffectivePlayerPronouns(
				{
					name: "James Peralta",
					aliases: ["Jamie"],
					pronouns: "he/him",
				},
				{
					sceneName: "Lyra",
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
				},
			),
		).toBe("he/him");
	});
});

describe("formatPlayerCharacterIdentityForPrompt", () => {
	it("mandates primary alias and pronouns", () => {
		const prompt = formatPlayerCharacterIdentityForPrompt({
			name: "James Peralta",
			aliases: ["Jamie", "Static"],
			pronouns: "they/them",
			gender: "non-binary",
			species: "human",
			age: "16",
		});

		expect(prompt).toContain("preferred scene name): Jamie");
		expect(prompt).toContain('Primary alias (default): "Jamie"');
		expect(prompt).toContain("Legal/full name: James Peralta");
		expect(prompt).toContain("Player Pronouns: they/them");
		expect(prompt).toContain("NEVER infer pronouns");
		expect(prompt).toContain("Never write he/him/his or she/her/hers");
	});

	it("states primary alias naming policy for characters with aliases", () => {
		const policy = formatPlayerPrimaryAliasNamingPolicy({
			name: "James Peralta",
			aliases: ["Jamie"],
		});
		expect(policy).toContain("official documents");
		expect(policy).toContain("Director note realization");
	});

	it("surfaces in-story identity overrides for coming-out transitions", () => {
		const prompt = formatPlayerCharacterIdentityForPrompt(
			{
				name: "James Peralta",
				aliases: ["Jamie"],
				pronouns: "he/him",
				gender: "trans girl",
				species: "human",
				age: "15",
			},
			"Lyra",
			"she/her",
		);

		expect(prompt).toContain("current in-story identity): Lyra (she/her)");
		expect(prompt).toContain("In-story identity transitions override the character sheet defaults");
		expect(prompt).toContain("Never write he/him/his for this character");
	});
});

describe("formatPlayerCharacterPronounAndNamingRules", () => {
	it("forbids full legal name in casual narration when an alias exists", () => {
		const rules = formatPlayerCharacterPronounAndNamingRules({
			name: "James Peralta",
			aliases: ["Jamie"],
			pronouns: "they/them",
		});

		expect(rules).toContain('"Jamie"');
		expect(rules).toContain('Legal/full name: "James Peralta"');
		expect(rules).toContain("official documents");
	});
});

describe("normalizePlayerCharacterAliases", () => {
	it("returns an empty array for missing or invalid values", () => {
		expect(normalizePlayerCharacterAliases(undefined)).toEqual([]);
		expect(normalizePlayerCharacterAliases("Jamie")).toEqual([]);
	});

	it("trims, deduplicates, and caps aliases", () => {
		expect(
			normalizePlayerCharacterAliases([" Jamie ", "jamie", "Potter", "", "Mr Potter"]),
		).toEqual(["Jamie", "Potter", "Mr Potter"]);
	});
});

describe("formatPlayerCharacterAliasesForPrompt", () => {
	it("formats aliases while excluding the main name", () => {
		expect(
			formatPlayerCharacterAliasesForPrompt({
				name: "Harry Potter",
				aliases: ["Harry", "Potter", "Mr Potter"],
			}),
		).toBe("Also known as: Harry, Potter, Mr Potter");
	});

	it("returns null when no aliases remain", () => {
		expect(
			formatPlayerCharacterAliasesForPrompt({
				name: "Harry Potter",
				aliases: [],
			}),
		).toBeNull();
	});
});

describe("normalizePlayerCharacterKnownTies", () => {
	it("trims, deduplicates, and caps known ties", () => {
		expect(
			normalizePlayerCharacterKnownTies([
				" Jake Peralta — father ",
				"jake peralta — father",
				"Amy Santiago — mother",
			]),
		).toEqual(["Jake Peralta — father", "Amy Santiago — mother"]);
	});
});

describe("formatPlayerCharacterKnownTiesForPrompt", () => {
	it("formats known ties for story prompts", () => {
		expect(
			formatPlayerCharacterKnownTiesForPrompt({
				knownTies: ["Jake Peralta — father", "Amy Santiago — mother"],
			}),
		).toBe("Known ties: Jake Peralta — father; Amy Santiago — mother");
	});
});

describe("formatCharacterKnownTiesConstraint", () => {
	it("lists allowed canon references for generation", () => {
		const constraint = formatCharacterKnownTiesConstraint({
			knownTies: ["Jake Peralta — father"],
		});

		expect(constraint).toContain("Jake Peralta — father");
		expect(constraint).toContain("only these canon characters");
	});
});

describe("formatAntiCanonSprawlGuidance", () => {
	it("tightens guidance when known ties are provided", () => {
		expect(formatAntiCanonSprawlGuidance(true)).toContain("Only the Known ties");
		expect(formatAntiCanonSprawlGuidance(false)).toContain("No Known ties were specified");
	});
});
