export type AudiobookPerformanceMode = "radio_drama" | "single_narrator";

export const DEFAULT_AUDIOBOOK_PERFORMANCE_MODE: AudiobookPerformanceMode = "radio_drama";

export function normalizeAudiobookPerformanceMode(
	value: string | null | undefined,
): AudiobookPerformanceMode {
	return value === "single_narrator" ? "single_narrator" : "radio_drama";
}
