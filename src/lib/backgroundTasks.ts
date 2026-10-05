import type {
	BackgroundJob,
	BackgroundJobStep,
	BackgroundJobType,
} from "../types/models";

export const BACKGROUND_TASK_JOB_TYPES = [
	"story_index",
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
	if (job.type === "story_index") {
		return job.payload?.incremental === true ? "Update Index" : "Full Re-index";
	}
	return "Background task";
}

export function getBackgroundTaskStoryLabel(
	job: BackgroundJob,
	storyTitleById: (storyId: string) => string | undefined,
): string {
	return job.storyId ? storyTitleById(job.storyId) ?? "Story" : "Settings";
}

export function getBackgroundTaskNavigationTarget(job: BackgroundJob): string {
	return job.storyId ? `/stories/${job.storyId}` : "/settings";
}

export function countCompletedBackgroundJobSteps(steps: BackgroundJobStep[]): number {
	return steps.filter((step) => step.status === "done").length;
}

function hasRunningBackgroundJobStep(steps: BackgroundJobStep[]): boolean {
	return steps.some((step) => step.status === "running");
}

function getActiveBackgroundJobStep(steps: BackgroundJobStep[]): BackgroundJobStep | null {
	return steps.find((step) => step.status === "running") ?? null;
}

function formatBackgroundJobStepFraction(
	step: BackgroundJobStep,
	steps: BackgroundJobStep[],
): string {
	if (!step.id.startsWith("chapter-")) {
		return "";
	}
	const chapterSteps = steps.filter((entry) => entry.id.startsWith("chapter-"));
	if (chapterSteps.length <= 1) return "";
	const index = chapterSteps.findIndex((entry) => entry.id === step.id);
	return index >= 0 ? ` (${index + 1}/${chapterSteps.length})` : "";
}

export function getBackgroundTaskStatusLine(
	job: BackgroundJob,
	storyLabel: string,
	remainingLabel?: string,
): string {
	if (job.status === "queued") return `${storyLabel} - Queued`;
	if (job.status !== "running") return storyLabel;

	const etaSuffix = remainingLabel ? ` - ${remainingLabel}` : "";
	const steps = job.progress?.steps;
	if (steps?.length) {
		const activeStep = getActiveBackgroundJobStep(steps);
		if (activeStep) {
			return `${storyLabel} - ${activeStep.label}${formatBackgroundJobStepFraction(activeStep, steps)}${etaSuffix}`;
		}
	}

	const progressLabel = getBackgroundTaskProgressLabel(job);
	return progressLabel
		? `${storyLabel} - ${progressLabel}${etaSuffix}`
		: `${storyLabel}${etaSuffix}`;
}

export function getBackgroundTaskProgressPercent(job: BackgroundJob): number | null {
	const progress = job.progress;
	if (!progress) return null;

	if (progress.steps?.length) {
		const total = progress.steps.length;
		const done = countCompletedBackgroundJobSteps(progress.steps);
		const current = hasRunningBackgroundJobStep(progress.steps) ? done + 0.5 : done;
		return Math.min(100, Math.round((current / total) * 100));
	}

	if (progress.total <= 0) return null;
	return Math.min(100, Math.round((progress.current / progress.total) * 100));
}

export function getBackgroundTaskProgressLabel(job: BackgroundJob): string {
	const progress = job.progress;
	if (!progress || progress.steps?.length) return "";
	if (progress.label?.trim()) return progress.label.trim();
	return progress.total > 0 ? `${progress.current} / ${progress.total}` : "";
}

export function formatEstimatedRemainingSeconds(totalSeconds: number): string {
	const seconds = Math.max(0, Math.round(totalSeconds));
	if (seconds < 60) return `~${seconds}s`;

	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	if (minutes >= 60) {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return mins > 0 ? `~${hours}h${mins}m` : `~${hours}h`;
	}
	return remainder > 0 ? `~${minutes}m${remainder}s` : `~${minutes}m`;
}

