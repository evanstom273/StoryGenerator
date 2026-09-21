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
  it("uses the current indexed protagonist name in relationship headings while preserving the character sheet name", () => {
    const bundle: StoryExportBundle = {
      exportedAt: "2026-09-21T00:00:00.000Z",
      story: {
        id: "story-identity", title: "Identity Story", universeId: "uni-1",
        playerCharacterId: "pc-1", createdAt: "2026-09-20T00:00:00.000Z",
        updatedAt: "2026-09-21T00:00:00.000Z", currentSummary: "",
      },
      universe: {
        id: "uni-1", name: "Test Universe", description: "", wikiUrl: "",
        createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z",
      },
      playerCharacter: {
        id: "pc-1", name: "James Peralta", age: "15", gender: "Male",
        species: "Human", pronouns: "he/him", appearance: "", personality: "",
        background: "", goals: "", aliases: [], knownTies: [], notes: "",
        createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z",
      },
      messages: [],
      storyIndex: {
        storyId: "story-identity", indexedMessageCount: 1,
        updatedAt: "2026-09-21T00:00:00.000Z", chapterSummaries: [],
        characters: [
          {
            id: "pc-1", canonicalName: "Lyra Peralta", aliases: ["James Peralta", "Jamie"],
            pronouns: "she/her", description: "Current indexed identity.", status: "active",
            developments: [], provenance: ["msg-1"], updatedAt: "2026-09-21T00:00:00.000Z",
          },
          {
            id: "jake-1", canonicalName: "Jake Peralta", aliases: [],
            description: "", status: "active", developments: [], provenance: ["msg-1"],
            updatedAt: "2026-09-21T00:00:00.000Z",
          },
        ],
        relationships: [
          {
            id: "rel-identity", characterIdA: "pc-1", characterIdB: "jake-1",
            nature: "father and daughter", state: "supportive", developments: [],
            provenance: ["msg-1"], updatedAt: "2026-09-21T00:00:00.000Z",
          },
        ],
      },
    };

    for (const format of ["markdown", "txt"] as const) {
      const content = String(serializeStoryExport(bundle, format).content);
      expect(content).toContain("Name: James Peralta");
      expect(content).toContain("Lyra Peralta & Jake Peralta");
      expect(content).not.toContain("James Peralta & Jake Peralta");
    }

    const json = JSON.parse(String(serializeStoryExport(bundle, "json").content));
    expect(json.playerCharacter.name).toBe("James Peralta");
    expect(json.storyIndex.characters.find((character: { id: string }) => character.id === "pc-1").canonicalName).toBe("Lyra Peralta");
  });

});
