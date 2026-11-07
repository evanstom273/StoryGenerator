import { describe, expect, it } from "vitest";
import { buildStoryChatContext } from "../ai/contextBuilder";
import type { PlayerCharacter, Story, Universe } from "../../types/models";

const NOW = "2026-01-01T00:00:00.000Z";
const universe: Universe = {
	id: "u1",
	name: "Brooklyn 99",
	description: "A precinct comedy.",
	wikiUrl: "",
	importedLore: [],
	importedCharacters: [],
	importedLocations: [],
	importedRelationships: [],
	createdAt: NOW,
};
const playerCharacter: PlayerCharacter = {
	id: "pc-jamie",
	name: "Jamie Diaz",
	aliases: [],
	age: "15",
	gender: "Male",
	species: "Human",
	pronouns: "he/him",
	appearance: "",
	personality: "Warm, curious.",
	background: "Raised by his parents, Jason and Rosa.",
	goals: "",
	notes: "",
	universeId: "u1",
	createdAt: NOW,
};
const story = (adultContentMode: Story["adultContentMode"]): Story => ({
	id: "s1",
	title: "The Upstate Diaz",
	universeId: "u1",
	playerCharacterId: "pc-jamie",
	currentSummary: "",
	adultContentMode,
	createdAt: NOW,
	updatedAt: NOW,
});

function build(providerType: "gemini" | "anthropic", mode: Story["adultContentMode"]) {
	return buildStoryChatContext({
		universe,
		story: story(mode),
		playerCharacter,
		imports: [],
		recentMessages: [],
		latestUserMessage: "I head downstairs for breakfast.",
		providerType,
	});
}

describe("Claude and Gemini receive the same story prompt", () => {
	it.each(["standard", "mature_non_graphic"] as const)("is identical in %s mode", (mode) => {
		expect(build("anthropic", mode)).toEqual(build("gemini", mode));
	});

	it("differs only in the provider capability line in explicit mode", () => {
		const gemini = build("gemini", "explicit_consensual_adults").map((message) => message.content).join("\n");
		const claude = build("anthropic", "explicit_consensual_adults").map((message) => message.content).join("\n");
		const geminiLines = gemini.split("\n");
		const claudeLines = claude.split("\n");
		const differing = geminiLines.filter((line, index) => line !== claudeLines[index]);
		expect(geminiLines).toHaveLength(claudeLines.length);
		expect(differing.length).toBeGreaterThan(0);
		expect(differing.every((line) => /provider capability/i.test(line))).toBe(true);
	});
});
