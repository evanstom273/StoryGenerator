import { describe, expect, it } from "vitest";
import {
	applyPlayerSceneNameToTranscript,
	detectEstablishedPlayerIdentityFromMessages,
	inferPlayerPronounsFromDirectorNotes,
	inferPlayerPronounsFromMessages,
	inferPlayerSceneNameFromDirectorNotes,
	inferPlayerSceneNameFromMessages,
	normalizeCharacterActionBeatsInTranscript,
	resolveSubjectPronoun,
	resolveSubjectPronounFromActionBeat,
	stripLeadingSubjectPronounForAudiobook,
} from "../storyText/playerSceneName";
import { applyStoryLocalIdentityToAssistantTranscript } from "../storyText/transcriptSanitizer";
import { resolveEffectivePlayerIdentity, resolvePlayerCharacterSceneName } from "../playerCharacterPrompt";
import type { StoryMessage } from "../../types/models";

describe("resolvePlayerCharacterSceneName", () => {
	it("defaults Jamie Peralta to Jamie when no alias or displayName is set", () => {
		expect(
			resolvePlayerCharacterSceneName(
				{ name: "Jamie Peralta", aliases: [] },
				{ recentMessages: [] },
			),
		).toBe("Jamie");
	});

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

	it("ignores corrupted displayName tokens persisted from prose inference", () => {
		expect(
			resolvePlayerCharacterSceneName(
				{ name: "James Peralta", aliases: ["Jamie"] },
				{
					storyState: {
						updatedAt: "2026-08-22T00:00:00.000Z",
						characters: {
							"James Peralta": {
								displayName: "The",
							},
						},
						worldFacts: [],
						unresolvedThreads: [],
					},
				},
			),
		).toBe("Jamie");
	});

	it("ignores legal-name-token displayName when a sheet alias exists", () => {
		expect(
			resolvePlayerCharacterSceneName(
				{ name: "James Peralta", aliases: ["Jamie"] },
				{
					storyState: {
						updatedAt: "2026-08-22T00:00:00.000Z",
						characters: {
							"James Peralta": {
								displayName: "James",
							},
						},
						worldFacts: [],
						unresolvedThreads: [],
					},
				},
			),
		).toBe("Jamie");
	});
});

describe("resolveEffectivePlayerIdentity with director notes", () => {
	it("keeps Jamie as the scene name when a director note starts with The", () => {
		const messages: StoryMessage[] = [
			{
				id: "31",
				storyId: "story-1",
				role: "user",
				content:
					"Director: *The front door bangs open violently. Jamie sprints in, breathing heavily. There's no Ellie.*",
				speakerType: "director",
				timestamp: "2026-08-22T00:00:00.000Z",
			},
		];

		expect(
			resolveEffectivePlayerIdentity(
				{ name: "James Peralta", aliases: ["Jamie"], pronouns: "he/him" },
				{ recentMessages: messages },
			).sceneName,
		).toBe("Jamie");
	});
});

describe("detectEstablishedPlayerIdentityFromMessages", () => {
	it("locks Lyra and she/her after a coming-out scene", () => {
		const messages: StoryMessage[] = [
			{
				id: "23",
				storyId: "story-1",
				role: "assistant",
				content:
					'Jamie: "I know. I\'m trans. I\'m your daughter... and I\'m really sorry."\nAmy: "Oh, sweetie... you have nothing to be sorry for."',
				speakerType: "assistant",
				timestamp: "2026-08-21T00:06:00.000Z",
			},
			{
				id: "27",
				storyId: "story-1",
				role: "assistant",
				content:
					'Jamie: "Lyra... that\'s my... name."\nAmy: *She eases back to look at her daughter\'s face.* "Lyra... like the heroine from His Dark Materials?"',
				speakerType: "assistant",
				timestamp: "2026-08-21T00:07:00.000Z",
			},
		];

		expect(
			detectEstablishedPlayerIdentityFromMessages(messages, "James Peralta", "Jamie"),
		).toEqual({
			sceneName: "Lyra",
			pronouns: "she/her",
		});
	});
});

describe("applyStoryLocalIdentityToAssistantTranscript", () => {
	it("rewrites player action-beat pronouns using story-local identity", () => {
		const normalized = applyStoryLocalIdentityToAssistantTranscript(
			'Lyra: *He takes a breath and looks Mac in the eye.* "I realized I\'m actually a big sister. And my name is Lyra now."',
			{
				legalName: "James Peralta",
				sceneName: "Lyra",
				pronouns: "she/her",
			},
		);

		expect(normalized).toContain("*She takes a breath and looks Mac in the eye.*");
		expect(normalized).not.toContain("*He takes a breath");
	});
});

