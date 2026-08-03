import { generateGeminiMultiSpeakerAudio } from "./geminiTts";
import type { GeminiTtsModelId } from "./geminiTtsVoices";
import { concatPcm16, encodePcm16ToWav } from "../aiDocumentGenerator/wavEncode";
import type { SpeechScriptLine, SpeechSynthesisPlan } from "../storyText/messageSpeechText";

const MAX_TTS_CHARS = 4500;
const NARRATOR_SPEAKER_ALIAS = "Narrator";

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

function groupScriptLinesBySpeaker(scriptLines: SpeechScriptLine[]) {
	const groups: Array<{ speaker: string; texts: string[] }> = [];

	for (const line of scriptLines) {
		const last = groups[groups.length - 1];
		if (last?.speaker === line.speaker) {
			last.texts.push(line.text);
		} else {
			groups.push({ speaker: line.speaker, texts: [line.text] });
		}
	}

	return groups;
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

		pcmParts.push(pcm);
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

		pcmParts.push(pcm);
	}

	return encodePcm16ToWav(concatPcm16(pcmParts));
}
