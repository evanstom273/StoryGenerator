import { describe, expect, it } from "vitest";
import {
	applyPlayerSceneNameToTranscript,
	inferPlayerSceneNameFromMessages,
	normalizePlayerActionBeatsInTranscript,
	resolveSubjectPronoun,
	stripLeadingSubjectPronounForAudiobook,
} from "../storyText/playerSceneName";
import { resolvePlayerCharacterSceneName } from "../playerCharacterPrompt";
import type { StoryMessage } from "../../types/models";

describe("resolvePlayerCharacterSceneName", () => {
	it("prefers in-story displayName over the legal character sheet name", () => {
		expect(
			resolvePlayerCharacterSceneName(
				{ name: "Silas Thorne", aliases: [] },
				{
					storyState: {
						updatedAt: "2026-01-01T00:00:00.000Z",
						characters: {
							"Silas Thorne": {
								displayName: "Mark Owen",
							},
						},
						worldFacts: [],
						unresolvedThreads: [],
					},
				},
			),
		).toBe("Mark Owen");
	});
});

describe("inferPlayerSceneNameFromMessages", () => {
	it("reads the most recent player speaker label from user messages", () => {
		const messages: StoryMessage[] = [
			{
				id: "1",
				storyId: "story-1",
				role: "user",
				content: "Mark Owen: \"My name is Mark Owen.\"",
				speakerType: "player",
				speakerName: "Mark Owen",
				timestamp: "2026-01-01T00:00:00.000Z",
			},
		];

		expect(inferPlayerSceneNameFromMessages(messages, "Silas Thorne")).toBe("Mark Owen");
	});
});

describe("applyPlayerSceneNameToTranscript", () => {
	it("replaces legal-name speaker headers and narrator mentions with the scene alias", () => {
		const masked = applyPlayerSceneNameToTranscript(
			[
				"Silas Thorne: *stares down into the steam rising from his mug.*",
				"Narrator: Silas abruptly sets the mug down.",
			].join("\n"),
			"Silas Thorne",
			"Mark Owen",
		);

		expect(masked).toContain("Mark:");
		expect(masked).not.toContain("Silas Thorne:");
		expect(masked).toContain("Mark abruptly sets the mug down.");
	});
});

describe("normalizePlayerActionBeatsInTranscript", () => {
	it("adds subject pronouns and a trailing full stop to player action beats", () => {
		const normalized = normalizePlayerActionBeatsInTranscript(
			'Mark: *stares down into the steam rising from his mug* "I saw his back."',
			"Mark Owen",
			"he/him",
		);

		expect(normalized).toContain("*He stares down into the steam rising from his mug.*");
	});
});

describe("stripLeadingSubjectPronounForAudiobook", () => {
	it("removes a leading subject pronoun from action narration", () => {
		expect(stripLeadingSubjectPronounForAudiobook("He stares down into the steam.")).toBe(
			"stares down into the steam.",
		);
	});

	it("resolves pronouns from character sheet values", () => {
		expect(resolveSubjectPronoun("she/her")).toBe("She");
		expect(resolveSubjectPronoun("he/him")).toBe("He");
		expect(resolveSubjectPronoun("they/them")).toBe("They");
	});
});
