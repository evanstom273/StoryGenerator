export const GEMINI_TTS_MODEL_PRIMARY = "gemini-3.1-flash-tts-preview";
export const GEMINI_TTS_MODEL_FALLBACK = "gemini-2.5-flash-preview-tts";

export type GeminiTtsModelId =
	| typeof GEMINI_TTS_MODEL_PRIMARY
	| typeof GEMINI_TTS_MODEL_FALLBACK;

export type GeminiTtsVoiceGroup =
	| "narration"
	| "podcast"
	| "news"
	| "warm"
	| "expressive"
	| "other";

export interface GeminiTtsVoiceOption {
	id: string;
	label: string;
	description: string;
	group: GeminiTtsVoiceGroup;
}

export const GEMINI_TTS_VOICE_GROUP_LABELS: Record<GeminiTtsVoiceGroup, string> = {
	narration: "Narration & audiobooks",
	podcast: "Podcast & conversation",
	news: "News & documentation",
	warm: "Warm & gentle",
	expressive: "Expressive & energetic",
	other: "Other",
};

export const GEMINI_TTS_VOICE_CATALOG: GeminiTtsVoiceOption[] = [
	{ id: "Aoede", label: "Aoede", description: "Breezy, natural — audiobooks", group: "narration" },
	{ id: "Charon", label: "Charon", description: "Informative, clear — news", group: "news" },
	{ id: "Schedar", label: "Schedar", description: "Even, measured tone", group: "narration" },
	{ id: "Enceladus", label: "Enceladus", description: "Calm, authoritative", group: "narration" },
	{ id: "Leda", label: "Leda", description: "Warm, conversational", group: "podcast" },
	{ id: "Callirrhoe", label: "Callirrhoe", description: "Easy-going", group: "podcast" },
	{ id: "Achird", label: "Achird", description: "Friendly", group: "podcast" },
	{ id: "Zubenelgenubi", label: "Zubenelgenubi", description: "Casual", group: "podcast" },
	{ id: "Vindemiatrix", label: "Vindemiatrix", description: "Gentle", group: "warm" },
	{ id: "Sulafat", label: "Sulafat", description: "Warm", group: "warm" },
	{ id: "Achernar", label: "Achernar", description: "Soft", group: "warm" },
	{ id: "Despina", label: "Despina", description: "Smooth", group: "warm" },
	{ id: "Algieba", label: "Algieba", description: "Smooth", group: "warm" },
	{ id: "Rasalgethi", label: "Rasalgethi", description: "Informative", group: "news" },
	{ id: "Sadaltager", label: "Sadaltager", description: "Knowledgeable", group: "news" },
	{ id: "Sadachbia", label: "Sadachbia", description: "Lively, professional", group: "news" },
	{ id: "Iapetus", label: "Iapetus", description: "Clear", group: "news" },
	{ id: "Erinome", label: "Erinome", description: "Clear", group: "news" },
	{ id: "Puck", label: "Puck", description: "Upbeat, energetic", group: "expressive" },
	{ id: "Fenrir", label: "Fenrir", description: "Excitable, dynamic", group: "expressive" },
	{ id: "Zephyr", label: "Zephyr", description: "Bright, cheerful", group: "expressive" },
	{ id: "Laomedeia", label: "Laomedeia", description: "Upbeat", group: "expressive" },
	{ id: "Autonoe", label: "Autonoe", description: "Bright", group: "expressive" },
	{ id: "Pulcherrima", label: "Pulcherrima", description: "Forward", group: "expressive" },
	{ id: "Kore", label: "Kore", description: "Firm, confident", group: "other" },
	{ id: "Orus", label: "Orus", description: "Firm", group: "other" },
	{ id: "Alnilam", label: "Alnilam", description: "Firm", group: "other" },
	{ id: "Gacrux", label: "Gacrux", description: "Mature", group: "other" },
	{ id: "Umbriel", label: "Umbriel", description: "Easy-going", group: "other" },
	{ id: "Algenib", label: "Algenib", description: "Gravelly", group: "other" },
];

