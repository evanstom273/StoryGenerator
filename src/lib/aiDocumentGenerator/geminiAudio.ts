import { generateGeminiMultiSpeakerAudio } from "../ai/geminiTts";
import {
	resolveGeminiPodcastTtsSettings,
	type GeminiPodcastTtsSettings,
} from "../ai/geminiTtsVoices";
import { isGenerationFailureError } from "../ai/errors";
import {
	buildGeminiTtsInput,
	extractPodcastDialogueFromMarkdown,
} from "./podcastScript";
import { concatPcm16, encodePcm16ToWav } from "./wavEncode";

const MAX_TTS_CHARS = 4500;
const CHUNK_ATTEMPTS = 4;

export interface GeminiPodcastTtsChunk {
	script: string;
	hostOne: string;
	hostTwo: string;
}

export interface GeminiPodcastAudioResumeState {
	pcmParts: Uint8Array[];
}

export interface GeminiPodcastAudioChunkProgress {
	index: number;
	total: number;
	pcmParts: Uint8Array[];
}

function splitMarkdownByChapterSections(markdown: string) {
	const lines = markdown.split("\n");
	const chunks: string[] = [];
	let current: string[] = [];

	for (const line of lines) {
		if (line.startsWith("### ") && current.length) {
			chunks.push(current.join("\n").trim());
			current = [line];
			continue;
		}
		current.push(line);
	}

	if (current.length) {
		chunks.push(current.join("\n").trim());
	}

	return chunks.filter(Boolean);
}

function splitScriptByLength(script: string, maxChars: number) {
	const lines = script.split("\n");
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

function splitDialogueIntoChunks(dialogue: {
	hostOne: string;
	hostTwo: string;
	script: string;
}): GeminiPodcastTtsChunk[] {
	if (dialogue.script.length <= MAX_TTS_CHARS) {
		return [
			{
				script: dialogue.script,
				hostOne: dialogue.hostOne,
				hostTwo: dialogue.hostTwo,
			},
		];
	}

	return splitScriptByLength(dialogue.script, MAX_TTS_CHARS).map((script) => ({
		script,
		hostOne: dialogue.hostOne,
		hostTwo: dialogue.hostTwo,
	}));
}

export function planGeminiPodcastTtsChunks(markdown: string) {
	const dialogue = extractPodcastDialogueFromMarkdown(markdown);
	if (!dialogue) {
		return [];
	}

	const sections = splitMarkdownByChapterSections(markdown);
	const chunks: GeminiPodcastTtsChunk[] = [];

	if (sections.length <= 1) {
		return splitDialogueIntoChunks(dialogue);
	}

	for (const section of sections) {
		const sectionDialogue = extractPodcastDialogueFromMarkdown(section);
		if (!sectionDialogue?.script.trim()) {
			continue;
		}
		chunks.push(...splitDialogueIntoChunks(sectionDialogue));
	}

	return chunks.length ? chunks : splitDialogueIntoChunks(dialogue);
}

function shouldRetryChunkError(error: unknown, signal?: AbortSignal) {
	if (signal?.aborted) {
		return false;
	}
	if (isGenerationFailureError(error)) {
		return error.failure.kind !== "cancelled";
	}
	if (error instanceof Error && /abort/i.test(error.message)) {
		return false;
	}
	return true;
}

export async function generateGeminiPodcastAudioFromMarkdown(params: {
	apiKey: string;
	markdown: string;
	signal?: AbortSignal;
	onProgress?: (message: string) => void;
	onChunkComplete?: (state: GeminiPodcastAudioChunkProgress) => void;
	resume?: GeminiPodcastAudioResumeState;
	tts?: Partial<GeminiPodcastTtsSettings>;
}) {
	const ttsSettings = resolveGeminiPodcastTtsSettings(params.tts);
	const dialogue = extractPodcastDialogueFromMarkdown(params.markdown);
	if (!dialogue) {
		throw new Error(
			"Could not extract host dialogue from the document. Use a podcast preset with labeled speaker lines.",
		);
	}

	const ttsChunks = planGeminiPodcastTtsChunks(params.markdown);
	if (!ttsChunks.length) {
		throw new Error("Could not find podcast dialogue to synthesize.");
	}

	const pcmParts: Uint8Array[] = params.resume?.pcmParts ? [...params.resume.pcmParts] : [];
	const startIndex = pcmParts.length;

	if (startIndex >= ttsChunks.length) {
		return encodePcm16ToWav(concatPcm16(pcmParts));
	}

	if (startIndex > 0) {
		params.onProgress?.(`Resuming audio at ${startIndex + 1}/${ttsChunks.length}…`);
	}

	for (let index = startIndex; index < ttsChunks.length; index += 1) {
		const chunk = ttsChunks[index]!;
		params.onProgress?.(`Generating audio ${index + 1}/${ttsChunks.length}…`);

		let pcm: Uint8Array | undefined;
		for (let attempt = 0; attempt < CHUNK_ATTEMPTS; attempt += 1) {
			try {
				pcm = await generateGeminiMultiSpeakerAudio({
					apiKey: params.apiKey,
					input: buildGeminiTtsInput(chunk.script, chunk.hostOne, chunk.hostTwo),
					speakers: [
						{ name: chunk.hostOne, voice: ttsSettings.hostOneVoice },
						{ name: chunk.hostTwo, voice: ttsSettings.hostTwoVoice },
					],
					signal: params.signal,
					model: ttsSettings.model,
				});
				break;
			} catch (error) {
				if (!shouldRetryChunkError(error, params.signal) || attempt === CHUNK_ATTEMPTS - 1) {
					throw error;
				}
				params.onProgress?.(
					`Retrying audio ${index + 1}/${ttsChunks.length} (attempt ${attempt + 2}/${CHUNK_ATTEMPTS})…`,
				);
			}
		}

		if (!pcm?.byteLength) {
			throw new Error(`Gemini TTS returned no audio for segment ${index + 1}/${ttsChunks.length}.`);
		}

		pcmParts.push(pcm);
		params.onChunkComplete?.({
			index,
			total: ttsChunks.length,
			pcmParts: [...pcmParts],
		});
	}

	return encodePcm16ToWav(concatPcm16(pcmParts));
}
