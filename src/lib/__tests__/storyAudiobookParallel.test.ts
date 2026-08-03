import { describe, expect, it } from "vitest";
import {
	clampAudiobookParallelChapters,
	DEFAULT_AUDIOBOOK_PARALLEL_CHAPTERS,
	MAX_AUDIOBOOK_PARALLEL_CHAPTERS,
} from "../ai/storyAudiobookParallel";

describe("storyAudiobookParallel", () => {
	it("defaults invalid values to one chapter at a time", () => {
		expect(clampAudiobookParallelChapters(undefined)).toBe(DEFAULT_AUDIOBOOK_PARALLEL_CHAPTERS);
		expect(clampAudiobookParallelChapters(null)).toBe(DEFAULT_AUDIOBOOK_PARALLEL_CHAPTERS);
		expect(clampAudiobookParallelChapters(NaN)).toBe(DEFAULT_AUDIOBOOK_PARALLEL_CHAPTERS);
	});

	it("clamps chapter concurrency between one and five", () => {
		expect(clampAudiobookParallelChapters(0)).toBe(1);
		expect(clampAudiobookParallelChapters(2)).toBe(2);
		expect(clampAudiobookParallelChapters(5)).toBe(5);
		expect(clampAudiobookParallelChapters(12)).toBe(MAX_AUDIOBOOK_PARALLEL_CHAPTERS);
	});
});
