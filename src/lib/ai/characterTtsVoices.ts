import {
	GEMINI_TTS_VOICE_IDS,
	geminiTtsVoiceMatchesGender,
	getGeminiTtsVoiceIdsForGender,
	type GeminiNarrationTtsSettings,
} from "./geminiTtsVoices";
import type { StoryStateData } from "../../types/models";

export type CharacterTtsVoiceMap = Record<string, string>;
export type CharacterTtsLabelMap = Record<string, string>;
export type CharacterTtsGenderHint = "male" | "female";
export type CharacterTtsGenderMap = Record<string, CharacterTtsGenderHint>;

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

export function inferCharacterTtsGenderHint(
	gender?: string | null,
	pronouns?: string | null,
): CharacterTtsGenderHint | undefined {
	const normalizedGender = gender?.trim().toLowerCase() ?? "";
	if (normalizedGender) {
		if (/^(m|male|man|boy)\b/.test(normalizedGender) || normalizedGender === "m") {
			return "male";
		}
		if (/^(f|female|woman|girl)\b/.test(normalizedGender) || normalizedGender === "f") {
			return "female";
		}
	}

	const normalizedPronouns = pronouns?.trim().toLowerCase() ?? "";
	if (normalizedPronouns) {
		if (/\b(he\/him|him\/he)\b/.test(normalizedPronouns) || normalizedPronouns === "he/him") {
			return "male";
		}
		if (/\b(she\/her|her\/she)\b/.test(normalizedPronouns) || normalizedPronouns === "she/her") {
			return "female";
		}
	}

	return undefined;
}

export function inferGenderFromPronounsInText(text: string): CharacterTtsGenderHint | undefined {
	const normalized = text.toLowerCase();
	let maleSignals = 0;
	let femaleSignals = 0;

	if (/\bhe\b/.test(normalized)) {
		maleSignals += 1;
	}
	if (/\bhis\b/.test(normalized)) {
		maleSignals += 1;
	}
	if (/\bhim\b/.test(normalized)) {
		maleSignals += 1;
	}
	if (/\bhimself\b/.test(normalized)) {
		maleSignals += 1;
	}

	if (/\bshe\b/.test(normalized)) {
		femaleSignals += 1;
	}
	if (/\bher\b/.test(normalized)) {
		femaleSignals += 1;
	}
	if (/\bhers\b/.test(normalized)) {
		femaleSignals += 1;
	}
	if (/\bherself\b/.test(normalized)) {
		femaleSignals += 1;
	}

	if (maleSignals > 0 && femaleSignals === 0) {
		return "male";
	}
	if (femaleSignals > 0 && maleSignals === 0) {
		return "female";
	}

	return undefined;
}

export function applyCharacterGenderHintForName(
	hints: CharacterTtsGenderMap,
	name: string,
	gender: CharacterTtsGenderHint,
) {
	const key = normalizeCharacterTtsKey(name);
	if (!key) {
		return;
	}

	hints[key] = gender;

	const firstToken = key.split(" ")[0] ?? "";
	if (firstToken.length >= 2) {
		hints[firstToken] = gender;
	}
}

export function buildCharacterGenderHintsFromStoryState(
	storyStateData: StoryStateData | null | undefined,
	options?: {
		playerName?: string | null;
		playerGender?: string | null;
		playerPronouns?: string | null;
	},
): CharacterTtsGenderMap {
	const hints: CharacterTtsGenderMap = {};
	const playerGender = inferCharacterTtsGenderHint(options?.playerGender, options?.playerPronouns);

	if (playerGender && options?.playerName?.trim()) {
		applyCharacterGenderHintForName(hints, options.playerName.trim(), playerGender);
	}

	for (const [canonicalKey, entry] of Object.entries(storyStateData?.characters ?? {})) {
		const gender = inferCharacterTtsGenderHint(entry?.gender, entry?.pronouns);
		if (!gender) {
			continue;
		}

		const names = [
			canonicalKey,
			entry?.canonicalName,
			entry?.displayName,
			...(entry?.aliases ?? []),
		].filter((name): name is string => Boolean(name?.trim()));

		for (const name of names) {
			applyCharacterGenderHintForName(hints, name, gender);
		}
	}

	return hints;
}

function resolveGenderHintForKey(
	key: string,
	labels: CharacterTtsLabelMap,
	characterGenders?: CharacterTtsGenderMap | null,
): CharacterTtsGenderHint | undefined {
	if (!characterGenders) {
		return undefined;
	}

	if (characterGenders[key]) {
		return characterGenders[key];
	}

	const label = labels[key];
	if (label) {
		const labelKey = normalizeCharacterTtsKey(label);
		if (characterGenders[labelKey]) {
			return characterGenders[labelKey];
		}
	}

	const firstToken = key.split(" ")[0] ?? "";
	if (firstToken.length >= 2 && characterGenders[firstToken]) {
		return characterGenders[firstToken];
	}

	return undefined;
}

function pickVoiceForCharacterKey(
	key: string,
	usedVoices: Set<string>,
	narratorVoice: string,
	genderPreference?: CharacterTtsGenderHint,
) {
	const excludeUnavailable = (voiceIds: string[]) =>
		voiceIds.filter((voiceId) => voiceId !== narratorVoice && !usedVoices.has(voiceId));

	let pool = excludeUnavailable(GEMINI_TTS_VOICE_IDS);

	if (genderPreference) {
		const genderPool = excludeUnavailable(getGeminiTtsVoiceIdsForGender(genderPreference));
		if (genderPool.length > 0) {
			pool = genderPool;
		}
	}

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
	characterGenders?: CharacterTtsGenderMap | null;
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
		const genderHint = resolveGenderHintForKey(key, labels, params.characterGenders);

		if (!labels[key]) {
			labels[key] = label;
		}

		if (voices[key]) {
			if (!genderHint || geminiTtsVoiceMatchesGender(voices[key], genderHint)) {
				continue;
			}
		}

		if (key === DIRECTOR_TTS_KEY) {
			voices[key] = params.narrationTts.voice;
			continue;
		}

		if (isPlayerCharacterTtsKey(key, params.playerName)) {
			const preferredVoice = params.narrationTts.characterVoice;
			const playerVoice =
				genderHint && !geminiTtsVoiceMatchesGender(preferredVoice, genderHint)
					? pickVoiceForCharacterKey(key, usedVoices, params.narrationTts.voice, genderHint)
					: preferredVoice;
			voices[key] = playerVoice;
			usedVoices.add(playerVoice);
			continue;
		}

		const assignedVoice = pickVoiceForCharacterKey(
			key,
			usedVoices,
			params.narrationTts.voice,
			genderHint,
		);
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
