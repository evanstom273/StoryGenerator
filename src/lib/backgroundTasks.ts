import type { StoryAudiobookProgress } from "./ai/storyAudiobookProgress";
import type { AudiobookChapterSynthStatus } from "./ai/storyAudiobookProgress";
import type { BackgroundJob, BackgroundJobStep, BackgroundJobStepStatus, BackgroundJobType } from "../types/models";

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
		novelisation: "Generating Novelisation",
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

export function countCompletedBackgroundJobSteps(steps: BackgroundJobStep[]): number {
	return steps.filter((step) => step.status === "done").length;
}

export function buildChapterDocumentSteps(params: {
	introLabel: string;
	chapterLabels: string[];
	epilogueLabel?: string | null;
}): BackgroundJobStep[] {
	const steps: BackgroundJobStep[] = [
		{ id: "intro", label: params.introLabel, status: "pending" },
	];
	params.chapterLabels.forEach((label, index) => {
		steps.push({
			id: `chapter-${index}`,
			label,
			status: "pending",
		});
	});
	if (params.epilogueLabel?.trim()) {
		steps.push({
			id: "epilogue",
			label: params.epilogueLabel.trim(),
			status: "pending",
		});
	}
	return steps;
}

export function setBackgroundJobStepStatus(
	steps: BackgroundJobStep[],
	activeStepId: string,
	mode: "start" | "complete",
): BackgroundJobStep[] {
	return steps.map((step) => {
		if (mode === "start") {
			if (step.id === activeStepId) {
				return { ...step, status: "running" };
			}
			if (step.status === "running") {
				return { ...step, status: "done" };
			}
			return step;
		}

		if (step.id === activeStepId) {
			return { ...step, status: "done" };
		}
		return step;
	});
}

export function backgroundJobProgressFromSteps(
	label: string,
	steps: BackgroundJobStep[],
): NonNullable<BackgroundJob["progress"]> {
	const total = Math.max(1, steps.length);
	const current = countCompletedBackgroundJobSteps(steps);
	return {
		current,
		total,
		label,
		steps,
	};
}

function mapAudiobookChapterStepStatus(
	status: AudiobookChapterSynthStatus,
): BackgroundJobStepStatus {
	switch (status) {
		case "synthesizing":
			return "running";
		case "done":
		case "cached":
			return "done";
		default:
			return "pending";
	}
}

export function mapAudiobookProgressToSteps(progress: StoryAudiobookProgress): BackgroundJobStep[] {
	const chapterSteps = progress.chapters.map((chapter, index) => ({
		id: chapter.segmentId || `chapter-${index}`,
		label: chapter.detail
			? `${chapter.displayLabel} — ${chapter.detail}`
			: chapter.displayLabel,
		status: mapAudiobookChapterStepStatus(chapter.status),
	}));

	const allChaptersDone =
		progress.chapters.length > 0 &&
		progress.chapters.every(
			(chapter) => chapter.status === "done" || chapter.status === "cached",
		);
	const isStitching = /stitching/i.test(progress.summary);

	if (progress.chapters.length <= 1 && !isStitching) {
		return chapterSteps;
	}

	const stitchingStep: BackgroundJobStep = {
		id: "stitching",
		label: "Stitching audiobook",
		status: isStitching ? "running" : allChaptersDone ? "pending" : "pending",
	};

	if (isStitching) {
		return [...chapterSteps.map((step) => ({ ...step, status: "done" as const })), stitchingStep];
	}

	return [...chapterSteps, stitchingStep];
}

export function getActiveBackgroundJobStep(steps: BackgroundJobStep[]): BackgroundJobStep | null {
	return steps.find((step) => step.status === "running") ?? null;
}

export function formatBackgroundJobStepFraction(
	step: BackgroundJobStep,
	steps: BackgroundJobStep[],
): string {
	if (step.id === "intro" || step.id === "epilogue" || step.id === "stitching" || step.id === "synthesis") {
		return "";
	}

	if (step.id.startsWith("chapter-")) {
		const chapterSteps = steps.filter((entry) => entry.id.startsWith("chapter-"));
		if (chapterSteps.length <= 1) {
			return "";
		}

		const index = chapterSteps.findIndex((entry) => entry.id === step.id);
		if (index >= 0) {
			return ` (${index + 1}/${chapterSteps.length})`;
		}
	}

	if (step.id.startsWith("audio-")) {
		const audioSteps = steps.filter((entry) => entry.id.startsWith("audio-"));
		if (audioSteps.length <= 1) {
			return "";
		}

		const index = audioSteps.findIndex((entry) => entry.id === step.id);
		if (index >= 0) {
			return ` (${index + 1}/${audioSteps.length})`;
		}
	}

	return "";
}

export function getBackgroundTaskStatusLine(
	job: BackgroundJob,
	storyLabel: string,
	remainingLabel?: string,
): string {
	if (job.status === "queued") {
		return `${storyLabel} - Queued`;
	}

	if (job.status !== "running") {
		return storyLabel;
	}

	const etaSuffix = remainingLabel ? ` - ${remainingLabel}` : "";
	const steps = job.progress?.steps;

	if (steps?.length) {
		const activeStep = getActiveBackgroundJobStep(steps);
		if (activeStep) {
			const fraction = formatBackgroundJobStepFraction(activeStep, steps);
			return `${storyLabel} - ${activeStep.label}${fraction}${etaSuffix}`;
		}
	}

	const progressLabel = getBackgroundTaskProgressLabel(job);
	if (progressLabel) {
		return `${storyLabel} - ${progressLabel}${etaSuffix}`;
	}

	return `${storyLabel}${etaSuffix}`;
}

