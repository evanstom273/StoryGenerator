import { formatElapsedSeconds } from "../ai/storyAudiobookProgress";
import type { GuidedChapterProgressChapter, GuidedChapterProgressUpdate } from "./runGuidedChapters";

export type GuidedChapterUiStatus = {
	storyId: string;
	phase: GuidedChapterProgressUpdate["phase"];
	currentChapter: number;
	totalChapters: number;
	chapterLabel?: string;
	message?: string;
	chapters: GuidedChapterProgressChapter[];
	jobId?: string;
	startedAtMs?: number;
	error?: string;
};

export function buildGuidedChapterUiStatus(
	storyId: string,
	update: GuidedChapterProgressUpdate,
	opts?: { jobId?: string; startedAtMs?: number; error?: string },
): GuidedChapterUiStatus {
	return {
		storyId,
		phase: update.phase,
		currentChapter: update.currentChapter,
		totalChapters: update.totalChapters,
		chapterLabel: update.chapterLabel,
		message: update.message,
		chapters: update.chapters.map((chapter) => ({ ...chapter })),
		jobId: opts?.jobId,
		startedAtMs: opts?.startedAtMs,
		error: opts?.error,
	};
}

export function getGuidedChapterProgressPercent(status: GuidedChapterUiStatus): number {
	if (status.totalChapters <= 0) {
		return 0;
	}

	const doneCount = status.chapters.filter((chapter) => chapter.status === "done").length;
	const activeBonus = status.phase === "generating" || status.phase === "indexing" ? 0.35 : 0;
	const base = (doneCount + activeBonus) / status.totalChapters;
	return Math.min(100, Math.round(base * 100));
}

export function formatGuidedChapterProgressSummary(status: GuidedChapterUiStatus): string {
	if (status.phase === "done") {
		return "Guided chapter generation complete";
	}
	if (status.phase === "error") {
		return status.error ?? "Guided chapter generation failed";
	}
	if (status.chapterLabel) {
		return `${status.chapterLabel} · ${status.message ?? status.phase}`;
	}
	return status.message ?? "Generating chapters…";
}

export function formatGuidedElapsedLabel(startedAtMs?: number): string {
	if (!startedAtMs) {
		return "0s";
	}
	return formatElapsedSeconds(startedAtMs);
}
