import { describe, expect, it } from "vitest";
import type { PlayerCharacter, Story } from "../../types/models";
import {
	buildStoryImportedCharacterAllowlist,
	collectStoryImportedCharacterAllowlistNames,
	formatStoryImportedCharactersForPrompt,
	normalizeStoryImportedCharacterIds,
	resolveStoryImportedCharacters,
} from "../storyImportedCharacters";

const baseCharacter = (overrides: Partial<PlayerCharacter> = {}): PlayerCharacter => ({
	id: "player-character:test",
	name: "Silas Thorne",
	aliases: ["Silas"],
	knownTies: ["Jamie Peralta — partner"],
	age: "34",
	gender: "Man",
	species: "Human",
	pronouns: "he/him",
	characterConcept: "Undercover detective",
	appearance: "Tall, dark hair",
	personality: "Dry and observant",
	background: "Works vice",
	goals: "Close the case",
	notes: "Uses a cover identity downtown",
	universeId: "universe:test",
	createdAt: "2026-01-01T00:00:00.000Z",
	...overrides,
});

describe("normalizeStoryImportedCharacterIds", () => {
	it("deduplicates and trims ids", () => {
		expect(
			normalizeStoryImportedCharacterIds([
				" player-character:a ",
				"player-character:a",
				"player-character:b",
				123,
				"",
			]),
		).toEqual(["player-character:a", "player-character:b"]);
	});
});

describe("resolveStoryImportedCharacters", () => {
	it("preserves order, excludes protagonist, and skips missing ids", () => {
		const protagonist = baseCharacter({ id: "player-character:hero", name: "Jamie Peralta" });
		const silas = baseCharacter({ id: "player-character:silas" });
		const maya = baseCharacter({ id: "player-character:maya", name: "Maya Chen" });
		const story: Pick<Story, "importedCharacterIds" | "playerCharacterId"> = {
			playerCharacterId: protagonist.id,
			importedCharacterIds: [silas.id, "missing-id", protagonist.id, maya.id],
		};

		expect(resolveStoryImportedCharacters(story, [protagonist, silas, maya])).toEqual([
			silas,
			maya,
		]);
	});
});

describe("buildStoryImportedCharacterAllowlist", () => {
	it("merges universe and story imported names", () => {
		const story: Pick<Story, "importedCharacterIds" | "playerCharacterId" | "universePackSnapshot"> =
			{
				playerCharacterId: "player-character:hero",
				importedCharacterIds: ["player-character:silas"],
				universePackSnapshot: {
					snapshotVersion: 1,
					exportedAt: "2026-01-01T00:00:00.000Z",
					packVersion: 1,
					universe: {
						id: "universe:test",
						name: "Test Universe",
						mode: "referenced",
						description: "",
						concept: "",
						genreTheme: "",
						tone: "",
						notes: "",
						universeBlueprint: "",
						importedCharacters: ["Jake Peralta"],
						createdAt: "2026-01-01T00:00:00.000Z",
						updatedAt: "2026-01-01T00:00:00.000Z",
					},
					universeImports: [],
				},
			};

		expect(
			buildStoryImportedCharacterAllowlist(story, [
				baseCharacter({ id: "player-character:silas", aliases: ["Silas"] }),
			]),
		).toEqual(["Jake Peralta", "Silas Thorne", "Silas"]);
	});
});

describe("formatStoryImportedCharactersForPrompt", () => {
	it("formats lightweight profiles without transcripts", () => {
		const prompt = formatStoryImportedCharactersForPrompt([baseCharacter()]);

		expect(prompt).toContain("Imported story characters");
		expect(prompt).toContain("Name: Silas Thorne");
		expect(prompt).toContain("Appearance: Tall, dark hair");
		expect(prompt).toContain("Known ties: Jamie Peralta — partner");
		expect(prompt).toContain("Background: Works vice");
		expect(prompt).not.toContain("Chapter I");
	});
});

describe("collectStoryImportedCharacterAllowlistNames", () => {
	it("includes names and aliases", () => {
		expect(
			collectStoryImportedCharacterAllowlistNames([
				baseCharacter({ aliases: ["Silas", "Thorne"] }),
			]),
		).toEqual(["Silas Thorne", "Silas", "Thorne"]);
	});
});
