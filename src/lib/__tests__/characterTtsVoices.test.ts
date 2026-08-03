import { describe, expect, it } from "vitest";
import {
	ensureCharacterTtsRegistry,
	normalizeCharacterTtsKey,
} from "../ai/characterTtsVoices";
import { resolveGeminiNarrationTtsSettings } from "../ai/geminiTtsVoices";

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
});
