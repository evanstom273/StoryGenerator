import {
	GEMINI_TTS_VOICE_IDS,
	type GeminiNarrationTtsSettings,
} from "./geminiTtsVoices";

export type CharacterTtsVoiceMap = Record<string, string>;
export type CharacterTtsLabelMap = Record<string, string>;

export interface CharacterTtsRegistry {
	voices: CharacterTtsVoiceMap;
	labels: CharacterTtsLabelMap;
}

export const DIRECTOR_TTS_KEY = "director";
export const DIRECTOR_TTS_LABEL = "Director";

export function normalizeCharacterTtsKey(name: string) {
	return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function resolveCharacterTtsKey(
	speakerLabel: string,
	existingLabels: CharacterTtsLabelMap,
): string {
	const normalized = normalizeCharacterTtsKey(speakerLabel);
	if (!normalized) {
		return normalized;
	}

	if (existingLabels[normalized]) {
		return normalized;
	}

	const firstToken = normalized.split(" ")[0] ?? normalized;

	for (const [key, label] of Object.entries(existingLabels)) {
		if (key === DIRECTOR_TTS_KEY) {
			continue;
		}

		const normalizedLabel = normalizeCharacterTtsKey(label);
		if (normalizedLabel === normalized) {
			return key;
		}

		const labelFirstToken = normalizedLabel.split(" ")[0] ?? normalizedLabel;
		if (
			firstToken.length >= 2 &&
			labelFirstToken.length >= 2 &&
			firstToken === labelFirstToken
		) {
			return key;
		}

		if (normalized.startsWith(`${key} `) || key.startsWith(`${normalized} `)) {
			return key;
		}
	}

	return normalized;
}

function hashString(value: string) {
	let hash = 2166136261;

	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return hash >>> 0;
}

function getPlayerNameVariants(playerName: string | null | undefined) {
	const trimmed = playerName?.trim() ?? "";
	if (!trimmed) {
		return [];
	}

	const tokens = trimmed.split(/\s+/).filter(Boolean);
	const firstToken = tokens[0] ?? "";
	const variants = new Set<string>();
	variants.add(normalizeCharacterTtsKey(trimmed));

	if (firstToken.length >= 2) {
		variants.add(normalizeCharacterTtsKey(firstToken));
	}

	return Array.from(variants);
}

export function isPlayerCharacterTtsKey(key: string, playerName: string | null | undefined) {
	const normalizedKey = normalizeCharacterTtsKey(key);
	return getPlayerNameVariants(playerName).includes(normalizedKey);
}

function pickVoiceForCharacterKey(
	key: string,
	usedVoices: Set<string>,
	narratorVoice: string,
) {
	const pool = GEMINI_TTS_VOICE_IDS.filter(
		(voiceId) => voiceId !== narratorVoice && !usedVoices.has(voiceId),
	);
	const fallbackPool =
		pool.length > 0
			? pool
			: GEMINI_TTS_VOICE_IDS.filter((voiceId) => voiceId !== narratorVoice);

	const index = hashString(key) % fallbackPool.length;
	return fallbackPool[index] ?? fallbackPool[0] ?? narratorVoice;
}

export function ensureCharacterTtsRegistry(params: {
	existingVoices?: CharacterTtsVoiceMap | null;
	existingLabels?: CharacterTtsLabelMap | null;
	characters: Array<{ key: string; label: string }>;
	narrationTts: GeminiNarrationTtsSettings;
	playerName?: string | null;
}): CharacterTtsRegistry {
	const voices: CharacterTtsVoiceMap = { ...(params.existingVoices ?? {}) };
	const labels: CharacterTtsLabelMap = { ...(params.existingLabels ?? {}) };
	const usedVoices = new Set(Object.values(voices));
	usedVoices.add(params.narrationTts.voice);

	for (const character of params.characters) {
		const label = character.label.trim();
		if (!label) {
			continue;
		}

		const key = resolveCharacterTtsKey(label, labels);

		if (!labels[key]) {
			labels[key] = label;
		}

		if (voices[key]) {
			continue;
		}

		if (key === DIRECTOR_TTS_KEY) {
			const directorVoice = pickVoiceForCharacterKey(key, usedVoices, params.narrationTts.voice);
			voices[key] = directorVoice;
			usedVoices.add(directorVoice);
			continue;
		}

		if (isPlayerCharacterTtsKey(key, params.playerName)) {
			voices[key] = params.narrationTts.characterVoice;
			usedVoices.add(params.narrationTts.characterVoice);
			continue;
		}

		const assignedVoice = pickVoiceForCharacterKey(key, usedVoices, params.narrationTts.voice);
		voices[key] = assignedVoice;
		usedVoices.add(assignedVoice);
	}

	return { voices, labels };
}

export function registryChanged(
	before: CharacterTtsRegistry | null | undefined,
	after: CharacterTtsRegistry,
) {
	if (!before) {
		return Object.keys(after.voices).length > 0;
	}

	const voiceKeys = new Set([...Object.keys(before.voices), ...Object.keys(after.voices)]);
	for (const key of voiceKeys) {
		if (before.voices[key] !== after.voices[key]) {
			return true;
		}
	}

	const labelKeys = new Set([...Object.keys(before.labels), ...Object.keys(after.labels)]);
	for (const key of labelKeys) {
		if (before.labels[key] !== after.labels[key]) {
			return true;
		}
	}

	return false;
}
