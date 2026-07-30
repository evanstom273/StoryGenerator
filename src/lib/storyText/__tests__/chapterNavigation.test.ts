import { describe, expect, it } from "vitest";
import type { StoryChapter, StoryMessage } from "../../../types/models";
import {
  countGeneratedChapters,
  getLatestChapterStartMessage,
} from "../chapterNavigation";

function makeMessage(id: string, index: number, chapterBoundary?: StoryMessage["chapterBoundary"]): StoryMessage {
  return {
    id,
    storyId: "story-1",
    role: "user",
    speakerType: "player",
    speakerName: "Hero",
    content: `Message ${index}`,
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
});
