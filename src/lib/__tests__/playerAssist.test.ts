import { describe, expect, it } from "vitest";
import {
	buildDirectorAssistContinuationRequest,
	buildDirectorAssistRequest,
	formatDirectorAssistContinuation,
	formatDirectorAssistOutput,
} from "../ai/playerAssist";
import {
	buildDirectorAssistContext,
	buildPlayerAssistContext,
	storyHasGeneratedScenes,
} from "../ai/playerAssistContext";
import type { PlayerCharacter, Story, StoryMessage, Universe } from "../../types/models";

const universe: Universe = {
	id: "universe-1",
	name: "Test Universe",
	description: "A test universe",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const story: Story = {
	id: "story-1",
	universeId: "universe-1",
	title: "Test Story",
	playerCharacterId: "pc-1",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	currentSummary: "The squad is investigating a missing file.",
};

const playerCharacter: PlayerCharacter = {
	id: "pc-1",
	universeId: "universe-1",
	name: "Alex Rivera",
	aliases: ["Alex"],
	pronouns: "they/them",
	gender: "",
	species: "human",
	age: "28",
	appearance: "",
	personality: "",
	background: "",
	notes: "",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

function userMessage(content: string, id: string): StoryMessage {
	return {
		id,
		storyId: "story-1",
		role: "user",
		content,
		speakerType: "player",
		timestamp: `2026-01-01T00:00:0${id}.000Z`,
	};
}

function assistantMessage(content: string, id: string): StoryMessage {
	return {
		id,
		storyId: "story-1",
		role: "assistant",
		content,
		timestamp: `2026-01-01T00:00:1${id}.000Z`,
	};
}

describe("storyHasGeneratedScenes", () => {
	it("returns false when no assistant messages exist", () => {
		expect(storyHasGeneratedScenes([userMessage("Hello", "1")])).toBe(false);
	});

	it("returns true when at least one assistant message exists", () => {
		expect(
			storyHasGeneratedScenes([
				userMessage("Hello", "1"),
				assistantMessage("Narrator: The room is quiet.", "2"),
			]),
		).toBe(true);
	});
});

describe("formatDirectorAssistOutput", () => {
	it("wraps bare staging text with Director prefix and asterisks", () => {
		expect(formatDirectorAssistOutput("Morgan confronts Alex about the file.")).toBe(
			"Director: *Morgan confronts Alex about the file.*",
		);
	});

	it("strips redundant Director prefix from model output", () => {
		expect(formatDirectorAssistOutput("Director: *Morgan steps into the room.*")).toBe(
			"Director: *Morgan steps into the room.*",
		);
	});
});

describe("formatDirectorAssistContinuation", () => {
	it("returns only the continuation when the model repeats the existing text", () => {
		expect(
			formatDirectorAssistContinuation(
				"Director: *Morgan steps into the room and waits.*",
				"Director: *Morgan steps",
			),
		).toBe("into the room and waits.*");
	});

	it("strips a repeated Director prefix from continuation output", () => {
		expect(
			formatDirectorAssistContinuation(
				"Director: Morgan finishes her coffee.",
				"Director: *Morgan sits at the table.",
			),
		).toBe("Morgan finishes her coffee.");
	});
});

describe("buildDirectorAssistRequest", () => {
	it("mentions Director staging format and player character", () => {
		const request = buildDirectorAssistRequest("Alex");

		expect(request).toContain("Director Assist request:");
		expect(request).toContain("Director:");
		expect(request).toContain("Alex");
		expect(request).toContain("approximate dialogue");
	});
});

describe("buildDirectorAssistContinuationRequest", () => {
	it("includes the existing draft without asking for a repeated prefix", () => {
		const request = buildDirectorAssistContinuationRequest("Director: *Morgan");

		expect(request).toContain("Existing text (do not repeat):");
		expect(request).toContain("Director: *Morgan");
		expect(request).toContain("Do NOT output the 'Director:' prefix again");
	});
});

describe("buildDirectorAssistContext", () => {
	it("includes the full transcript instead of truncating to the player-assist window", () => {
		const messages = Array.from({ length: 35 }, (_, index) =>
			index % 2 === 0
				? userMessage(`Player line ${index}`, `u-${index}`)
				: assistantMessage(`Scene line ${index}`, `a-${index}`),
		);

		const context = buildDirectorAssistContext({
			universe,
			story,
			playerCharacter,
			imports: [],
			summaries: [],
			recentMessages: messages,
		});

		const transcriptMessages = context.filter(
			(message) => message.role === "user" || message.role === "assistant",
		);

		expect(transcriptMessages.length).toBeGreaterThan(30);
		expect(context.at(-1)?.content).toContain("Director Assist request:");
		expect(context.some((message) => message.content.includes("Director Assist Mode"))).toBe(true);
	});
});

describe("buildPlayerAssistContext", () => {
	it("still truncates transcript history to the player-assist window", () => {
		const messages = Array.from({ length: 35 }, (_, index) =>
			index % 2 === 0
				? userMessage(`Player line ${index}`, `u-${index}`)
				: assistantMessage(`Scene line ${index}`, `a-${index}`),
		);

		const context = buildPlayerAssistContext({
			universe,
			story,
			playerCharacter,
			imports: [],
			summaries: [],
			recentMessages: messages,
		});

		const transcriptMessages = context.filter(
			(message) =>
				(message.role === "user" || message.role === "assistant") &&
				!message.content.includes("Player Assist request:"),
		);

		expect(transcriptMessages.length).toBe(30);
		expect(context.at(-1)?.content).toContain("Player Assist request:");
	});
});
