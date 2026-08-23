import { describe, expect, it } from "vitest";
import {
	buildActiveSceneSpeakerRegistry,
	formatSceneSpeakerRegistryPrompt,
	injectSceneSpeakerRegistry,
} from "../sceneSpeakerRegistry";
import { resolveSemanticSpeakerAttribution } from "../../storyText/semanticSpeakerResolver";

describe("buildActiveSceneSpeakerRegistry", () => {
	it("uses structured active participants and excludes every player alias", () => {
		const registry = buildActiveSceneSpeakerRegistry({
			player: { canonicalName: "Rebecca", aliases: ["Rebecca", "Becca"] },
			storyState: {
				updatedAt: "2026-01-01T00:00:00.000Z",
				characters: {
					rebecca: { canonicalName: "Rebecca", aliases: ["Becca"] },
					rosa: { canonicalName: "Rosa Diaz", narrativeName: "Rosa" },
				},
				worldFacts: [],
				unresolvedThreads: [],
				scene: { activeParticipants: ["Becca", "Rosa"] },
			},
		});

		expect(registry.eligibleNonPlayerSpeakers).toEqual([
			expect.objectContaining({
				canonicalName: "Rosa",
				evidence: ["story_state_active_participant"],
			}),
		]);
	});

	it("uses recent parsed speaker ownership as scene evidence", () => {
		const registry = buildActiveSceneSpeakerRegistry({
			player: { canonicalName: "Rebecca", aliases: ["Becca"] },
			recentMessages: [
				{ role: "assistant", content: 'Rosa: *She folds her arms.* "Really?"' },
			],
			latestUserMessage: "I grin at her.",
		});

		expect(registry.eligibleNonPlayerSpeakers).toEqual([
			expect.objectContaining({ canonicalName: "Rosa" }),
		]);
	});

	it("keeps multiple evidenced NPCs so downstream repair can refuse ambiguity", () => {
		const registry = buildActiveSceneSpeakerRegistry({
			player: { canonicalName: "Rebecca", aliases: [] },
			recentMessages: [
				{
					role: "assistant",
					content: 'Rosa: "No."\n\nAmy: "Maybe."',
				},
			],
		});

		expect(registry.eligibleNonPlayerSpeakers.map((speaker) => speaker.canonicalName)).toEqual([
			"Amy",
			"Rosa",
		]);
	});

	it("falls back only when exactly one non-player identity is known", () => {
		const registry = buildActiveSceneSpeakerRegistry({
			player: { canonicalName: "Rebecca", aliases: [] },
			importedCharacters: [{ name: "Rosa", aliases: [] }],
		});

		expect(registry.eligibleNonPlayerSpeakers[0]?.evidence).toContain(
			"sole_known_non_player",
		);
	});

	it("constrains the resolver to the sole active NPC in the reported Rebecca/Rosa case", () => {
		const registry = buildActiveSceneSpeakerRegistry({
			player: { canonicalName: "Becca", aliases: ["Rebecca Alvarez", "Rebecca"] },
			storyState: {
				updatedAt: "2026-01-01T00:00:00.000Z",
				characters: {
					rebecca: { canonicalName: "Rebecca Alvarez", narrativeName: "Becca" },
					rosa: { canonicalName: "Rosa Diaz", narrativeName: "Rosa" },
				},
				worldFacts: [],
				unresolvedThreads: [],
				scene: { activeParticipants: ["Becca", "Rosa"] },
			},
		});
		const source =
			'Rebecca: *Her eyes trace the strap-on against Rebecca\'s hips.* "You look entirely too pleased with yourself right now."';
		const result = resolveSemanticSpeakerAttribution({
			text: source,
			player: {
				name: registry.player.canonicalName,
				aliases: registry.player.aliases,
			},
			eligibleSpeakers: registry.eligibleNonPlayerSpeakers.map((speaker) => ({
				name: speaker.canonicalName,
				aliases: speaker.aliases,
			})),
		});

		expect(registry.eligibleNonPlayerSpeakers.map((speaker) => speaker.canonicalName)).toEqual([
			"Rosa",
		]);
		expect(result.text).toBe(source.replace(/^Rebecca:/, "Rosa:"));
	});
});

describe("speaker registry prompt", () => {
	it("places the semantic ownership note immediately before the live user message", () => {
		const registry = buildActiveSceneSpeakerRegistry({
			player: { canonicalName: "Rebecca", aliases: ["Becca"] },
			importedCharacters: [{ name: "Rosa", aliases: [] }],
		});
		const messages = injectSceneSpeakerRegistry(
			[
				{ role: "system", content: "rules" },
				{ role: "assistant", content: "history" },
				{ role: "user", content: "live turn" },
			],
			registry,
			false,
		);

		expect(messages.map((message) => message.role)).toEqual([
			"system",
			"assistant",
			"system",
			"user",
		]);
		expect(messages[2]?.content).toContain("A Name: header owns both");
		expect(formatSceneSpeakerRegistryPrompt(registry, false)).toContain(
			"Rosa",
		);
	});
});
