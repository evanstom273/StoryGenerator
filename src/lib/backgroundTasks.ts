import { formatElapsedSeconds } from "./ai/storyAudiobookProgress";
import type { StoryAudiobookProgress } from "./ai/storyAudiobookProgress";
import type { BackgroundJob, BackgroundJobType } from "../types/models";

export const BACKGROUND_TASK_JOB_TYPES = [
	"story_index",
	"story_audiobook",
	"ai_document",
	"podcast_audio",
] as const satisfies readonly BackgroundJobType[];

export type BackgroundTaskJobType = (typeof BACKGROUND_TASK_JOB_TYPES)[number];

export const DEFAULT_MAX_CONCURRENT_BACKGROUND_TASKS = 2 as const;

export function isBackgroundTaskJob(job: Pick<BackgroundJob, "type">): job is BackgroundJob & {
	type: BackgroundTaskJobType;
} {
	return (BACKGROUND_TASK_JOB_TYPES as readonly string[]).includes(job.type);
}

export function resolveMaxConcurrentBackgroundTasks(
	value: number | null | undefined,
): 1 | 2 | 3 | 4 | 5 {
	if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
		return value;
	}
	return DEFAULT_MAX_CONCURRENT_BACKGROUND_TASKS;
}

export function getBackgroundTaskTypeLabel(job: BackgroundJob): string {
	switch (job.type) {
		case "story_index":
			return job.payload?.incremental ? "Update Index" : "Full Re-index";
		case "story_audiobook":
			switch (job.payload?.audiobookPurpose) {
				case "playback":
					return "Prepare Audiobook";
				case "chapter_listen":
					return "Prepare Chapter Audio";
				default:
					return "Generate Audiobook";
			}
		case "ai_document":
			return getAiDocumentTaskLabel(job);
		case "podcast_audio":
			return "Generate Podcast";
		default:
			return "Background task";
	}
}

function getAiDocumentTaskLabel(job: BackgroundJob): string {
	const presetId = job.payload?.aiDocumentPresetId ?? "";
	const labels: Record<string, string> = {
		"character-analysis": "Generating Character Analysis",
		"relationship-analysis": "Generating Relationship Analysis",
		"podcast-chapter-breakdown": "Generating Podcast Breakdown",
		"podcast-discussion": "Generating Podcast Discussion",
		"story-summary": "Generating Story Summary",
		"character-guide": "Generating Character Guide",
		"timeline": "Generating Timeline",
		"lore-bible": "Generating Lore Bible",
		"episode-guide": "Generating Episode Guide",
		"writer-commentary": "Generating Writer Commentary",
		"previously-on": "Generating Previously On",
		custom: "Generating AI Document",
	};
	return labels[presetId] ?? "Generating AI Document";
}

export function getBackgroundTaskStoryLabel(
	job: BackgroundJob,
	storyTitleById: (storyId: string) => string | undefined,
): string {
	if (job.storyId) {
		return storyTitleById(job.storyId) ?? "Story";
	}

	if (job.payload?.aiDocumentSourceType === "upload") {
		return job.payload.aiDocumentSourceLabel?.trim() || "Uploaded export";
	}

	return "Settings";
}

export function getBackgroundTaskNavigationTarget(job: BackgroundJob): string {
	if (job.type === "ai_document" || job.type === "podcast_audio") {
		if (job.payload?.aiDocumentSourceType === "story" && job.payload.aiDocumentSourceStoryId) {
			return `/stories/${job.payload.aiDocumentSourceStoryId}`;
		}
		return "/settings?tab=documents";
	}

	if (job.storyId) {
		return `/stories/${job.storyId}`;
	}

	return "/settings?tab=documents";
}

export function getBackgroundTaskProgressPercent(job: BackgroundJob): number | null {
	const progress = job.progress;
	if (!progress || progress.total <= 0) {
		return null;
	}
	return Math.min(100, Math.round((progress.current / progress.total) * 100));
}

export function getBackgroundTaskProgressLabel(job: BackgroundJob): string {
	const progress = job.progress;
	if (!progress) {
		return getBackgroundTaskTypeLabel(job);
	}

	if (progress.label?.trim()) {
		return progress.label.trim();
	}

	if (progress.total > 0) {
		return `${progress.current} / ${progress.total}`;
	}

	return getBackgroundTaskTypeLabel(job);
}

