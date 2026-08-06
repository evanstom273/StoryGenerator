import { describe, expect, it } from "vitest";
import {
	countActiveBackgroundTasks,
	audiobookProgressToBackgroundJobProgress,
	formatEstimatedRemainingSeconds,
	getBackgroundTaskNavigationTarget,
	getBackgroundTaskRemainingLabel,
	getBackgroundTaskTypeLabel,
	isAudiobookExportBackgroundJob,
	isAudiobookListenBackgroundJob,
	isBackgroundTaskJob,
	moveQueuedBackgroundTaskInOrder,
	partitionBackgroundTasks,
	resolveMaxConcurrentBackgroundTasks,
	sortQueuedBackgroundTasks,
} from "../backgroundTasks";
import type { BackgroundJob } from "../../types/models";

function makeJob(partial: Partial<BackgroundJob> & Pick<BackgroundJob, "id" | "type" | "status">): BackgroundJob {
	return {
		createdAt: "2026-01-01T00:00:00.000Z",
		...partial,
	};
}

describe("backgroundTasks", () => {
	it("identifies managed background task job types", () => {
		expect(isBackgroundTaskJob(makeJob({ id: "1", type: "story_index", status: "queued" }))).toBe(true);
		expect(isBackgroundTaskJob(makeJob({ id: "2", type: "metachat_generate", status: "queued" }))).toBe(false);
	});

	it("resolves max concurrent background tasks with default", () => {
		expect(resolveMaxConcurrentBackgroundTasks(undefined)).toBe(2);
		expect(resolveMaxConcurrentBackgroundTasks(4)).toBe(4);
		expect(resolveMaxConcurrentBackgroundTasks(9)).toBe(2);
	});

	it("labels index jobs by incremental mode", () => {
		expect(
			getBackgroundTaskTypeLabel(
				makeJob({
					id: "1",
					type: "story_index",
					status: "running",
					payload: { incremental: true },
				}),
			),
		).toBe("Update Index");
		expect(
			getBackgroundTaskTypeLabel(
				makeJob({
					id: "2",
					type: "story_index",
					status: "running",
					payload: { incremental: false },
				}),
			),
		).toBe("Full Re-index");
	});

	it("partitions running, queued, and completed tasks", () => {
		const jobs = [
			makeJob({ id: "running", type: "story_audiobook", status: "running", storyId: "s1" }),
			makeJob({ id: "queued", type: "ai_document", status: "queued", storyId: "s2" }),
			makeJob({ id: "done", type: "podcast_audio", status: "complete" }),
			makeJob({ id: "meta", type: "metachat_generate", status: "running" }),
		];

		const grouped = partitionBackgroundTasks(jobs);
		expect(grouped.running.map((job) => job.id)).toEqual(["running"]);
		expect(grouped.queued.map((job) => job.id)).toEqual(["queued"]);
		expect(grouped.completed.map((job) => job.id)).toEqual(["done"]);
		expect(countActiveBackgroundTasks(jobs)).toBe(2);
	});

	it("labels playback audiobook jobs separately from export", () => {
		expect(
			getBackgroundTaskTypeLabel(
				makeJob({
					id: "1",
					type: "story_audiobook",
					status: "running",
					payload: { audiobookPurpose: "playback" },
				}),
			),
		).toBe("Prepare Audiobook");
		expect(
			getBackgroundTaskTypeLabel(
				makeJob({
					id: "2",
					type: "story_audiobook",
					status: "running",
					payload: { audiobookPurpose: "chapter_listen" },
				}),
			),
		).toBe("Prepare Chapter Audio");
		expect(
			getBackgroundTaskTypeLabel(
				makeJob({
					id: "3",
					type: "story_audiobook",
					status: "running",
					payload: { audiobookPurpose: "export" },
				}),
			),
		).toBe("Generate Audiobook");
		expect(
			isAudiobookListenBackgroundJob(
				makeJob({
					id: "4",
					type: "story_audiobook",
					status: "running",
					payload: { audiobookPurpose: "chapter_listen" },
				}),
			),
		).toBe(true);
		expect(
			isAudiobookExportBackgroundJob(
				makeJob({
					id: "5",
					type: "story_audiobook",
					status: "running",
					payload: { audiobookPurpose: "chapter_listen" },
				}),
			),
		).toBe(false);
	});

	it("maps audiobook chapter progress to background job progress", () => {
		expect(
			audiobookProgressToBackgroundJobProgress({
				summary: "1/2 chapters ready",
				chapters: [
					{
						segmentId: "a",
						label: "Chapter 1",
						displayLabel: "Chapter 1",
						status: "done",
					},
					{
						segmentId: "b",
						label: "Chapter 2",
						displayLabel: "Chapter 2",
						status: "synthesizing",
					},
				],
			}),
		).toEqual({
			current: 1,
			total: 2,
			label: "1/2 chapters ready",
		});
	});

	it("formats estimated remaining time", () => {
		expect(formatEstimatedRemainingSeconds(13)).toBe("~13s");
		expect(formatEstimatedRemainingSeconds(133)).toBe("~2m13s");
		expect(formatEstimatedRemainingSeconds(120)).toBe("~2m");
		expect(formatEstimatedRemainingSeconds(3661)).toBe("~1h1m");
	});

	it("estimates remaining time from job progress", () => {
		const startedAt = "2026-01-01T00:00:00.000Z";
		const nowMs = new Date("2026-01-01T00:01:00.000Z").getTime();

		expect(
			getBackgroundTaskRemainingLabel(
				makeJob({
					id: "1",
					type: "story_audiobook",
					status: "running",
					startedAt,
					progress: { current: 1, total: 4, label: "Chapter 1" },
				}),
				nowMs,
			),
		).toBe("~3m");

		expect(
			getBackgroundTaskRemainingLabel(
				makeJob({
					id: "2",
					type: "ai_document",
					status: "queued",
				}),
				nowMs,
			),
		).toBe("Queued");
	});

	it("routes navigation targets for story and settings jobs", () => {
		expect(
			getBackgroundTaskNavigationTarget(
				makeJob({ id: "1", type: "story_index", status: "running", storyId: "abc" }),
			),
		).toBe("/stories/abc");
		expect(
			getBackgroundTaskNavigationTarget(
				makeJob({
					id: "2",
					type: "ai_document",
					status: "queued",
					payload: { aiDocumentSourceType: "upload" },
				}),
			),
		).toBe("/settings?tab=documents");
	});

	it("reorders queued background tasks", () => {
		const queued = [
			makeJob({ id: "a", type: "story_index", status: "queued", queueOrder: 1 }),
			makeJob({ id: "b", type: "story_audiobook", status: "queued", queueOrder: 2 }),
			makeJob({ id: "c", type: "ai_document", status: "queued", queueOrder: 3 }),
		];

		const movedDown = moveQueuedBackgroundTaskInOrder(queued, "a", "down");
		expect(movedDown?.map((job) => job.id)).toEqual(["b", "a", "c"]);
		expect(movedDown?.map((job) => job.queueOrder)).toEqual([1, 2, 3]);

		const movedUp = moveQueuedBackgroundTaskInOrder(movedDown ?? [], "c", "up");
		expect(movedUp?.map((job) => job.id)).toEqual(["b", "c", "a"]);

		expect(sortQueuedBackgroundTasks([
			makeJob({ id: "late", type: "podcast_audio", status: "queued", queueOrder: 5, createdAt: "2026-01-03T00:00:00.000Z" }),
			makeJob({ id: "early", type: "story_index", status: "queued", queueOrder: 1, createdAt: "2026-01-01T00:00:00.000Z" }),
		]).map((job) => job.id)).toEqual(["early", "late"]);
	});
});
