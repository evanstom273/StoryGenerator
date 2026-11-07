import { describe, expect, it } from "vitest";
import {
	buildCharacterConceptGeneratorSystemPrompt,
	buildCharacterConceptUserPrompt,
	isCompleteCharacterConcept,
	looksLikeBiographyOpener,
	normalizeGeneratedCharacterConcept,
} from "../ai/characterGenerator";
import {
	buildCharacterConceptConstraintsFromDraft,
	formatCharacterConceptAliasesConstraint,
	formatCharacterKnownTiesConstraint,
	formatAntiCanonSprawlGuidance,
} from "../playerCharacterPrompt";
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
	it("includes filled character fields but not aliases", () => {
		expect(
			buildCharacterConceptConstraintsFromDraft({
				name: "Alex Rivera",
				species: "Human",
				aliases: ["Potter", "Detective Potter"],
				appearance: "Tall and tired-looking.",
			}),
		).toEqual({
			name: "Alex Rivera",
			species: "Human",
			appearance: "Tall and tired-looking.",
		});
	});
});

describe("formatCharacterConceptAliasesConstraint", () => {
	it("explains aliases are ambiguous recognition names", () => {
		const constraint = formatCharacterConceptAliasesConstraint({
			name: "Morgan Reyes",
			aliases: ["Alex", "Static"],
		});

		expect(constraint).toContain("Alex, Static");
		expect(constraint).toContain("ambiguous");
		expect(constraint).toContain("content-creator");
		expect(constraint).toContain("furry persona");
	});
});

describe("buildCharacterConceptGeneratorSystemPrompt", () => {
	it("uses universe context when provided", () => {
		const prompt = buildCharacterConceptGeneratorSystemPrompt({
			universe,
			existing: { name: "Alex Rivera" },
		});

		expect(prompt).toContain("Neon Harbor");
		expect(prompt).toContain("name: Alex Rivera");
		expect(prompt).toContain("inspire the rest of the character sheet");
		expect(prompt).toContain("Alex Rivera");
	});

	it("falls back to a setting-flexible concept when no universe is selected", () => {
		const prompt = buildCharacterConceptGeneratorSystemPrompt({
			existing: { pronouns: "they/them" },
		});

		expect(prompt).toContain("No universe is selected");
		expect(prompt).toContain("pronouns: they/them");
	});

	it("renders alias and previous-concept guidance separately", () => {
		const prompt = buildCharacterConceptGeneratorSystemPrompt({
			universe,
			existing: { name: "Morgan Reyes", age: "15" },
			aliasConstraint: formatCharacterConceptAliasesConstraint({
				name: "Morgan Reyes",
				aliases: ["Alex", "Static"],
			}),
			previousConcept: "A secret hacker feeding tips to the precinct.",
		});

		expect(prompt).not.toContain("aliases: Alex, Static");
		expect(prompt).toContain("ambiguous");
		expect(prompt).toContain("do not repeat this hook");
		expect(prompt).toContain("secret hacker");
		expect(prompt).toContain("Vary the central hook");
	});

	it("includes anti-canon-sprawl guidance and known ties", () => {
		const prompt = buildCharacterConceptGeneratorSystemPrompt({
			universe,
			existing: { name: "Morgan Reyes" },
			knownTiesConstraint: formatCharacterKnownTiesConstraint({
				knownTies: ["Captain Reyes — mentor", "Elena Reyes — sibling"],
			}),
			antiCanonSprawlGuidance: formatAntiCanonSprawlGuidance(true),
		});

		expect(prompt).toContain("Do not name-drop the full main cast");
		expect(prompt).toContain("Captain Reyes — mentor");
		expect(prompt).toContain("Only the Known ties");
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
				"Alex Rivera is a quick-witted investigator caught in an",
				"Alex Rivera",
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
				"Alex Rivera is a quick-witted investigator caught in an",
				"Alex Rivera",
			),
		).toBe(false);
	});
});

describe("buildCharacterConceptUserPrompt", () => {
	it("asks for a stronger retry on later attempts", () => {
		expect(buildCharacterConceptUserPrompt(1)).toContain("character sheet");
	});

	it("asks for a fresh angle when a previous concept exists", () => {
		expect(buildCharacterConceptUserPrompt(0, "A secret hacker alias.")).toContain(
			"different central hook",
		);
	});
});