export function getBackgroundTaskElapsedLabel(job: BackgroundJob, nowMs = Date.now()): string {
	const reference = job.startedAt ?? job.createdAt;
	if (!reference) {
		return "0s";
	}
	return formatElapsedSeconds(new Date(reference).getTime(), nowMs);
}

export function countActiveBackgroundTasks(jobs: BackgroundJob[]): number {
	return jobs.filter(
		(job) =>
			isBackgroundTaskJob(job) &&
			(job.status === "queued" || job.status === "running"),
	).length;
}

export function resolveBackgroundTaskQueueOrder(job: BackgroundJob): number {
	if (typeof job.queueOrder === "number" && Number.isFinite(job.queueOrder)) {
		return job.queueOrder;
	}
	return new Date(job.createdAt).getTime();
}

export function compareQueuedBackgroundTasks(left: BackgroundJob, right: BackgroundJob): number {
	const orderDelta = resolveBackgroundTaskQueueOrder(left) - resolveBackgroundTaskQueueOrder(right);
	if (orderDelta !== 0) {
		return orderDelta;
	}
	return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

export function sortQueuedBackgroundTasks(jobs: BackgroundJob[]): BackgroundJob[] {
	return [...jobs].sort(compareQueuedBackgroundTasks);
}

export function getNextBackgroundTaskQueueOrder(jobs: BackgroundJob[]): number {
	const queued = jobs.filter((job) => isBackgroundTaskJob(job) && job.status === "queued");
	if (!queued.length) {
		return 1;
	}
	return Math.max(...queued.map((job) => resolveBackgroundTaskQueueOrder(job))) + 1;
}

export function moveQueuedBackgroundTaskInOrder(
	queued: BackgroundJob[],
	jobId: string,
	direction: "up" | "down",
): BackgroundJob[] | null {
	const sorted = sortQueuedBackgroundTasks(queued);
	const currentIndex = sorted.findIndex((job) => job.id === jobId);
	if (currentIndex === -1) {
		return null;
	}

	const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
	if (targetIndex < 0 || targetIndex >= sorted.length) {
		return null;
	}

	const next = [...sorted];
	const [moved] = next.splice(currentIndex, 1);
	next.splice(targetIndex, 0, moved);

	return next.map((job, index) => ({
		...job,
		queueOrder: index + 1,
	}));
}

export function isAudiobookListenBackgroundJob(job: BackgroundJob): boolean {
	return (
		job.type === "story_audiobook" &&
		(job.payload?.audiobookPurpose === "playback" ||
			job.payload?.audiobookPurpose === "chapter_listen")
	);
}

export function isAudiobookExportBackgroundJob(job: BackgroundJob): boolean {
	return job.type === "story_audiobook" && !isAudiobookListenBackgroundJob(job);
}

export function audiobookProgressToBackgroundJobProgress(progress: StoryAudiobookProgress): {
	current: number;
	total: number;
	label: string;
} {
	const total = Math.max(1, progress.chapters.length);
	const doneCount = progress.chapters.filter(
		(chapter) => chapter.status === "done" || chapter.status === "cached",
	).length;

	return {
		current: doneCount,
		total,
		label: progress.summary,
	};
}

export function partitionBackgroundTasks(jobs: BackgroundJob[]) {
	const backgroundTasks = jobs.filter(isBackgroundTaskJob);
	const running = backgroundTasks
		.filter((job) => job.status === "running")
		.sort(
			(left, right) =>
				new Date(left.startedAt ?? left.createdAt).getTime() -
				new Date(right.startedAt ?? right.createdAt).getTime(),
		);
	const queued = backgroundTasks
		.filter((job) => job.status === "queued")
		.sort(compareQueuedBackgroundTasks);
	const completed = backgroundTasks
		.filter(
			(job) =>
				job.status === "complete" || job.status === "failed" || job.status === "cancelled",
		)
		.sort(
			(left, right) =>
				new Date(right.finishedAt ?? right.createdAt).getTime() -
				new Date(left.finishedAt ?? left.createdAt).getTime(),
		);

	return { running, queued, completed };
}
