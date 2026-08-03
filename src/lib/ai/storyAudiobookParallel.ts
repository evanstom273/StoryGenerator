export const DEFAULT_AUDIOBOOK_PARALLEL_CHAPTERS = 1;
export const MAX_AUDIOBOOK_PARALLEL_CHAPTERS = 5;

export function clampAudiobookParallelChapters(value: number | null | undefined) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return DEFAULT_AUDIOBOOK_PARALLEL_CHAPTERS;
	}

	return Math.min(
		MAX_AUDIOBOOK_PARALLEL_CHAPTERS,
		Math.max(DEFAULT_AUDIOBOOK_PARALLEL_CHAPTERS, Math.round(parsed)),
	);
}
