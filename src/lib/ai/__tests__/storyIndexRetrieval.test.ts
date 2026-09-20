import { describe, expect, it } from "vitest";
import {
  extractActiveCharacterIds,
  selectRelevantChapterSummaries,
  buildDirectorIndexedMemory,
} from "../storyIndexRetrieval";
import type {
  PlayerCharacter,
  StoryIndex,
  StoryIndexChapterSummary,
  StoryIndexCharacter,
  StoryMessage,
} from "../../../types/models";

describe("storyIndexRetrieval", () => {
  const playerCharacter: PlayerCharacter = {
    id: "pc-1",
    name: "Geralt of Rivia",
    aliases: ["White Wolf", "Butcher of Blaviken"],
    createdAt: "1",
    updatedAt: "1",
  };

  const characters: StoryIndexCharacter[] = [
    {
      id: "char-1",
      canonicalName: "Geralt of Rivia",
      aliases: ["White Wolf"],
      description: "A seasoned Witcher.",
      status: "healthy",
      developments: [],
      provenance: [],
      updatedAt: "1",
    },
    {
      id: "char-2",
      canonicalName: "Yennefer of Vengerberg",
      aliases: ["Yen"],
      description: "Powerful sorceress.",
      status: "investigating anomaly",
      developments: ["Opened a portal to Oxenfurt."],
      provenance: [],
      updatedAt: "1",
    },
    {
      id: "char-3",
      canonicalName: "Jaskier",
      aliases: ["Dandelion"],
      description: "Famed bard.",
      status: "at the tavern",
      developments: [],
      provenance: [],
      updatedAt: "1",
    },
  ];

  describe("extractActiveCharacterIds", () => {
    it("always includes the player character", () => {
      const recentMessages: StoryMessage[] = [
        { id: "m1", storyId: "s1", role: "assistant", content: "A quiet wind blows.", timestamp: "1" },
      ];
      const activeIds = extractActiveCharacterIds(recentMessages, characters, playerCharacter);
      expect(activeIds.has("char-1")).toBe(true);
    });

    it("identifies characters mentioned by canonical name", () => {
      const recentMessages: StoryMessage[] = [
        { id: "m1", storyId: "s1", role: "assistant", content: "Yennefer turned around with purple eyes blazing.", timestamp: "1" },
      ];
      const activeIds = extractActiveCharacterIds(recentMessages, characters, playerCharacter);
      expect(activeIds.has("char-2")).toBe(true);
      expect(activeIds.has("char-3")).toBe(false);
    });

    it("identifies characters mentioned by alias", () => {
      const recentMessages: StoryMessage[] = [
        { id: "m1", storyId: "s1", role: "assistant", content: 'Dandelion strummed his lute: "Listen to this tale!"', timestamp: "1" },
      ];
      const activeIds = extractActiveCharacterIds(recentMessages, characters, playerCharacter);
      expect(activeIds.has("char-3")).toBe(true);
    });
  });

  describe("selectRelevantChapterSummaries", () => {
    const makeSummary = (id: string, label: string, text: string): StoryIndexChapterSummary => ({
      chapterId: id,
      chapterLabel: label,
      summary: text,
      sourceMessageIds: [],
      lastIndexedMessageId: "",
      updatedAt: "1",
    });

    it("returns all chapters if total chapters <= maxCount", () => {
      const summaries = [
        makeSummary("c1", "Chapter 1", "Beginning"),
        makeSummary("c2", "Chapter 2", "Middle"),
      ];
      const selected = selectRelevantChapterSummaries(summaries, characters, 4);
      expect(selected).toHaveLength(2);
    });

    it("prioritizes recent continuity and character-relevant older chapters for long stories", () => {
      const summaries = [
        makeSummary("c1", "Chapter 1", "Geralt met Yennefer in the forest."),
        makeSummary("c2", "Chapter 2", "A boring trek through the swamp with mud."),
        makeSummary("c3", "Chapter 3", "Another quiet road through the mountains."),
        makeSummary("c4", "Chapter 4", "Encounter at the ruined fortress."),
        makeSummary("c5", "Chapter 5", "Current battle in the courtyard."),
      ];

      // Active character is Yennefer (char-2)
      const activeChars = [characters[1]];
      const selected = selectRelevantChapterSummaries(summaries, activeChars, 3);

      // Must include latest 2 chapters (c4, c5)
      expect(selected.some((s) => s.chapterId === "c4")).toBe(true);
      expect(selected.some((s) => s.chapterId === "c5")).toBe(true);
      // Older chapter mentioning Yennefer (c1) should be prioritized over c2 and c3
      expect(selected.some((s) => s.chapterId === "c1")).toBe(true);
      expect(selected.some((s) => s.chapterId === "c2")).toBe(false);
    });
  });

  describe("buildDirectorIndexedMemory", () => {
    it("returns null when index is null or empty", () => {
      expect(buildDirectorIndexedMemory({ index: null, recentMessages: [], playerCharacter })).toBeNull();

      const emptyIndex: StoryIndex = {
        storyId: "s1",
        chapterSummaries: [],
        characters: [],
        relationships: [],
        indexedMessageCount: 0,
        updatedAt: "1",
      };
      expect(buildDirectorIndexedMemory({ index: emptyIndex, recentMessages: [], playerCharacter })).toBeNull();
    });

    it("formats indexed memory with characters, relationships, and chapter summaries", () => {
      const index: StoryIndex = {
        storyId: "s1",
        chapterSummaries: [
          {
            chapterId: "ch-1",
            chapterLabel: "Chapter 1: The Trail",
            summary: "Geralt accepted a bounty on a cockatrice.",
            sourceMessageIds: ["m1"],
            lastIndexedMessageId: "m1",
            updatedAt: "1",
          },
        ],
        characters: [
          {
            id: "char-1",
            canonicalName: "Geralt of Rivia",
            aliases: ["White Wolf"],
            description: "Monster slayer.",
            status: "ready for battle",
            developments: ["Accepted the bounty."],
            provenance: ["m1"],
            updatedAt: "1",
          },
          {
            id: "char-2",
            canonicalName: "Yennefer",
            aliases: [],
            description: "Mage.",
            status: "away",
            developments: [],
            provenance: ["m1"],
            updatedAt: "1",
          },
        ],
        relationships: [
          {
            id: "rel-1",
            characterIdA: "char-1",
            characterIdB: "char-2",
            nature: "Complicated romantic bond",
            state: "Separated by distance",
            developments: ["Exchanged raven letters."],
            provenance: ["m1"],
            updatedAt: "1",
          },
        ],
        indexedMessageCount: 1,
        updatedAt: "1",
      };

      const result = buildDirectorIndexedMemory({
        index,
        recentMessages: [{ id: "m1", storyId: "s1", role: "assistant", content: "Yennefer sent word.", timestamp: "1" }],
        playerCharacter,
      });

      expect(result).not.toBeNull();
      expect(result).toContain("Detailed Chapter Summaries");
      expect(result).toContain("Canonical Characters & Current Status");
      expect(result).toContain("Geralt of Rivia");
      expect(result).toContain("Yennefer");
      expect(result).toContain("Character Relationships");
      expect(result).toContain("Complicated romantic bond");
      expect(result).toContain("Chapter 1: The Trail");
      expect(result).toContain("Geralt accepted a bounty on a cockatrice.");
    });
  });
});
