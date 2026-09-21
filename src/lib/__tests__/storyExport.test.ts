import { describe, expect, it } from "vitest";
import { serializeStoryExport } from "../storyExport";
import type { StoryExportBundle } from "../../types/models";

describe("storyExport markdown", () => {
  it("includes story index with chapter summaries, characters, and relationships in markdown export", () => {
    const bundle: StoryExportBundle = {
      exportedAt: "2026-09-20T00:00:00.000Z",
      story: {
        id: "story-1",
        title: "Chronicles of Eldoria",
        universeId: "uni-1",
        playerCharacterId: "pc-1",
        createdAt: "2026-09-20T00:00:00.000Z",
        updatedAt: "2026-09-20T00:10:00.000Z",
        currentSummary: "",
      },
      universe: {
        id: "uni-1",
        name: "Eldoria Realm",
        description: "A high fantasy magical realm.",
        wikiUrl: "https://example.com/eldoria",
        createdAt: "2026-09-20T00:00:00.000Z",
        updatedAt: "2026-09-20T00:00:00.000Z",
      },
      playerCharacter: {
        id: "pc-1",
        name: "Aria Shadowalker",
        age: "24",
        gender: "Female",
        species: "Elf",
        pronouns: "she/her",
        appearance: "Tall with silver hair",
        personality: "Cautious and observant",
        background: "Exiled rogue",
        goals: "Find the Sunstone",
        aliases: ["The Shadow"],
        knownTies: ["Guild of Rogues"],
        notes: "Keeps a hidden dagger",
        createdAt: "2026-09-20T00:00:00.000Z",
        updatedAt: "2026-09-20T00:00:00.000Z",
      },
      messages: [
        {
          id: "msg-1",
          storyId: "story-1",
          role: "assistant",
          content: "The mist parted before the castle gates.",
          timestamp: "2026-09-20T00:01:00.000Z",
        },
      ],
      storyIndex: {
        storyId: "story-1",
        indexedMessageCount: 1,
        updatedAt: "2026-09-20T00:05:00.000Z",
        chapterSummaries: [
          {
            chapterId: "ch-1",
            chapterLabel: "Chapter 1: The Gates",
            summary: "Aria reached the ancient gate and scouted the guards.",
            sourceMessageIds: ["msg-1"],
            lastIndexedMessageId: "msg-1",
            updatedAt: "2026-09-20T00:05:00.000Z",
          },
        ],
        characters: [
          {
            id: "char-1",
            canonicalName: "Gareth",
            aliases: ["Captain"],
            description: "Commander of the gate watch.",
            status: "Suspicious",
            developments: ["Questioned Aria at the gates"],
            provenance: ["msg-1"],
            updatedAt: "2026-09-20T00:05:00.000Z",
          },
        ],
        relationships: [
          {
            id: "rel-1",
            characterIdA: "char-1",
            characterIdB: "pc-1",
            nature: "wary adversaries",
            state: "tense confrontation",
            developments: ["Gareth demanded proof of identity"],
            provenance: ["msg-1"],
            updatedAt: "2026-09-20T00:05:00.000Z",
          },
        ],
      },
    };

    const result = serializeStoryExport(bundle, "markdown");
    const content = String(result.content);

    expect(content).toContain("# Chronicles of Eldoria");
    expect(content).toContain("## Story Index");
    expect(content).toContain("### Chapter Summaries");
    expect(content).toContain("#### Chapter 1: The Gates");
    expect(content).toContain("Aria reached the ancient gate and scouted the guards.");
    expect(content).toContain("### Characters");
    expect(content).toContain("#### Gareth (Suspicious)");
    expect(content).toContain("Commander of the gate watch.");
    expect(content).toContain("Questioned Aria at the gates");
    expect(content).toContain("### Relationships");
    expect(content).toContain("#### Gareth & Aria Shadowalker (tense confrontation)");
    expect(content).toContain("wary adversaries");
    expect(content).toContain("Gareth demanded proof of identity");
    expect(content).toContain("## Transcript");
  });
});
