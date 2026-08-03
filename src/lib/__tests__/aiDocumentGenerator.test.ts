import { describe, expect, it } from "vitest";
import { buildAiDocumentMessages } from "../aiDocumentGenerator/buildPrompt";
import {
	AI_DOCUMENT_CUSTOM_PRESET_ID,
	buildAiDocumentFilename,
	getAiDocumentPreset,
} from "../aiDocumentGenerator/presets";
import { extractPodcastDialogueFromMarkdown } from "../aiDocumentGenerator/podcastScript";
import { encodePcm16ToWav } from "../aiDocumentGenerator/wavEncode";

describe("aiDocumentGenerator", () => {
	it("builds messages from preset and source material", () => {
		const preset = getAiDocumentPreset("story-summary");
		const messages = buildAiDocumentMessages({
			preset,
			sourceLabel: "Example Story",
			sourceMaterial: "Transcript line one.",
		});

		expect(messages.length).toBe(2);
		expect(messages[0].content).toContain("companion Markdown document");
		expect(messages[1].content).toContain("Example Story");
	});

	it("includes chapter structure instructions for podcast chapter breakdown", () => {
		const preset = getAiDocumentPreset("podcast-chapter-breakdown");
		const messages = buildAiDocumentMessages({
			preset,
			sourceLabel: "Example Story",
			sourceMaterial: "Chapter source",
			structure: "chapter-by-chapter",
		});

		expect(messages[0].content).toContain("Summary Table");
		expect(messages[0].content).toContain("Open Questions");
	});

	it("extracts labeled podcast dialogue for Gemini TTS", () => {
		const markdown = [
			"### Chapter I: Lunch",
			"",
			"**Sam:** Welcome back!",
			"**Alex:** Let's dive in.",
		].join("\n");

		const dialogue = extractPodcastDialogueFromMarkdown(markdown);
		expect(dialogue?.hostOne).toBe("Sam");
		expect(dialogue?.hostTwo).toBe("Alex");
		expect(dialogue?.script).toContain("Sam: Welcome back!");
	});

	it("builds filenames with extensions", () => {
		expect(buildAiDocumentFilename("story-summary")).toBe("story-summary.md");
		expect(buildAiDocumentFilename("podcast-chapter-breakdown", "Peralta", "wav")).toBe(
			"peralta-podcast-chapter-breakdown.wav",
		);
	});

	it("requires custom instructions for the custom preset", () => {
		const preset = getAiDocumentPreset(AI_DOCUMENT_CUSTOM_PRESET_ID);
		expect(() =>
			buildAiDocumentMessages({
				preset,
				sourceLabel: "Upload",
				sourceMaterial: "Source",
			}),
		).toThrow(/describe the document/i);
	});

	it("encodes pcm to wav", () => {
		const pcm = new Uint8Array([0, 0, 1, 0]);
		const wav = encodePcm16ToWav(pcm);
		expect(wav.byteLength).toBeGreaterThan(44);
	});
});
