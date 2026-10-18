import { describe, expect, it } from "vitest";
import {
	findMissingLinkedCharacterIds,
	formatLinkedCharacterSheetsForPrompt,
	remapLinkedCharacterIds,
	resolveLinkedCharacterSheets,
} from "../characterLinks";
import { createCharacterRecord, updateCharacterRecord } from "../libraryRecords";
import { formatAntiCanonSprawlGuidance, normalizeLinkedCharacterIds } from "../playerCharacterPrompt";
import {
	buildCharacterConceptGeneratorSystemPrompt,
	buildCharacterGeneratorSystemPrompt,
} from "../ai/characterGenerator";
import { buildStoryChatContext } from "../ai/contextBuilder";
import type { PlayerCharacter, PlayerCharacterDraft, Story, Universe } from "../../types/models";

const NOW = "2026-01-01T00:00:00.000Z";

function sheet(id: string, name: string, overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
	return {
		id,
		name,
		aliases: [],
		age: "",
		gender: "",
		species: "",
		pronouns: "",
		appearance: "",
		personality: "",
		background: "",
		goals: "",
		notes: "",
		universeId: "u1",
		createdAt: NOW,
		...overrides,
	};
}

const universe: Universe = {
	id: "u1",
	name: "Harlow Street",
	description: "A bakery sitcom.",
	wikiUrl: "",
	importedLore: [],
	importedCharacters: [],
	importedLocations: [],
	importedRelationships: [],
	createdAt: NOW,
};

describe("normalizeLinkedCharacterIds", () => {
	it("trims, de-duplicates and drops the sheet's own ID without any cap", () => {
		const many = Array.from({ length: 50 }, (_, index) => `pc-${index}`);
		const result = normalizeLinkedCharacterIds([" pc-1 ", "pc-1", "self", "", 7, ...many], "self");
		expect(result).toHaveLength(50);
		expect(result[0]).toBe("pc-1");
		expect(new Set(result)).toEqual(new Set(many));
	});
});

describe("character records", () => {
	const draft: PlayerCharacterDraft = {
		name: "Nell",
		age: "",
		gender: "",
		species: "",
		pronouns: "",
		appearance: "",
		personality: "",
		background: "",
		notes: "",
		universeId: "u1",
		linkedCharacterIds: ["pc-dora", "pc-dora", "pc-pip"],
	};

	it("stores normalised links on create", () => {
		expect(createCharacterRecord(draft).linkedCharacterIds).toEqual(["pc-dora", "pc-pip"]);
	});

	it("keeps existing links when an update omits the field", () => {
		const current = sheet("pc-nell", "Nell", { linkedCharacterIds: ["pc-dora"] });
		const { linkedCharacterIds: _omitted, ...partial } = draft;
		expect(updateCharacterRecord(partial, current).linkedCharacterIds).toEqual(["pc-dora"]);
		expect(updateCharacterRecord({ ...draft, linkedCharacterIds: [] }, current).linkedCharacterIds).toBeUndefined();
	});
});

