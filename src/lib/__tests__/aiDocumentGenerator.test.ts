import { describe, expect, it } from "vitest";
import { buildAiDocumentMessages } from "../aiDocumentGenerator/buildPrompt";
import {
	AI_DOCUMENT_CUSTOM_PRESET_ID,
	buildAiDocumentFilename,
	getAiDocumentPreset,
} from "../aiDocumentGenerator/presets";
import { buildNovelisationSystemPrompt } from "../aiDocumentGenerator/novelisationPrompt";
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

	it("registers novelisation preset with format-conversion instructions", () => {
		const preset = getAiDocumentPreset("novelisation");
		expect(preset.displayName).toBe("Novelisation");
		expect(preset.defaultStructure).toBe("chapter-by-chapter");
		expect(preset.systemPrompt).toBe(buildNovelisationSystemPrompt());
		expect(preset.systemPrompt).toContain("professional novel adaptor");
		expect(preset.systemPrompt).toContain("FORMAT ADAPTATION");
		expect(preset.systemPrompt).not.toContain("companion Markdown document");
	});

	it("includes novelisation chapter structure instructions", () => {
		const preset = getAiDocumentPreset("novelisation");
		const messages = buildAiDocumentMessages({
			preset,
			sourceLabel: "Example Story",
			sourceMaterial: "Chapter source",
			structure: "chapter-by-chapter",
			section: "chapter",
			chapterLabel: "Chapter II",
		});

		expect(messages[0].content).toContain("Write ONLY the novel prose for Chapter II");
		expect(messages[0].content).toContain("concise chapter title");
		expect(messages[0].content).not.toContain("Sam");
	});

	it("includes author chapter title rules when a subtitle exists", () => {
		const preset = getAiDocumentPreset("novelisation");
		const messages = buildAiDocumentMessages({
			preset,
			sourceLabel: "Example Story",
			sourceMaterial: "Chapter source",
			structure: "chapter-by-chapter",
			section: "chapter",
			chapterLabel: "Chapter II: Principal's Office",
		});

		expect(messages[0].content).toContain("## Chapter II: Principal's Office");
		expect(messages[0].content).not.toContain("concise chapter title");
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
		expect(messages[0].content).toContain("Morgan");
		expect(messages[0].content).toContain("predictions");
	});

	it("extracts labeled podcast dialogue for Gemini TTS", () => {
		const markdown = [
			"### Chapter I: Lunch",
			"",
			"**Morgan:** Welcome back!",
			"**Casey:** Let's dive in.",
		].join("\n");

		const dialogue = extractPodcastDialogueFromMarkdown(markdown);
		expect(dialogue?.hostOne).toBe("Morgan");
		expect(dialogue?.hostTwo).toBe("Casey");
		expect(dialogue?.script).toContain("Morgan: Welcome back!");
	});

	it("builds filenames with extensions", () => {
		expect(buildAiDocumentFilename("story-summary")).toBe("story-summary.md");
		expect(buildAiDocumentFilename("novelisation", "Rivera")).toBe("rivera-novelisation.md");
		expect(buildAiDocumentFilename("podcast-chapter-breakdown", "Rivera", "wav")).toBe(
			"rivera-podcast-chapter-breakdown.wav",
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
		expect(buildAudioFilenameFromMarkdownUpload("Rivera Custom Document.MARKDOWN")).toBe(
			"rivera-custom-document.wav",
		);
	});

	it("splits long chapter sections into multiple TTS chunks", () => {
		const lines = ["### Chapter I", "", "**Morgan:** Hello.", "**Casey:** Hi."];
		for (let index = 0; index < 120; index += 1) {
			lines.push(`**Morgan:** Line ${index} with enough text to grow the script.`);
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
