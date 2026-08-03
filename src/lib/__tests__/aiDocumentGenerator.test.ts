import { describe, expect, it } from "vitest";
import { buildAiDocumentMessages } from "../aiDocumentGenerator/buildPrompt";
import {
	AI_DOCUMENT_CUSTOM_PRESET_ID,
	buildAiDocumentFilename,
	getAiDocumentPreset,
} from "../aiDocumentGenerator/presets";

describe("aiDocumentGenerator", () => {
	it("builds messages from preset and source material", () => {
		const preset = getAiDocumentPreset("story-summary");
		const messages = buildAiDocumentMessages({
			preset,
			sourceLabel: "Example Story",
			sourceMaterial: "Transcript line one.",
		});

		expect(messages.length).toBe(2);
		expect(messages[0].role).toBe("system");
		expect(messages[0].content).toContain("companion Markdown document");
		expect(messages[1].content).toContain("Example Story");
		expect(messages[1].content).toContain("Transcript line one.");
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

	it("builds filenames from preset stems", () => {
		expect(buildAiDocumentFilename("story-summary")).toBe("story-summary.md");
		expect(buildAiDocumentFilename("podcast-discussion", "Brooklyn Nine-Nine")).toBe(
			"brooklyn-nine-nine-podcast-discussion.md",
		);
	});
});
