import { describe, expect, it } from "vitest";
import type { StoryExportBundle, StoryMessage } from "../../types/models";
import { buildStoryArchiveContent } from "../storyArchiveContent";
import { serializeStoryArchiveMarkdown } from "../storyArchiveMarkdown";

function makeBundle(overrides: Partial<StoryExportBundle> = {}): StoryExportBundle {
	const messages: StoryMessage[] = overrides.messages ?? [
		{
			id: "msg-1",
			storyId: "story-1",
			role: "user",
			content: "Hello there.",
			timestamp: "2026-08-01T12:00:00.000Z",
			speakerName: "Jamie",
			speakerType: "player",
		},
		{
			id: "msg-2",
			storyId: "story-1",
			role: "assistant",
			content: "*The room is quiet.*\n\nHolt: \"Good morning.\"",
			timestamp: "2026-08-01T12:01:00.000Z",
			speakerType: "narrator",
		},
	];

	return {
		exportedAt: "2026-08-03T12:00:00.000Z",
		story: {
			id: "story-1",
			title: "Wands at Four",
			universeId: "universe-1",
			playerCharacterId: "pc-1",
			createdAt: "2026-08-01T10:00:00.000Z",
			updatedAt: "2026-08-03T12:00:00.000Z",
			currentSummary: "A wizard-detective case unfolds.",
			status: "active",
		},
		universe: {
			id: "universe-1",
			name: "Brooklyn Nine-Nine",
			description: "Comedy police precinct",
			wikiUrl: "",
			createdAt: "2026-08-01T10:00:00.000Z",
			updatedAt: "2026-08-01T10:00:00.000Z",
		},
		playerCharacter: {
			id: "pc-1",
			name: "Jamie Potter",
			age: "30",
			gender: "female",
			species: "human",
			pronouns: "she/her",
			appearance: "",
			personality: "",
			background: "",
			goals: "",
			notes: "",
			createdAt: "2026-08-01T10:00:00.000Z",
			updatedAt: "2026-08-01T10:00:00.000Z",
		},
		messages,
		storyState: {
			id: "story-state:story-1",
			storyId: "story-1",
			updatedAt: "2026-08-03T12:00:00.000Z",
			stateJson: JSON.stringify({
				updatedAt: "2026-08-03T12:00:00.000Z",
				indexedAt: "2026-08-03T11:00:00.000Z",
				characters: {
					Holt: {
						name: "Holt",
						statusBullets: ["Captain of the precinct"],
					},
				},
				worldFacts: [],
				unresolvedThreads: [],
				summaries: {
					premise: "A magical detective joins the precinct.",
					protagonistSummary: "Jamie is new to the team.",
					currentSituation: "Morning briefing in the squad room.",
					recentDevelopments: ["Jamie arrived at the precinct"],
				},
				indexes: {
					messageCount: 2,
					characters: {
						holt: {
							name: "Holt",
							aliases: ["Captain Holt"],
							description: "Precinct captain",
							firstSeenMessage: 2,
							lastSeenMessage: 2,
							evidence: { messageNumbers: [2] },
						},
					},
					relationships: [
						{
							a: "Jamie Potter",
							b: "Holt",
							tier: "colleague",
							summary: "Professional rapport",
							history: [{ summary: "First morning greeting" }],
							evidence: { messageNumbers: [2] },
						},
					],
					worldFacts: [
						{
							fact: "The precinct opens at dawn.",
							evidence: { messageNumbers: [2] },
						},
					],
					openThreads: [
						{
							thread: "Who summoned Jamie?",
							evidence: { messageNumbers: [1] },
						},
					],
					significantMemories: [
						{
							moment: "Jamie enters the squad room",
							evidence: { messageNumbers: [1] },
						},
					],
					locations: {
						squad: {
							name: "Squad room",
							description: "Busy morning hub",
							evidence: { messageNumbers: [2] },
						},
					},
				},
			}),
		},
		chapters: [
			{
				id: "chapter-1",
				storyId: "story-1",
				label: "Chapter I",
				summary: "Arrival",
				endsAtIndex: 2,
				createdAt: "2026-08-01T12:00:00.000Z",
				updatedAt: "2026-08-01T12:00:00.000Z",
			},
		],
		...overrides,
	};
}

describe("buildStoryArchiveContent", () => {
	it("assembles archive sections from story state and transcript", () => {
		const content = buildStoryArchiveContent(makeBundle());

		expect(content.title).toBe("Wands at Four");
		expect(content.metadata.universe).toBe("Brooklyn Nine-Nine");
		expect(content.summary.premise).toContain("magical detective");
		expect(content.transcript.length).toBeGreaterThan(0);
		expect(content.characters.some((entry) => entry.name === "Holt")).toBe(true);
		expect(content.relationships.length).toBe(1);
		expect(content.worldFacts.length).toBe(1);
		expect(content.openThreads.length).toBe(1);
		expect(content.significantMemories.length).toBe(1);
		expect(content.locations.length).toBe(1);
		expect(content.chapters.length).toBe(1);
	});
});

describe("serializeStoryArchiveMarkdown", () => {
	it("includes archive sections and table of contents with explicit anchors", () => {
		const markdown = serializeStoryArchiveMarkdown(makeBundle());

		expect(markdown).toContain("# Wands at Four");
		expect(markdown).toContain("<a id=\"contents\"></a>");
		expect(markdown).toContain("## Contents");
		expect(markdown).toContain("[Metadata](#metadata)");
		expect(markdown).toContain("<a id=\"metadata\"></a>");
		expect(markdown).toContain("## Metadata");
		expect(markdown).toContain("<a id=\"story-summary\"></a>");
		expect(markdown).toContain("## Story Summary");
		expect(markdown).toContain("<a id=\"transcript\"></a>");
		expect(markdown).toContain("## Transcript");
		expect(markdown).toContain("## Characters");
		expect(markdown).toContain("## World Facts");
		expect(markdown).toContain("## Active Threads");
		expect(markdown).toContain("## Significant Memories");
		expect(markdown).toContain("## Locations");
		expect(markdown).toContain("## Chapters");
		expect(markdown).toContain("**Chapter end:** Chapter I");
		expect(markdown).toContain("Captain of the precinct");
		expect(markdown).toContain("Who summoned Jamie?");
	});
});