export const GEMINI_TTS_VOICE_IDS = GEMINI_TTS_VOICE_CATALOG.map((voice) => voice.id);

export const DEFAULT_GEMINI_PODCAST_HOST_ONE_VOICE = "Charon";
export const DEFAULT_GEMINI_PODCAST_HOST_TWO_VOICE = "Aoede";

export const GEMINI_TTS_MODEL_OPTIONS: Array<{
	id: GeminiTtsModelId;
	label: string;
	description: string;
}> = [
	{
		id: GEMINI_TTS_MODEL_PRIMARY,
		label: "Gemini 3.1 Flash TTS (preview)",
		description: "Latest preview — best quality",
	},
	{
		id: GEMINI_TTS_MODEL_FALLBACK,
		label: "Gemini 2.5 Flash TTS (preview)",
		description: "Fallback if 3.1 is unavailable",
	},
];

export interface GeminiPodcastTtsSettings {
	hostOneVoice: string;
	hostTwoVoice: string;
	model: GeminiTtsModelId;
}

export type GeminiPodcastTtsSettingsInput = {
	hostOneVoice?: string;
	hostTwoVoice?: string;
	model?: string;
};

export function isValidGeminiTtsVoice(voice: string) {
	return GEMINI_TTS_VOICE_IDS.includes(voice);
}

export function isValidGeminiTtsModel(model: string): model is GeminiTtsModelId {
	return model === GEMINI_TTS_MODEL_PRIMARY || model === GEMINI_TTS_MODEL_FALLBACK;
}

export function resolveGeminiPodcastTtsSettings(
	partial?: GeminiPodcastTtsSettingsInput | null,
): GeminiPodcastTtsSettings {
	const hostOneVoice = partial?.hostOneVoice?.trim() ?? "";
	const hostTwoVoice = partial?.hostTwoVoice?.trim() ?? "";
	const model = partial?.model?.trim() ?? "";

	return {
		hostOneVoice: isValidGeminiTtsVoice(hostOneVoice)
			? hostOneVoice
			: DEFAULT_GEMINI_PODCAST_HOST_ONE_VOICE,
		hostTwoVoice: isValidGeminiTtsVoice(hostTwoVoice)
			? hostTwoVoice
			: DEFAULT_GEMINI_PODCAST_HOST_TWO_VOICE,
		model: isValidGeminiTtsModel(model) ? model : GEMINI_TTS_MODEL_PRIMARY,
	};
}

export function getGeminiTtsVoiceOption(voiceId: string) {
	return GEMINI_TTS_VOICE_CATALOG.find((voice) => voice.id === voiceId);
}

export const DEFAULT_GEMINI_NARRATION_VOICE = "Iapetus";
export const DEFAULT_GEMINI_CHARACTER_VOICE = "Aoede";

export interface GeminiNarrationTtsSettings {
	voice: string;
	characterVoice: string;
	model: GeminiTtsModelId;
}

export type GeminiNarrationTtsSettingsInput = {
	voice?: string;
	characterVoice?: string;
	model?: string;
};

export function resolveGeminiNarrationTtsSettings(
	partial?: GeminiNarrationTtsSettingsInput | null,
): GeminiNarrationTtsSettings {
	const voice = partial?.voice?.trim() ?? "";
	const characterVoice = partial?.characterVoice?.trim() ?? "";
	const model = partial?.model?.trim() ?? "";

	return {
		voice: isValidGeminiTtsVoice(voice) ? voice : DEFAULT_GEMINI_NARRATION_VOICE,
		characterVoice: isValidGeminiTtsVoice(characterVoice)
			? characterVoice
			: DEFAULT_GEMINI_CHARACTER_VOICE,
		model: isValidGeminiTtsModel(model) ? model : GEMINI_TTS_MODEL_PRIMARY,
	};
}
