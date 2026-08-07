import { describe, expect, it } from "vitest";
import type { StoryMessage, StoryStateDataV2 } from "../../types/models";
import {
	applyTranscriptPresenceGate,
	createClearedStoryStateV2,
	isPlayerPresentInTranscript,
	listPresentIndexedCharacterNames,
} from "../transcriptPresence";

function makeUserMessage(
	overrides: Partial<StoryMessage> & Pick<StoryMessage, "content">,
): StoryMessage {
	return {
		id: "msg-user",
		storyId: "story-1",
		role: "user",
		timestamp: "2026-08-07T18:00:00.000Z",
		speakerType: "player",
		speakerName: "Silas Thorne",
		...overrides,
	};
}

function makeAssistantMessage(content: string): StoryMessage {
	return {
		id: "msg-assistant",
		storyId: "story-1",
		role: "assistant",
		timestamp: "2026-08-07T18:01:00.000Z",
		speakerType: "narrator",
		content,
	};
}

const chapterOneMessages: StoryMessage[] = [
	{
		id: "msg-1",
		storyId: "story-1",
		role: "system",
		content: "Chapter I.",
		timestamp: "2026-08-07T18:00:00.000Z",
		speakerType: "system",
	},
	makeUserMessage({
		id: "msg-2",
		speakerType: "director",
		speakerName: "Director",
		content: "*Jake, Rosa, Amy and Charles arrive at a cordoned-off alleyway.*",
	}),
	makeAssistantMessage(
		"**Jake:** \"Alright, hear me out.\"\n\n**Amy:** \"Captain Holt said to treat this with extreme caution.\"",
	),
	makeUserMessage({
		id: "msg-4",
		speakerType: "director",
		speakerName: "Director",
		content: "*Officer Mercer points down the alleyway at a grisly corpse.*",
	}),
	makeUserMessage({
		id: "msg-8",
		content: "*End of Chapter I.*",
	}),
];

const omniscientState: StoryStateDataV2 = {
	updatedAt: "2026-08-07T18:00:00.000Z",
	memoryArchitectureVersion: "2.0",
	characters: {
		"Silas Thorne": {
			canonicalName: "Silas Thorne",
			narrativeName: "Mark Owen",
			statusBullets: ["Orchestrating a grand game in Brooklyn"],
		},
		"Jake Peralta": {
			canonicalName: "Jake Peralta",
			statusBullets: ["Investigating the alleyway trap"],
		},
	},
	worldFacts: [],
	unresolvedThreads: [],
	summaries: {
		premise:
			"Silas Thorne, a wealthy mastermind, shifts his operational focus to Brooklyn, setting a collision course with NYPD detectives.",
		protagonistSummary:
			"Silas Thorne is a ruthless criminal antagonist known for theatrical murders.",
		currentSituation:
			"Detectives Jake, Rosa, Amy, and Charles examine a blood-painted message above a suspended body.",
	},
	indexes: {
		messageCount: 8,
		messageNumberingVersion: "1.0",
		characters: {
			jake: {
				name: "Jake Peralta",
				description: "NYPD detective investigating the alleyway trap.",
			},
		},
		relationships: [
			{ a: "Jake Peralta", b: "Silas Thorne", tier: "nemesis", summary: "Silas views Jake as a participant." },
			{ a: "Jake Peralta", b: "Rosa Diaz", tier: "colleague", summary: "Partners at the scene." },
		],
		openThreads: [
			{ thread: "What elaborate game will Silas Thorne prepare in Brooklyn?" },
			{ thread: "Who painted 'He's coming' on the wall above the victim?" },
		],
		worldFacts: [],
		significantMemories: [],
		locations: {
			brooklyn: {
				name: "Brooklyn",
				description: "Where Silas Thorne is establishing his next theatrical masterpiece.",
			},
		},
	},
};

describe("transcriptPresence", () => {
	it("treats the player as absent from chapter-one alley content", () => {
		expect(
			isPlayerPresentInTranscript(chapterOneMessages, {
				name: "Silas Thorne",
				aliases: ["Mark Owen"],
			}),
		).toBe(false);
	});

	it("removes hidden player index data when the player has not appeared yet", () => {
		const gated = applyTranscriptPresenceGate(
			omniscientState,
			chapterOneMessages,
			{ name: "Silas Thorne", aliases: ["Mark Owen"] },
			{ messageCount: 5 },
		);

		expect(gated.characters?.["Silas Thorne"]).toBeUndefined();
		expect(gated.summaries?.protagonistSummary).toBeUndefined();
		expect(gated.summaries?.premise).not.toContain("Silas Thorne");
		expect(gated.indexes?.relationships?.some((entry) => entry.b === "Silas Thorne")).toBe(false);
		expect(gated.indexes?.openThreads?.some((entry) => entry.thread.includes("Silas Thorne"))).toBe(
			false,
		);
		expect(gated.indexes?.locations?.brooklyn).toBeUndefined();
		expect(gated.characters?.["Jake Peralta"]).toBeDefined();
	});

	it("lists only transcript-present characters for character status", () => {
		const gated = applyTranscriptPresenceGate(
			omniscientState,
			chapterOneMessages,
			{ name: "Silas Thorne", aliases: ["Mark Owen"] },
			{ messageCount: 5 },
		);

		expect(
			listPresentIndexedCharacterNames(
				gated,
				chapterOneMessages,
				{ name: "Silas Thorne", aliases: ["Mark Owen"] },
				{ messageCount: 5 },
			),
		).toEqual(["Jake Peralta"]);
	});

	it("creates a fully cleared index scaffold", () => {
		const cleared = createClearedStoryStateV2({ rpStats: { trust: 1 } as never });
		expect(cleared.characters).toEqual({});
		expect(cleared.indexes?.relationships).toEqual([]);
		expect(cleared.indexes?.openThreads).toEqual([]);
		expect(cleared.lastIndexedMessageCount).toBe(0);
		expect(cleared.rpStats).toEqual({ trust: 1 });
	});
});
