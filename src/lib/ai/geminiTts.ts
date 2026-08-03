import { normalizeAIError } from "./errors";

const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
const GEMINI_TTS_FALLBACK_MODEL = "gemini-3.1-flash-tts-preview";
const TTS_REQUEST_TIMEOUT_MS = 180_000;

export const GEMINI_TTS_VOICES = {
	hostA: "Kore",
	hostB: "Puck",
} as const;

interface GeminiInteractionResponse {
	output_audio?: {
		data?: string;
	};
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
	const models = [params.model ?? GEMINI_TTS_MODEL, GEMINI_TTS_FALLBACK_MODEL];

	try {
		for (const model of models) {
			const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": safeKey,
				},
				body: JSON.stringify({
					model,
					input: params.input,
					response_format: { type: "audio" },
					generation_config: {
						speech_config: params.speakers.map((speaker) => ({
							speaker: speaker.name,
							voice: speaker.voice,
						})),
					},
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				const message = await response.text();
				if (model === models[models.length - 1]) {
					throw new Error(message || `Gemini TTS request failed (${response.status}).`);
				}
				continue;
			}

			const payload = (await response.json()) as GeminiInteractionResponse;
			const audioBase64 = payload.output_audio?.data;
			if (!audioBase64) {
				if (model === models[models.length - 1]) {
					throw new Error("Gemini TTS returned no audio data.");
				}
				continue;
			}

			return decodeBase64ToBytes(audioBase64);
		}

		throw new Error("Gemini TTS returned no audio data.");
	} catch (error) {
		throw normalizeAIError(error, { userCancelled: params.signal?.aborted });
	} finally {
		window.clearTimeout(timeoutId);
		params.signal?.removeEventListener("abort", abortListener);
	}
}
