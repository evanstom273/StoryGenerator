import { describe, expect, it } from "vitest";
import {
	buildCharacterConceptGeneratorSystemPrompt,
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
		expect(prompt).toContain("writing prompt or character pitch");
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
