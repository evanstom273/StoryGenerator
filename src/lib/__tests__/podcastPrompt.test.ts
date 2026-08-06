import { describe, expect, it } from "vitest";
import { buildAiDocumentMessages } from "../aiDocumentGenerator/buildPrompt";
import { getAiDocumentPreset } from "../aiDocumentGenerator/presets";
import {
	estimateChapterDiscussionCoverage,
	formatPriorDiscussionsForPrompt,
	PODCAST_HOST_ONE,
	PODCAST_HOST_TWO,
} from "../aiDocumentGenerator/podcastPrompt";
import type { ChapterSourceSegment } from "../aiDocumentGenerator/types";

describe("podcastPrompt", () => {
	it("estimates brief coverage for short transition chapters", () => {
		const segments: ChapterSourceSegment[] = [
			{ label: "Chapter I", transcript: "A long opening with many events and dialogue.\nNarrator: Hello world.\n".repeat(40) },
			{ label: "Chapter II", transcript: "Brief transition.\nNarrator: They walked." },
		];
		const coverage = estimateChapterDiscussionCoverage(segments[1]!, segments);
		expect(coverage.tier).toBe("brief");
	});

	it("estimates extended or deep coverage for heavy chapters", () => {
		const emotional = "death grief tragedy betrayal reveal twist shock ".repeat(20);
		const segments: ChapterSourceSegment[] = [
			{ label: "Chapter I", transcript: "Short opener." },
			{
				label: "Chapter II",
				transcript: `${emotional}\nRiley: We have to run!\nDoctor: No!\n`.repeat(30),
			},
		];
		const coverage = estimateChapterDiscussionCoverage(segments[1]!, segments);
		expect(["extended", "deep"]).toContain(coverage.tier);
		expect(coverage.factors.length).toBeGreaterThan(0);
	});

	it("formats prior discussions for rolling context", () => {
		const segments: ChapterSourceSegment[] = [
			{ label: "Chapter I", transcript: "source" },
			{ label: "Chapter II", transcript: "source" },
		];
		const formatted = formatPriorDiscussionsForPrompt(
			segments,
			["**Morgan:** I thought that ally would return.", "**Casey:** Same."],
			1,
		);
		expect(formatted).toContain("Chapter I");
		expect(formatted).toContain("that ally");
	});

	it("includes Host One and Host Two in podcast chapter breakdown prompts", () => {
		const preset = getAiDocumentPreset("podcast-chapter-breakdown");
		const messages = buildAiDocumentMessages({
			preset,
			sourceLabel: "Example Story",
			sourceMaterial: "Chapter transcript",
			structure: "chapter-by-chapter",
			section: "introduction",
		});

		expect(messages[0].content).toContain(PODCAST_HOST_ONE);
		expect(messages[0].content).toContain(PODCAST_HOST_TWO);
		expect(messages[0].content).toContain("Final Thoughts");
		expect(messages[0].content).not.toContain("Summary Table");
	});

	it("includes coverage guidance in chapter section prompts", () => {
		const preset = getAiDocumentPreset("podcast-chapter-breakdown");
		const coverage = estimateChapterDiscussionCoverage(
			{ label: "Chapter III", transcript: "A standard chapter with some dialogue.\nHero: Hello." },
			[
				{ label: "Chapter I", transcript: "Opening." },
				{ label: "Chapter II", transcript: "Middle." },
				{ label: "Chapter III", transcript: "A standard chapter with some dialogue.\nHero: Hello." },
			],
		);
		const messages = buildAiDocumentMessages({
			preset,
			sourceLabel: "Example — Chapter III",
			sourceMaterial: "Chapter transcript only",
			structure: "chapter-by-chapter",
			section: "chapter",
			chapterLabel: "Chapter III",
			podcastChapterContext: {
				chapterIndex: 2,
				totalChapters: 3,
				coverage,
				priorDiscussions: "**Chapter I**\nMorgan: Early prediction about the harbor signal.",
			},
		});

		expect(messages[0].content).toContain("Do not spoil");
		expect(messages[0].content).toContain(coverage.targetGuidance);
		expect(messages[0].content).toContain("harbor signal");
	});
});