export function getBackgroundTaskProgressPercent(job: BackgroundJob): number | null {
	const progress = job.progress;
	if (!progress) {
		return null;
	}

	if (progress.steps?.length) {
		const total = progress.steps.length;
		const done = countCompletedBackgroundJobSteps(progress.steps);
		const hasRunning = progress.steps.some((step) => step.status === "running");
		const current = hasRunning ? done + 0.5 : done;
		return Math.min(100, Math.round((current / total) * 100));
	}

	if (progress.total <= 0) {
		return null;
	}
	return Math.min(100, Math.round((progress.current / progress.total) * 100));
}

export function getBackgroundTaskProgressLabel(job: BackgroundJob): string {
	const progress = job.progress;
	if (!progress) {
		return "";
	}

	if (progress.steps?.length) {
		return "";
	}

	if (progress.label?.trim()) {
		return progress.label.trim();
	}

	if (progress.total > 0) {
		return `${progress.current} / ${progress.total}`;
	}

	return "";
}

export function formatEstimatedRemainingSeconds(totalSeconds: number): string {
	const seconds = Math.max(0, Math.round(totalSeconds));
	if (seconds < 60) {
		return `~${seconds}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	if (minutes >= 60) {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return mins > 0 ? `~${hours}h${mins}m` : `~${hours}h`;
	}

	return remainder > 0 ? `~${minutes}m${remainder}s` : `~${minutes}m`;
}

function getFallbackTotalSeconds(job: BackgroundJob): number {
	switch (job.type) {
		case "story_index":
			return job.payload?.incremental ? 120 : 300;
		case "story_audiobook":
			return isAudiobookListenBackgroundJob(job) ? 90 : 600;
		case "ai_document":
			if (job.payload?.aiDocumentPresetId === "novelisation") {
				return 480;
			}
			return 180;
		case "podcast_audio":
			return 180;
		default:
			return 120;
	}
}

export function getBackgroundTaskRemainingSeconds(
	job: BackgroundJob,
	nowMs = Date.now(),
): number | null {
	if (job.status !== "running") {
		return null;
	}

	const reference = job.startedAt ?? job.createdAt;
	if (!reference) {
		return null;
	}

	const startedMs = new Date(reference).getTime();
	const elapsedSec = Math.max(0, (nowMs - startedMs) / 1000);
	const progress = job.progress;
	const fallbackTotalSec = getFallbackTotalSeconds(job);

	if (progress?.steps?.length) {
		const totalSteps = progress.steps.length;
		const doneSteps = countCompletedBackgroundJobSteps(progress.steps);

		if (doneSteps === 0) {
			return Math.max(0, fallbackTotalSec - elapsedSec);
		}

		return Math.max(0, (elapsedSec / doneSteps) * (totalSteps - doneSteps));
	}

	if (progress && progress.total > 0) {
		if (progress.current >= progress.total) {
			return 0;
		}

		if (progress.current > 0) {
			const fraction = progress.current / progress.total;
			const estimatedTotalSec = elapsedSec / fraction;
			return Math.max(0, estimatedTotalSec - elapsedSec);
		}
	}

	return Math.max(0, fallbackTotalSec - elapsedSec);
}

export function getBackgroundTaskRemainingLabel(job: BackgroundJob, nowMs = Date.now()): string {
	if (job.status === "queued") {
		return "Queued";
	}

	if (job.status !== "running") {
		return "";
	}

	const remainingSec = getBackgroundTaskRemainingSeconds(job, nowMs);
	if (remainingSec === null) {
		return "~…";
	}

	return formatEstimatedRemainingSeconds(remainingSec);
}

/** @deprecated Use getBackgroundTaskRemainingLabel */
export function getBackgroundTaskElapsedLabel(job: BackgroundJob, nowMs = Date.now()): string {
	return getBackgroundTaskRemainingLabel(job, nowMs);
}

export function countActiveBackgroundTasks(jobs: BackgroundJob[]): number {
	return jobs.filter(
		(job) =>
			isBackgroundTaskJob(job) &&
			(job.status === "queued" || job.status === "running"),
	).length;
}

export function countRunningBackgroundTasks(jobs: BackgroundJob[]): number {
	return jobs.filter(
		(job) => isBackgroundTaskJob(job) && job.status === "running",
	).length;
}

export function findAudiobookListenJobForPlayId(
	jobs: BackgroundJob[],
	playId: string,
): BackgroundJob | undefined {
	return jobs.find(
		(job) =>
			isAudiobookListenBackgroundJob(job) &&
			job.payload?.audiobookPlayId === playId &&
			(job.status === "queued" || job.status === "running"),
	);
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

export function audiobookProgressToBackgroundJobProgress(
	progress: StoryAudiobookProgress,
	parentLabel: string,
): NonNullable<BackgroundJob["progress"]> {
	const steps = mapAudiobookProgressToSteps(progress);
	return backgroundJobProgressFromSteps(parentLabel, steps);
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
