import type { AiDocumentPreset } from "./presets";
import { AI_DOCUMENT_CUSTOM_PRESET_ID } from "./presets";
import type { AiDocumentStructure } from "./types";
import type { ChapterCoverageGuide } from "./podcastPrompt";
import {
	buildPodcastChapterSectionPrompt,
	buildPodcastFinalThoughtsSectionPrompt,
	buildPodcastIntroductionSectionPrompt,
} from "./podcastPrompt";
import {
	buildNovelisationChapterSectionPrompt,
	buildNovelisationTitleSectionPrompt,
	isNovelisationPreset,
} from "./novelisationPrompt";

function isPodcastPreset(preset: AiDocumentPreset) {
	return preset.id === "podcast-chapter-breakdown" || preset.id === "podcast-discussion";
}

export function buildAiDocumentMessages(params: {
	preset: AiDocumentPreset;
	customPrompt?: string;
	sourceLabel: string;
	sourceMaterial: string;
	structure?: AiDocumentStructure;
	section?: "introduction" | "chapter" | "epilogue";
	chapterLabel?: string;
	podcastChapterContext?: {
		chapterIndex: number;
		totalChapters: number;
		coverage: ChapterCoverageGuide;
		priorDiscussions: string;
	};
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
			? buildChapterStructureInstructions(
					params.preset,
					params.section,
					params.chapterLabel,
					params.podcastChapterContext,
				)
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
	preset: AiDocumentPreset,
	section?: "introduction" | "chapter" | "epilogue",
	chapterLabel?: string,
	podcastChapterContext?: {
		chapterIndex: number;
		totalChapters: number;
		coverage: ChapterCoverageGuide;
		priorDiscussions: string;
	},
) {
	if (isNovelisationPreset(preset.id)) {
		if (section === "introduction") {
			return buildNovelisationTitleSectionPrompt();
		}

		if (section === "chapter" && chapterLabel?.trim()) {
			return buildNovelisationChapterSectionPrompt(chapterLabel);
		}

		if (section === "epilogue") {
			return "";
		}

		return `
Structure requirements:
- A single top-level title heading
- One ## chapter heading per source chapter in order
- Continuous novel prose under each chapter heading`;
	}

	if (preset.id === "podcast-chapter-breakdown") {
		if (section === "introduction") {
			return buildPodcastIntroductionSectionPrompt();
		}

		if (section === "chapter" && chapterLabel?.trim() && podcastChapterContext) {
			return buildPodcastChapterSectionPrompt({
				chapterLabel,
				chapterIndex: podcastChapterContext.chapterIndex,
				totalChapters: podcastChapterContext.totalChapters,
				coverage: podcastChapterContext.coverage,
				priorDiscussions: podcastChapterContext.priorDiscussions,
			});
		}

		if (section === "epilogue") {
			return buildPodcastFinalThoughtsSectionPrompt();
		}

		return `
Structure requirements:
- Title with podcast name and story topic
- ### Introduction with Sam and Alex welcoming listeners
- One ### section per chapter in source order (labelled **Sam:** / **Alex:** dialogue)
- ### Final Thoughts — rich closing discussion`;
	}

	if (section === "introduction") {
		return `\n\nWrite ONLY the podcast title block, host names, topic line, and Introduction section. Do not summarize individual chapters yet.`;
	}

	if (section === "chapter" && chapterLabel?.trim()) {
		const hostNote = isPodcastPreset(preset)
			? "Use Sam and Alex with **Sam:** / **Alex:** labels."
			: "Use two hosts in dialogue (label them consistently).";
		return `\n\nWrite ONLY the podcast section for ${chapterLabel.trim()}.
Use ### ${chapterLabel.trim()}: [short descriptive subtitle] as the heading.
${hostNote}
Do not write the introduction or closing sections.`;
	}

	if (section === "epilogue") {
		if (isPodcastPreset(preset)) {
			return buildPodcastFinalThoughtsSectionPrompt();
		}
		return `\n\nWrite ONLY the closing sections after all chapter discussions.
Do not repeat chapter-by-chapter dialogue.`;
	}

	return `\n\nStructure requirements:
- Title with podcast name and story topic
- Host names and short introduction
- One ### section per chapter in source order
- Closing discussion section`;
}

export function buildEpilogueSourceMaterial(chapterSections: string[], chapterLabels?: string[]) {
	return chapterSections
		.map((section, index) => {
			const label = chapterLabels?.[index]?.trim() || `Chapter section ${index + 1}`;
			return `${label}:\n${section.trim()}`;
		})
		.join("\n\n---\n\n");
}
