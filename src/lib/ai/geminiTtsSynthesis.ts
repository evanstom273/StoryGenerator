import { generateGeminiMultiSpeakerAudio } from "./geminiTts";
import type { GeminiTtsModelId } from "./geminiTtsVoices";
import {
	concatPcm16,
	createSilencePcm16,
	encodePcm16ToWav,
	normalizePcm16Loudness,
} from "../aiDocumentGenerator/wavEncode";
import type { SpeechScriptLine, SpeechSynthesisPlan } from "../storyText/messageSpeechText";

const MAX_TTS_CHARS = 4500;
const NARRATOR_SPEAKER_ALIAS = "Narrator";
export const GEMINI_TTS_SAMPLE_RATE = 24000;
export const SPEECH_GROUP_GAP_MS = 400;
export const SPEECH_MESSAGE_GAP_MS = 1000;
export const SPEECH_CHUNK_GAP_MS = 300;

function splitTextByLength(text: string, maxChars: number) {
	if (text.length <= maxChars) {
		return [text];
	}

	const lines = text.split("\n");
	const chunks: string[] = [];
	let current: string[] = [];
	let size = 0;

	for (const line of lines) {
		const lineSize = line.length + 1;
		if (size + lineSize > maxChars && current.length) {
			chunks.push(current.join("\n"));
			current = [];
			size = 0;
		}
		current.push(line);
		size += lineSize;
	}

	if (current.length) {
		chunks.push(current.join("\n"));
	}

	return chunks.filter(Boolean);
}

function buildNarrationTtsInput(text: string) {
	return `Read the following passage aloud with a clear, natural, emotive narration voice:\n\n${text}`;
}

function resolveVoiceForSpeaker(
	speaker: string,
	speakers: Array<{ name: string; voice: string }>,
) {
	const match = speakers.find((entry) => entry.name === speaker);
	return match?.voice ?? speakers[0]?.voice ?? "Iapetus";
}

export interface SpeechScriptLineGroup {
	speaker: string;
	texts: string[];
	messageBreakAfter?: boolean;
}

export function groupScriptLinesBySpeaker(scriptLines: SpeechScriptLine[]): SpeechScriptLineGroup[] {
	const groups: SpeechScriptLineGroup[] = [];

	for (const line of scriptLines) {
		const last = groups[groups.length - 1];
		if (last?.speaker === line.speaker && !last.messageBreakAfter) {
			last.texts.push(line.text);
			last.messageBreakAfter = line.messageBreakAfter;
		} else {
			groups.push({
				speaker: line.speaker,
				texts: [line.text],
				messageBreakAfter: line.messageBreakAfter,
			});
		}
	}

	return groups;
}

export function buildGeminiTtsSynthesisSignature(plan: SpeechSynthesisPlan) {
	if (!plan.scriptLines.length) {
		const voice = plan.speakers[0]?.voice ?? "Iapetus";
		return `narrator:${voice}\0${plan.text}`;
	}

	const groups = groupScriptLinesBySpeaker(plan.scriptLines);
	return groups
		.map((group) => {
			const voice = resolveVoiceForSpeaker(group.speaker, plan.speakers);
			return `${group.speaker}\0${voice}\0${group.texts.join("\n\n")}`;
		})
		.join("\n");
}

function appendSpeechGap(
	pcmParts: Uint8Array[],
	gapMs: number,
	sampleRate = GEMINI_TTS_SAMPLE_RATE,
) {
	if (gapMs > 0) {
		pcmParts.push(createSilencePcm16(gapMs, sampleRate));
	}
}

async function synthesizeScriptLineGroups(params: {
	apiKey: string;
	plan: SpeechSynthesisPlan;
	model: GeminiTtsModelId;
	signal?: AbortSignal;
	onProgress?: (message: string) => void;
}) {
	const groups = groupScriptLinesBySpeaker(params.plan.scriptLines);
	const pcmParts: Uint8Array[] = [];

	for (let index = 0; index < groups.length; index += 1) {
		const group = groups[index]!;
		params.onProgress?.(
			groups.length > 1
				? `Synthesizing ${group.speaker} ${index + 1}/${groups.length}…`
				: "Synthesizing audio…",
		);

		const text = group.texts.join("\n\n");
		const voice = resolveVoiceForSpeaker(group.speaker, params.plan.speakers);
		const input = buildNarrationTtsInput(text);

		const pcm = await generateGeminiMultiSpeakerAudio({
			apiKey: params.apiKey,
			input,
			speakers: [{ name: NARRATOR_SPEAKER_ALIAS, voice }],
			model: params.model,
			signal: params.signal,
		});

		pcmParts.push(normalizePcm16Loudness(pcm));

		if (index < groups.length - 1) {
			const gapMs = group.messageBreakAfter ? SPEECH_MESSAGE_GAP_MS : SPEECH_GROUP_GAP_MS;
			appendSpeechGap(pcmParts, gapMs);
		}
	}

	return encodePcm16ToWav(concatPcm16(pcmParts));
}

export async function synthesizeGeminiSpeechPlan(params: {
	apiKey: string;
	plan: SpeechSynthesisPlan;
	model: GeminiTtsModelId;
	signal?: AbortSignal;
	onProgress?: (message: string) => void;
}) {
	if (params.plan.scriptLines.length > 0) {
		return synthesizeScriptLineGroups(params);
	}

	const chunks = splitTextByLength(params.plan.text, MAX_TTS_CHARS);
	const pcmParts: Uint8Array[] = [];

	for (let index = 0; index < chunks.length; index += 1) {
		const chunk = chunks[index]!;
		params.onProgress?.(
			chunks.length > 1 ? `Synthesizing audio ${index + 1}/${chunks.length}…` : "Synthesizing audio…",
		);

		const voice = params.plan.speakers[0]?.voice ?? "Iapetus";
		const input = buildNarrationTtsInput(chunk);

		const pcm = await generateGeminiMultiSpeakerAudio({
			apiKey: params.apiKey,
			input,
			speakers: [{ name: NARRATOR_SPEAKER_ALIAS, voice }],
			model: params.model,
			signal: params.signal,
		});

		pcmParts.push(normalizePcm16Loudness(pcm));

		if (index < chunks.length - 1) {
			appendSpeechGap(pcmParts, SPEECH_CHUNK_GAP_MS);
		}
	}

	return encodePcm16ToWav(concatPcm16(pcmParts));
}
