import { describe, expect, it } from "vitest";
import { createInheritedStoryIndex } from "../storyInheritance";
import { applyExtractionToIndex } from "../ai/storyIndexingPipeline";
import type { PlayerCharacter, StoryIndex } from "../../types/models";

const parentIndex: StoryIndex = {
  id: "story-index:parent",
  storyId: "parent",
  chapterSummaries: [
    {
      chapterId: "parent-chapter-1",
      chapterLabel: "Chapter I",
      summary: "Parent chapter summary.",
      sourceMessageIds: ["parent-message-1"],
      lastIndexedMessageId: "parent-message-1",
      updatedAt: "2026-09-24T00:00:00.000Z",
    },
  ],
  characters: [
    {
      id: "pc",
      canonicalName: "Lyra",
      aliases: ["Jamie"],
      pronouns: "she/her",
      description: "The protagonist.",
      status: "Asleep upstairs.",
      developments: ["Came out to her family."],
      provenance: ["parent-message-1"],
      updatedAt: "2026-09-24T00:00:00.000Z",
    },
  ],
  relationships: [],
  lastIndexedMessageId: "parent-message-1",
  lastIndexedAt: "2026-09-24T00:00:00.000Z",
  indexedMessageCount: 253,
  updatedAt: "2026-09-24T00:00:00.000Z",
};

const playerCharacter: PlayerCharacter = {
  id: "pc",
  name: "Jamie",
  aliases: [],
  knownTies: [],
  age: "15",
  gender: "Male",
  species: "Human",
  pronouns: "he/him",
  appearance: "",
  personality: "",
  background: "",
  goals: "",
  notes: "",
  universeId: "universe",
  createdAt: "2026-09-24T00:00:00.000Z",
};

describe("inherited story indexes", () => {
  it("copies continuity while resetting sequel indexing progress", () => {
    const inherited = createInheritedStoryIndex({
      parentIndex,
      parentStoryId: "parent",
      parentStoryTitle: "The Son of Diaz",
      childStoryId: "sequel",
      inheritedAt: "2026-09-24T01:00:00.000Z",
    });

    expect(inherited.storyId).toBe("sequel");
    expect(inherited.inheritedFromStoryId).toBe("parent");
    expect(inherited.indexedMessageCount).toBe(0);
    expect(inherited.lastIndexedMessageId).toBeUndefined();
    expect(inherited.chapterSummaries[0]).toMatchObject({
      chapterLabel: "Chapter I",
      originStoryId: "parent",
      originStoryTitle: "The Son of Diaz",
    });
    expect(inherited.characters[0]?.canonicalName).toBe("Lyra");
    expect(inherited.characters[0]?.status).toBe("Asleep upstairs.");
  });

  it("keeps inherited Chapter I separate from the sequel's Chapter I", () => {
    const inherited = createInheritedStoryIndex({
      parentIndex,
      parentStoryId: "parent",
      parentStoryTitle: "The Son of Diaz",
      childStoryId: "sequel",
    });

    const updated = applyExtractionToIndex({
      extraction: {
        chapterSummary: "The sequel begins after a time skip.",
        characters: [],
        relationships: [],
      },
      existingIndex: inherited,
      storyId: "sequel",
      chapterLabel: "Chapter I",
      chapterId: "sequel-chapter-1",
      messageIds: ["sequel-message-1"],
      playerCharacter,
    });

    expect(updated.chapterSummaries).toHaveLength(2);
    expect(updated.chapterSummaries[0]?.summary).toBe("Parent chapter summary.");
    expect(updated.chapterSummaries[0]?.originStoryId).toBe("parent");
    expect(updated.chapterSummaries[1]).toMatchObject({
      chapterId: "sequel-chapter-1",
      chapterLabel: "Chapter I",
      summary: "The sequel begins after a time skip.",
    });
    expect(updated.chapterSummaries[1]?.originStoryId).toBeUndefined();
  });

  it("preserves older provenance when a sequel itself becomes a parent", () => {
    const firstSequel = createInheritedStoryIndex({
      parentIndex,
      parentStoryId: "story-1",
      parentStoryTitle: "Story One",
      childStoryId: "story-2",
    });

    firstSequel.chapterSummaries.push({
      chapterId: "story-2-chapter-1",
      chapterLabel: "Chapter I",
      summary: "Story two begins.",
      sourceMessageIds: ["story-2-message-1"],
      lastIndexedMessageId: "story-2-message-1",
      updatedAt: "2026-09-24T02:00:00.000Z",
    });

    const secondSequel = createInheritedStoryIndex({
      parentIndex: firstSequel,
      parentStoryId: "story-2",
      parentStoryTitle: "Story Two",
      childStoryId: "story-3",
    });

    expect(secondSequel.chapterSummaries[0]?.originStoryId).toBe("story-1");
    expect(secondSequel.chapterSummaries[0]?.originStoryTitle).toBe("Story One");
    expect(secondSequel.chapterSummaries[1]?.originStoryId).toBe("story-2");
    expect(secondSequel.chapterSummaries[1]?.originStoryTitle).toBe("Story Two");
  });
});
