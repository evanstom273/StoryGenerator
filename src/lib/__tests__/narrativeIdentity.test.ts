import { describe, expect, it } from "vitest";
import type { StoryStateData } from "../../types/models";
import {
	applyNarrativeIdentityToText,
	buildNarrativeIdentityRegistry,
	createNarrativeIdentityPromptContext,
	resolveNarrativeDisplayName,
	resolveNarrativeProtagonistName,
} from "../narrativeIdentity";
import { formatStoryLongTermMemoryForPrompt } from "../ai/storyStateExtractor";

const silasStoryState: StoryStateData = {
	updatedAt: "2026-08-07T18:00:00.000Z",
	characters: {
		"Silas Thorne": {
			canonicalName: "Silas Thorne",
			narrativeName: "Mark Owen",
			displayName: "Mark Owen",
			aliases: ["Mark Owen"],
		},
	},
	worldFacts: [],
	unresolvedThreads: [],
	summaries: {
		premise: "Silas Thorne orchestrates deadly games from the shadows.",
		currentSituation:
			"Witness 'Mark Owen' (Silas Thorne) vanished during a blackout in the briefing room.",
	},
	indexes: {
		characters: {
			silas: {
				name: "Silas Thorne",
				narrativeName: "Mark Owen",
				aliases: ["Mark Owen"],
				description: "Wealthy mastermind posing as witness Mark Owen.",
			},
		},
		relationships: [
			{
				a: "Jake Peralta",
				b: "Silas Thorne",
				tier: "nemesis",
				summary:
					"Jake is investigating Silas Thorne's murder scene, unaware that 'Mark Owen' is Silas Thorne.",
			},
		],
		openThreads: [
			{
				thread:
					"How did witness 'Mark Owen' (Silas Thorne) vanish from the briefing room during the blackout?",
			},
		],
	},
};

describe("narrativeIdentity", () => {
	it("uses the player scene name as narrative identity before reveal", () => {
		const registry = buildNarrativeIdentityRegistry({
			storyState: silasStoryState,
			playerCharacter: {
				name: "Silas Thorne",
				aliases: ["Mark Owen"],
			},
			messageCount: 22,
		});

		expect(
			resolveNarrativeProtagonistName(
				{ name: "Silas Thorne", aliases: ["Mark Owen"] },
				silasStoryState,
			),
		).toBe("Mark Owen");
		expect(resolveNarrativeDisplayName("Silas Thorne", registry, { messageCount: 22 })).toBe(
			"Mark Owen",
		);
	});

	it("redacts hidden canonical names from reader-facing summary text", () => {
		const registry = buildNarrativeIdentityRegistry({
			storyState: silasStoryState,
			playerCharacter: {
				name: "Silas Thorne",
				aliases: ["Mark Owen"],
			},
			messageCount: 22,
		});

		expect(
			applyNarrativeIdentityToText(
				"Jake is investigating Silas Thorne's murder scene, unaware that 'Mark Owen' is Silas Thorne.",
				registry,
				{ messageCount: 22 },
			),
		).toBe("Jake is investigating Mark Owen's murder scene");

		expect(
			applyNarrativeIdentityToText(
				"How did witness 'Mark Owen' (Silas Thorne) vanish from the briefing room?",
				registry,
				{ messageCount: 22 },
			),
		).toBe("How did witness Mark Owen vanish from the briefing room?");
	});

	it("shows the reveal format after identityRevealedAtMessage", () => {
		const revealedState: StoryStateData = {
			...silasStoryState,
			characters: {
				"Silas Thorne": {
					...silasStoryState.characters["Silas Thorne"],
					identityRevealedAtMessage: 20,
				},
			},
		};
		const registry = buildNarrativeIdentityRegistry({
			storyState: revealedState,
			playerCharacter: {
				name: "Silas Thorne",
				aliases: ["Mark Owen"],
			},
			messageCount: 22,
		});

		expect(resolveNarrativeDisplayName("Silas Thorne", registry, { messageCount: 22 })).toBe(
			"Mark Owen (revealed to be Silas Thorne)",
		);
	});

	it("redacts long-term memory prompts for narration context", () => {
		const narrativeIdentity = createNarrativeIdentityPromptContext({
			storyState: silasStoryState,
			playerCharacter: {
				name: "Silas Thorne",
				aliases: ["Mark Owen"],
			},
			messageCount: 22,
		});
		const prompt = formatStoryLongTermMemoryForPrompt(silasStoryState, {
			playerName: "Silas Thorne",
			narrativeIdentity,
		});

		expect(prompt).toContain("Mark Owen");
		expect(prompt).not.toContain("Silas Thorne posing as");
		expect(prompt).toContain("Jake Peralta ↔ Mark Owen");
	});
});
