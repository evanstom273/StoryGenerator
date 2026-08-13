import type { StoryChapter } from "../../types/models";
import { normalizeChapterDisplayLabel, formatElapsedSeconds } from "./storyAudiobookProgress";

export type StoryIndexingPhase =
	| "idle"
	| "loading"
	| "extracting"
	| "saving"
	| "done"
	| "error";

export type StoryIndexingStage =
	| "loading"
	| "messages"
	| "chapter-boundaries"
	| "chapter-reviews"
	| "saving-state";

export type IndexingChapterReviewStatus = "pending" | "active" | "done";

export interface IndexingChapterReviewItem {
	label: string;
	displayLabel: string;
	status: IndexingChapterReviewStatus;
	startedAtMs?: number;
	completedAtMs?: number;
}

export interface StoryIndexingUiStatus {
	storyId: string;
	phase: StoryIndexingPhase;
	processedMessages: number;
	totalMessages: number;
	message?: string;
	error?: string;
	warning?: string;
	startedAtMs?: number;
	stage?: StoryIndexingStage;
	chapterReviews?: IndexingChapterReviewItem[];
	jobId?: string;
}

export interface StoryIndexingDisplayProgress {
	stage: StoryIndexingStage;
	processed: number;
	total: number;
	summary: string;
	detail?: string;
	startedAtMs: number;
	chapterReviews?: IndexingChapterReviewItem[];
}

export interface SelectChaptersForArchiveRebuildOptions {
	incremental: boolean;
	previousDeepIndexedMessageCount?: number;
	rebuildAllChapterSummaries?: boolean;
	storedChapters?: StoryChapter[];
}

function chapterBoundariesMatch(left: StoryChapter, right: StoryChapter | undefined): boolean {
	if (!right) {
		return false;
	}
	return left.endsAtIndex === right.endsAtIndex && left.endsAtMessageId === right.endsAtMessageId;
}

export function shouldRebuildChapterArchiveSummary(
	chapter: StoryChapter,
	opts: SelectChaptersForArchiveRebuildOptions,
): boolean {
	if (opts.rebuildAllChapterSummaries) {
		return true;
	}

	if (!chapter.summary?.trim()) {
		return true;
	}

	const storedChapter = opts.storedChapters?.find((entry) => entry.id === chapter.id);
	if (!storedChapter || !chapterBoundariesMatch(chapter, storedChapter)) {
		return true;
	}

	if (opts.incremental) {
		return chapter.endsAtIndex > (opts.previousDeepIndexedMessageCount ?? 0);
	}

	return false;
}

export function selectChaptersForArchiveRebuild(
	chapters: StoryChapter[],
	opts: SelectChaptersForArchiveRebuildOptions,
): StoryChapter[] {
	const sorted = [...chapters].sort((left, right) => left.endsAtIndex - right.endsAtIndex);
	return sorted.filter((chapter) => shouldRebuildChapterArchiveSummary(chapter, opts));
}

export function buildInitialChapterReviewProgress(
	chapters: Pick<StoryChapter, "label">[],
): IndexingChapterReviewItem[] {
	return chapters.map((chapter) => ({
		label: chapter.label,
		displayLabel: normalizeChapterDisplayLabel(chapter.label),
		status: "pending",
	}));
}

export function resolveIndexingStage(status: StoryIndexingUiStatus): StoryIndexingStage {
	if (status.stage) {
		return status.stage;
	}

	switch (status.phase) {
		case "loading":
			return "loading";
		case "extracting":
			return "messages";
		case "saving":
			return "saving-state";
		default:
			return "loading";
	}
}

export function resolveIndexingDisplayProgress(
	status: StoryIndexingUiStatus,
): StoryIndexingDisplayProgress | null {
	if (status.phase === "idle" || status.phase === "done" || status.phase === "error") {
		return null;
	}

	const stage = resolveIndexingStage(status);
	const startedAtMs = status.startedAtMs ?? Date.now();

	if (stage === "chapter-reviews" && status.chapterReviews?.length) {
		const total = status.chapterReviews.length;
		const processed = status.chapterReviews.filter((chapter) => chapter.status === "done").length;
		const active = status.chapterReviews.find((chapter) => chapter.status === "active");

		return {
			stage,
			processed,
			total,
			summary: formatChapterReviewSummary(processed, total, active),
			detail: active?.displayLabel,
			startedAtMs,
			chapterReviews: status.chapterReviews,
		};
	}

	const processed =
		stage === "messages" || stage === "loading" ? status.processedMessages : status.processedMessages;
	const total = status.totalMessages;

	return {
		stage,
		processed,
		total,
		summary: status.message ?? formatIndexingStageSummary(stage, processed, total),
		detail: undefined,
		startedAtMs,
	};
}

export function formatIndexingStageSummary(
	stage: StoryIndexingStage,
	processed: number,
	total: number,
): string {
	switch (stage) {
		case "loading":
			return "Loading story…";
		case "messages":
			return total > 0 ? `Indexing message ${processed}/${total}…` : "Indexing messages…";
		case "chapter-boundaries":
			return "Rebuilding chapter boundaries…";
		case "chapter-reviews":
			return total > 0 ? `Rebuilding chapter reviews ${processed}/${total}…` : "Rebuilding chapter reviews…";
		case "saving-state":
			return "Saving indexed state…";
		default:
			return "Indexing…";
	}
}

export function formatChapterReviewSummary(
	processed: number,
	total: number,
	active?: IndexingChapterReviewItem,
): string {
	if (processed >= total && total > 0) {
		return "Chapter reviews complete";
	}

	if (active) {
		return `Chapter review ${processed + 1}/${total} · ${active.displayLabel}`;
	}

	return total > 0 ? `Chapter reviews ${processed}/${total}` : "Rebuilding chapter reviews…";
}

export function getIndexingProgressPercent(progress: StoryIndexingDisplayProgress): number {
	if (progress.total <= 0) {
		return progress.stage === "loading" ? 4 : 0;
	}

	return Math.min(100, Math.max(4, Math.round((progress.processed / progress.total) * 100)));
}

export { formatElapsedSeconds };
