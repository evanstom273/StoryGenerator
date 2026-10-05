import type { GenerateResponseResult } from "../ai/types";
import { GenerationFailureError, isGenerationFailureError, type GenerationFailure } from "../ai/errors";
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
	assertNovelisationChapterCoverage,
	assertNovelisationChapterSection,
	extractNovelisationTitleSourceMaterial,
	isNovelisationPreset,
	stripLeadingNovelisationChapterHeading,
} from "./novelisationPrompt";
import { buildChapterSegmentedSourceMaterial, buildSourceMaterialFromStoryBundle } from "./sourceMaterial";

type GenerateChunk = (messages: Array<{ role: "system" | "user"; content: string }>) => Promise<string>;

export type ChapterDocumentProgressUpdate = {
	steps: BackgroundJobStep[];
};

/**
 * Keep each novelisation request comfortably below model context/output limits.
 * A long logical chapter is adapted in multiple source parts and then stitched
 * back into one chapter. This is deliberately independent of chapter count:
 * 10, 30, or 100 chapters all use the same loop.
 */
export const NOVELISATION_SOURCE_PART_MAX_CHARS = 12000;
const NOVELISATION_CONTINUITY_TAIL_CHARS = 2400;

function splitOversizedLine(line: string, maxChars: number): string[] {
	const parts: string[] = [];
	let remaining = line.trim();

	while (remaining.length > maxChars) {
		let cutAt = remaining.lastIndexOf(" ", maxChars);
		if (cutAt < Math.floor(maxChars * 0.6)) {
			cutAt = maxChars;
		}
		parts.push(remaining.slice(0, cutAt).trim());
		remaining = remaining.slice(cutAt).trimStart();
	}

	if (remaining) {
		parts.push(remaining);
	}

	return parts;
}

export function splitNovelisationChapterSource(
	transcript: string,
	maxChars = NOVELISATION_SOURCE_PART_MAX_CHARS,
): string[] {
	const normalized = transcript.trim();
	if (!normalized) {
		return [];
	}
	if (normalized.length <= maxChars) {
		return [normalized];
	}

	const parts: string[] = [];
	let current = "";

	const flushCurrent = () => {
		if (current.trim()) {
			parts.push(current.trim());
		}
		current = "";
	};

	for (const rawLine of normalized.split("\n")) {
		const line = rawLine.trimEnd();
		const candidate = current ? `${current}\n${line}` : line;
		if (candidate.length <= maxChars) {
			current = candidate;
			continue;
		}

		flushCurrent();
		if (line.length <= maxChars) {
			current = line;
			continue;
		}

		const oversizedParts = splitOversizedLine(line, maxChars);
		for (let index = 0; index < oversizedParts.length; index += 1) {
			const part = oversizedParts[index]!;
			if (index === oversizedParts.length - 1) {
				current = part;
			} else {
				parts.push(part);
			}
		}
	}

	flushCurrent();
	return parts;
}

function getContinuityTail(text: string) {
	const trimmed = text.trim();
	return trimmed.length <= NOVELISATION_CONTINUITY_TAIL_CHARS
		? trimmed
		: trimmed.slice(-NOVELISATION_CONTINUITY_TAIL_CHARS);
}

function withNovelisationFailureContext(
	failure: GenerationFailure,
	args: {
		chapterLabel: string;
		partIndex: number;
		totalParts: number;
		fallback?: string;
		fallbackSource?: string;
	},
) {
	const partLabel = `${args.partIndex + 1}/${Math.max(1, args.totalParts)}`;
	return {
		...failure,
		summaryMessage:
			`${failure.summaryMessage}\nFailed while generating ${args.chapterLabel} (part ${partLabel}).`,
		diagnostic: [
			failure.diagnostic,
			"documentStep=chapter",
			`chapterLabel=${args.chapterLabel}`,
			`chapterPart=${partLabel}`,
			args.fallback ? `fallback=${args.fallback}` : undefined,
			args.fallbackSource ? `fallbackSource=${args.fallbackSource}` : undefined,
		]
			.filter(Boolean)
			.join("; "),
	};
}

function buildNovelisationSummaryFallbackPrompt(customPrompt?: string) {
	return [
		customPrompt?.trim(),
		"Provider-refusal fallback: adapt only the canonical high-level chapter summary supplied as source.",
		"Preserve the established events, emotional beats, relationships, and outcomes from that summary.",
		"Keep sensitive material non-graphic and non-procedural. Do not add instructions, anatomical detail, or new events.",
		"Write the chapter as polished novel prose without mentioning this fallback or the missing transcript.",
	]
		.filter(Boolean)
		.join("\n\n");
}

