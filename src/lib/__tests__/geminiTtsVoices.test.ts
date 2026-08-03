import { describe, expect, it } from "vitest";
import {
	DEFAULT_GEMINI_PODCAST_HOST_ONE_VOICE,
	DEFAULT_GEMINI_PODCAST_HOST_TWO_VOICE,
	GEMINI_TTS_MODEL_PRIMARY,
	GEMINI_TTS_VOICE_IDS,
	resolveGeminiPodcastTtsSettings,
} from "../ai/geminiTtsVoices";

describe("geminiTtsVoices", () => {
	it("returns defaults when settings are missing or invalid", () => {
		expect(resolveGeminiPodcastTtsSettings()).toEqual({
			hostOneVoice: DEFAULT_GEMINI_PODCAST_HOST_ONE_VOICE,
			hostTwoVoice: DEFAULT_GEMINI_PODCAST_HOST_TWO_VOICE,
			model: GEMINI_TTS_MODEL_PRIMARY,
		});

		expect(
			resolveGeminiPodcastTtsSettings({
				hostOneVoice: "NotAVoice",
				hostTwoVoice: "",
				model: "invalid-model",
			}),
		).toEqual({
			hostOneVoice: DEFAULT_GEMINI_PODCAST_HOST_ONE_VOICE,
			hostTwoVoice: DEFAULT_GEMINI_PODCAST_HOST_TWO_VOICE,
			model: GEMINI_TTS_MODEL_PRIMARY,
		});
	});

	it("keeps valid voice and model selections", () => {
		expect(
			resolveGeminiPodcastTtsSettings({
				hostOneVoice: "Leda",
				hostTwoVoice: "Schedar",
				model: "gemini-2.5-flash-preview-tts",
			}),
		).toEqual({
			hostOneVoice: "Leda",
			hostTwoVoice: "Schedar",
			model: "gemini-2.5-flash-preview-tts",
		});
	});

	it("lists all 30 Gemini prebuilt voices", () => {
		expect(GEMINI_TTS_VOICE_IDS.length).toBe(30);
	});
});
