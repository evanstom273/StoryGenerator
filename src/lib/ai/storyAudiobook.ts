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

function getNextChapterBannerLabel(label: string) {
	const match = label.match(/chapter\s+(\d+)/i);
	if (match?.[1]) {
		const next = Number.parseInt(match[1], 10);
		if (Number.isFinite(next)) {
			return `Chapter ${next + 1}`;
		}
	}
	return `Chapter ${label}`;
}

export function listStoryAudiobookChapterSegments(
	messages: StoryMessage[],
	options: {
		playerName?: string | null;
		narrationTts: GeminiNarrationTtsSettings;
		characterRegistry: CharacterTtsRegistry;
		chapters?: StoryChapter[];
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
				narrationTts: options.narrationTts,
				characterRegistry: options.characterRegistry,
				allStoryMessages: messages,
				chapterTitle: start.label,
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

export async function synthesizeStoryAudiobookWav(params: {
	apiKey: string;
	segments: StoryAudiobookChapterSegment[];
	model: GeminiTtsModelId;
	signal?: AbortSignal;
	onProgress?: (message: string) => void;
}): Promise<ArrayBuffer> {
	const pcmParts: Uint8Array[] = [];

	for (let index = 0; index < params.segments.length; index += 1) {
		if (params.signal?.aborted) {
			throw new DOMException("Aborted", "AbortError");
		}

		const segment = params.segments[index]!;
		const chapterLabel = segment.label;
		params.onProgress?.(
			params.segments.length > 1
				? `Preparing ${chapterLabel} (${index + 1}/${params.segments.length})…`
				: "Preparing audiobook…",
		);

		let wavBytes: Uint8Array | null = null;
		const cached = await loadChapterWavFromCache(segment.playId, segment.plan, params.model);
		if (cached) {
			wavBytes = cached.wav;
		}

		if (!wavBytes) {
			params.onProgress?.(
				params.segments.length > 1
					? `Synthesizing ${chapterLabel} (${index + 1}/${params.segments.length})…`
					: "Synthesizing audiobook…",
			);

			const synthesized = await synthesizeGeminiSpeechPlan({
				apiKey: params.apiKey,
				plan: segment.plan,
				model: params.model,
				signal: params.signal,
				onProgress: (message) => {
					params.onProgress?.(
						params.segments.length > 1 ? `${chapterLabel}: ${message}` : message,
					);
				},
			});

			wavBytes = new Uint8Array(synthesized);
			const playDigest = await computeGeminiTtsCacheDigest(
				segment.playId,
				segment.plan,
				params.model,
			);
			await writeGeminiTtsCache(playDigest, segment.playId, wavBytes);

			const planDigest = await computeGeminiTtsPlanCacheDigest(segment.plan, params.model);
			if (planDigest !== playDigest) {
				await writeGeminiTtsCache(planDigest, segment.playId, wavBytes);
			}
		}

		const decoded = decodeWavToPcm16(wavBytes);
		pcmParts.push(normalizePcm16Loudness(decoded.pcm));

		if (index < params.segments.length - 1) {
			pcmParts.push(createSilencePcm16(SPEECH_MESSAGE_GAP_MS, decoded.sampleRate));
		}
	}

	return encodePcm16ToWav(concatPcm16(pcmParts));
}

export function buildStoryAudiobookFilename(storyTitle: string) {
	const slug = storyTitle
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return `${slug || "story"}-story-audiobook.wav`;
}

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
