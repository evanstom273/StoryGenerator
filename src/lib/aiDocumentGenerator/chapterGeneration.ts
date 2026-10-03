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
	assertNovelisationChapterCoverage,
	assertNovelisationChapterSection,
	extractNovelisationTitleSourceMaterial,
	isNovelisationPreset,
	stripLeadingNovelisationChapterHeading,
} from "./novelisationPrompt";
import { buildChapterSegmentedSourceMaterial, buildSourceMaterialFromStoryBundle } from "./sourceMaterial";

type GenerateChunk = (messages: Array<{ role: "system" | "user"; content: string }>) => Promise<string>;

const NOVELISATION_CHAPTER_REQUEST_CHARS = 24000;

function splitSourceForNovelisationRequests(source: string, maxChars = NOVELISATION_CHAPTER_REQUEST_CHARS) {
	const trimmed = source.trim();
	if (!trimmed || trimmed.length <= maxChars) {
		return trimmed ? [trimmed] : [];
	}

	const lines = trimmed.split("\n");
	const parts: string[] = [];
	let current = "";

	const pushCurrent = () => {
		const value = current.trim();
		if (value) {
			parts.push(value);
		}
		current = "";
	};

	for (const line of lines) {
		if (line.length > maxChars) {
			pushCurrent();
			for (let offset = 0; offset < line.length; offset += maxChars) {
				parts.push(line.slice(offset, offset + maxChars));
			}
			continue;
		}

		const candidate = current ? `${current}\n${line}` : line;
		if (candidate.length > maxChars) {
			pushCurrent();
			current = line;
		} else {
			current = candidate;
		}
	}
	pushCurrent();
	return parts;
}

function buildNovelisationPartSource(
	part: string,
	partIndex: number,
	totalParts: number,
	previousTail: string,
) {
	if (totalParts <= 1) {
		return part;
	}

	return [
		`This logical chapter is being adapted in ${totalParts} consecutive source parts.`,
		`This request contains source part ${partIndex + 1} of ${totalParts}.`,
		partIndex === 0
			? "Start the chapter normally."
			: "Continue the SAME chapter directly. Do not restart it and do not repeat its chapter heading.",
		previousTail
			? `Previous generated prose ends with this continuity reference (do not repeat it):\n${previousTail}`
			: "",
		"",
		"Source for this part:",
		part,
	]
		.filter(Boolean)
		.join("\n\n");
}

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

	for (let partIndex = 0; partIndex < sourceParts.length; partIndex += 1) {
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

		if (isNovelisation) {
			const sourceParts = splitSourceForNovelisationRequests(segment.transcript);
			const generatedParts: string[] = [];
			for (let partIndex = 0; partIndex < sourceParts.length; partIndex += 1) {
				if (params.signal?.aborted) {
					throw new Error("Request aborted.");
				}
				const previousTail = generatedParts.length
					? generatedParts[generatedParts.length - 1]!.slice(-1200)
					: "";
				const chapterMessages = buildAiDocumentMessages({
					preset: params.preset,
					customPrompt: params.customPrompt,
					sourceLabel:
						sourceParts.length > 1
							? `${params.sourceLabel} — ${segment.label} — part ${partIndex + 1}/${sourceParts.length}`
							: `${params.sourceLabel} — ${segment.label}`,
					sourceMaterial: buildNovelisationPartSource(
						sourceParts[partIndex]!,
						partIndex,
						sourceParts.length,
						previousTail,
					),
					structure: "chapter-by-chapter",
					section: "chapter",
					chapterLabel: segment.label,
					novelisationChapterPart:
						sourceParts.length > 1
							? {
								partIndex,
								totalParts: sourceParts.length,
							}
							: undefined,
				});
				const generatedPart = await params.generateChunk(chapterMessages);
				generatedParts.push(
					partIndex === 0
						? generatedPart.trim()
						: stripNovelisationChapterHeading(generatedPart),
				);
			}
			chapterSections.push(generatedParts.filter(Boolean).join("\n\n").trim());
		} else {
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
		}
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
