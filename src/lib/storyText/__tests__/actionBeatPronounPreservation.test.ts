import { describe, expect, it } from "vitest";
import { normalizeCharacterActionBeatsInTranscript } from "../playerSceneName";
import { buildCharacterGenderHintsFromStoryState } from "../../ai/characterGenderHints";

const normalize = (text: string, opts?: Parameters<typeof normalizeCharacterActionBeatsInTranscript>[1]) =>
	normalizeCharacterActionBeatsInTranscript(text, opts);

describe("action beat normalization preserves authored prose", () => {
	it("leaves possessive-led beats untouched instead of inventing 'lets'", () => {
		const source = "Rosa: *Her fingers let go of her pen. It rolls an inch across the blotter and stops.*";
		expect(normalize(source)).toBe(source);
	});

	it("does not turn a mixed-pronoun beat into 'They lets their…'", () => {
		const source = "Rosa: *Her eyes find his across the desk.*";
		expect(normalize(source)).toBe(source);
	});

	it("never overwrites an authored subject with a guessed pronoun", () => {
		const source = "Rosa: *She walks over to Jake and hands him the file.*";
		expect(normalize(source)).toBe(source);
	});

	it("still corrects an authored subject when the character's pronouns are known", () => {
		expect(normalize("Rosa: *He walks over.*", { characterGenders: { rosa: "female" } })).toBe(
			"Rosa: *She walks over.*",
		);
	});

	it("adds a missing subject with agreeing verb forms", () => {
		expect(normalize("Rosa: *walks to the door.*")).toBe("Rosa: *They walk to the door.*");
		expect(normalize("Sam: *lets the door close.*", { characterGenders: { sam: "female" } })).toBe(
			"Sam: *She lets the door close.*",
		);
	});

	it("de-conjugates the verb when known they/them pronouns replace an authored subject", () => {
		expect(
			normalize("Alex: *She lets the file drop.*", {
				playerSceneName: "Alex",
				playerPronouns: "they/them",
			}),
		).toBe("Alex: *They let the file drop.*");
	});

	it("applies forced player pronouns only to the player's own lines", () => {
		const source = "Rosa: *She lets her fingers drop.*\nRebecca: *She walks over.*";
		expect(
			normalize(source, { playerSceneName: "Rebecca", playerPronouns: "he/him", forcePlayerPronouns: true }),
		).toBe("Rosa: *She lets her fingers drop.*\nRebecca: *He walks over.*");
	});

	it("does not add a full stop after a trailing ellipsis", () => {
		expect(normalize("Sam: *walks off…*")).toBe("Sam: *They walk off…*");
	});

	it("repairs garbled 'She hers eyes' without inventing a verb", () => {
		expect(normalize("Rosa: *She hers eyes trace the line of the desk.*")).toBe(
			"Rosa: *Her eyes trace the line of the desk.*",
		);
	});
});

describe("character gender hints", () => {
	it("uses Story Index pronouns and imported character sheets, with the index winning", () => {
		const hints = buildCharacterGenderHintsFromStoryState(null, {
			playerName: "Rebecca Alvarez",
			playerPronouns: "she/her",
			importedCharacters: [
				{ name: "Theo Marsh", aliases: ["Teddy"], gender: "man", pronouns: "" },
				{ name: "Sam Reyes", aliases: [], gender: "", pronouns: "he/him" },
			],
			storyIndexCharacters: [
				{ canonicalName: "Rosa Diaz", aliases: ["Diaz"], pronouns: "she/her" },
				{ canonicalName: "Sam Reyes", aliases: [], pronouns: "she/her" },
			],
		});

		expect(hints).toMatchObject({
			"rosa diaz": "female",
			rosa: "female",
			diaz: "female",
			"theo marsh": "male",
			teddy: "male",
			sam: "female",
			rebecca: "female",
		});
	});

	it("never lets another character's record override the player", () => {
		const hints = buildCharacterGenderHintsFromStoryState(null, {
			playerName: "Rebecca Alvarez",
			playerPronouns: "she/her",
			storyIndexCharacters: [{ canonicalName: "Rebecca Alvarez", aliases: [], pronouns: "he/him" }],
		});
		expect(hints.rebecca).toBe("female");
	});
});