describe("resolveLinkedCharacterSheets", () => {
	const doraOriginal = sheet("pc-dora-1", "Dora Hale", { characterConcept: "Bakery owner." });
	const doraAu = sheet("pc-dora-2", "Dora Hale", { characterConcept: "AU: ship captain." });
	const nell = sheet("pc-nell", "Nell", { linkedCharacterIds: ["pc-dora-2", "pc-gone", "pc-theo"] });
	const theo = sheet("pc-theo", "Theo", { linkedCharacterIds: ["pc-dora-2", "pc-nell"] });
	const all = [doraOriginal, doraAu, nell, theo];

	it("resolves the exact linked version, one hop, skipping missing and in-prompt sheets", () => {
		const resolved = resolveLinkedCharacterSheets([nell, theo], all);
		expect(resolved.map((entry) => entry.character.id)).toEqual(["pc-dora-2"]);
		expect(resolved[0]?.linkedFrom).toEqual(["Nell", "Theo"]);
	});

	it("formats sheets with their IDs so same-name versions stay distinct", () => {
		const both = formatLinkedCharacterSheetsForPrompt(
			resolveLinkedCharacterSheets([sheet("pc-x", "X", { linkedCharacterIds: ["pc-dora-1", "pc-dora-2"] })], all),
			{ universeNameById: () => "Harlow Street" },
		)!;
		expect(both).toContain("Sheet ID: pc-dora-1");
		expect(both).toContain("Sheet ID: pc-dora-2");
		expect(both).toContain("Concept: AU: ship captain.");
		expect(both).toContain("Universe: Harlow Street");
		expect(both).toContain("it means exactly this sheet (same Sheet ID)");
	});

	it("clips long fields only when asked", () => {
		const long = sheet("pc-long", "Long", { background: "x".repeat(2000) });
		const text = formatLinkedCharacterSheetsForPrompt([{ character: long, linkedFrom: [] }], { maxFieldChars: 100 })!;
		expect(text).toContain(`Background: ${"x".repeat(100)}…`);
		expect(formatLinkedCharacterSheetsForPrompt([])).toBeNull();
	});

	it("reports links whose sheets no longer exist", () => {
		expect(findMissingLinkedCharacterIds(nell.linkedCharacterIds, all)).toEqual(["pc-gone"]);
	});
});

describe("remapLinkedCharacterIds", () => {
	it("repoints merged duplicates and removes deleted sheets, returning only changed records", () => {
		const a = sheet("a", "A", { linkedCharacterIds: ["dup", "keep"] });
		const b = sheet("b", "B", { linkedCharacterIds: ["gone"] });
		const c = sheet("c", "C", { linkedCharacterIds: ["keep"] });
		const updated = remapLinkedCharacterIds([a, b, c], new Map([["dup", "winner"], ["gone", null]]));
		expect(updated.map((character) => [character.id, character.linkedCharacterIds])).toEqual([
			["a", ["winner", "keep"]],
			["b", undefined],
		]);
	});
});

describe("linked sheets in AI prompts", () => {
	const block = "Linked character sheets (the exact people the sheets above refer to):\n\nName: Dora Hale\nSheet ID: pc-dora-2";

	it("adds the block and allows linked names in both generators", () => {
		const details = buildCharacterGeneratorSystemPrompt({
			universe,
			linkedCharactersBlock: block,
			antiCanonSprawlGuidance: formatAntiCanonSprawlGuidance(false, true),
		});
		const concept = buildCharacterConceptGeneratorSystemPrompt({ universe, linkedCharactersBlock: block });
		expect(details).toContain("Sheet ID: pc-dora-2");
		expect(details).toContain("Only people in the Linked character sheets may be named.");
		expect(concept).toContain("Sheet ID: pc-dora-2");
	});

	it("leaves the anti-sprawl guidance unchanged without links", () => {
		expect(formatAntiCanonSprawlGuidance(true)).toContain("Only the Known ties listed above may be named.");
		expect(formatAntiCanonSprawlGuidance(true)).not.toContain("Linked character sheets");
	});

	it("adds a Linked Character Sheets block to story context only when links exist", () => {
		const story: Story = {
			id: "s1",
			title: "T",
			universeId: "u1",
			playerCharacterId: "pc-nell",
			currentSummary: "",
			createdAt: NOW,
			updatedAt: NOW,
		};
		const base = {
			universe,
			story,
			playerCharacter: sheet("pc-nell", "Nell"),
			imports: [],
			recentMessages: [],
			latestUserMessage: "Hi.",
		};
		const withLinks = buildStoryChatContext({ ...base, linkedCharactersBlock: block });
		expect(withLinks.some((message) => message.content.startsWith("Linked Character Sheets\n\n"))).toBe(true);
		expect(buildStoryChatContext(base).some((message) => message.content.startsWith("Linked Character Sheets"))).toBe(
			false,
		);
	});
});
