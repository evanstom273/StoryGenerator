import { describe, expect, it } from "vitest";
import {
	formatPlayerCharacterAliasesForPrompt,
	formatPlayerCharacterKnownTiesForPrompt,
	formatCharacterKnownTiesConstraint,
	formatAntiCanonSprawlGuidance,
	normalizePlayerCharacterAliases,
	normalizePlayerCharacterKnownTies,
} from "../playerCharacterPrompt";

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
