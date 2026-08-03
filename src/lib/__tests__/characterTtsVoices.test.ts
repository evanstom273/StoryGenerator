import { describe, expect, it } from "vitest";
import {
	buildCharacterGenderHintsFromStoryState,
	ensureCharacterTtsRegistry,
	inferCharacterTtsGenderHint,
	normalizeCharacterTtsKey,
} from "../ai/characterTtsVoices";
import {
	geminiTtsVoiceMatchesGender,
	getGeminiTtsVoiceGender,
	resolveGeminiNarrationTtsSettings,
} from "../ai/geminiTtsVoices";

describe("characterTtsVoices", () => {
	const narrationTts = resolveGeminiNarrationTtsSettings();

	it("assigns stable voices for the same character key", () => {
		const first = ensureCharacterTtsRegistry({
			characters: [{ key: normalizeCharacterTtsKey("Rosa Diaz"), label: "Rosa Diaz" }],
			narrationTts,
		});
		const second = ensureCharacterTtsRegistry({
			existingVoices: {},
			existingLabels: {},
			characters: [{ key: normalizeCharacterTtsKey("Rosa Diaz"), label: "Rosa Diaz" }],
			narrationTts,
		});

		expect(first.voices[normalizeCharacterTtsKey("Rosa Diaz")]).toBe(
			second.voices[normalizeCharacterTtsKey("Rosa Diaz")],
		);
	});

	it("merges short and full character names to the same voice", () => {
		const fullNameKey = normalizeCharacterTtsKey("Rosa Diaz");
		const initial = ensureCharacterTtsRegistry({
			characters: [{ key: fullNameKey, label: "Rosa Diaz" }],
			narrationTts,
		});

		const later = ensureCharacterTtsRegistry({
			existingVoices: initial.voices,
			existingLabels: initial.labels,
			characters: [
				{ key: normalizeCharacterTtsKey("Rosa"), label: "Rosa" },
				{ key: normalizeCharacterTtsKey("Amy Santiago"), label: "Amy Santiago" },
			],
			narrationTts,
		});

		expect(later.voices[fullNameKey]).toBe(initial.voices[fullNameKey]);
		expect(later.labels[fullNameKey]).toBe("Rosa Diaz");
		expect(later.voices[normalizeCharacterTtsKey("Rosa")]).toBeUndefined();
	});

	it("assigns male voices for male characters and female voices for female characters", () => {
		const registry = ensureCharacterTtsRegistry({
			characters: [
				{ key: normalizeCharacterTtsKey("Jake Peralta"), label: "Jake Peralta" },
				{ key: normalizeCharacterTtsKey("Rosa Diaz"), label: "Rosa Diaz" },
			],
			narrationTts,
			characterGenders: {
				[normalizeCharacterTtsKey("Jake Peralta")]: "male",
				[normalizeCharacterTtsKey("Rosa Diaz")]: "female",
			},
		});

		const jakeVoice = registry.voices[normalizeCharacterTtsKey("Jake Peralta")];
		const rosaVoice = registry.voices[normalizeCharacterTtsKey("Rosa Diaz")];
		expect(jakeVoice).toBeTruthy();
		expect(rosaVoice).toBeTruthy();
		expect(geminiTtsVoiceMatchesGender(jakeVoice!, "male")).toBe(true);
		expect(geminiTtsVoiceMatchesGender(rosaVoice!, "female")).toBe(true);
	});

	it("infers gender hints from story state character sheets", () => {
		const hints = buildCharacterGenderHintsFromStoryState({
			updatedAt: "2026-01-01T00:00:00.000Z",
			characters: {
				"Rosa Diaz": {
					canonicalName: "Rosa Diaz",
					gender: "female",
					pronouns: "she/her",
				},
				"Jake Peralta": {
					displayName: "Jake",
					gender: "male",
				},
			},
			worldFacts: [],
			unresolvedThreads: [],
		});

		expect(hints[normalizeCharacterTtsKey("Rosa Diaz")]).toBe("female");
		expect(hints[normalizeCharacterTtsKey("Rosa")]).toBe("female");
		expect(hints[normalizeCharacterTtsKey("Jake")]).toBe("male");
		expect(inferCharacterTtsGenderHint("male", "he/him")).toBe("male");
		expect(getGeminiTtsVoiceGender("Charon")).toBe("male");
	});
});
