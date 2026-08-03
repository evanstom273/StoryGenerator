import { GEMINI_TTS_VOICES, generateGeminiMultiSpeakerAudio } from "../ai/geminiTts";
import {
	buildGeminiTtsInput,
	extractPodcastDialogueFromMarkdown,
} from "./podcastScript";
import { encodePcm16ToWav, concatArrayBuffers } from "./wavEncode";

const MAX_TTS_CHARS = 6000;

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

export async function generateGeminiPodcastAudioFromMarkdown(params: {
	apiKey: string;
	markdown: string;
	signal?: AbortSignal;
	onProgress?: (message: string) => void;
}) {
	const dialogue = extractPodcastDialogueFromMarkdown(params.markdown);
	if (!dialogue) {
		throw new Error(
			"Could not extract host dialogue from the document. Use a podcast preset with labeled speaker lines.",
		);
	}

	const sections = splitMarkdownByChapterSections(params.markdown);
	const ttsChunks =
		sections.length > 1
			? sections
			: dialogue.script.length > MAX_TTS_CHARS
				? splitScriptByLength(dialogue.script, MAX_TTS_CHARS)
				: [dialogue.script];

	const wavParts: ArrayBuffer[] = [];
	for (let index = 0; index < ttsChunks.length; index += 1) {
		const chunk = ttsChunks[index]!;
		const chunkDialogue = extractPodcastDialogueFromMarkdown(chunk) ?? dialogue;
		params.onProgress?.(`Generating audio ${index + 1}/${ttsChunks.length}…`);

		const pcm = await generateGeminiMultiSpeakerAudio({
			apiKey: params.apiKey,
			input: buildGeminiTtsInput(chunkDialogue.script, chunkDialogue.hostOne, chunkDialogue.hostTwo),
			speakers: [
				{ name: chunkDialogue.hostOne, voice: GEMINI_TTS_VOICES.hostA },
				{ name: chunkDialogue.hostTwo, voice: GEMINI_TTS_VOICES.hostB },
			],
			signal: params.signal,
		});

		wavParts.push(encodePcm16ToWav(pcm));
	}

	return concatArrayBuffers(wavParts);
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

	return chunks;
}
