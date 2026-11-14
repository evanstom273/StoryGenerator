import { describe, expect, it } from "vitest";
import type { PlayerCharacter, Story } from "../../types/models";
import {
	buildPlayerCharacterSwap,
	getSwappablePlayerCharacters,
	isPlayerCharacterSheetEmpty,
} from "../storyPlayerCharacterSwap";

const now = "2026-11-14T10:00:00.000Z";

function sheet(id: string, overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
	return {
		id,
		name: "Jamie Peralta",
		age: "15",
		gender: "Male",
		species: "Human",
		pronouns: "he/him",
		characterConcept: "Jake and Amy's middle child.",
		appearance: "",
		personality: "",
		background: "",
		goals: "",
		notes: "",
		universeId: "b99",
		createdAt: now,
		...overrides,
	};
}

const story: Story = {
	id: "story-1",
	title: "Hashtag Sweet Sixteen",
	universeId: "b99",
	playerCharacterId: "jamie-blank",
	importedCharacterIds: ["mac", "jamie-real"],
	currentSummary: "",
	createdAt: now,
	updatedAt: "2026-11-01T00:00:00.000Z",
};

describe("getSwappablePlayerCharacters", () => {
	it("offers other library sheets from the story's universe only", () => {
		const characters = [
			sheet("jamie-blank"),
			sheet("jamie-real"),
			sheet("jamie-other-universe", { universeId: "marvel" }),
			sheet("jamie-story-scoped", { scope: "story", storyId: "story-2" }),
		];
		expect(getSwappablePlayerCharacters(story, characters).map((character) => character.id)).toEqual(["jamie-real"]);
	});

	it("matches any of a multi-universe story's universes", () => {
		const crossover = { ...story, universeIds: ["b99", "marvel"] };
		const characters = [sheet("jamie-other-universe", { universeId: "marvel" })];
		expect(getSwappablePlayerCharacters(crossover, characters)).toHaveLength(1);
	});
});

describe("buildPlayerCharacterSwap", () => {
	it("re-points the story and drops the new sheet from the imported characters", () => {
		const result = buildPlayerCharacterSwap({ story, state: null, nextCharacter: sheet("jamie-real"), now });
		expect(result.story).toMatchObject({ playerCharacterId: "jamie-real", importedCharacterIds: ["mac"], updatedAt: now });
		expect(result.state).toBeNull();
	});

	it("removes the imported list entirely when nothing is left in it", () => {
		const result = buildPlayerCharacterSwap({
			story: { ...story, importedCharacterIds: ["jamie-real"] },
			state: null,
			nextCharacter: sheet("jamie-real"),
			now,
		});
		expect(result.story).not.toHaveProperty("importedCharacterIds");
	});

	it("clears the old character's identity override but keeps the rest of the state", () => {
		const state = {
			currentLocation: "Kitchen",
			playerIdentityOverride: {
				playerCharacterId: "jamie-blank",
				sourceMessageId: "m3",
				source: "player_turn",
				sceneName: "Jay",
			},
		};
		const result = buildPlayerCharacterSwap({ story, state, nextCharacter: sheet("jamie-real"), now });
		expect(result.state).toEqual({ currentLocation: "Kitchen" });
		expect(state).toHaveProperty("playerIdentityOverride");
	});

	it("returns the same state object when there is nothing to clear", () => {
		const state = { currentLocation: "Kitchen" };
		expect(buildPlayerCharacterSwap({ story, state, nextCharacter: sheet("jamie-real"), now }).state).toBe(state);
	});

	it("refuses the current character and sheets from other universes", () => {
		expect(() => buildPlayerCharacterSwap({ story, state: null, nextCharacter: sheet("jamie-blank"), now })).toThrow(
			/already/,
		);
		expect(() =>
			buildPlayerCharacterSwap({
				story,
				state: null,
				nextCharacter: sheet("elsewhere", { universeId: "marvel" }),
				now,
			}),
		).toThrow(/universe/);
	});
});

describe("isPlayerCharacterSheetEmpty", () => {
	it("is true when only the name is set", () => {
		const blank = sheet("blank", {
			age: "",
			gender: "",
			species: " ",
			pronouns: "",
			characterConcept: undefined,
		});
		expect(isPlayerCharacterSheetEmpty(blank)).toBe(true);
	});

	it("is false when any field has content", () => {
		expect(isPlayerCharacterSheetEmpty(sheet("filled"))).toBe(false);
	});
});
