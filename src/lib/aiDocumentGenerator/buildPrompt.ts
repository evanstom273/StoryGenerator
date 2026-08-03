import type { AiDocumentPreset } from "./presets";
import { AI_DOCUMENT_CUSTOM_PRESET_ID } from "./presets";
import type { AiDocumentStructure } from "./types";

export function buildAiDocumentMessages(params: {
	preset: AiDocumentPreset;
	customPrompt?: string;
	sourceLabel: string;
	sourceMaterial: string;
	structure?: AiDocumentStructure;
	section?: "introduction" | "chapter" | "epilogue";
	chapterLabel?: string;
}) {
	const customInstructions =
		params.preset.id === AI_DOCUMENT_CUSTOM_PRESET_ID
			? params.customPrompt?.trim()
			: params.preset.systemPrompt;

	if (!customInstructions) {
		throw new Error("Describe the document you want generated.");
	}

	const structureNote =
		params.structure === "chapter-by-chapter"
			? buildChapterStructureInstructions(params.section, params.chapterLabel)
			: "";

	const systemContent =
		params.preset.id === AI_DOCUMENT_CUSTOM_PRESET_ID
			? `${params.preset.systemPrompt}\n\nCustom instructions:\n${customInstructions}${structureNote}`
			: `${customInstructions}${structureNote}`;

	const userContent = [
		`Source: ${params.sourceLabel}`,
		"",
		"---",
		"",
		"Use the following Story Engine source material as your only reference:",
		"",
		params.sourceMaterial,
	].join("\n");

	return [
		{ role: "system" as const, content: systemContent },
		{ role: "user" as const, content: userContent },
	];
}

function buildChapterStructureInstructions(
	section?: "introduction" | "chapter" | "epilogue",
	chapterLabel?: string,
) {
	if (section === "introduction") {
		return `\n\nWrite ONLY the podcast title block, host names, topic line, and Introduction section. Do not summarize individual chapters yet.`;
	}

	if (section === "chapter" && chapterLabel?.trim()) {
		return `\n\nWrite ONLY the podcast section for ${chapterLabel.trim()}.
Use ### ${chapterLabel.trim()}: [short descriptive subtitle] as the heading.
Use two hosts in dialogue (label them consistently, e.g. Host A and Host B or Sam and Alex).
Do not write the introduction, summary table, themes section, or open questions.`;
	}

	if (section === "epilogue") {
		return `\n\nWrite ONLY the closing sections after all chapter discussions:
1. ### Summary Table — markdown table with Chapter, Key Location, Core Events columns for every chapter covered
2. ### Themes & Character Arcs — bullet lists for core themes and character evolution
3. ### Open Questions for Listeners — numbered thoughtful questions
Do not repeat chapter-by-chapter dialogue.`;
	}

	return `\n\nStructure requirements:
- Title with podcast name and story topic
- Host names and short introduction
- One ### section per chapter in source order, each with a descriptive subtitle and two-host dialogue
- ### Summary Table with Chapter | Key Location | Core Events
- ### Themes & Character Arcs (core themes + character evolution)
- ### Open Questions for Listeners`;
}

export function buildEpilogueSourceMaterial(chapterSections: string[]) {
	return chapterSections
		.map((section, index) => `Chapter section ${index + 1}:\n${section.trim()}`)
		.join("\n\n---\n\n");
}
