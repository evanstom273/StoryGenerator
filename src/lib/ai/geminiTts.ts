import { normalizeAIError } from "./errors";

const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const GEMINI_TTS_FALLBACK_MODEL = "gemini-2.5-flash-preview-tts";
const GEMINI_INTERACTIONS_API_REVISION = "2026-05-20";
const TTS_REQUEST_TIMEOUT_MS = 180_000;
const TTS_ATTEMPTS_PER_MODEL = 3;

export const GEMINI_TTS_VOICES = {
	hostA: "Kore",
	hostB: "Puck",
} as const;

interface ContentBlock {
	type?: string;
	data?: string;
	mime_type?: string;
}

interface InteractionStep {
	type?: string;
	content?: ContentBlock[];
}

export interface GeminiInteractionPayload {
	output_audio?: {
		data?: string;
		mime_type?: string;
	};
	outputs?: ContentBlock[];
	steps?: InteractionStep[];
	error?: {
		message?: string;
	};
}

function decodeBase64ToBytes(base64: string) {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

function isWavBytes(bytes: Uint8Array) {
	return (
		bytes.length >= 4 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46
	);
}

function extractPcmFromWav(wav: Uint8Array) {
	if (!isWavBytes(wav)) {
		return wav;
	}

	const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
	let offset = 12;
	while (offset + 8 <= wav.byteLength) {
		const chunkId = String.fromCharCode(
			wav[offset]!,
			wav[offset + 1]!,
			wav[offset + 2]!,
			wav[offset + 3]!,
		);
		const chunkSize = view.getUint32(offset + 4, true);
		if (chunkId === "data") {
			return wav.subarray(offset + 8, offset + 8 + chunkSize);
		}
		offset += 8 + chunkSize;
	}

	return wav.byteLength > 44 ? wav.subarray(44) : wav;
}

function collectAudioBlocks(payload: GeminiInteractionPayload) {
	const blocks: ContentBlock[] = [];

	if (payload.output_audio?.data) {
		blocks.push({
			type: "audio",
			data: payload.output_audio.data,
			mime_type: payload.output_audio.mime_type,
		});
	}

	for (const output of payload.outputs ?? []) {
		if (output.type === "audio" && output.data) {
			blocks.push(output);
		}
	}

	for (const step of payload.steps ?? []) {
		if (step.type !== "model_output") {
			continue;
		}
		for (const block of step.content ?? []) {
			if (block.type === "audio" && block.data) {
				blocks.push(block);
			}
		}
	}

	return blocks;
}

export function extractGeminiInteractionAudioPayload(payload: GeminiInteractionPayload) {
	const blocks = collectAudioBlocks(payload);
	if (!blocks.length) {
		return null;
	}

	const block = blocks[blocks.length - 1]!;
	if (!block.data) {
		return null;
	}

	return {
		data: block.data,
		mimeType: block.mime_type,
	};
}

export function decodeGeminiInteractionAudioToPcm(payload: GeminiInteractionPayload) {
	const audio = extractGeminiInteractionAudioPayload(payload);
	if (!audio) {
		return null;
	}

	const bytes = decodeBase64ToBytes(audio.data);
	const mimeType = audio.mimeType?.toLowerCase() ?? "";
	if (mimeType.includes("wav") || isWavBytes(bytes)) {
		return extractPcmFromWav(bytes);
	}

	return bytes;
}

async function requestGeminiTtsInteraction(params: {
	apiKey: string;
	model: string;
	input: string;
	speakers: Array<{ name: string; voice: string }>;
	signal?: AbortSignal;
}) {
	const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-goog-api-key": params.apiKey,
			"Api-Revision": GEMINI_INTERACTIONS_API_REVISION,
		},
		body: JSON.stringify({
			model: params.model,
			input: params.input,
			response_format: { type: "audio" },
			generation_config: {
				speech_config: params.speakers.map((speaker) => ({
					speaker: speaker.name,
					voice: speaker.voice,
				})),
			},
		}),
		signal: params.signal,
	});

	const responseText = await response.text();
	let payload: GeminiInteractionPayload | null = null;
	if (responseText) {
		try {
			payload = JSON.parse(responseText) as GeminiInteractionPayload;
		} catch {
			payload = null;
		}
	}

	return {
		ok: response.ok,
		status: response.status,
		payload,
		responseText,
	};
}

export async function generateGeminiMultiSpeakerAudio(params: {
	apiKey: string;
	input: string;
	speakers: Array<{ name: string; voice: string }>;
	signal?: AbortSignal;
	model?: string;
}) {
	const controller = new AbortController();
	const abortListener = () => controller.abort();
	if (params.signal) {
		if (params.signal.aborted) {
			controller.abort();
		} else {
			params.signal.addEventListener("abort", abortListener, { once: true });
		}
	}

	const timeoutId = window.setTimeout(() => controller.abort(), TTS_REQUEST_TIMEOUT_MS);
	const safeKey = params.apiKey.replace(/[^\x00-\xFF]/g, "");
	const primaryModel = params.model ?? GEMINI_TTS_MODEL;
	const models =
		primaryModel === GEMINI_TTS_FALLBACK_MODEL
			? [primaryModel]
			: [primaryModel, GEMINI_TTS_FALLBACK_MODEL];
	let lastErrorMessage = "Gemini TTS returned no audio data.";

	try {
		for (const model of models) {
			for (let attempt = 0; attempt < TTS_ATTEMPTS_PER_MODEL; attempt += 1) {
				const result = await requestGeminiTtsInteraction({
					apiKey: safeKey,
					model,
					input: params.input,
					speakers: params.speakers,
					signal: controller.signal,
				});

				if (!result.ok) {
					const apiMessage =
						result.payload?.error?.message?.trim() ||
						result.responseText.trim() ||
						`Gemini TTS request failed (${result.status}).`;
					lastErrorMessage = apiMessage;
					const retryable = result.status >= 500 || result.status === 429;
					if (retryable && attempt < TTS_ATTEMPTS_PER_MODEL - 1) {
						continue;
					}
					if (model === models[models.length - 1]) {
						throw new Error(apiMessage);
					}
					break;
				}

				if (!result.payload) {
					lastErrorMessage = "Gemini TTS returned an unreadable response.";
					if (attempt < TTS_ATTEMPTS_PER_MODEL - 1) {
						continue;
					}
					break;
				}

				const pcm = decodeGeminiInteractionAudioToPcm(result.payload);
				if (pcm?.byteLength) {
					return pcm;
				}

				lastErrorMessage = "Gemini TTS returned no audio data.";
				if (attempt < TTS_ATTEMPTS_PER_MODEL - 1) {
					continue;
				}
			}
		}

		throw new Error(lastErrorMessage);
	} catch (error) {
		throw normalizeAIError(error, { userCancelled: params.signal?.aborted });
	} finally {
		window.clearTimeout(timeoutId);
		params.signal?.removeEventListener("abort", abortListener);
	}
}