export function getBackgroundTaskRemainingSeconds(
	job: BackgroundJob,
	nowMs = Date.now(),
): number | null {
	if (job.status !== "running") return null;

	const reference = job.startedAt ?? job.createdAt;
	if (!reference) return null;

	const startedMs = new Date(reference).getTime();
	const elapsedSec = Math.max(0, (nowMs - startedMs) / 1000);
	const progress = job.progress;
	const fallbackTotalSec = 120;

	if (progress?.steps?.length) {
		const totalSteps = progress.steps.length;
		const doneSteps = countCompletedBackgroundJobSteps(progress.steps);
		if (doneSteps === 0) {
			return elapsedSec >= fallbackTotalSec
				? null
				: Math.max(0, fallbackTotalSec - elapsedSec);
		}
		return Math.max(0, (elapsedSec / doneSteps) * (totalSteps - doneSteps));
	}

	if (progress && progress.total > 0) {
		if (progress.current >= progress.total) return 0;
		if (progress.current > 0) {
			const estimatedTotalSec = elapsedSec / (progress.current / progress.total);
			return Math.max(0, estimatedTotalSec - elapsedSec);
		}
	}

	return Math.max(0, fallbackTotalSec - elapsedSec);
}

export function getBackgroundTaskRemainingLabel(job: BackgroundJob, nowMs = Date.now()): string {
	if (job.status === "queued") return "Queued";
	if (job.status !== "running") return "";

	const remainingSec = getBackgroundTaskRemainingSeconds(job, nowMs);
	if (remainingSec === null || remainingSec <= 0) return "Working…";
	return formatEstimatedRemainingSeconds(remainingSec);
}

/** @deprecated Use getBackgroundTaskRemainingLabel */
export function getBackgroundTaskElapsedLabel(job: BackgroundJob, nowMs = Date.now()): string {
	return getBackgroundTaskRemainingLabel(job, nowMs);
}

export function countActiveBackgroundTasks(jobs: BackgroundJob[]): number {
	return jobs.filter(
		(job) => isBackgroundTaskJob(job) && (job.status === "queued" || job.status === "running"),
	).length;
}

export function countRunningBackgroundTasks(jobs: BackgroundJob[]): number {
	return jobs.filter((job) => isBackgroundTaskJob(job) && job.status === "running").length;
}

export function resolveBackgroundTaskQueueOrder(job: BackgroundJob): number {
	if (typeof job.queueOrder === "number" && Number.isFinite(job.queueOrder)) {
		return job.queueOrder;
	}
	return new Date(job.createdAt).getTime();
}

export function compareQueuedBackgroundTasks(left: BackgroundJob, right: BackgroundJob): number {
	const orderDelta = resolveBackgroundTaskQueueOrder(left) - resolveBackgroundTaskQueueOrder(right);
	return orderDelta !== 0
		? orderDelta
		: new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

export function sortQueuedBackgroundTasks(jobs: BackgroundJob[]): BackgroundJob[] {
	return [...jobs].sort(compareQueuedBackgroundTasks);
}

export function getNextBackgroundTaskQueueOrder(jobs: BackgroundJob[]): number {
	const queued = jobs.filter((job) => isBackgroundTaskJob(job) && job.status === "queued");
	return queued.length
		? Math.max(...queued.map((job) => resolveBackgroundTaskQueueOrder(job))) + 1
		: 1;
}

export function moveQueuedBackgroundTaskInOrder(
	queued: BackgroundJob[],
	jobId: string,
	direction: "up" | "down",
): BackgroundJob[] | null {
	const sorted = sortQueuedBackgroundTasks(queued);
	const currentIndex = sorted.findIndex((job) => job.id === jobId);
	if (currentIndex === -1) return null;

	const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
	if (targetIndex < 0 || targetIndex >= sorted.length) return null;

	const next = [...sorted];
	const [moved] = next.splice(currentIndex, 1);
	next.splice(targetIndex, 0, moved);
	return next.map((job, index) => ({ ...job, queueOrder: index + 1 }));
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
		.filter((job) =>
			job.status === "complete" || job.status === "failed" || job.status === "cancelled"
		)
		.sort(
			(left, right) =>
				new Date(right.finishedAt ?? right.createdAt).getTime() -
				new Date(left.finishedAt ?? left.createdAt).getTime(),
		);
	return { running, queued, completed };
}
