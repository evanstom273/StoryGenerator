import { describe, expect, it } from "vitest";
import { createInheritedStoryIndex } from "../storyInheritance";
import type { StoryIndex } from "../../types/models";

describe("createInheritedStoryIndex", () => {
  it("carries continuity forward without carrying parent indexing progress", () => {
    const parent: StoryIndex = {
      id: "story-index:parent",
      storyId: "parent",
      chapterSummaries: [{
        chapterId: "chapter-1",
        chapterLabel: "Chapter I",
        summary: "The first story happened.",
        sourceMessageIds: ["m1", "m2"],
        lastIndexedMessageId: "m2",
        updatedAt: "2026-09-24T00:00:00Z",
      }],
      characters: [{
        id: "character-1",
        canonicalName: "Lyra",
        aliases: ["Jamie"],
        description: "A teenager.",
        status: "Asleep upstairs.",
        developments: ["Came out to her family."],
        provenance: ["m1"],
        updatedAt: "2026-09-24T00:00:00Z",
      }],
      relationships: [],
      lastIndexedMessageId: "m2",
      indexedMessageCount: 2,
      updatedAt: "2026-09-24T00:00:00Z",
    };

    const child = createInheritedStoryIndex({
      parentIndex: parent,
      parentStoryId: "parent",
      parentStoryTitle: "Story One",
      childStoryId: "child",
      inheritedAt: "2026-09-25T00:00:00Z",
    });

    expect(child.storyId).toBe("child");
    expect(child.lastIndexedMessageId).toBeUndefined();
    expect(child.indexedMessageCount).toBe(0);
    expect(child.inheritedFromStoryId).toBe("parent");
    expect(child.chapterSummaries[0]).toMatchObject({
      chapterLabel: "Chapter I",
      originStoryId: "parent",
      originStoryTitle: "Story One",
    });
    expect(child.characters[0]?.developments).toEqual(["Came out to her family."]);

    child.characters[0]!.developments.push("New sequel development.");
    expect(parent.characters[0]?.developments).toEqual(["Came out to her family."]);
  });

  it("preserves older provenance through sequel chains", () => {
    const parent: StoryIndex = {
      storyId: "story-2",
      chapterSummaries: [{
        chapterId: "chapter-1",
        chapterLabel: "Chapter I",
        originStoryId: "story-1",
        originStoryTitle: "Story One",
        summary: "Inherited history.",
        sourceMessageIds: ["m1"],
        lastIndexedMessageId: "m1",
        updatedAt: "2026-09-24T00:00:00Z",
      }],
      characters: [],
      relationships: [],
      indexedMessageCount: 0,
      updatedAt: "2026-09-24T00:00:00Z",
    };

    const child = createInheritedStoryIndex({
      parentIndex: parent,
      parentStoryId: "story-2",
      parentStoryTitle: "Story Two",
      childStoryId: "story-3",
    });

    expect(child.chapterSummaries[0]?.originStoryId).toBe("story-1");
    expect(child.chapterSummaries[0]?.originStoryTitle).toBe("Story One");
  });
});
