import type { GenerateResponseResult } from "../ai/types";
import type { BackgroundJobStep } from "../../types/models";
import {
	buildChapterDocumentSteps,
	setBackgroundJobStepStatus,
} from "../backgroundTasks";
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
import {
	assembleNovelisationDocument,
	extractNovelisationTitleSourceMaterial,
	isNovelisationPreset,
} from "./novelisationPrompt";
import { buildChapterSegmentedSourceMaterial, buildSourceMaterialFromStoryBundle } from "./sourceMaterial";

type GenerateChunk = (messages: Array<{ role: "system" | "user"; content: string }>) => Promise<string>;

export type ChapterDocumentProgressUpdate = {
	steps: BackgroundJobStep[];
};

export async function generateChapterStructuredDocument(params: {
	preset: AiDocumentPreset;
	customPrompt?: string;
	sourceLabel: string;
	chapterSegments: ChapterSourceSegment[];
	fullSourceMaterial: string;
	generateChunk: GenerateChunk;
	onProgress?: (update: ChapterDocumentProgressUpdate) => void;
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
	const introLabel = isNovelisation ? "Writing title" : "Writing introduction";
	const epilogueLabel = isNovelisation
		? null
		: isPodcastBreakdown
			? "Writing final thoughts"
			: "Writing closing sections";

	let steps = buildChapterDocumentSteps({
		introLabel,
		chapterLabels: segments.map((segment) => {
			if (!isPodcastBreakdown) {
				return segment.label;
			}
			const coverage = estimateChapterDiscussionCoverage(segment, segments);
			return `${segment.label} (${coverage.tier} coverage)`;
		}),
		epilogueLabel,
	});

	const reportStep = (activeStepId: string, mode: "start" | "complete") => {
		steps = setBackgroundJobStepStatus(steps, activeStepId, mode);
		params.onProgress?.({ steps });
	};

	reportStep("intro", "start");
	const introSourceMaterial = isNovelisation
		? extractNovelisationTitleSourceMaterial(
				params.fullSourceMaterial,
				segments.map((segment) => segment.label),
			)
		: params.fullSourceMaterial;
	const introMessages = buildAiDocumentMessages({
		preset: params.preset,
		customPrompt: params.customPrompt,
		sourceLabel: params.sourceLabel,
		sourceMaterial: introSourceMaterial,
		structure: "chapter-by-chapter",
		section: "introduction",
	});
	const introduction = await params.generateChunk(introMessages);
	reportStep("intro", "complete");

	const chapterSections: string[] = [];
	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index]!;
		if (params.signal?.aborted) {
			throw new Error("Request aborted.");
		}

		const coverage = estimateChapterDiscussionCoverage(segment, segments);
		const stepId = `chapter-${index}`;
		reportStep(stepId, "start");

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
		reportStep(stepId, "complete");
	}

	if (isNovelisation) {
		return assembleNovelisationDocument(introduction, chapterSections);
	}

	reportStep("epilogue", "start");
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
	reportStep("epilogue", "complete");

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
