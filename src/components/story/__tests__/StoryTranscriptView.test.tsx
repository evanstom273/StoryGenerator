import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StoryChapter, StoryMessage } from "../../../types/models";

vi.mock("../StorySpeechControls", () => ({
	FullStoryAudiobookControls: () => null,
	ChapterListenBanner: ({ label }: { label: string }) => <div data-chapter-banner>{label}</div>,
}));

import { StoryTranscriptView } from "../StoryTranscriptView";

describe("StoryTranscriptView narrator presentation", () => {
	it("shows narrator prose without its structural label or changing canonical content", () => {
		const canonical = "Narrator: *The room falls silent.*";
		const message: StoryMessage = {
			id: "narrator-message",
			storyId: "story-1",
			role: "assistant",
			content: canonical,
			timestamp: "2026-08-01T12:01:00.000Z",
			speakerType: "narrator",
		};

		const html = renderToStaticMarkup(
			<StoryTranscriptView messages={[message]} playerCharacterName="Jamie" />,
		);

		expect(html).toContain("The room falls silent.");
		expect(html).not.toContain("Narrator:");
		expect(html).toContain("text-ink-muted italic");
		expect(message.content).toBe(canonical);
	});

	it("keeps named character speakers visible", () => {
		const message: StoryMessage = {
			id: "character-message",
			storyId: "story-1",
			role: "assistant",
			content: 'Rosa: *She stands.* "Jamie?"',
			timestamp: "2026-08-01T12:02:00.000Z",
			speakerType: "narrator",
		};

		const html = renderToStaticMarkup(
			<StoryTranscriptView messages={[message]} playerCharacterName="Jamie" />,
		);

		expect(html).toContain("Rosa:");
		expect(html).toContain("She stands.");
		expect(html).toContain("&quot;Jamie?&quot;");
	});

	it("does not infer a later chapter from ordinary turns after an explicit Chapter IV marker", () => {
		const messages: StoryMessage[] = [
			{
				id: "chapter-iv",
				storyId: "story-1",
				role: "user",
				content: "Chapter IV.",
				timestamp: "2026-08-01T12:00:00.000Z",
			},
			{
				id: "ordinary-user-turn",
				storyId: "story-1",
				role: "user",
				speakerName: "Jamie",
				content: "The room is quiet.",
				timestamp: "2026-08-01T12:01:00.000Z",
			},
			{
				id: "ordinary-assistant-turn",
				storyId: "story-1",
				role: "assistant",
				content: "No one moves.",
				timestamp: "2026-08-01T12:02:00.000Z",
			},
		];
		const chapter: StoryChapter = {
			id: "chapter-iv-record",
			storyId: "story-1",
			label: "Chapter IV",
			endsAtMessageId: "stale-end-message-id",
			endsAtIndex: 2,
			createdAt: "2026-08-01T12:00:00.000Z",
		};

		const html = renderToStaticMarkup(
			<StoryTranscriptView messages={messages} playerCharacterName="Jamie" chapters={[chapter]} />,
		);

		expect(html).toContain("Chapter IV");
		expect(html).not.toContain("Chapter V");
		expect(html).toContain("The room is quiet.");
		expect(html).toContain("No one moves.");
		expect((html.match(/data-chapter-banner/g) ?? []).length).toBe(1);
		expect(messages[0]?.content).toBe("Chapter IV.");
	});

	it("shows an explicit later Chapter V marker as a new chapter banner", () => {
		const messages: StoryMessage[] = [
			{
				id: "chapter-iv",
				storyId: "story-1",
				role: "user",
				content: "Chapter IV.",
				timestamp: "2026-08-01T12:00:00.000Z",
			},
			{
				id: "ordinary-user-turn",
				storyId: "story-1",
				role: "user",
				speakerName: "Jamie",
				content: "The room is quiet.",
				timestamp: "2026-08-01T12:01:00.000Z",
			},
			{
				id: "ordinary-assistant-turn",
				storyId: "story-1",
				role: "assistant",
				content: "No one moves.",
				timestamp: "2026-08-01T12:02:00.000Z",
			},
			{
				id: "chapter-v",
				storyId: "story-1",
				role: "user",
				content: "Chapter V.",
				timestamp: "2026-08-01T12:03:00.000Z",
			},
		];
		const chapter: StoryChapter = {
			id: "chapter-iv-record",
			storyId: "story-1",
			label: "Chapter IV",
			endsAtMessageId: "stale-end-message-id",
			endsAtIndex: 2,
			createdAt: "2026-08-01T12:00:00.000Z",
		};

		const html = renderToStaticMarkup(
			<StoryTranscriptView messages={messages} playerCharacterName="Jamie" chapters={[chapter]} />,
		);

		expect(html).toContain("Chapter V");
		expect((html.match(/data-chapter-banner/g) ?? []).length).toBe(2);
	});
});
