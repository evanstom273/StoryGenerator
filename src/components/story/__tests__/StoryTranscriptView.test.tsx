import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StoryMessage } from "../../../types/models";

vi.mock("../StorySpeechControls", () => ({
	FullStoryAudiobookControls: () => null,
	ChapterListenBanner: () => null,
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
});
