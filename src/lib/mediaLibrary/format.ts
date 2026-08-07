export function formatDurationMs(durationMs: number): string {
	if (!Number.isFinite(durationMs) || durationMs <= 0) {
		return "0:00";
	}

	const totalSeconds = Math.floor(durationMs / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatPlaybackProgress(lastPositionMs: number, durationMs: number): string {
	if (!durationMs) {
		return formatDurationMs(lastPositionMs);
	}

	const percent = Math.min(100, Math.round((lastPositionMs / durationMs) * 100));
	return `${percent}% · ${formatDurationMs(lastPositionMs)} / ${formatDurationMs(durationMs)}`;
}

export const MEDIA_ASSET_CATEGORY_LABELS: Record<
	import("../../types/models").MediaAssetCategory,
	string
> = {
	audiobook: "Audiobooks",
	chapter: "Chapter Audio",
	ai_document: "AI Documents",
	podcast: "Podcasts",
};
