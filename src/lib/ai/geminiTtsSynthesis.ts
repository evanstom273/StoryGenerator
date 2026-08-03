import { generateGeminiMultiSpeakerAudio } from "./geminiTts";
import type { GeminiTtsModelId } from "./geminiTtsVoices";
import { buildGeminiTtsInput } from "../aiDocumentGenerator/podcastScript";
import { concatPcm16, encodePcm16ToWav } from "../aiDocumentGenerator/wavEncode";
import type { SpeechSynthesisPlan } from "../storyText/messageSpeechText";

const MAX_TTS_CHARS = 4500;

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

export async function synthesizeGeminiSpeechPlan(params: {
	apiKey: string;
	plan: SpeechSynthesisPlan;
	model: GeminiTtsModelId;
	signal?: AbortSignal;
	onProgress?: (message: string) => void;
}) {
	const chunks = splitTextByLength(params.plan.text, MAX_TTS_CHARS);
	const pcmParts: Uint8Array[] = [];

	for (let index = 0; index < chunks.length; index += 1) {
		const chunk = chunks[index]!;
		params.onProgress?.(
			chunks.length > 1 ? `Synthesizing audio ${index + 1}/${chunks.length}…` : "Synthesizing audio…",
		);

		const input = params.plan.multiSpeaker
			? buildGeminiTtsInput(
					chunk,
					params.plan.speakers[0]!.name,
					params.plan.speakers[1]?.name ?? params.plan.speakers[0]!.name,
				)
			: buildNarrationTtsInput(chunk);

		const pcm = await generateGeminiMultiSpeakerAudio({
			apiKey: params.apiKey,
			input,
			speakers: params.plan.speakers,
			model: params.model,
			signal: params.signal,
		});

		pcmParts.push(pcm);
	}

	return encodePcm16ToWav(concatPcm16(pcmParts));
}
