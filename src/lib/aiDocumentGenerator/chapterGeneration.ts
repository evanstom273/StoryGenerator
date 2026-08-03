import type { GenerateResponseResult } from "../ai/types";
import type { ChapterSourceSegment } from "./types";
import {
	buildAiDocumentMessages,
	buildEpilogueSourceMaterial,
} from "./buildPrompt";
import type { AiDocumentPreset } from "./presets";
import { buildChapterSegmentedSourceMaterial, buildSourceMaterialFromStoryBundle } from "./sourceMaterial";

type GenerateChunk = (messages: Array<{ role: "system" | "user"; content: string }>) => Promise<string>;

export async function generateChapterStructuredDocument(params: {
	preset: AiDocumentPreset;
	customPrompt?: string;
	sourceLabel: string;
	chapterSegments: ChapterSourceSegment[];
	fullSourceMaterial: string;
	generateChunk: GenerateChunk;
	onProgress?: (message: string) => void;
	signal?: AbortSignal;
}) {
	if (params.signal?.aborted) {
		throw new Error("Request aborted.");
	}

	const segments = params.chapterSegments.filter((segment) => segment.transcript.trim());
	if (segments.length <= 1) {
		const messages = buildAiDocumentMessages({
			preset: params.preset,
			customPrompt: params.customPrompt,
			sourceLabel: params.sourceLabel,
			sourceMaterial: params.fullSourceMaterial,
			structure: "chapter-by-chapter",
		});
		return await params.generateChunk(messages);
	}

	params.onProgress?.("Writing introduction…");
	const introMessages = buildAiDocumentMessages({
		preset: params.preset,
		customPrompt: params.customPrompt,
		sourceLabel: params.sourceLabel,
		sourceMaterial: params.fullSourceMaterial,
		structure: "chapter-by-chapter",
		section: "introduction",
	});
	const introduction = await params.generateChunk(introMessages);

	const chapterSections: string[] = [];
	for (const segment of segments) {
		if (params.signal?.aborted) {
			throw new Error("Request aborted.");
		}
		params.onProgress?.(`Chapter: ${segment.label}`);
		const chapterMessages = buildAiDocumentMessages({
			preset: params.preset,
			customPrompt: params.customPrompt,
			sourceLabel: `${params.sourceLabel} — ${segment.label}`,
			sourceMaterial: segment.transcript,
			structure: "chapter-by-chapter",
			section: "chapter",
			chapterLabel: segment.label,
		});
		const section = await params.generateChunk(chapterMessages);
		chapterSections.push(section.trim());
	}

	params.onProgress?.("Writing summary, themes, and open questions…");
	const epilogueMessages = buildAiDocumentMessages({
		preset: params.preset,
		customPrompt: params.customPrompt,
		sourceLabel: params.sourceLabel,
		sourceMaterial: buildEpilogueSourceMaterial(chapterSections),
		structure: "chapter-by-chapter",
		section: "epilogue",
	});
	const epilogue = await params.generateChunk(epilogueMessages);

	return [introduction.trim(), ...chapterSections, epilogue.trim()].filter(Boolean).join("\n\n---\n\n");
}

export function resolveSourceMaterialForStructure(
	bundle: import("../../types/models").StoryExportBundle,
	structure: "single" | "chapter-by-chapter",
) {
	if (structure === "chapter-by-chapter") {
		return buildChapterSegmentedSourceMaterial(bundle);
	}
	return buildSourceMaterialFromStoryBundle(bundle);
}

export type { GenerateResponseResult };
