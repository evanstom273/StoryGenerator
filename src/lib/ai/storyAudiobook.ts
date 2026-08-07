import type { GeminiTtsModelId } from "./geminiTtsVoices";
import {
	buildGeminiTtsSynthesisSignature,
	SPEECH_MESSAGE_GAP_MS,
	synthesizeGeminiSpeechPlan,
} from "./geminiTtsSynthesis";
import {
	computeGeminiTtsCacheDigest,
	computeGeminiTtsPlanCacheDigest,
	getGeminiTtsMemoryCache,
	readGeminiTtsCache,
	readGeminiTtsCacheForPlan,
	writeGeminiTtsCache,
} from "./geminiTtsCache";
import type { CharacterTtsRegistry } from "./characterTtsVoices";
import type { GeminiNarrationTtsSettings } from "./geminiTtsVoices";
import {
	concatPcm16,
	createSilencePcm16,
	decodeWavToPcm16,
	encodePcm16ToWav,
	normalizePcm16Loudness,
} from "../aiDocumentGenerator/wavEncode";
import {
	getMessagesForChapterStartingAt,
	resolveChapterEndMessageIndex,
	resolveMessageChapterBoundary,
} from "../storyText/chapterNavigation";
import {
	buildChapterSpeechPlan,
	type SpeechSynthesisPlan,
} from "../storyText/messageSpeechText";
import type { StoryChapter, StoryMessage } from "../../types/models";
import { getNextChapterBannerLabel } from "./chapterBannerLabel";
import { clampAudiobookParallelChapters } from "./storyAudiobookParallel";
import type { AudiobookPerformanceMode } from "./audiobookPerformance";
import { DEFAULT_AUDIOBOOK_PERFORMANCE_MODE } from "./audiobookPerformance";
import {
	buildInitialAudiobookProgress,
	cloneAudiobookProgress,
	parseTtsProgressDetail,
	updateChapterProgress,
	type StoryAudiobookProgress,
} from "./storyAudiobookProgress";

export interface StoryAudiobookChapterSegment {
	id: string;
	label: string;
	startMessageId: string;
	playId: string;
	plan: SpeechSynthesisPlan;
}

