import { describe, expect, it } from "vitest";
import {
	DEFAULT_AUDIOBOOK_PERFORMANCE_MODE,
	normalizeAudiobookPerformanceMode,
} from "../ai/audiobookPerformance";

describe("normalizeAudiobookPerformanceMode", () => {
	it("defaults to radio drama", () => {
		expect(DEFAULT_AUDIOBOOK_PERFORMANCE_MODE).toBe("radio_drama");
		expect(normalizeAudiobookPerformanceMode(undefined)).toBe("radio_drama");
	});

	it("accepts single narrator", () => {
		expect(normalizeAudiobookPerformanceMode("single_narrator")).toBe("single_narrator");
	});
});
