import { describe, expect, it } from "vitest";
import type { StoryMessage } from "../../types/models";
import { buildEncyclopediaEntityIndex } from "../encyclopedia/encyclopediaExtractor";
import {
	formatSingleMessageForEncyclopedia,
	shouldIndexMessageForEncyclopedia,
} from "../encyclopedia/encyclopediaTranscript";

function makeMessage(
	overrides: Partial<StoryMessage> & Pick<StoryMessage, "role" | "content">,
): StoryMessage {
	return {
		id: "msg-1",
		storyId: "story-1",
		timestamp: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("encyclopediaTranscript", () => {
	it("skips continue, director, author, system, and empty messages", () => {
		expect(
			shouldIndexMessageForEncyclopedia(
				makeMessage({ role: "user", content: "continue", speakerType: "continue" }),
			),
		).toBe(false);
		expect(
			shouldIndexMessageForEncyclopedia(
				makeMessage({ role: "user", content: "Focus on Jamie.", speakerType: "director" }),
			),
		).toBe(false);
		expect(
			shouldIndexMessageForEncyclopedia(
				makeMessage({
					role: "user",
					content: "Jamie is secretly a hero.",
					speakerType: "author",
					authorDirective: { kind: "secret" },
				}),
			),
		).toBe(false);
		expect(shouldIndexMessageForEncyclopedia(makeMessage({ role: "system", content: "init" }))).toBe(false);
		expect(shouldIndexMessageForEncyclopedia(makeMessage({ role: "assistant", content: "   " }))).toBe(false);
	});

	it("indexes player and story messages", () => {
		expect(
			shouldIndexMessageForEncyclopedia(makeMessage({ role: "user", content: "I walk into the hospital." })),
		).toBe(true);
		expect(
			shouldIndexMessageForEncyclopedia(
				makeMessage({
					role: "assistant",
					content: "Jamie waits by the window.",
					speakerType: "canon",
					speakerName: "Jamie Mercer",
				}),
			),
		).toBe(true);
	});

	it("formats a single message with clear boundaries", () => {
		const formatted = formatSingleMessageForEncyclopedia(
			makeMessage({
				role: "assistant",
				content: "The rain fell hard.",
				speakerType: "narrator",
			}),
			"Alex",
			12,
			100,
			"Chapter III",
		);
		expect(formatted).toContain("--- Message 12 of 100 ---");
		expect(formatted).toContain("Speaker: Narrator");
		expect(formatted).toContain("Chapter: Chapter III");
		expect(formatted).toContain("MESSAGE TEXT:");
		expect(formatted).toContain("The rain fell hard.");
		expect(formatted).toContain("--- End Message 12 ---");
	});
});

describe("buildEncyclopediaEntityIndex", () => {
	it("returns names only without full entry bodies", () => {
		const index = buildEncyclopediaEntityIndex({
			version: "1.0",
			characters: {
				jamie: { id: "jamie", name: "Jamie Mercer", description: "Should not appear in index" },
			},
			events: [{ id: "e1", title: "Hospital arrival" }],
		});
		expect(index).toContain("Jamie Mercer");
		expect(index).not.toContain("Should not appear in index");
		expect(index).toContain("Hospital arrival");
	});
});
