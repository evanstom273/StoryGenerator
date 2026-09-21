import { describe, expect, it } from "vitest";
import { serializeStoryExport } from "../storyExport";
import type { StoryExportBundle } from "../../types/models";

function makeBundle(): StoryExportBundle {
  return {
    exportedAt: "2026-09-20T00:00:00.000Z",
    story: { id: "story-1", title: "Chronicles of Eldoria", universeId: "uni-1", playerCharacterId: "pc-1", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:10:00.000Z", currentSummary: "" },
    universe: { id: "uni-1", name: "Eldoria Realm", description: "A high fantasy magical realm.", wikiUrl: "https://example.com/eldoria", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" },
    playerCharacter: { id: "pc-1", name: "Aria Shadowalker", age: "24", gender: "Female", species: "Elf", pronouns: "she/her", appearance: "Tall with silver hair", personality: "Cautious and observant", background: "Exiled rogue", goals: "Find the Sunstone", aliases: ["The Shadow"], knownTies: ["Guild of Rogues"], notes: "Keeps a hidden dagger", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" },
    messages: [{ id: "msg-1", storyId: "story-1", role: "assistant", content: "The mist parted before the castle gates.", timestamp: "2026-09-20T00:01:00.000Z" }],
    storyIndex: {
      storyId: "story-1", indexedMessageCount: 1, updatedAt: "2026-09-20T00:05:00.000Z",
      chapterSummaries: [{ chapterId: "ch-1", chapterLabel: "Chapter 1: The Gates", summary: "INDEX ONLY SUMMARY", sourceMessageIds: ["msg-1"], lastIndexedMessageId: "msg-1", updatedAt: "2026-09-20T00:05:00.000Z" }],
      characters: [{ id: "char-1", canonicalName: "INDEX ONLY CHARACTER", aliases: [], description: "INDEX ONLY DESCRIPTION", status: "active", developments: [], provenance: ["msg-1"], updatedAt: "2026-09-20T00:05:00.000Z" }],
      relationships: [],
    },
  };
}

describe("storyExport", () => {
  it("omits derived Story Index data from markdown and text exports", () => {
    for (const format of ["markdown", "txt"] as const) {
      const content = String(serializeStoryExport(makeBundle(), format).content);
      expect(content).toContain("Chronicles of Eldoria");
      expect(content).toContain("Transcript");
      expect(content).toContain("The mist parted before the castle gates.");
      expect(content).not.toContain("Story Index");
      expect(content).not.toContain("INDEX ONLY SUMMARY");
      expect(content).not.toContain("INDEX ONLY CHARACTER");
    }
  });

  it("omits storyIndex from JSON story exports", () => {
    const content = String(serializeStoryExport(makeBundle(), "json").content);
    const parsed = JSON.parse(content);
    expect(parsed.storyIndex).toBeUndefined();
    expect(content).not.toContain("INDEX ONLY SUMMARY");
  });
});
