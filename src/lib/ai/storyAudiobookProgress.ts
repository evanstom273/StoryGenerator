import type { StoryAudiobookChapterSegment } from "./storyAudiobook";

export type AudiobookChapterSynthStatus = "pending" | "cached" | "synthesizing" | "done";

export interface AudiobookChapterProgressItem {
	segmentId: string;
	label: string;
	displayLabel: string;
	status: AudiobookChapterSynthStatus;
	startedAtMs?: number;
	completedAtMs?: number;
	detail?: string;
}

export interface StoryAudiobookProgress {
	chapters: AudiobookChapterProgressItem[];
	summary: string;
}

export function formatElapsedSeconds(startedAtMs: number, endedAtMs = Date.now()) {
	const seconds = Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
	if (seconds < 60) {
		return `${seconds}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function normalizeChapterDisplayLabel(label: string) {
	const trimmed = label.trim();
	const doubled = trimmed.match(/^Chapter\s+(Chapter\s+.+)$/i);
	if (doubled?.[1]) {
		return normalizeChapterDisplayLabel(doubled[1]);
	}
	return trimmed;
}

export function buildInitialAudiobookProgress(
	segments: Pick<StoryAudiobookChapterSegment, "id" | "label">[],
): StoryAudiobookProgress {
	const chapters = segments.map((segment) => ({
		segmentId: segment.id,
		label: segment.label,
		displayLabel: normalizeChapterDisplayLabel(segment.label),
		status: "pending" as const,
	}));

	return {
		chapters,
		summary:
			segments.length > 1 ? `Preparing ${segments.length} chapters…` : "Preparing audiobook…",
	};
}

export function formatAudiobookProgressSummary(progress: StoryAudiobookProgress) {
	const total = progress.chapters.length;
	const doneCount = progress.chapters.filter(
		(chapter) => chapter.status === "done" || chapter.status === "cached",
	).length;
	const active = progress.chapters.filter((chapter) => chapter.status === "synthesizing");

	if (doneCount === total && total > 0) {
		return "Stitching audiobook…";
	}

	if (active.length === 0 && doneCount === 0) {
		return progress.summary;
	}

	if (active.length === 1 && total === 1) {
		const chapter = active[0]!;
		return chapter.detail ? `${chapter.displayLabel} — ${chapter.detail}` : chapter.displayLabel;
	}

	if (active.length > 0) {
		if (doneCount > 0) {
			return `${doneCount}/${total} chapters ready · ${active.length} synthesizing`;
		}

		const labels = active.map((chapter) => chapter.displayLabel).join(" · ");
		if (active.length === 1) {
			const chapter = active[0]!;
			return chapter.detail ? `${chapter.displayLabel} — ${chapter.detail}` : chapter.displayLabel;
		}

		return `Synthesizing ${labels}`;
	}

	return `${doneCount}/${total} chapters ready`;
}

export function parseTtsProgressDetail(message: string) {
	const trimmed = message.trim().replace(/…$/, "");
	const prefixMatch = trimmed.match(/^Synthesizing\s+(.+)$/i);
	if (prefixMatch?.[1]) {
		return prefixMatch[1].trim();
	}

	return trimmed;
}

export function cloneAudiobookProgress(progress: StoryAudiobookProgress): StoryAudiobookProgress {
	return {
		summary: progress.summary,
		chapters: progress.chapters.map((chapter) => ({ ...chapter })),
	};
}

export function updateChapterProgress(
	progress: StoryAudiobookProgress,
	segmentId: string,
	patch: Partial<AudiobookChapterProgressItem>,
): StoryAudiobookProgress {
	const chapters = progress.chapters.map((chapter) =>
		chapter.segmentId === segmentId ? { ...chapter, ...patch } : chapter,
	);
	const next: StoryAudiobookProgress = { ...progress, chapters };
	next.summary = formatAudiobookProgressSummary(next);
	return next;
}
