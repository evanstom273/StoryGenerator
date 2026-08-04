import { describe, expect, it } from "vitest";
import { getMessagesForChapterStartingAt } from "../storyText/chapterNavigation";
import {
	buildCharacterGenderHintsFromMessages,
	buildChapterSpeechPlan,
	buildCharacterTtsRegistryForStory,
	buildStoryMessageSpeechPlan,
	isSpeakableUserMessage,
	metaChatContentToSpeechText,
	shouldAnnounceChapterTitle,
} from "../storyText/messageSpeechText";
import { normalizeCharacterTtsKey } from "../ai/characterTtsVoices";
import {
	geminiTtsVoiceMatchesGender,
	resolveGeminiNarrationTtsSettings,
} from "../ai/geminiTtsVoices";
import type { StoryMessage } from "../../types/models";

function assistantMessage(content: string, id = "msg-1", timestamp = "2026-01-01T00:00:00.000Z"): StoryMessage {
	return {
		id,
		storyId: "story-1",
		role: "assistant",
		content,
		timestamp,
	};
}

describe("messageSpeechText", () => {
	const narrationTts = resolveGeminiNarrationTtsSettings();

	it("builds single-speaker narration for prose-only assistant messages", () => {
		const plan = buildStoryMessageSpeechPlan(
			assistantMessage("The rain fell hard against the windows.\n\nShe waited in silence."),
			{ narrationTts },
		);

		expect(plan?.multiSpeaker).toBe(false);
		expect(plan?.speakers).toEqual([{ name: "Narrator", voice: narrationTts.voice }]);
		expect(plan?.text).toContain("rain fell hard");
	});

	it("uses narrator and character voices for mixed dialogue", () => {
		const plan = buildStoryMessageSpeechPlan(
			assistantMessage(
				"The alley was empty.\n\nMarcus: *checks the corner.* \"We need to move.\"\n\nHe ran north.",
			),
			{ narrationTts },
		);

		expect(plan?.multiSpeaker).toBe(true);
		expect(plan?.speakers.find((speaker) => speaker.name === "Narrator")?.voice).toBe(
			narrationTts.voice,
		);
		expect(plan?.scriptLines.some((line) => line.speaker === "Marcus")).toBe(true);
		expect(plan?.scriptLines.some((line) => line.speaker === "Narrator" && line.text.includes("checks the corner"))).toBe(
			true,
		);
		expect(plan?.text).toContain("Marcus:");
		expect(plan?.text).toContain("We need to move");
	});

	it("treats quoted speech as dialogue and everything else as narration", () => {
		const plan = buildStoryMessageSpeechPlan(
			assistantMessage('Marcus: *draws his sidearm.* "We need to move."'),
			{ narrationTts },
		);

		expect(plan?.scriptLines).toEqual([
			{ speaker: "Narrator", text: "Marcus draws his sidearm." },
			{ speaker: "Marcus", text: "We need to move." },
		]);
	});

	it("includes character names for label-only transcript lines", () => {
		const plan = buildStoryMessageSpeechPlan(
			assistantMessage("Jake Peralta:\nputs his pen down"),
			{ narrationTts },
		);

		expect(plan?.text.toLowerCase()).toContain("jake");
		expect(plan?.text).toContain("puts his pen down");
		expect(plan?.scriptLines[0]?.speaker).toBe("Narrator");
		expect(plan?.scriptLines[0]?.text).toContain("Jake Peralta puts his pen down");
	});

	it("reads asterisk actions with the narrator and quoted dialogue with the character voice", () => {
		const plan = buildStoryMessageSpeechPlan(
			assistantMessage(
				"Jake:\n*spins an open pen across his desk.* \"Two weeks is practically tomorrow, Rosa.\"",
			),
			{ narrationTts },
		);

		expect(plan?.scriptLines).toEqual([
			{
				speaker: "Narrator",
				text: "Jake spins an open pen across his desk.",
			},
			{
				speaker: "Jake",
				text: "Two weeks is practically tomorrow, Rosa.",
			},
		]);
	});

	it("narrates stacks-style action beats instead of speaking them in character voice", () => {
		const plan = buildStoryMessageSpeechPlan(
			assistantMessage(
				"Amy:\n*stacks a neat pile of folders on her desk.* \"Jake's timeline is completely nonsensical.\"",
			),
			{ narrationTts, playerName: "Jake Peralta" },
		);

		expect(plan?.scriptLines).toEqual([
			{
				speaker: "Narrator",
				text: "Amy stacks a neat pile of folders on her desk.",
			},
			{
				speaker: "Amy",
				text: "Jake's timeline is completely nonsensical.",
			},
		]);
	});

	it("infers character gender from pronouns in transcript lines", () => {
		const messages: StoryMessage[] = [
			assistantMessage("Jake Peralta spins an open pen across his desk.", "a1"),
			assistantMessage("Rosa:\nShe folds her arms.", "a2"),
		];

		const hints = buildCharacterGenderHintsFromMessages(messages);
		expect(hints[normalizeCharacterTtsKey("Jake Peralta")]).toBe("male");
		expect(hints[normalizeCharacterTtsKey("Jake")]).toBe("male");
		expect(hints[normalizeCharacterTtsKey("Rosa")]).toBe("female");

		const registry = buildCharacterTtsRegistryForStory(messages, { narrationTts });
		const jakeVoice = registry.voices[normalizeCharacterTtsKey("Jake Peralta")];
		const rosaVoice = registry.voices[normalizeCharacterTtsKey("Rosa")];
		expect(jakeVoice).toBeTruthy();
		expect(rosaVoice).toBeTruthy();
		expect(geminiTtsVoiceMatchesGender(jakeVoice!, "male")).toBe(true);
		expect(geminiTtsVoiceMatchesGender(rosaVoice!, "female")).toBe(true);
	});

	it("strips markdown from MetaChat content", () => {
		expect(metaChatContentToSpeechText("**Bold** and _italic_ with `code`.")).toBe(
			"Bold and italic with code.",
		);
	});

	it("builds player dialogue speech for user messages", () => {
		const plan = buildStoryMessageSpeechPlan(
			{
				id: "u1",
				storyId: "story-1",
				role: "user",
				content: "*leans forward* \"We need to leave now.\"",
				speakerType: "player",
				timestamp: "2026-01-01T00:00:00.000Z",
			},
			{ playerName: "Amy Santiago", narrationTts },
		);

		expect(plan?.multiSpeaker).toBe(true);
		expect(plan?.speakers.some((speaker) => speaker.name === "Amy Santiago")).toBe(true);
		expect(plan?.scriptLines.some((line) => line.speaker === "Narrator" && line.text.includes("leans forward"))).toBe(
			true,
		);
		expect(plan?.scriptLines.some((line) => line.speaker === "Amy Santiago" && line.text.includes("leave"))).toBe(
			true,
		);
	});

	it("skips continue user messages but allows director directions", () => {
		expect(
			isSpeakableUserMessage({
				id: "c1",
				storyId: "story-1",
				role: "user",
				content: "Continue",
				speakerType: "continue",
				timestamp: "2026-01-01T00:00:00.000Z",
			}),
		).toBe(false);
		expect(
			isSpeakableUserMessage({
				id: "d1",
				storyId: "story-1",
				role: "user",
				content: "Stage a chase scene.",
				speakerType: "director",
				timestamp: "2026-01-01T00:00:00.000Z",
			}),
		).toBe(true);

		const directorPlan = buildStoryMessageSpeechPlan(
			{
				id: "d1",
				storyId: "story-1",
				role: "user",
				content: "Stage a chase scene.",
				speakerType: "director",
				timestamp: "2026-01-01T00:00:00.000Z",
			},
			{ narrationTts },
		);
		expect(directorPlan?.scriptLines[0]?.speaker).toBe("Director");
		expect(directorPlan?.text.toLowerCase()).toContain("chase");
		expect(directorPlan?.speakers.find((speaker) => speaker.name === "Director")?.voice).toBe(
			narrationTts.voice,
		);
	});

	it("uses per-character speaker labels when registry is provided", () => {
		const messages: StoryMessage[] = [
			assistantMessage("Rosa: \"We need to move.\"\n\nAmy: *Copy that.*", "a1"),
		];
		const registry = buildCharacterTtsRegistryForStory(messages, {
			playerName: "Jake Peralta",
			narrationTts,
		});
		const plan = buildChapterSpeechPlan(messages, {
			narrationTts,
			characterRegistry: registry,
		});

		expect(plan?.scriptLines.some((line) => line.speaker === "Rosa")).toBe(true);
		expect(plan?.scriptLines.some((line) => line.speaker === "Narrator" && line.text.includes("Copy that"))).toBe(
			true,
		);
		expect(plan?.speakers.some((speaker) => speaker.name === "Rosa")).toBe(true);
		expect(plan?.speakers.find((speaker) => speaker.name === "Rosa")?.voice).toBe(
			registry.voices[normalizeCharacterTtsKey("Rosa")],
		);
	});

	it("builds chapter speech with player, director, and multi-voice narration", () => {
		const messages: StoryMessage[] = [
			{
				id: "p1",
				storyId: "story-1",
				role: "user",
				content: "\"Let's go.\"",
				speakerType: "player",
				timestamp: "2026-01-01T00:00:00.000Z",
			},
			{
				id: "d1",
				storyId: "story-1",
				role: "user",
				content: "Make it tense.",
				speakerType: "director",
				timestamp: "2026-01-01T00:00:30.000Z",
			},
			assistantMessage(
				"They sprinted down the alley.\n\nMarcus: *glances back.* \"Hurry up!\"",
				"a1",
				"2026-01-01T00:01:00.000Z",
			),
			{
				id: "p2",
				storyId: "story-1",
				role: "user",
				content: "Keep running.",
				speakerType: "player",
				timestamp: "2026-01-01T00:02:00.000Z",
			},
			assistantMessage("The sirens grew louder.", "a2", "2026-01-01T00:02:30.000Z"),
		];

		const chapterSlice = messages.slice(0, 3);
		const plan = buildChapterSpeechPlan(chapterSlice, { narrationTts });
		expect(plan?.multiSpeaker).toBe(true);
		expect(plan?.text).toContain("Let's go");
		expect(plan?.text).toContain("Director:");
		expect(plan?.text).toContain("sprinted");
		expect(plan?.text).toContain("Marcus");
		expect(plan?.text).not.toContain("Keep running");
		expect(plan?.text).not.toContain("sirens");
		expect(plan?.scriptLines.filter((line) => line.messageBreakAfter)).toHaveLength(3);
	});

	it("builds chapter speech from speakable story messages", () => {
		const messages: StoryMessage[] = [
			assistantMessage("Opening narration.", "a1"),
			{
				id: "u1",
				storyId: "story-1",
				role: "user",
				content: "Let's get moving.",
				speakerType: "player",
				timestamp: "2026-01-01T00:01:00.000Z",
			},
			{
				id: "u2",
				storyId: "story-1",
				role: "user",
				content: "Continue",
				speakerType: "continue",
				timestamp: "2026-01-01T00:01:30.000Z",
			},
			assistantMessage("More narration.", "a2"),
		];

		const plan = buildChapterSpeechPlan(messages, { narrationTts });
		expect(plan?.text).toContain("Opening narration.");
		expect(plan?.text).toContain("get moving");
		expect(plan?.text).toContain("More narration.");
		expect(plan?.text).not.toContain("Continue");
	});

	it("announces chapter titles before chapter speech", () => {
		const plan = buildChapterSpeechPlan([assistantMessage("The rain fell hard.")], {
			narrationTts,
			chapterTitle: "Chapter One: The Worst Day",
		});

		expect(plan?.scriptLines[0]).toEqual({
			speaker: "Narrator",
			text: "Chapter One: The Worst Day",
			messageBreakAfter: true,
		});
		expect(plan?.text).toContain("Chapter One: The Worst Day");
		expect(plan?.text).toContain("rain fell hard");
	});

	it("does not announce generic full story labels", () => {
		expect(shouldAnnounceChapterTitle("Full Story")).toBe(false);

		const plan = buildChapterSpeechPlan([assistantMessage("Opening narration.")], {
			narrationTts,
			chapterTitle: "Full Story",
		});

		expect(plan?.scriptLines[0]?.speaker).toBe("Narrator");
		expect(plan?.scriptLines[0]?.text).toContain("Opening narration");
		expect(plan?.scriptLines.some((line) => line.text === "Full Story")).toBe(false);
	});

	it("keeps asterisks inside quoted dialogue on the character voice (Ellie burp story)", () => {
		const plan = buildStoryMessageSpeechPlan(
			assistantMessage(
				'Ellie: *gestures emphatically with a french fry.* "So then Mr. Henderson goes — \'Class, silence!\' — *.except his mic was still plugged into the cafeteria speaker system, so the entire middle school heard him burp right into the microphone!*"',
			),
			{ narrationTts },
		);

		expect(plan?.scriptLines).toEqual([
			{
				speaker: "Narrator",
				text: "Ellie gestures emphatically with a french fry.",
			},
			{
				speaker: "Ellie",
				text:
					"So then Mr. Henderson goes — 'Class, silence!' — except his mic was still plugged into the cafeteria speaker system, so the entire middle school heard him burp right into the microphone!",
			},
		]);
	});

	it("reads colon dialogue in character voice without wrapping as action", () => {
		const plan = buildStoryMessageSpeechPlan(
			assistantMessage('Amy: "He said it plain: we are not doing this."'),
			{ narrationTts, playerName: "Jake Peralta" },
		);

		expect(plan?.scriptLines).toEqual([
			{
				speaker: "Amy",
				text: "He said it plain: we are not doing this.",
			},
		]);
	});

	it("routes first-person staging between quoted dialogue to the character voice in player turns", () => {
		const plan = buildStoryMessageSpeechPlan(
			{
				id: "jamie-1",
				storyId: "story-1",
				role: "user",
				speakerName: "Jamie",
				speakerType: "player",
				content:
					'"—and I distinctly remember someone..." I look at Dad through the camera, smirking. "Saying that I wouldn\'t be able to wrestle as a type-1, so... suck it Peralta!" We all laugh.',
				timestamp: "2026-01-01T00:00:00.000Z",
			},
			{ playerName: "Jamie", narrationTts },
		);

		expect(plan?.scriptLines).toEqual([
			{
				speaker: "Jamie",
				text: "—and I distinctly remember someone...",
			},
			{
				speaker: "Jamie",
				text: "I look at Dad through the camera, smirking.",
			},
			{
				speaker: "Jamie",
				text:
					"Saying that I wouldn't be able to wrestle as a type-1, so... suck it Peralta!",
			},
			{
				speaker: "Jamie",
				text: "We all laugh.",
			},
		]);
	});

	it("keeps third-person group staging between quotes on the narrator in player turns", () => {
		const plan = buildStoryMessageSpeechPlan(
			{
				id: "jamie-2",
				storyId: "story-1",
				role: "user",
				speakerName: "Jamie",
				speakerType: "player",
				content:
					'"Hello there!" The five of them all laugh. "See you later!"',
				timestamp: "2026-01-01T00:00:00.000Z",
			},
			{ playerName: "Jamie", narrationTts },
		);

		expect(plan?.scriptLines).toEqual([
			{ speaker: "Jamie", text: "Hello there!" },
			{ speaker: "Narrator", text: "The five of them all laugh." },
			{ speaker: "Jamie", text: "See you later!" },
		]);
	});

	it("reads first-person player RP blocks entirely in the character voice", () => {
		const plan = buildStoryMessageSpeechPlan(
			{
				id: "jamie-3",
				storyId: "story-1",
				role: "user",
				speakerName: "Jamie",
				speakerType: "player",
				content:
					'*I roll my eyes.* "Whatever. I\'m done." *I stand up to leave. Dad grabs my arm.*',
				timestamp: "2026-01-01T00:00:00.000Z",
			},
			{ playerName: "Jamie", narrationTts },
		);

		expect(plan?.scriptLines).toEqual([
			{ speaker: "Jamie", text: "I roll my eyes." },
			{ speaker: "Jamie", text: "Whatever. I'm done." },
			{
				speaker: "Jamie",
				text: "I stand up to leave. Dad grabs my arm.",
			},
		]);
		expect(plan?.scriptLines.every((line) => line.speaker === "Jamie")).toBe(true);
	});

	it("narrates third-person player action beats without the character name prefix", () => {
		const plan = buildStoryMessageSpeechPlan(
			{
				id: "jamie-4",
				storyId: "story-1",
				role: "user",
				speakerName: "Jamie",
				speakerType: "player",
				content: '"Sniff... sniff..." *Still nothing. Still the door is locked.*',
				timestamp: "2026-01-01T00:00:00.000Z",
			},
			{ playerName: "Jamie", narrationTts },
		);

		expect(plan?.scriptLines).toEqual([
			{ speaker: "Jamie", text: "Sniff... sniff..." },
			{
				speaker: "Narrator",
				text: "Still nothing. Still the door is locked.",
			},
		]);
	});

	it("applies player perspective rules to labeled Jamie blocks in assistant messages", () => {
		const plan = buildStoryMessageSpeechPlan(
			assistantMessage(
				'Jamie: "Sniff... sniff..." *Still nothing. Still the door is locked.*',
			),
			{ playerName: "Jamie", narrationTts },
		);

		expect(plan?.scriptLines).toEqual([
			{ speaker: "Jamie", text: "Sniff... sniff..." },
			{
				speaker: "Narrator",
				text: "Still nothing. Still the door is locked.",
			},
		]);
	});
});

describe("getMessagesForChapterStartingAt", () => {
	it("returns messages until the next chapter start", () => {
		const messages: StoryMessage[] = [
			assistantMessage("Intro", "intro"),
			{
				id: "ch2-marker",
				storyId: "story-1",
				role: "assistant",
				content: "Start of two.",
				chapterBoundary: { kind: "start", label: "Chapter Two" },
				timestamp: "2026-01-01T00:01:00.000Z",
			},
			assistantMessage("Chapter two body.", "ch2-body", "2026-01-01T00:01:30.000Z"),
			{
				id: "ch3-marker",
				storyId: "story-1",
				role: "assistant",
				content: "Start of three.",
				chapterBoundary: { kind: "start", label: "Chapter Three" },
				timestamp: "2026-01-01T00:02:00.000Z",
			},
			assistantMessage("Chapter three body.", "ch3-body", "2026-01-01T00:02:30.000Z"),
		];

		const slice = getMessagesForChapterStartingAt(messages, "ch2-marker");
		expect(slice.map((message) => message.id)).toEqual(["ch2-body"]);
	});
});
