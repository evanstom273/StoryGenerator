import { describe, expect, it } from "vitest";
import { getMessagesForChapterStartingAt } from "../storyText/chapterNavigation";
import {
	buildChapterSpeechPlan,
	buildStoryMessageSpeechPlan,
	isSpeakableUserMessage,
	metaChatContentToSpeechText,
} from "../storyText/messageSpeechText";
import { resolveGeminiNarrationTtsSettings } from "../ai/geminiTtsVoices";
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
			assistantMessage("The alley was empty.\n\nMarcus: We need to move.\n\nHe ran north."),
			{ narrationTts },
		);

		expect(plan?.multiSpeaker).toBe(true);
		expect(plan?.speakers).toEqual([
			{ name: "Narrator", voice: narrationTts.voice },
			{ name: "Character", voice: narrationTts.characterVoice },
		]);
		expect(plan?.text).toContain("Narrator:");
		expect(plan?.text).toContain("Character: Marcus");
		expect(plan?.text).toContain("We need to move");
	});

	it("includes character names for label-only transcript lines", () => {
		const plan = buildStoryMessageSpeechPlan(
			assistantMessage("Jake Peralta:\nputs his pen down"),
			{ narrationTts },
		);

		expect(plan?.text.toLowerCase()).toContain("jake");
		expect(plan?.text).toContain("puts his pen down");
		expect(plan?.text).not.toMatch(/Character: puts his pen down/i);
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
				content: "*leans forward* We need to leave now.",
				speakerType: "player",
				timestamp: "2026-01-01T00:00:00.000Z",
			},
			{ playerName: "Amy Santiago", narrationTts },
		);

		expect(plan?.multiSpeaker).toBe(false);
		expect(plan?.speakers[0]?.voice).toBe(narrationTts.characterVoice);
		expect(plan?.text.toLowerCase()).toContain("leave");
	});

	it("skips continue and director user messages", () => {
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
		).toBe(false);
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
