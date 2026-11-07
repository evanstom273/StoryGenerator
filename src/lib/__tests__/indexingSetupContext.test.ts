import { describe, expect, it } from "vitest";
import { buildIndexingSetupContext } from "../ai/indexingSetupContext";
import { buildIndexingPrompt } from "../ai/storyIndexingPipeline";
import type { PlayerCharacter, Universe } from "../../types/models";

const sheet = (id: string, name: string, extra: Partial<PlayerCharacter> = {}): PlayerCharacter => ({
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
	createdAt: "2026-01-01T00:00:00Z",
	...extra,
});

const universe = (mode: Universe["mode"]): Universe => ({
	id: "u1",
	name: "Brooklyn 99",
	mode,
	description: "",
	wikiUrl: "",
	importedLore: [],
	importedCharacters: [],
	importedLocations: [],
	importedRelationships: [],
	createdAt: "2026-01-01T00:00:00Z",
});

describe("buildIndexingSetupContext", () => {
	const jamie = sheet("pc-jamie", "Jamie Diaz", {
		pronouns: "he/him",
		personality: "Warm and curious.",
		background: "Raised by his parents, Jason and Rosa.",
		notes: "Helps Laurent test recipes.",
		knownTies: ["Rosa Diaz — mother"],
		linkedCharacterIds: ["pc-mike"],
	});
	const mike = sheet("pc-mike", "Mike", { background: "Head of estate security." });
	const theo = sheet("pc-theo", "Theo", { background: "Family friend." });

	it("includes the full player sheet, imported characters and linked sheets", () => {
		const text = buildIndexingSetupContext({
			story: { playerCharacterId: "pc-jamie", importedCharacterIds: ["pc-theo"] },
			playerCharacter: jamie,
			allCharacters: [jamie, mike, theo],
			universe: universe("referenced"),
		});
		expect(text).toContain("Background: Raised by his parents, Jason and Rosa.");
		expect(text).toContain("Personality: Warm and curious.");
		expect(text).toContain("Notes: Helps Laurent test recipes.");
		expect(text).toContain("Known ties: Rosa Diaz — mother");
		expect(text).toContain("Imported story characters:");
		expect(text).toContain("Family friend.");
		expect(text).toContain("Sheet ID: pc-mike");
		expect(text).toContain("Head of estate security.");
		expect(text).toContain("keep their canon identities, families, and histories");
	});

	it("omits the canon note for original universes", () => {
		const text = buildIndexingSetupContext({
			story: { playerCharacterId: "pc-jamie" },
			playerCharacter: jamie,
			allCharacters: [jamie, mike],
			universe: universe("custom"),
		});
		expect(text).toContain("(an original setting)");
		expect(text).not.toContain("canon identities");
	});
});

describe("buildIndexingPrompt setup section", () => {
	const base = {
		storyTitle: "T",
		playerCharacter: sheet("pc-jamie", "Jamie Diaz"),
		chapterLabel: "Chapter I",
		existingCharacters: [],
		existingRelationships: [],
		newMessages: [],
	};

	it("adds setup canon and its rules only when setup context is given", () => {
		const withSetup = buildIndexingPrompt({ ...base, setupContext: "Player character sheet:\nName: Jamie Diaz" });
		expect(withSetup).toContain("### Story Setup (authoritative pre-story canon):");
		expect(withSetup).toContain("'Canonize conservatively' applies to inferences drawn from the transcript");
		expect(buildIndexingPrompt(base)).not.toContain("Story Setup");
	});
});
