import { describe, expect, it } from "vitest";
import {
	buildInitialAudiobookProgress,
	normalizeChapterDisplayLabel,
	parseTtsProgressDetail,
	updateChapterProgress,
} from "../ai/storyAudiobookProgress";

describe("storyAudiobookProgress", () => {
	it("normalizes doubled chapter prefixes", () => {
		expect(normalizeChapterDisplayLabel("Chapter Chapter II")).toBe("Chapter II");
	});

	it("parses inner TTS progress without redundant prefixes", () => {
		expect(parseTtsProgressDetail("Synthesizing Director 2/66…")).toBe("Director 2/66");
		expect(parseTtsProgressDetail("Synthesizing audio…")).toBe("audio");
	});

	it("tracks per-chapter status updates", () => {
		const initial = buildInitialAudiobookProgress([
			{ id: "a", label: "Chapter I" },
			{ id: "b", label: "Chapter II" },
		]);

		const synthesizing = updateChapterProgress(initial, "a", {
			status: "synthesizing",
			startedAtMs: 1000,
			detail: "Director 1/12",
		});

		expect(synthesizing.chapters[0]?.status).toBe("synthesizing");
		expect(synthesizing.chapters[0]?.detail).toBe("Director 1/12");
		expect(synthesizing.summary).toContain("Chapter I");
	});
});
