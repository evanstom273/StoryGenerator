import { describe, expect, it } from "vitest";
import {
	formatPlayerCharacterAliasesForPrompt,
	formatPlayerCharacterIdentityForPrompt,
	formatPlayerCharacterKnownTiesForPrompt,
	formatPlayerCharacterPronounAndNamingRules,
	formatCharacterKnownTiesConstraint,
	formatAntiCanonSprawlGuidance,
	buildPlayerNameForValidation,
	getPlayerCharacterNameVariants,
	normalizePlayerCharacterAliases,
	normalizePlayerCharacterKnownTies,
	resolvePlayerCharacterPreferredSceneName,
} from "../playerCharacterPrompt";

describe("resolvePlayerCharacterPreferredSceneName", () => {
	it("prefers the first alias over the legal name", () => {
		expect(
			resolvePlayerCharacterPreferredSceneName({
				name: "James Peralta",
				aliases: ["Jamie", "Static"],
			}),
		).toBe("Jamie");
	});

	it("uses the first name token when the legal name has multiple parts and no aliases exist", () => {
		expect(
			resolvePlayerCharacterPreferredSceneName({
				name: "James Peralta",
				aliases: [],
			}),
		).toBe("James");
	});

	it("uses Jamie as the default scene name for Jamie Peralta", () => {
		expect(
			resolvePlayerCharacterPreferredSceneName({
				name: "Jamie Peralta",
				aliases: [],
			}),
		).toBe("Jamie");
	});
});

describe("getPlayerCharacterNameVariants", () => {
	it("includes legal name, aliases, and name tokens", () => {
		expect(
			getPlayerCharacterNameVariants({
				name: "James Peralta",
				aliases: ["Jamie", "Static"],
			}),
		).toEqual(expect.arrayContaining(["James Peralta", "Jamie", "Static", "James", "Peralta"]));
	});
});

describe("buildPlayerNameForValidation", () => {
	it("includes sheet aliases for transcript validation", () => {
		expect(
			buildPlayerNameForValidation({
				name: "James Peralta",
				aliases: ["Jamie", "Static"],
			}),
		).toBe("James Peralta (Jamie, Static)");
	});
});

describe("formatPlayerCharacterIdentityForPrompt", () => {
	it("mandates preferred scene name and pronouns", () => {
		const prompt = formatPlayerCharacterIdentityForPrompt({
			name: "James Peralta",
			aliases: ["Jamie", "Static"],
			pronouns: "they/them",
			gender: "non-binary",
			species: "human",
			age: "16",
		});

		expect(prompt).toContain("preferred scene name): Jamie");
		expect(prompt).toContain("Legal/full name: James Peralta");
		expect(prompt).toContain("Player Pronouns: they/them");
		expect(prompt).toContain("NEVER infer pronouns");
		expect(prompt).toContain("Never write he/him/his or she/her/hers");
	});
});

describe("formatPlayerCharacterPronounAndNamingRules", () => {
	it("forbids full legal name in casual narration when an alias exists", () => {
		const rules = formatPlayerCharacterPronounAndNamingRules({
			name: "James Peralta",
			aliases: ["Jamie"],
			pronouns: "they/them",
		});

		expect(rules).toContain('"Jamie"');
		expect(rules).toContain('Do NOT use the full legal name "James Peralta"');
	});
});

describe("normalizePlayerCharacterAliases", () => {
	it("returns an empty array for missing or invalid values", () => {
		expect(normalizePlayerCharacterAliases(undefined)).toEqual([]);
		expect(normalizePlayerCharacterAliases("Jamie")).toEqual([]);
	});

	it("trims, deduplicates, and caps aliases", () => {
		expect(
			normalizePlayerCharacterAliases([" Jamie ", "jamie", "Potter", "", "Mr Potter"]),
		).toEqual(["Jamie", "Potter", "Mr Potter"]);
	});
});

describe("formatPlayerCharacterAliasesForPrompt", () => {
	it("formats aliases while excluding the main name", () => {
		expect(
			formatPlayerCharacterAliasesForPrompt({
				name: "Harry Potter",
				aliases: ["Harry", "Potter", "Mr Potter"],
			}),
		).toBe("Also known as: Harry, Potter, Mr Potter");
	});

	it("returns null when no aliases remain", () => {
		expect(
			formatPlayerCharacterAliasesForPrompt({
				name: "Harry Potter",
				aliases: [],
			}),
		).toBeNull();
	});
});

describe("normalizePlayerCharacterKnownTies", () => {
	it("trims, deduplicates, and caps known ties", () => {
		expect(
			normalizePlayerCharacterKnownTies([
				" Jake Peralta — father ",
				"jake peralta — father",
				"Amy Santiago — mother",
			]),
		).toEqual(["Jake Peralta — father", "Amy Santiago — mother"]);
	});
});

describe("formatPlayerCharacterKnownTiesForPrompt", () => {
	it("formats known ties for story prompts", () => {
		expect(
			formatPlayerCharacterKnownTiesForPrompt({
				knownTies: ["Jake Peralta — father", "Amy Santiago — mother"],
			}),
		).toBe("Known ties: Jake Peralta — father; Amy Santiago — mother");
	});
});

describe("formatCharacterKnownTiesConstraint", () => {
	it("lists allowed canon references for generation", () => {
		const constraint = formatCharacterKnownTiesConstraint({
			knownTies: ["Jake Peralta — father"],
		});

		expect(constraint).toContain("Jake Peralta — father");
		expect(constraint).toContain("only these canon characters");
	});
});

describe("formatAntiCanonSprawlGuidance", () => {
	it("tightens guidance when known ties are provided", () => {
		expect(formatAntiCanonSprawlGuidance(true)).toContain("Only the Known ties");
		expect(formatAntiCanonSprawlGuidance(false)).toContain("No Known ties were specified");
	});
});
