import { describe, expect, it } from "vitest";
import {
	isResolvedOpenThread,
	mergeOpenThreadsAuthoritative,
	reconcileResolvedOpenThreads,
} from "../openThreads";
import type { StoryStateDataV2 } from "../../types/models";

const chapterTwoState: StoryStateDataV2 = {
	updatedAt: "2026-01-01T00:00:00.000Z",
	characters: {},
	worldFacts: [],
	unresolvedThreads: [],
	indexes: {
		messageCount: 11,
		characters: {
			"Jamie Potter": { name: "Jamie Potter", lastSeenMessage: 11 },
		},
		openThreads: [
			{ thread: "Where is Detective Jamie Potter prior to the 3:00 PM demonstration?", evidence: { messageNumbers: [5] } },
			{ thread: "Who is entering through the heavy double doors at the end of the hall at 2:45 PM?", evidence: { messageNumbers: [3] } },
			{ thread: "Will Jamie arrive in time for 3:00 PM to keep the evening shift log on schedule?", evidence: { messageNumbers: [5] } },
			{ thread: "What demonstration does Jamie have planned for Wands at Four today?", evidence: { messageNumbers: [9] } },
		],
	},
};

describe("openThreads", () => {
	it("bins solved location and arrival threads once Jamie has appeared", () => {
		expect(
			isResolvedOpenThread(
				"Where is Detective Jamie Potter prior to the 3:00 PM demonstration?",
				chapterTwoState,
				{ playerName: "Jamie Potter", totalMessages: 11 },
			),
		).toBe(true);
		expect(
			isResolvedOpenThread(
				"Who is entering through the heavy double doors at the end of the hall at 2:45 PM?",
				chapterTwoState,
				{ totalMessages: 11 },
			),
		).toBe(true);
	});

	it("keeps still-open demonstration threads", () => {
		const reconciled = reconcileResolvedOpenThreads(chapterTwoState.indexes?.openThreads, chapterTwoState, {
			playerName: "Jamie Potter",
			totalMessages: 11,
		});
		expect(reconciled?.map((entry) => entry.thread)).toEqual([
			"What demonstration does Jamie have planned for Wands at Four today?",
		]);
	});

	it("uses incoming open threads as authoritative replacement", () => {
		const merged = mergeOpenThreadsAuthoritative(
			chapterTwoState.indexes?.openThreads,
			[
				{
					thread: "How will Jamie's Transfiguration demonstration involving Charles unfold?",
					evidence: { messageNumbers: [11] },
				},
			],
		);
		expect(merged?.length).toBe(1);
		expect(merged?.[0]?.thread).toContain("Transfiguration");
	});
});
