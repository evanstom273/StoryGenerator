import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Story, StoryIndex, StoryMessage } from "../../../types/models";

let mockContextValue: any = {};

vi.mock("../../../app/providers/StoryEngineProvider", () => ({
  useStoryEngine: () => mockContextValue,
}));

import { StoryIndexSection } from "../StoryIndexSection";

describe("StoryIndexSection", () => {
  it("renders cadence selector and live pending counter", () => {
    const story: Story = {
      id: "story-1",
      title: "Test Story",
      universeId: "uni-1",
      playerCharacterId: "pc-1",
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
      currentSummary: "",
      indexingCadence: "every_10_messages",
    };

    const messages: StoryMessage[] = [
      {
        id: "msg-1",
        storyId: "story-1",
        role: "user",
        content: "Hello",
        timestamp: "2026-09-20T00:01:00.000Z",
      },
      {
        id: "msg-2",
        storyId: "story-1",
        role: "assistant",
        content: "Hi there",
        timestamp: "2026-09-20T00:02:00.000Z",
      },
    ];

    const storyIndex: StoryIndex = {
      storyId: "story-1",
      indexedMessageCount: 0,
      characters: [],
      relationships: [],
      chapterSummaries: [],
      updatedAt: "2026-09-20T00:00:00.000Z",
    };

    mockContextValue = {
      storyIndexes: [storyIndex],
      stories: [story],
      updateStory: vi.fn(),
      aiSettings: { indexingCadence: "every_5_messages" },
      getStoryIndex: vi.fn().mockResolvedValue(storyIndex),
      messages,
      updateStoryIndex: vi.fn(),
      fullReindexStory: vi.fn(),
      clearStoryIndex: vi.fn(),
      rebuildStatus: undefined,
      backgroundJobs: [],
    };

    const html = renderToStaticMarkup(<StoryIndexSection storyId="story-1" />);

    // Cadence dropdown is present and has every_10_messages selected
    expect(html).toContain("Automatic Indexing Cadence");
    expect(html).toContain("Every 10 messages");
    expect(html).toContain('value="every_10_messages"');

    // Live counter shows 2 pending unindexed
    expect(html).toContain("2 pending unindexed");
    // Cadence progress indicator indicates 2 / 10
    expect(html).toContain("2 / 10 unindexed (8 more until auto-index)");
  });

  it("renders live progress indicator during active indexing", () => {
    const story: Story = {
      id: "story-1",
      title: "Test Story",
      universeId: "uni-1",
      playerCharacterId: "pc-1",
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
      currentSummary: "",
      indexingCadence: "every_5_messages",
    };

    mockContextValue = {
      storyIndexes: [],
      stories: [story],
      updateStory: vi.fn(),
      aiSettings: null,
      getStoryIndex: vi.fn().mockResolvedValue(null),
      messages: [],
      updateStoryIndex: vi.fn(),
      fullReindexStory: vi.fn(),
      clearStoryIndex: vi.fn(),
      rebuildStatus: {
        storyId: "story-1",
        phase: "extracting",
        processedMessages: 3,
        totalMessages: 5,
        message: "Indexed 3 of 5 messages...",
      },
      backgroundJobs: [],
    };

    const html = renderToStaticMarkup(<StoryIndexSection storyId="story-1" />);

    // Active indexing badge with live counter
    expect(html).toContain("Indexing (3/5)");
    // Progress message
    expect(html).toContain("Indexed 3 of 5 messages...");
    // Progress percentage
    expect(html).toContain("60%");
  });

  it("renders up to date and populated tabs when indexed", () => {
    const story: Story = {
      id: "story-1",
      title: "Test Story",
      universeId: "uni-1",
      playerCharacterId: "pc-1",
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
      currentSummary: "",
      indexingCadence: "every_5_messages",
    };

    const storyIndex: StoryIndex = {
      storyId: "story-1",
      lastIndexedMessageId: "msg-1",
      indexedMessageCount: 1,
      characters: [
        {
          id: "char-1",
          canonicalName: "Elena",
          aliases: ["El"],
          description: "A brave explorer",
          status: "Active",
          developments: ["Found the artifact"],
          provenance: ["msg-1"],
          updatedAt: "2026-09-20T00:05:00.000Z",
        },
      ],
      relationships: [
        {
          id: "rel-1",
          characterIdA: "char-1",
          characterIdB: "char-2",
          nature: "allies",
          state: "close",
          developments: [],
          provenance: ["msg-1"],
          updatedAt: "2026-09-20T00:05:00.000Z",
        },
      ],
      chapterSummaries: [
        {
          chapterId: "ch-1",
          chapterLabel: "Chapter 1",
          summary: "Elena set off on the journey.",
          sourceMessageIds: ["msg-1"],
          lastIndexedMessageId: "msg-1",
          updatedAt: "2026-09-20T00:05:00.000Z",
        },
      ],
      updatedAt: "2026-09-20T00:05:00.000Z",
    };

    mockContextValue = {
      storyIndexes: [storyIndex],
      stories: [story],
      updateStory: vi.fn(),
      aiSettings: null,
      getStoryIndex: vi.fn().mockResolvedValue(storyIndex),
      messages: [
        {
          id: "msg-1",
          storyId: "story-1",
          role: "assistant",
          content: "Elena stepped outside.",
          timestamp: "2026-09-20T00:01:00.000Z",
        },
      ],
      updateStoryIndex: vi.fn(),
      fullReindexStory: vi.fn(),
      clearStoryIndex: vi.fn(),
      rebuildStatus: undefined,
      backgroundJobs: [],
    };

    const html = renderToStaticMarkup(<StoryIndexSection storyId="story-1" />);

    expect(html).toContain("Up to date");
    expect(html).toContain("Characters (1)");
    expect(html).toContain("Relationships (1)");
    expect(html).toContain("Chapter Summaries (1)");
    expect(html).toContain("Elena");
    // Individual Story State records are collapsed by default so long indexes
    // remain easy to scan. Details render only after expanding a record.
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("A brave explorer");
    expect(html).not.toContain("Elena set off on the journey.");
  });
});
