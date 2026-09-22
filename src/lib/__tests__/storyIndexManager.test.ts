import { describe, expect, it, vi } from "vitest";
import {
  calculatePendingMessages,
  shouldTriggerAutomaticIndexing,
  groupMessagesByChapter,
  updateStoryIndexToCurrent,
  rebuildFullStoryIndex,
  clearStoryIndex,
} from "../storyIndexManager";
import type {
  PlayerCharacter,
  Story,
  StoryChapter,
  StoryIndex,
  StoryMessage,
} from "../../types/models";
import type { StoryEngineRepository } from "../repository";
import type { AIProvider, GenerateResponseResult } from "../ai/types";

function createMockRepository(initialData?: {
  messages?: StoryMessage[];
  chapters?: StoryChapter[];
  storyIndex?: StoryIndex | null;
  story?: Story;
  playerCharacter?: PlayerCharacter;
}): StoryEngineRepository {
  let messages = [...(initialData?.messages ?? [])];
  let chapters = [...(initialData?.chapters ?? [])];
  let storyIndex: StoryIndex | null = initialData?.storyIndex ?? null;
  const story = initialData?.story ?? {
    id: "story-1",
    universeId: "universe-1",
    playerCharacterId: "player-1",
    title: "Test Story",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  const playerCharacter = initialData?.playerCharacter ?? {
    id: "player-1",
    name: "Hero",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  return {
    async getStory(id: string) {
      return id === story.id ? story : null;
    },
    async getPlayerCharacter(id: string) {
      return id === playerCharacter.id ? playerCharacter : null;
    },
    async listStoryMessages(storyId: string) {
      return messages.filter((m) => m.storyId === storyId);
    },
    async listStoryChapters(storyId: string) {
      return chapters.filter((c) => c.storyId === storyId);
    },
    async getStoryIndex(storyId: string) {
      return storyIndex?.storyId === storyId ? storyIndex : null;
    },
    async saveStoryIndex(index: StoryIndex) {
      storyIndex = { ...index };
      return storyIndex;
    },
    async deleteStoryIndex(storyId: string) {
      if (storyIndex?.storyId === storyId) {
        storyIndex = null;
      }
    },
  } as unknown as StoryEngineRepository;
}

function makeMockProvider(responseJson: string, shouldFail = false): AIProvider {
  return {
    async generateResponse(): Promise<GenerateResponseResult> {
      if (shouldFail) {
        throw new Error("Provider generation failure.");
      }
      return {
        content: responseJson,
        finishReason: "stop",
      };
    },
    async generateStream(): Promise<AsyncIterable<string>> {
      async function* gen() {
        if (shouldFail) throw new Error("Stream error");
        yield responseJson;
      }
      return gen();
    },
    async validateConnection() {
      return true;
    },
  };
}

describe("storyIndexManager", () => {
  describe("calculatePendingMessages", () => {
    const messages: StoryMessage[] = [
      { id: "m1", storyId: "s1", role: "user", content: "1", timestamp: "2026-01-01T01:00:00Z" },
      { id: "m2", storyId: "s1", role: "assistant", content: "2", timestamp: "2026-01-01T02:00:00Z" },
      { id: "m3", storyId: "s1", role: "user", content: "3", timestamp: "2026-01-01T03:00:00Z" },
    ];

    it("returns all messages if index is null", () => {
      const pending = calculatePendingMessages(messages, null);
      expect(pending.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    });

    it("returns all messages if lastIndexedMessageId is not set", () => {
      const index: StoryIndex = {
        storyId: "s1",
        chapterSummaries: [],
        characters: [],
        relationships: [],
        indexedMessageCount: 0,
        updatedAt: "2026-01-01T00:00:00Z",
      };
      const pending = calculatePendingMessages(messages, index);
      expect(pending.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    });

    it("returns only messages after lastIndexedMessageId", () => {
      const index: StoryIndex = {
        storyId: "s1",
        lastIndexedMessageId: "m2",
        chapterSummaries: [],
        characters: [],
        relationships: [],
        indexedMessageCount: 2,
        updatedAt: "2026-01-01T00:00:00Z",
      };
      const pending = calculatePendingMessages(messages, index);
      expect(pending.map((m) => m.id)).toEqual(["m3"]);
    });

    it("returns empty array if index is fully caught up", () => {
      const index: StoryIndex = {
        storyId: "s1",
        lastIndexedMessageId: "m3",
        chapterSummaries: [],
        characters: [],
        relationships: [],
        indexedMessageCount: 3,
        updatedAt: "2026-01-01T00:00:00Z",
      };
      const pending = calculatePendingMessages(messages, index);
      expect(pending).toHaveLength(0);
    });

    it("falls back to provenance filter if lastIndexedMessageId is missing from messages", () => {
      const index: StoryIndex = {
        storyId: "s1",
        lastIndexedMessageId: "m-deleted",
        chapterSummaries: [
          {
            chapterId: "c1",
            chapterLabel: "Chapter 1",
            summary: "summary",
            sourceMessageIds: ["m1", "m2"],
            lastIndexedMessageId: "m2",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
        characters: [],
        relationships: [],
        indexedMessageCount: 2,
        updatedAt: "2026-01-01T00:00:00Z",
      };
      const pending = calculatePendingMessages(messages, index);
      expect(pending.map((m) => m.id)).toEqual(["m3"]);
    });
  });

  describe("shouldTriggerAutomaticIndexing", () => {
    it("handles every_message cadence", () => {
      expect(shouldTriggerAutomaticIndexing("every_message", 0)).toBe(false);
      expect(shouldTriggerAutomaticIndexing("every_message", 1)).toBe(true);
      expect(shouldTriggerAutomaticIndexing("every_message", 5)).toBe(true);
    });

    it("handles every_5_messages cadence", () => {
      expect(shouldTriggerAutomaticIndexing("every_5_messages", 4)).toBe(false);
      expect(shouldTriggerAutomaticIndexing("every_5_messages", 5)).toBe(true);
      expect(shouldTriggerAutomaticIndexing("every_5_messages", 6)).toBe(true);
    });

    it("handles every_10_messages cadence", () => {
      expect(shouldTriggerAutomaticIndexing("every_10_messages", 9)).toBe(false);
      expect(shouldTriggerAutomaticIndexing("every_10_messages", 10)).toBe(true);
    });

    it("handles every_15_messages cadence", () => {
      expect(shouldTriggerAutomaticIndexing("every_15_messages", 14)).toBe(false);
      expect(shouldTriggerAutomaticIndexing("every_15_messages", 15)).toBe(true);
    });

    it("handles every_20_messages cadence", () => {
      expect(shouldTriggerAutomaticIndexing("every_20_messages", 19)).toBe(false);
      expect(shouldTriggerAutomaticIndexing("every_20_messages", 20)).toBe(true);
    });

    it("handles every_chapter cadence", () => {
      expect(shouldTriggerAutomaticIndexing("every_chapter", 10, false)).toBe(false);
      expect(shouldTriggerAutomaticIndexing("every_chapter", 10, true)).toBe(true);
      expect(shouldTriggerAutomaticIndexing("every_chapter", 0, true)).toBe(false);
    });
  });

  describe("groupMessagesByChapter", () => {
    it("groups messages by chapter boundary", () => {
      const messages: StoryMessage[] = [
        { id: "m1", storyId: "s1", role: "user", content: "1", timestamp: "1" },
        { id: "m2", storyId: "s1", role: "assistant", content: "2", timestamp: "2" },
        { id: "m3", storyId: "s1", role: "user", content: "3", timestamp: "3" },
      ];
      const chapters: StoryChapter[] = [
        {
          id: "ch-1",
          storyId: "s1",
          label: "Chapter 1",
          endsAtMessageId: "m2",
          endsAtIndex: 2,
          createdAt: "1",
        },
      ];

      const groups = groupMessagesByChapter(messages, chapters);
      expect(groups).toHaveLength(2);
      expect(groups[0].chapterLabel).toBe("Chapter 1");
      expect(groups[0].messages.map((m) => m.id)).toEqual(["m1", "m2"]);
      expect(groups[1].chapterLabel).toBe("Chapter 2");
      expect(groups[1].messages.map((m) => m.id)).toEqual(["m3"]);
    });

    it("does not split chapter start markers into duplicate pseudo-chapters", () => {
      const messages: StoryMessage[] = [
        { id: "m1", storyId: "s1", role: "user", content: "1", timestamp: "1", chapterBoundary: { kind: "start", label: "Chapter I" } },
        { id: "m2", storyId: "s1", role: "assistant", content: "2", timestamp: "2" },
        { id: "m3", storyId: "s1", role: "user", content: "3", timestamp: "3", chapterBoundary: { kind: "start", label: "Chapter II" } },
        { id: "m4", storyId: "s1", role: "assistant", content: "4", timestamp: "4" },
      ];
      const chapters: StoryChapter[] = [
        {
          id: "ch-1",
          storyId: "s1",
          label: "Chapter I",
          endsAtMessageId: "m2",
          endsAtIndex: 2,
          createdAt: "1",
        },
      ];

      const groups = groupMessagesByChapter(messages, chapters);
      expect(groups).toHaveLength(2);
      expect(groups[0].chapterLabel).toBe("Chapter I");
      expect(groups[0].chapterId).toBe("ch-1");
      expect(groups[0].messages.map((m) => m.id)).toEqual(["m1", "m2"]);
      expect(groups[1].chapterLabel).toBe("Chapter II");
      expect(groups[1].messages.map((m) => m.id)).toEqual(["m3", "m4"]);
    });

    it("keeps explicit transcript chapter starts authoritative when persisted chapter metadata is stale", () => {
      const messages: StoryMessage[] = [
        { id: "m1", storyId: "s1", role: "user", content: "Chapter II.", timestamp: "1", chapterBoundary: { kind: "start", label: "Chapter II" } },
        { id: "m2", storyId: "s1", role: "assistant", content: "Chapter two scene.", timestamp: "2" },
        { id: "m3", storyId: "s1", role: "user", content: "End of Chapter II.", timestamp: "3", chapterBoundary: { kind: "end", label: "Chapter II" } },
        { id: "m4", storyId: "s1", role: "user", content: "Chapter III.", timestamp: "4", chapterBoundary: { kind: "start", label: "Chapter III" } },
        { id: "m5", storyId: "s1", role: "assistant", content: "Chapter three scene.", timestamp: "5" },
        { id: "m6", storyId: "s1", role: "user", content: "End of Chapter III.", timestamp: "6", chapterBoundary: { kind: "end", label: "Chapter III" } },
      ];
      const chapters: StoryChapter[] = [
        {
          id: "ch-2",
          storyId: "s1",
          label: "Chapter II",
          // Deliberately stale: persisted metadata incorrectly says Chapter II
          // continues through Chapter III.
          endsAtMessageId: "m6",
          endsAtIndex: 6,
          createdAt: "1",
        },
      ];

      const groups = groupMessagesByChapter(messages, chapters);

      expect(groups).toHaveLength(2);
      expect(groups[0].chapterLabel).toBe("Chapter II");
      expect(groups[0].chapterId).toBe("ch-2");
      expect(groups[0].messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
      expect(groups[1].chapterLabel).toBe("Chapter III");
      expect(groups[1].chapterId).toBeUndefined();
      expect(groups[1].messages.map((m) => m.id)).toEqual(["m4", "m5", "m6"]);
    });

    it("assigns a pending slice to the correct later chapter using the full transcript", () => {
      const allMessages: StoryMessage[] = [
        { id: "m1", storyId: "s1", role: "user", content: "1", timestamp: "1" },
        { id: "m2", storyId: "s1", role: "assistant", content: "2", timestamp: "2" },
        { id: "m3", storyId: "s1", role: "user", content: "3", timestamp: "3" },
        { id: "m4", storyId: "s1", role: "assistant", content: "4", timestamp: "4" },
      ];
      const chapters: StoryChapter[] = [
        {
          id: "ch-1",
          storyId: "s1",
          label: "Chapter 1",
          endsAtMessageId: "m2",
          endsAtIndex: 2,
          createdAt: "1",
        },
      ];

      const groups = groupMessagesByChapter([allMessages[2]!, allMessages[3]!], chapters, allMessages);
      expect(groups).toHaveLength(1);
      expect(groups[0].chapterLabel).toBe("Chapter 2");
      expect(groups[0].messages.map((m) => m.id)).toEqual(["m3", "m4"]);
    });
  });

  describe("updateStoryIndexToCurrent", () => {
    const messages: StoryMessage[] = [
      { id: "m1", storyId: "story-1", role: "user", content: "Go east", timestamp: "1" },
      { id: "m2", storyId: "story-1", role: "assistant", content: "You find a cave", timestamp: "2" },
    ];
    const mockExtraction = JSON.stringify({
      chapterSummary: "Explored the eastern cave.",
      characters: [{ name: "Hero", description: "Protagonist" }],
      relationships: [],
    });

    it("indexes pending messages and updates index record", async () => {
      const repository = createMockRepository({ messages });
      const provider = makeMockProvider(mockExtraction);
      const progressCalls: Array<[number, number]> = [];

      const result = await updateStoryIndexToCurrent({
        storyId: "story-1",
        repository,
        playerCharacter: { id: "player-1", name: "Hero", createdAt: "1", updatedAt: "1" },
        story: { id: "story-1", universeId: "u1", playerCharacterId: "player-1", title: "Story", createdAt: "1", updatedAt: "1" },
        provider,
        model: "gemini-2.5-flash",
        onProgress: (processed, total) => {
          progressCalls.push([processed, total]);
        },
      });

      expect(result.indexedMessageCount).toBe(2);
      expect(result.lastIndexedMessageId).toBe("m2");
      expect(result.chapterSummaries).toHaveLength(1);
      expect(result.chapterSummaries[0].summary).toBe("Explored the eastern cave.");
      expect(progressCalls).toEqual([[1, 1]]);

      const saved = await repository.getStoryIndex("story-1");
      expect(saved?.lastIndexedMessageId).toBe("m2");
    });

    it("reports progress in chapter batches rather than messages", async () => {
      const chapteredMessages: StoryMessage[] = [
        { id: "m1", storyId: "story-1", role: "user", content: "One", timestamp: "1" },
        { id: "m2", storyId: "story-1", role: "assistant", content: "Two", timestamp: "2" },
        { id: "m3", storyId: "story-1", role: "user", content: "Three", timestamp: "3" },
      ];
      const chapters: StoryChapter[] = [
        {
          id: "ch-1",
          storyId: "story-1",
          label: "Chapter 1",
          endsAtMessageId: "m2",
          endsAtIndex: 2,
          createdAt: "1",
        },
      ];
      const repository = createMockRepository({ messages: chapteredMessages, chapters });
      const progressCalls: Array<[number, number]> = [];

      await updateStoryIndexToCurrent({
        storyId: "story-1",
        repository,
        playerCharacter: { id: "player-1", name: "Hero", createdAt: "1", updatedAt: "1" },
        story: { id: "story-1", universeId: "u1", playerCharacterId: "player-1", title: "Story", createdAt: "1", updatedAt: "1" },
        provider: makeMockProvider(mockExtraction),
        model: "gemini-2.5-flash",
        onProgress: (processed, total) => progressCalls.push([processed, total]),
      });

      expect(progressCalls).toEqual([[1, 2], [2, 2]]);
    });

    it("keeps an existing saved index untouched when a later chapter batch fails", async () => {
      const chapteredMessages: StoryMessage[] = [
        { id: "m1", storyId: "story-1", role: "user", content: "Old chapter", timestamp: "1" },
        { id: "m2", storyId: "story-1", role: "assistant", content: "New chapter", timestamp: "2" },
      ];
      const chapters: StoryChapter[] = [
        {
          id: "ch-1",
          storyId: "story-1",
          label: "Chapter 1",
          endsAtMessageId: "m1",
          endsAtIndex: 1,
          createdAt: "1",
        },
      ];
      const initialIndex: StoryIndex = {
        storyId: "story-1",
        lastIndexedMessageId: "m1",
        chapterSummaries: [{
          chapterId: "ch-1",
          chapterLabel: "Chapter 1",
          summary: "Already indexed.",
          sourceMessageIds: ["m1"],
          lastIndexedMessageId: "m1",
          updatedAt: "1",
        }],
        characters: [],
        relationships: [],
        indexedMessageCount: 1,
        updatedAt: "1",
      };
      const repository = createMockRepository({
        messages: chapteredMessages,
        chapters,
        storyIndex: initialIndex,
      });

      await expect(
        updateStoryIndexToCurrent({
          storyId: "story-1",
          repository,
          playerCharacter: { id: "player-1", name: "Hero", createdAt: "1", updatedAt: "1" },
          story: { id: "story-1", universeId: "u1", playerCharacterId: "player-1", title: "Story", createdAt: "1", updatedAt: "1" },
          provider: makeMockProvider("", true),
          model: "gemini-2.5-flash",
        }),
      ).rejects.toThrow();

      const saved = await repository.getStoryIndex("story-1");
      expect(saved?.lastIndexedMessageId).toBe("m1");
      expect(saved?.chapterSummaries).toHaveLength(1);
      expect(saved?.chapterSummaries[0].chapterLabel).toBe("Chapter 1");
    });

    it("does not update lastIndexedMessageId if indexing operation fails", async () => {
      const repository = createMockRepository({ messages });
      const failingProvider = makeMockProvider("", true);

      await expect(
        updateStoryIndexToCurrent({
          storyId: "story-1",
          repository,
          playerCharacter: { id: "player-1", name: "Hero", createdAt: "1", updatedAt: "1" },
          story: { id: "story-1", universeId: "u1", playerCharacterId: "player-1", title: "Story", createdAt: "1", updatedAt: "1" },
          provider: failingProvider,
          model: "gemini-2.5-flash",
        }),
      ).rejects.toThrow();

      // Verified: index was not marked as indexed
      const saved = await repository.getStoryIndex("story-1");
      expect(saved).toBeNull();
    });
  });

  describe("rebuildFullStoryIndex", () => {
    const messages: StoryMessage[] = [
      { id: "m1", storyId: "story-1", role: "user", content: "Hello", timestamp: "1" },
    ];
    const initialIndex: StoryIndex = {
      storyId: "story-1",
      lastIndexedMessageId: "m0",
      chapterSummaries: [
        {
          chapterId: "c0",
          chapterLabel: "Old Chapter",
          summary: "Old summary",
          sourceMessageIds: ["m0"],
          lastIndexedMessageId: "m0",
          updatedAt: "1",
        },
      ],
      characters: [{ id: "c1", canonicalName: "Old", aliases: [], description: "", status: "", developments: [], provenance: [], updatedAt: "1" }],
      relationships: [],
      indexedMessageCount: 1,
      updatedAt: "1",
    };

    it("replaces existing index only on complete success (atomic swap)", async () => {
      const repository = createMockRepository({ messages, storyIndex: initialIndex });
      const newExtraction = JSON.stringify({
        chapterSummary: "New clean summary",
        characters: [{ name: "Hero", description: "A brave warrior" }],
        relationships: [],
      });
      const provider = makeMockProvider(newExtraction);

      const result = await rebuildFullStoryIndex({
        storyId: "story-1",
        repository,
        playerCharacter: { id: "player-1", name: "Hero", createdAt: "1", updatedAt: "1" },
        story: { id: "story-1", universeId: "u1", playerCharacterId: "player-1", title: "Story", createdAt: "1", updatedAt: "1" },
        provider,
        model: "gemini-2.5-flash",
      });

      expect(result.chapterSummaries[0].summary).toBe("New clean summary");
      expect(result.chapterSummaries.some((c) => c.chapterLabel === "Old Chapter")).toBe(false);

      const saved = await repository.getStoryIndex("story-1");
      expect(saved?.chapterSummaries[0].summary).toBe("New clean summary");
    });

    it("preserves previous index if rebuild fails midway", async () => {
      const repository = createMockRepository({ messages, storyIndex: initialIndex });
      const failingProvider = makeMockProvider("", true);

      await expect(
        rebuildFullStoryIndex({
          storyId: "story-1",
          repository,
          playerCharacter: { id: "player-1", name: "Hero", createdAt: "1", updatedAt: "1" },
          story: { id: "story-1", universeId: "u1", playerCharacterId: "player-1", title: "Story", createdAt: "1", updatedAt: "1" },
          provider: failingProvider,
          model: "gemini-2.5-flash",
        }),
      ).rejects.toThrow();

      // Verify initial index is intact and was not cleared or replaced
      const saved = await repository.getStoryIndex("story-1");
      expect(saved?.chapterSummaries[0].summary).toBe("Old summary");
      expect(saved?.characters[0].canonicalName).toBe("Old");
    });
  });

  describe("clearStoryIndex", () => {
    it("deletes the derived index without touching authoritative story messages or characters", async () => {
      const messages: StoryMessage[] = [
        { id: "m1", storyId: "story-1", role: "user", content: "Hello", timestamp: "1" },
      ];
      const initialIndex: StoryIndex = {
        storyId: "story-1",
        chapterSummaries: [],
        characters: [],
        relationships: [],
        indexedMessageCount: 1,
        updatedAt: "1",
      };

      const repository = createMockRepository({ messages, storyIndex: initialIndex });
      await clearStoryIndex({ storyId: "story-1", repository });

      // Index deleted
      expect(await repository.getStoryIndex("story-1")).toBeNull();
      // Story transcript preserved
      expect(await repository.listStoryMessages("story-1")).toHaveLength(1);
      // Player character preserved
      expect(await repository.getPlayerCharacter("player-1")).toBeDefined();
    });
  });
});
