import { describe, expect, it } from "vitest";
import { buildAiDocumentMessages } from "../aiDocumentGenerator/buildPrompt";
import {
	AI_DOCUMENT_CUSTOM_PRESET_ID,
	buildAiDocumentFilename,
	getAiDocumentPreset,
} from "../aiDocumentGenerator/presets";
import { extractPodcastDialogueFromMarkdown } from "../aiDocumentGenerator/podcastScript";
import { buildAudioFilenameFromMarkdownUpload } from "../aiDocumentGenerator/sourceMaterial";
import { planGeminiPodcastTtsChunks } from "../aiDocumentGenerator/geminiAudio";
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

	it("includes podcast structure for chapter breakdown preset", () => {
		const preset = getAiDocumentPreset("podcast-chapter-breakdown");
		const messages = buildAiDocumentMessages({
			preset,
			sourceLabel: "Example Story",
			sourceMaterial: "Chapter source",
			structure: "chapter-by-chapter",
		});

		expect(messages[0].content).toContain("Final Thoughts");
		expect(messages[0].content).toContain("Sam");
		expect(messages[0].content).toContain("predictions");
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

	it("builds audio filename from markdown upload name", () => {
		expect(buildAudioFilenameFromMarkdownUpload("podcast-discussion.md")).toBe(
			"podcast-discussion.wav",
		);
		expect(buildAudioFilenameFromMarkdownUpload("Peralta Custom Document.MARKDOWN")).toBe(
			"peralta-custom-document.wav",
		);
	});

	it("splits long chapter sections into multiple TTS chunks", () => {
		const lines = ["### Chapter I", "", "**Sam:** Hello.", "**Alex:** Hi."];
		for (let index = 0; index < 120; index += 1) {
			lines.push(`**Sam:** Line ${index} with enough text to grow the script.`);
		}
		const markdown = lines.join("\n");
		const chunks = planGeminiPodcastTtsChunks(markdown);
		expect(chunks.length).toBeGreaterThan(1);
	});

	it("encodes pcm to wav", () => {
		const pcm = new Uint8Array([0, 0, 1, 0]);
		const wav = encodePcm16ToWav(pcm);
		expect(wav.byteLength).toBeGreaterThan(44);
	});
});
