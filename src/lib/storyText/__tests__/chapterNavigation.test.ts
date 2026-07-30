import { describe, expect, it } from "vitest";
import type { StoryChapter, StoryMessage } from "../../../types/models";
import {
  countGeneratedChapters,
  getLatestChapterStartMessage,
  resolveChapterHeaderElement,
} from "../chapterNavigation";

function makeMessage(
  id: string,
  index: number,
  chapterBoundary?: StoryMessage["chapterBoundary"],
  content?: string,
): StoryMessage {
  return {
    id,
    storyId: "story-1",
    role: "user",
    speakerType: "player",
    speakerName: "Hero",
    content: content ?? `Message ${index}`,
    timestamp: new Date(2026, 0, index + 1).toISOString(),
    chapterBoundary,
  };
}

function makeChapter(label: string, endsAtMessageId: string, endsAtIndex: number): StoryChapter {
  return {
    id: `chapter-${label}`,
    storyId: "story-1",
    label,
    endsAtMessageId,
    endsAtIndex,
    createdAt: new Date().toISOString(),
  };
}

describe("chapterNavigation", () => {
  it("counts an open chapter after the last closed chapter record", () => {
    const messages = [
      makeMessage("m1", 0),
      makeMessage("m2", 1),
      makeMessage("m3", 2, { kind: "start", label: "Chapter Two" }),
      makeMessage("m4", 3),
    ];
    const chapters = [makeChapter("Chapter One", "m2", 2)];

    expect(countGeneratedChapters(messages, chapters)).toBe(2);
    expect(getLatestChapterStartMessage(messages, chapters)?.id).toBe("m3");
  });

  it("targets the latest closed chapter when every chapter has ended", () => {
    const messages = [
      makeMessage("m1", 0),
      makeMessage("m2", 1),
      makeMessage("m3", 2, { kind: "start", label: "Chapter Two" }),
      makeMessage("m4", 3),
      makeMessage("m5", 4, { kind: "start", label: "Chapter Three" }),
      makeMessage("m6", 5, { kind: "end", label: "Chapter Three" }),
    ];
    const chapters = [
      makeChapter("Chapter One", "m2", 2),
      makeChapter("Chapter Two", "m4", 4),
      makeChapter("Chapter Three", "m6", 6),
    ];

    expect(countGeneratedChapters(messages, chapters)).toBe(3);
    expect(getLatestChapterStartMessage(messages, chapters)?.id).toBe("m5");
  });

  it("detects chapter markers from message content when chapterBoundary is unset", () => {
    const messages = [
      makeMessage("m1", 0),
      makeMessage("m2", 1),
      makeMessage("m3", 2, undefined, "Chapter Two start"),
      makeMessage("m4", 3),
      makeMessage("m5", 4, undefined, "Chapter Three start"),
      makeMessage("m6", 5),
    ];

    expect(countGeneratedChapters(messages, [])).toBe(3);
    expect(getLatestChapterStartMessage(messages, [])?.id).toBe("m5");
  });

  it("counts many chapters from transcript markers alone", () => {
    const messages = [
      makeMessage("m1", 0),
      makeMessage("m2", 1, undefined, "Chapter Two start"),
      makeMessage("m3", 2),
      makeMessage("m4", 3, undefined, "Chapter Three start"),
      makeMessage("m5", 4),
      makeMessage("m6", 5, undefined, "Chapter Four start"),
      makeMessage("m7", 6),
      makeMessage("m8", 7, undefined, "Chapter Five start"),
      makeMessage("m9", 8),
      makeMessage("m10", 9, undefined, "Chapter Six start"),
      makeMessage("m11", 10),
    ];

    expect(countGeneratedChapters(messages, [])).toBe(6);
    expect(getLatestChapterStartMessage(messages, [])?.id).toBe("m10");
  });

  it("finds chapter start via endsAtMessageId when endsAtIndex does not match array position", () => {
    const messages = [
      makeMessage("m1", 0),
      makeMessage("m2", 1),
      makeMessage("m3", 2, undefined, "Chapter Two start"),
      makeMessage("m4", 3),
    ];
    const chapters = [
      makeChapter("Chapter One", "m2", 99),
    ];

    expect(getLatestChapterStartMessage(messages, chapters)?.id).toBe("m3");
  });

  it("finds open chapter via endsAtIndex when endsAtMessageId is missing", () => {
    const messages = [
      makeMessage("m1", 0),
      makeMessage("m2", 1),
      makeMessage("m3", 2),
      makeMessage("m4", 3),
      makeMessage("m5", 4),
      makeMessage("m6", 5),
      makeMessage("m7", 6),
      makeMessage("m8", 7),
      makeMessage("m9", 8),
      makeMessage("m10", 9),
      makeMessage("m11", 10),
    ];
    const chapters = [
      makeChapter("Chapter One", "missing-1", 2),
      makeChapter("Chapter Two", "missing-2", 4),
      makeChapter("Chapter Three", "missing-3", 6),
      makeChapter("Chapter Four", "missing-4", 8),
      makeChapter("Chapter Five", "missing-5", 10),
    ];

    expect(countGeneratedChapters(messages, chapters)).toBe(6);
    expect(getLatestChapterStartMessage(messages, chapters)?.id).toBe("m11");
  });

  it("prefers inferred latest chapter over an older explicit start marker", () => {
    const messages = [
      makeMessage("m1", 0),
      makeMessage("m2", 1),
      makeMessage("m3", 2, { kind: "start", label: "Chapter Two" }),
      makeMessage("m4", 3),
      makeMessage("m5", 4),
      makeMessage("m6", 5),
    ];
    const chapters = [
      makeChapter("Chapter One", "m2", 2),
      makeChapter("Chapter Two", "m4", 4),
    ];

    expect(getLatestChapterStartMessage(messages, chapters)?.id).toBe("m5");
  });
});