function sortMessages(messages: StoryMessage[]) {
	return [...messages].sort(
		(left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
	);
}

export function listStoryAudiobookChapterSegments(
	messages: StoryMessage[],
	options: {
		playerName?: string | null;
		playerSceneName?: string | null;
		playerPronouns?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
		characterRegistry: CharacterTtsRegistry;
		chapters?: StoryChapter[];
		audiobookPerformanceMode?: AudiobookPerformanceMode;
	},
): StoryAudiobookChapterSegment[] {
	const sorted = sortMessages(messages);
	const seenStartIds = new Set<string>();
	const segmentStarts: Array<{ messageId: string; label: string }> = [];

	const addStart = (messageId: string, label: string) => {
		if (!messageId || seenStartIds.has(messageId)) {
			return;
		}
		seenStartIds.add(messageId);
		segmentStarts.push({ messageId, label });
	};

	const sortedChapters = [...(options.chapters ?? [])].sort(
		(left, right) => left.endsAtIndex - right.endsAtIndex,
	);
	for (const chapter of sortedChapters) {
		const endIndex = resolveChapterEndMessageIndex(messages, chapter);
		if (endIndex !== null && endIndex + 1 < sorted.length) {
			const nextMessage = sorted[endIndex + 1];
			if (nextMessage) {
				addStart(nextMessage.id, getNextChapterBannerLabel(chapter.label));
			}
		}
	}

	for (const message of sorted) {
		const boundary = resolveMessageChapterBoundary(message);
		if (boundary?.kind === "start") {
			addStart(message.id, boundary.label);
		}
	}

	if (segmentStarts.length === 0 && sorted.length > 0) {
		addStart(sorted[0]!.id, "Full Story");
	}

	segmentStarts.sort(
		(left, right) =>
			sorted.findIndex((message) => message.id === left.messageId) -
			sorted.findIndex((message) => message.id === right.messageId),
	);

	return segmentStarts
		.map((start) => {
			const chapterMessages = getMessagesForChapterStartingAt(messages, start.messageId);
			const plan = buildChapterSpeechPlan(chapterMessages, {
				playerName: options.playerName,
				playerSceneName: options.playerSceneName,
				playerPronouns: options.playerPronouns,
				narrationTts: options.narrationTts,
				characterRegistry: options.characterRegistry,
				allStoryMessages: messages,
				chapterTitle: start.label,
				audiobookPerformanceMode:
					options.audiobookPerformanceMode ?? DEFAULT_AUDIOBOOK_PERFORMANCE_MODE,
			});

			if (!plan) {
				return null;
			}

			return {
				id: start.messageId,
				label: start.label,
				startMessageId: start.messageId,
				playId: `chapter-${start.messageId}`,
				plan,
			};
		})
		.filter((segment): segment is StoryAudiobookChapterSegment => segment !== null);
}

async function loadChapterWavFromCache(
	playId: string,
	plan: SpeechSynthesisPlan,
	model: GeminiTtsModelId,
) {
	const playDigest = await computeGeminiTtsCacheDigest(playId, plan, model);
	const fromPlayId =
		getGeminiTtsMemoryCache(playDigest) ?? (await readGeminiTtsCache(playDigest));
	if (fromPlayId) {
		return { wav: fromPlayId, digest: playDigest };
	}

	const fromPlan = await readGeminiTtsCacheForPlan(plan, model);
	if (fromPlan) {
		return { wav: fromPlan, digest: playDigest };
	}

	return null;
}

async function synthesizeChapterSegmentWav(params: {
	apiKey: string;
	segment: StoryAudiobookChapterSegment;
	model: GeminiTtsModelId;
	signal?: AbortSignal;
	onDetail?: (detail: string) => void;
}) {
	if (params.signal?.aborted) {
		throw new DOMException("Aborted", "AbortError");
	}

	let wavBytes: Uint8Array | null = null;
	const cached = await loadChapterWavFromCache(
		params.segment.playId,
		params.segment.plan,
		params.model,
	);
	if (cached) {
		wavBytes = cached.wav;
	}

	if (!wavBytes) {
		const synthesized = await synthesizeGeminiSpeechPlan({
			apiKey: params.apiKey,
			plan: params.segment.plan,
			model: params.model,
			signal: params.signal,
			onProgress: (message) => {
				params.onDetail?.(parseTtsProgressDetail(message));
			},
		});

		wavBytes = new Uint8Array(synthesized);
		const playDigest = await computeGeminiTtsCacheDigest(
			params.segment.playId,
			params.segment.plan,
			params.model,
		);
		await writeGeminiTtsCache(playDigest, params.segment.playId, wavBytes);

		const planDigest = await computeGeminiTtsPlanCacheDigest(params.segment.plan, params.model);
		if (planDigest !== playDigest) {
			await writeGeminiTtsCache(planDigest, params.segment.playId, wavBytes);
		}
	}

	return wavBytes;
}

export async function synthesizeStoryAudiobookWav(params: {
	apiKey: string;
	segments: StoryAudiobookChapterSegment[];
	model: GeminiTtsModelId;
	parallelChapters?: number;
	signal?: AbortSignal;
	onProgress?: (progress: StoryAudiobookProgress) => void;
}): Promise<ArrayBuffer> {
	const parallelChapters = clampAudiobookParallelChapters(params.parallelChapters);
	const pcmParts: Uint8Array[] = [];
	const segmentCount = params.segments.length;
	let progressState = buildInitialAudiobookProgress(params.segments);
	const emitProgress = () => params.onProgress?.(cloneAudiobookProgress(progressState));
	emitProgress();

	for (let batchStart = 0; batchStart < segmentCount; batchStart += parallelChapters) {
		if (params.signal?.aborted) {
			throw new DOMException("Aborted", "AbortError");
		}

		const batch = params.segments.slice(batchStart, batchStart + parallelChapters);
		const batchStartedAtMs = Date.now();
		const batchPrep = await Promise.all(
			batch.map(async (segment) => ({
				segment,
				cached: await loadChapterWavFromCache(segment.playId, segment.plan, params.model),
			})),
		);

		for (const entry of batchPrep) {
			if (entry.cached) {
				progressState = updateChapterProgress(progressState, entry.segment.id, {
					status: "cached",
					startedAtMs: batchStartedAtMs,
					completedAtMs: Date.now(),
					detail: undefined,
				});
			} else {
				progressState = updateChapterProgress(progressState, entry.segment.id, {
					status: "synthesizing",
					startedAtMs: batchStartedAtMs,
					detail: undefined,
				});
			}
		}
		emitProgress();

		const wavResults = await Promise.all(
			batchPrep.map(async (entry, batchIndex) => {
				const segmentIndex = batchStart + batchIndex;
				const segment = entry.segment;

				const wavBytes = entry.cached
					? entry.cached.wav
					: await synthesizeChapterSegmentWav({
							apiKey: params.apiKey,
							segment,
							model: params.model,
							signal: params.signal,
							onDetail: (detail) => {
								progressState = updateChapterProgress(progressState, segment.id, {
									detail,
								});
								emitProgress();
							},
						});

				progressState = updateChapterProgress(progressState, segment.id, {
					status: "done",
					completedAtMs: Date.now(),
					detail: undefined,
				});
				emitProgress();

				return { segmentIndex, wavBytes };
			}),
		);

		for (const result of wavResults.sort((left, right) => left.segmentIndex - right.segmentIndex)) {
			const decoded = decodeWavToPcm16(result.wavBytes);
			pcmParts.push(normalizePcm16Loudness(decoded.pcm));

			if (result.segmentIndex < segmentCount - 1) {
				pcmParts.push(createSilencePcm16(SPEECH_MESSAGE_GAP_MS, decoded.sampleRate));
			}
		}
	}

	return encodePcm16ToWav(concatPcm16(pcmParts));
}

export { buildStoryAudiobookFilename } from "../exportFilename";

export async function computeStoryAudiobookPreparedDigest(
	playId: string,
	segments: StoryAudiobookChapterSegment[],
	model: GeminiTtsModelId,
) {
	const signatures = segments.map((segment) => buildGeminiTtsSynthesisSignature(segment.plan));
	const payload = JSON.stringify({
		v: 1,
		playId,
		model,
		signatures,
	});

	if (typeof crypto !== "undefined" && crypto.subtle?.digest) {
		const bytes = new TextEncoder().encode(payload);
		const digest = await crypto.subtle.digest("SHA-256", bytes);
		return Array.from(new Uint8Array(digest))
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("");
	}

	let hash = 2166136261;
	for (let index = 0; index < payload.length; index += 1) {
		hash ^= payload.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return `f${(hash >>> 0).toString(16)}`;
}
