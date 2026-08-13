import { describe, expect, it } from "vitest";
import {
	buildIndexingContinuitySnapshot,
	serializeIndexingContinuitySnapshot,
} from "../ai/indexingContinuitySnapshot";
import type { StoryStateDataV2 } from "../../types/models";

describe("indexingContinuitySnapshot", () => {
	it("keeps active entities and omits dormant cast members from the prompt snapshot", () => {
		const state: StoryStateDataV2 = {
			updatedAt: "2026-01-01T00:00:00.000Z",
			characters: {
				"Mark Owen": {
					statusBullets: ["Waiting at the harbor"],
				},
				"Old Contact": {
					notes: ["Retired from the story long ago"],
				},
			},
			summaries: {
				premise: "A detective story",
				worldSummary: "Rainy city noir",
			},
			indexes: {
				characters: {
					"Mark Owen": {
						name: "Mark Owen",
						lastSeenMessage: 95,
					},
					"Old Contact": {
						name: "Old Contact",
						lastSeenMessage: 5,
					},
				},
				openThreads: [{ thread: "Who is following Mark Owen?" }],
				relationships: [
					{
						a: "Mark Owen",
						b: "Captain Reyes",
						tier: "ally",
						summary: "Professional respect",
					},
				],
			},
		};

		const snapshot = buildIndexingContinuitySnapshot({
			state,
			currentMessageNumber: 100,
			playerName: "Mark Owen",
			currentChunkMessages: [
				{
					id: "m-100",
					storyId: "story-1",
					role: "assistant",
					content: "Captain Reyes stepped into the warehouse.",
					timestamp: "2026-01-02T00:00:00.000Z",
					speakerName: "narrator",
				},
			],
		});

		expect(snapshot.characters).toEqual({
			"Mark Owen": {
				statusBullets: ["Waiting at the harbor"],
			},
		});
		expect(snapshot.characters).not.toHaveProperty("Old Contact");
		expect(snapshot.summaries).toMatchObject({
			premise: "A detective story",
			worldSummary: "Rainy city noir",
		});
		expect(snapshot.indexes).toMatchObject({
			openThreads: [{ thread: "Who is following Mark Owen?" }],
		});

		const serialized = serializeIndexingContinuitySnapshot(snapshot);
		expect(serialized).toContain("Mark Owen");
		expect(serialized).not.toContain("Old Contact");
	});
});