describe("inferPlayerSceneNameFromDirectorNotes", () => {
	it("reads a new scene name only from explicit rename dialogue in director notes", () => {
		const messages: StoryMessage[] = [
			{
				id: "30",
				storyId: "story-1",
				role: "user",
				content: '*Jamie takes a breath.* "Call me Lyra."',
				speakerType: "director",
				timestamp: "2026-08-21T00:08:00.000Z",
			},
		];

		expect(
			inferPlayerSceneNameFromDirectorNotes(messages, "James Peralta", "Jamie"),
		).toBe("Lyra");
	});

	it("does not treat sentence openers like The or Saturday as a renamed player", () => {
		const messages: StoryMessage[] = [
			{
				id: "31",
				storyId: "story-1",
				role: "user",
				content:
					"Director: *The front door bangs open violently, nearly flying off of the hinges. Jamie sprints in, breathing heavily. There's no Ellie. He can't speak, struggling to catch his breath.*",
				speakerType: "director",
				timestamp: "2026-08-22T00:00:00.000Z",
			},
			{
				id: "32",
				storyId: "story-1",
				role: "user",
				content:
					"Director: *it's a Saturday afternoon. Jake, Amy and Mac are in the living room playing a board game (Uno).*",
				speakerType: "director",
				timestamp: "2026-08-22T00:01:00.000Z",
			},
		];

		expect(
			inferPlayerSceneNameFromDirectorNotes(messages, "James Peralta", "Jamie"),
		).toBeNull();
	});

	it("does not treat other characters mentioned in a director note as the player", () => {
		const messages: StoryMessage[] = [
			{
				id: "33",
				storyId: "story-1",
				role: "user",
				content:
					"Director: *Jamie sprints in, breathing heavily. There's no Ellie. He can't speak, struggling to catch his breath.*",
				speakerType: "director",
				timestamp: "2026-08-22T00:02:00.000Z",
			},
		];

		expect(
			inferPlayerSceneNameFromDirectorNotes(messages, "James Peralta", "Jamie"),
		).toBeNull();
	});
});

describe("inferPlayerPronounsFromDirectorNotes", () => {
	it("reads feminine pronouns from a director note", () => {
		const messages: StoryMessage[] = [
			{
				id: "30",
				storyId: "story-1",
				role: "user",
				content: "*Lyra finally pulls back from her parents, wiping her eyes on her sleeve.*",
				speakerType: "director",
				timestamp: "2026-08-21T00:08:00.000Z",
			},
		];

		expect(inferPlayerPronounsFromDirectorNotes(messages)).toBe("she/her");
	});

	it("does not treat collective possessive their as a they/them player pronoun signal", () => {
		const messages: StoryMessage[] = [
			{
				id: "31",
				storyId: "story-1",
				role: "user",
				content:
					"It's a quiet Saturday night. Becca and Rosa are on the couch in their apartment, wine glasses on the table, cuddling while watching a film.",
				speakerType: "director",
				timestamp: "2026-08-21T00:08:00.000Z",
			},
		];

		expect(inferPlayerPronounsFromDirectorNotes(messages)).toBeNull();
	});
});

describe("inferPlayerPronounsFromMessages", () => {
	it("infers she/her from recent assistant scenes about the player", () => {
		const messages: StoryMessage[] = [
			{
				id: "27",
				storyId: "story-1",
				role: "assistant",
				content:
					'Jamie: *She buries her face against Amy\'s shoulder.* "Lyra... that\'s my... name."\nAmy: *She eases back just enough to look at her daughter\'s face.* "Lyra... like the heroine from His Dark Materials?"',
				speakerType: "assistant",
				timestamp: "2026-08-21T00:07:00.000Z",
			},
		];

		expect(inferPlayerPronounsFromMessages(messages, "James Peralta", "Lyra")).toBe("she/her");
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

	it("uses story-state gender for NPCs without possessive cues in the beat", () => {
		const normalized = normalizeCharacterActionBeatsInTranscript(
			'Captain Holt: watches with solemn concern, resting a heavy hand near the edge of the table. "Take a slow breath."',
			{
				characterGenders: {
					"captain holt": "male",
					captain: "male",
				},
			},
		);

		expect(normalized).toContain(
			"*He watches with solemn concern, resting a heavy hand near the edge of the table.*",
		);
	});

	it("preserves determiner-led action beats instead of treating their first noun as a verb", () => {
		const normalized = normalizeCharacterActionBeatsInTranscript(
			[
				"Claude: *A soft, pleasant visualizer pulse illuminates the room...*",
				"Claude: *The blue waveform pulses across the display...*",
				"Claude: *An alert chime sounds from the console...*",
			].join("\n"),
		);

		expect(normalized).toContain("*A soft, pleasant visualizer pulse illuminates the room...*");
		expect(normalized).toContain("*The blue waveform pulses across the display...*");
		expect(normalized).toContain("*An alert chime sounds from the console...*");
		expect(normalized).not.toContain("He as");
		expect(normalized).not.toContain("They thes");
	});

	it("preserves adjective- and noun-led complete action sentences", () => {
		const normalized = normalizeCharacterActionBeatsInTranscript(
			[
				"Claude: *Soft blue light fills the display.*",
				"Claude: *Quiet and deliberate, the waveform pulses steadily.*",
			].join("\n"),
		);

		expect(normalized).toContain("*Soft blue light fills the display.*");
		expect(normalized).toContain("*Quiet and deliberate, the waveform pulses steadily.*");
	});

	it("does not treat pronoun-led narrator pseudo-labels as character speakers", () => {
		const normalized = normalizeCharacterActionBeatsInTranscript(
			[
				"He narrator:",
				"The squad watches intently as the man stands motionless in the center of the room.",
			].join("\n"),
		);

		expect(normalized).not.toContain("*He narrator:*");
		expect(normalized).toContain(
			"The squad watches intently as the man stands motionless in the center of the room.",
		);
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
