import type { GenerateResponseResult } from "../ai/types";
import type { ChapterSourceSegment } from "./types";
import {
	buildAiDocumentMessages,
	buildEpilogueSourceMaterial,
} from "./buildPrompt";
import type { AiDocumentPreset } from "./presets";
import {
	estimateChapterDiscussionCoverage,
	formatPriorDiscussionsForPrompt,
} from "./podcastPrompt";
import { isNovelisationPreset } from "./novelisationPrompt";
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

	const isPodcastBreakdown = params.preset.id === "podcast-chapter-breakdown";
	const isNovelisation = isNovelisationPreset(params.preset.id);

	params.onProgress?.(isNovelisation ? "Writing title…" : "Writing introduction…");
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
	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index]!;
		if (params.signal?.aborted) {
			throw new Error("Request aborted.");
		}

		const coverage = estimateChapterDiscussionCoverage(segment, segments);
		const progressLabel =
			isPodcastBreakdown
				? `${segment.label} (${coverage.tier} coverage)`
				: segment.label;
		params.onProgress?.(`Chapter: ${progressLabel}`);

		const priorDiscussions = isPodcastBreakdown
			? formatPriorDiscussionsForPrompt(segments, chapterSections, index)
			: "";

		const chapterMessages = buildAiDocumentMessages({
			preset: params.preset,
			customPrompt: params.customPrompt,
			sourceLabel: `${params.sourceLabel} — ${segment.label}`,
			sourceMaterial: segment.transcript,
			structure: "chapter-by-chapter",
			section: "chapter",
			chapterLabel: segment.label,
			podcastChapterContext: isPodcastBreakdown
				? {
						chapterIndex: index,
						totalChapters: segments.length,
						coverage,
						priorDiscussions,
					}
				: undefined,
		});
		const section = await params.generateChunk(chapterMessages);
		chapterSections.push(section.trim());
	}

	if (isNovelisation) {
		return [introduction.trim(), ...chapterSections].filter(Boolean).join("\n\n");
	}

	params.onProgress?.(
		isPodcastBreakdown ? "Writing final thoughts…" : "Writing closing sections…",
	);
	const chapterLabels = segments.map((segment) => segment.label);
	const epilogueMessages = buildAiDocumentMessages({
		preset: params.preset,
		customPrompt: params.customPrompt,
		sourceLabel: params.sourceLabel,
		sourceMaterial: buildEpilogueSourceMaterial(chapterSections, chapterLabels),
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
