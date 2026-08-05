import { describe, expect, it } from "vitest";
import {
	buildCharacterConceptGeneratorSystemPrompt,
	buildCharacterConceptUserPrompt,
	isCompleteCharacterConcept,
	looksLikeBiographyOpener,
	normalizeGeneratedCharacterConcept,
} from "../ai/characterGenerator";
import { buildCharacterConceptConstraintsFromDraft } from "../playerCharacterPrompt";
import type { Universe } from "../../types/models";

const universe: Universe = {
	id: "universe-1",
	name: "Neon Harbor",
	description: "A rain-soaked cyberpunk port city.",
	wikiUrl: "",
	importedLore: [],
	importedCharacters: [],
	importedLocations: [],
	importedRelationships: [],
	createdAt: "2026-01-01T00:00:00.000Z",
};

describe("buildCharacterConceptConstraintsFromDraft", () => {
	it("includes filled character fields and aliases", () => {
		expect(
			buildCharacterConceptConstraintsFromDraft({
				name: "Jamie Potter",
				species: "Human",
				aliases: ["Potter", "Detective Potter"],
				appearance: "Tall and tired-looking.",
			}),
		).toEqual({
			name: "Jamie Potter",
			species: "Human",
			aliases: "Potter, Detective Potter",
			appearance: "Tall and tired-looking.",
		});
	});
});

describe("buildCharacterConceptGeneratorSystemPrompt", () => {
	it("uses universe context when provided", () => {
		const prompt = buildCharacterConceptGeneratorSystemPrompt({
			universe,
			existing: { name: "Jamie Potter" },
		});

		expect(prompt).toContain("Neon Harbor");
		expect(prompt).toContain("name: Jamie Potter");
		expect(prompt).toContain("creative brief");
		expect(prompt).toContain("GOOD example");
	});

	it("falls back to a setting-flexible concept when no universe is selected", () => {
		const prompt = buildCharacterConceptGeneratorSystemPrompt({
			existing: { pronouns: "they/them" },
		});

		expect(prompt).toContain("No universe is selected");
		expect(prompt).toContain("pronouns: they/them");
	});
});

describe("normalizeGeneratedCharacterConcept", () => {
	it("strips wrapping quotes and code fences", () => {
		expect(normalizeGeneratedCharacterConcept('```\n"A weary courier with a secret."\n```')).toBe(
			"A weary courier with a secret.",
		);
	});
});

describe("looksLikeBiographyOpener", () => {
	it("flags encyclopedia-style openers", () => {
		expect(
			looksLikeBiographyOpener(
				"Jamie Peralta is a fast-talking, fifteen-year-old high schooler caught in an",
				"Jamie Peralta",
			),
		).toBe(true);
	});
});

describe("isCompleteCharacterConcept", () => {
	it("accepts a multi-sentence pitch", () => {
		expect(
			isCompleteCharacterConcept(
				"A sharp-tongued rookie detective who plays the clown to hide how carefully they're watching everyone in the room. Core tension: protect their friends vs. blow the whistle on corruption they can't yet prove. Fun to play as the one who jokes first and notices second.",
			),
		).toBe(true);
	});

	it("rejects truncated biography-style output", () => {
		expect(
			isCompleteCharacterConcept(
				"Jamie Peralta is a fast-talking, fifteen-year-old high schooler caught in an",
				"Jamie Peralta",
			),
		).toBe(false);
	});
});

describe("buildCharacterConceptUserPrompt", () => {
	it("asks for a stronger retry on later attempts", () => {
		expect(buildCharacterConceptUserPrompt(1)).toContain("biography opener");
	});
});
