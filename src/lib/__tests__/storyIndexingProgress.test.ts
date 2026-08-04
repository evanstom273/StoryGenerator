import { describe, expect, it } from "vitest";
import {
	buildInitialChapterReviewProgress,
	getIndexingProgressPercent,
	resolveIndexingDisplayProgress,
	selectChaptersForArchiveRebuild,
} from "../ai/storyIndexingProgress";
import type { StoryChapter } from "../../types/models";

describe("storyIndexingProgress", () => {
	it("selects chapters that need archive rebuild in incremental mode", () => {
		const chapters: StoryChapter[] = [
			{
				id: "ch-1",
				storyId: "story-1",
				label: "Chapter One",
				endsAtMessageId: "m-10",
				endsAtIndex: 10,
				createdAt: "2026-01-01T00:00:00.000Z",
				summary: "Old summary",
			},
			{
				id: "ch-2",
				storyId: "story-1",
				label: "Chapter Two",
				endsAtMessageId: "m-20",
				endsAtIndex: 20,
				createdAt: "2026-01-01T00:01:00.000Z",
				summary: "Fresh summary",
			},
		];

		const selected = selectChaptersForArchiveRebuild(chapters, true, 15);
		expect(selected.map((chapter) => chapter.id)).toEqual(["ch-2"]);
	});

	it("builds chapter review progress rows", () => {
		const progress = buildInitialChapterReviewProgress([
			{ label: "Chapter I: The Case" },
		]);

		expect(progress).toEqual([
			{
				label: "Chapter I: The Case",
				displayLabel: "Chapter I: The Case",
				status: "pending",
			},
		]);
	});

	it("resolves message indexing progress with elapsed summary", () => {
		const display = resolveIndexingDisplayProgress({
			storyId: "story-1",
			phase: "extracting",
			processedMessages: 12,
			totalMessages: 40,
			message: "Indexing message 12/40…",
			startedAtMs: Date.now() - 5000,
			stage: "messages",
		});

		expect(display?.processed).toBe(12);
		expect(display?.total).toBe(40);
		expect(display?.summary).toContain("Indexing message 12/40");
		expect(getIndexingProgressPercent(display!)).toBe(30);
	});
});