async function generateNovelisationChapter(params: {
	preset: AiDocumentPreset;
	customPrompt?: string;
	sourceLabel: string;
	segment: ChapterSourceSegment;
	generateChunk: GenerateChunk;
	signal?: AbortSignal;
}) {
	const sourceParts = splitNovelisationChapterSource(params.segment.transcript);
	if (!sourceParts.length) {
		throw new Error(
			`Novelisation generation failed: ${params.segment.label} had no source material.`,
		);
	}

	let assembled = "";
	let activePartIndex = 0;

	try {
		for (let partIndex = 0; partIndex < sourceParts.length; partIndex += 1) {
			activePartIndex = partIndex;
			if (params.signal?.aborted) {
				throw new Error("Request aborted.");
			}

			const chapterMessages = buildAiDocumentMessages({
				preset: params.preset,
				customPrompt: params.customPrompt,
				sourceLabel:
				`${params.sourceLabel} — ${params.segment.label}` +
				(sourceParts.length > 1 ? ` — part ${partIndex + 1}/${sourceParts.length}` : ""),
				sourceMaterial: sourceParts[partIndex]!,
				structure: "chapter-by-chapter",
				section: "chapter",
				chapterLabel: params.segment.label,
				novelisationChapterPartContext: {
					partIndex,
					totalParts: sourceParts.length,
					previousProseTail: partIndex > 0 ? getContinuityTail(assembled) : undefined,
				},
			});

			const generatedPart = (await params.generateChunk(chapterMessages)).trim();
			if (partIndex === 0) {
				assertNovelisationChapterSection(generatedPart, params.segment.label);
				assembled = generatedPart;
				continue;
			}

			const continuation = stripLeadingNovelisationChapterHeading(generatedPart);
			if (!continuation) {
				throw new Error(
					`Novelisation generation failed: ${params.segment.label} part ${partIndex + 1} contained no prose.`,
				);
			}
			assembled = `${assembled.trim()}\n\n${continuation}`;
		}

		return assembled.trim();
	} catch (error) {
		if (!isGenerationFailureError(error)) {
			throw error;
		}

		const contextualFailure = withNovelisationFailureContext(error.failure, {
			chapterLabel: params.segment.label,
			partIndex: activePartIndex,
			totalParts: sourceParts.length,
		});

		const summary = params.segment.summary?.trim();
		if (contextualFailure.kind !== "provider_refusal" || !summary) {
			throw new GenerationFailureError(contextualFailure);
		}

		if (params.signal?.aborted) {
			throw new Error("Request aborted.");
		}

		const fallbackMessages = buildAiDocumentMessages({
			preset: params.preset,
			customPrompt: buildNovelisationSummaryFallbackPrompt(params.customPrompt),
			sourceLabel: `${params.sourceLabel} — ${params.segment.label} — summary fallback`,
			sourceMaterial: `Canonical high-level summary for ${params.segment.label}:\n\n${summary}`,
			structure: "chapter-by-chapter",
			section: "chapter",
			chapterLabel: params.segment.label,
			novelisationChapterPartContext: {
				partIndex: 0,
				totalParts: 1,
			},
		});

		try {
			const fallbackChapter = (await params.generateChunk(fallbackMessages)).trim();
			assertNovelisationChapterSection(fallbackChapter, params.segment.label);
			return fallbackChapter;
		} catch (fallbackError) {
			if (!isGenerationFailureError(fallbackError)) {
				throw fallbackError;
			}

			const fallbackFailure = withNovelisationFailureContext(fallbackError.failure, {
				chapterLabel: params.segment.label,
				partIndex: 0,
				totalParts: 1,
				fallback: "chapter_summary_non_graphic",
				fallbackSource: "canonical_chapter_summary",
			});
			throw new GenerationFailureError({
				...fallbackFailure,
				summaryMessage:
					`${fallbackFailure.summaryMessage}\nThe full-transcript request was refused first, and the one-time high-level chapter-summary fallback was also refused.`,
			});
		}
	}
}

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
	const normalizedSegments =
		segments.length > 0
			? segments
			: [{ label: "Chapter I", transcript: params.fullSourceMaterial.trim() }];

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
		chapterLabels: normalizedSegments.map((segment) => {
			if (!isPodcastBreakdown) {
				return segment.label;
			}
			const coverage = estimateChapterDiscussionCoverage(segment, normalizedSegments);
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
				normalizedSegments.map((segment) => segment.label),
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
	for (let index = 0; index < normalizedSegments.length; index += 1) {
		const segment = normalizedSegments[index]!;
		if (params.signal?.aborted) {
			throw new Error("Request aborted.");
		}

		const stepId = `chapter-${index}`;
		reportStep(stepId, "start");

		if (isNovelisation) {
			const section = await generateNovelisationChapter({
				preset: params.preset,
				customPrompt: params.customPrompt,
				sourceLabel: params.sourceLabel,
				segment,
				generateChunk: params.generateChunk,
				signal: params.signal,
			});
			chapterSections.push(section);
			reportStep(stepId, "complete");
			continue;
		}

		const coverage = estimateChapterDiscussionCoverage(segment, normalizedSegments);
		const priorDiscussions = isPodcastBreakdown
			? formatPriorDiscussionsForPrompt(normalizedSegments, chapterSections, index)
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
						totalChapters: normalizedSegments.length,
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
		const document = assembleNovelisationDocument(introduction, chapterSections);
		assertNovelisationChapterCoverage(
			document,
			normalizedSegments.map((segment) => segment.label),
		);
		return document;
	}

	reportStep("epilogue", "start");
	const chapterLabels = normalizedSegments.map((segment) => segment.label);
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
