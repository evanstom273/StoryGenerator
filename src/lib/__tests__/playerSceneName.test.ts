import { describe, expect, it } from "vitest";
import {
	applyPlayerSceneNameToTranscript,
	inferPlayerSceneNameFromMessages,
	normalizeCharacterActionBeatsInTranscript,
	resolveSubjectPronoun,
	resolveSubjectPronounFromActionBeat,
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

describe("normalizeCharacterActionBeatsInTranscript", () => {
	it("adds subject pronouns and a trailing full stop to player action beats", () => {
		const normalized = normalizeCharacterActionBeatsInTranscript(
			'Mark: *stares down into the steam rising from his mug* "I saw his back."',
			{
				playerSceneName: "Mark Owen",
				playerPronouns: "he/him",
			},
		);

		expect(normalized).toContain("*He stares down into the steam rising from his mug.*");
	});

	it("normalizes action beats for every character speaker block", () => {
		const normalized = normalizeCharacterActionBeatsInTranscript(
			[
				'Jake: *pulls up a chair across from him, leaning in with genuine concern* "Take your time."',
				'Rosa: *folds her arms* "What do you mean?"',
			].join("\n"),
		);

		expect(normalized).toContain(
			"*He pulls up a chair across from him, leaning in with genuine concern.*",
		);
		expect(normalized).toContain("*She folds her arms.*");
	});

	it("infers pronouns from possessives inside action beats", () => {
		expect(resolveSubjectPronounFromActionBeat("*stares down into the steam rising from his mug*")).toBe(
			"He",
		);
		expect(resolveSubjectPronounFromActionBeat("*folds her arms*")).toBe("She");
	});

	it("wraps bare action prose before dialogue and adds pronouns with a trailing period", () => {
		const normalized = normalizeCharacterActionBeatsInTranscript(
			'Mark: stares down into the dark liquid in his mug "I saw him.."',
			{
				playerSceneName: "Mark",
				playerPronouns: "he/him",
			},
		);

		expect(normalized).toContain("*He stares down into the dark liquid in his mug.*");
	});

	it("wraps bare action prose for NPC speaker lines", () => {
		const normalized = normalizeCharacterActionBeatsInTranscript(
			'Jake: leans in slightly, his voice dropping to a gentle and low "Did you get a look at his face?"',
		);

		expect(normalized).toContain(
			"*He leans in slightly, his voice dropping to a gentle and low.*",
		);
	});

	it("normalizes bare action lines under a speaker header", () => {
		const normalized = normalizeCharacterActionBeatsInTranscript(
			['Mark:', 'shakes his head slowly, his voice a raspy whisper', '"No..."'].join("\n"),
			{
				playerSceneName: "Mark",
				playerPronouns: "he/him",
			},
		);

		expect(normalized).toContain("*He shakes his head slowly, his voice a raspy whisper.*");
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
