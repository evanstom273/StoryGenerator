import { describe, expect, it } from "vitest";
import {
	formatPlayerCharacterAliasesForPrompt,
	normalizePlayerCharacterAliases,
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
