import { describe, expect, it } from "vitest";
import {
  matchExistingCharacter,
  buildRelationshipPairKey,
  buildIndexingPrompt,
  parseAndValidateIndexingExtraction,
  processIndexingBatch,
  normalizeNameKey,
} from "../storyIndexingPipeline";
import type {
  PlayerCharacter,
  Story,
  StoryIndex,
  StoryIndexCharacter,
  StoryIndexRelationship,
  StoryMessage,
} from "../../../types/models";
import type { AIProvider, GenerateResponseResult } from "../types";

function makeMockProvider(responseJson: string): AIProvider {
  return {
    async generateResponse(): Promise<GenerateResponseResult> {
      return {
        content: responseJson,
        finishReason: "stop",
      };
    },
    async generateStream(): Promise<AsyncIterable<string>> {
      async function* gen() {
        yield responseJson;
      }
      return gen();
    },
    async validateConnection() {
      return true;
    },
  };
}

const mockPlayerCharacter: PlayerCharacter = {
  id: "player-1",
  name: "Arthur Pendragon",
  aliases: ["Artie", "Once and Future King"],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const mockStory: Story = {
  id: "story-1",
  universeId: "universe-1",
  playerCharacterId: "player-1",
  title: "The Legend of Camelot",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("storyIndexingPipeline", () => {
  describe("normalizeNameKey", () => {
    it("normalizes casing, whitespace, and smart quotes", () => {
      expect(normalizeNameKey('  "Merlin" the Wise  ')).toBe("merlin the wise");
      expect(normalizeNameKey("Arthur ‘King’ Pendragon")).toBe("arthur king pendragon");
    });
  });

  describe("matchExistingCharacter", () => {
    const existingChars: StoryIndexCharacter[] = [
      {
        id: "char-merlin",
        canonicalName: "Merlin Ambrosius",
        aliases: ["Myrddin", "The Old Mage"],
        description: "Court wizard",
        status: "alive",
        developments: [],
        provenance: ["msg-1"],
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    it("matches by canonical character ID", () => {
      const match = matchExistingCharacter("char-merlin", existingChars);
      expect(match?.id).toBe("char-merlin");
    });

    it("matches by exact canonical name", () => {
      const match = matchExistingCharacter("Merlin Ambrosius", existingChars);
      expect(match?.id).toBe("char-merlin");
    });

    it("matches case-insensitively with extra whitespace", () => {
      const match = matchExistingCharacter("  merlin ambrosius ", existingChars);
      expect(match?.id).toBe("char-merlin");
    });

    it("matches by alias", () => {
      const match = matchExistingCharacter("The Old Mage", existingChars);
      expect(match?.id).toBe("char-merlin");
    });

    it("returns null for non-matching character", () => {
      const match = matchExistingCharacter("Lancelot", existingChars);
      expect(match).toBeNull();
    });
  });

  describe("buildRelationshipPairKey", () => {
    it("produces identical pair key regardless of parameter order", () => {
      expect(buildRelationshipPairKey("char-a", "char-b")).toBe("char-a::char-b");
      expect(buildRelationshipPairKey("char-b", "char-a")).toBe("char-a::char-b");
    });
  });

  describe("buildIndexingPrompt relationship guidance", () => {
    it("treats narratively significant interpersonal history as relationship-worthy", () => {
      const prompt = buildIndexingPrompt({
        storyTitle: mockStory.title,
        playerCharacter: mockPlayerCharacter,
        chapterLabel: "Chapter 1",
        existingCharacters: [],
        existingRelationships: [],
        newMessages: [
          {
            id: "msg-relationship",
            storyId: mockStory.id,
            role: "assistant",
            content: "A saboteur attacks Arthur after being confronted.",
            timestamp: "1",
          },
        ],
      });

      expect(prompt).toContain("A single consequential interaction can be relationship-worthy");
      expect(prompt).toContain("Bias toward preserving a meaningful relationship rather than omitting it");
      expect(prompt).toContain("mere co-presence or trivial incidental exchanges");
      expect(prompt).toContain("Keep relationship developments selective");
      expect(prompt).toContain("captain/officer");
      expect(prompt).toContain("adversaries");
    });
  });

  describe("parseAndValidateIndexingExtraction", () => {
    it("parses clean JSON", () => {
      const input = JSON.stringify({
        chapterSummary: "Arthur met Merlin in the deep woods.",
        characters: [{ name: "Merlin", description: "Enchanter" }],
        relationships: [{ characterA: "Arthur", characterB: "Merlin", nature: "Mentor" }],
      });
      const result = parseAndValidateIndexingExtraction(input);
      expect(result.chapterSummary).toBe("Arthur met Merlin in the deep woods.");
      expect(result.characters?.[0]?.name).toBe("Merlin");
      expect(result.relationships?.[0]?.nature).toBe("Mentor");
    });

    it("strips markdown code fences", () => {
      const input = "```json\n" + JSON.stringify({ chapterSummary: "Summary text." }) + "\n```";
      const result = parseAndValidateIndexingExtraction(input);
      expect(result.chapterSummary).toBe("Summary text.");
    });

    it("parses code fences with conversational preamble and trailing commentary", () => {
      const input = "Here is the extraction:\n```json\n" + JSON.stringify({ chapterSummary: "Summary text with intro." }) + "\n```\nHope this helps!";
      const result = parseAndValidateIndexingExtraction(input);
      expect(result.chapterSummary).toBe("Summary text with intro.");
    });

    it("repairs trailing commas in JSON object", () => {
      const input = '{\n  "chapterSummary": "Summary with trailing comma.",\n}';
      const result = parseAndValidateIndexingExtraction(input);
      expect(result.chapterSummary).toBe("Summary with trailing comma.");
    });

    it("throws on completely malformed JSON", () => {
      expect(() => parseAndValidateIndexingExtraction("Not JSON at all")).toThrow(
        /failed to parse structured JSON/i,
      );
    });
  });

  describe("processIndexingBatch", () => {
    it("retries once when the model returns malformed JSON", async () => {
      let calls = 0;
      const provider: AIProvider = {
        async generateResponse(): Promise<GenerateResponseResult> {
          calls += 1;
          return {
            content: calls === 1
              ? '{"chapterSummary":"truncated"'
              : JSON.stringify({ chapterSummary: "Recovered summary.", characters: [], relationships: [] }),
            finishReason: "stop",
          };
        },
        async generateStream(): Promise<AsyncIterable<string>> {
          async function* gen() {
            yield "";
          }
          return gen();
        },
        async validateConnection() {
          return true;
        },
      };

      const result = await processIndexingBatch({
        story: mockStory,
        playerCharacter: mockPlayerCharacter,
        chapterLabel: "Chapter 1",
        messages: [{ id: "msg-retry", storyId: "story-1", role: "user", content: "Hello", timestamp: "1" }],
        existingIndex: null,
        provider,
        model: "gemini-2.5-flash",
      });

      expect(calls).toBe(2);
      expect(result.chapterSummaries[0]?.summary).toBe("Recovered summary.");
    });

    const messages: StoryMessage[] = [
      {
        id: "msg-1",
        storyId: "story-1",
        role: "assistant",
        content: 'Merlin approached: "Arthur, your quest begins now."',
        timestamp: "2026-01-01T01:00:00Z",
      },
    ];

    it("keeps relationships when the model returns canonical character IDs", async () => {
      const provider = makeMockProvider(JSON.stringify({
        chapterSummary: "Arthur confronts Merlin.",
        characters: [
          { name: "Merlin Ambrosius", description: "Court wizard" },
        ],
        relationships: [
          {
            characterA: "player-1",
            characterB: "char-merlin-fixed",
            nature: "Adversaries",
            state: "Hostile",
            developments: ["A serious confrontation established open hostility."],
          },
        ],
      }));

      const existingIndex: StoryIndex = {
        storyId: mockStory.id,
        chapterSummaries: [],
        characters: [{
          id: "char-merlin-fixed",
          canonicalName: "Merlin Ambrosius",
          aliases: ["Merlin"],
          description: "Court wizard",
          status: "active",
          developments: [],
          provenance: [],
          updatedAt: "1",
        }],
        relationships: [],
        indexedMessageCount: 0,
        updatedAt: "1",
      };

      const result = await processIndexingBatch({
        story: mockStory,
        playerCharacter: mockPlayerCharacter,
        chapterLabel: "Chapter 1",
        messages,
        existingIndex,
        provider,
        model: "gemini-2.5-flash",
      });

      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0]?.nature).toBe("Adversaries");
      expect(new Set([result.relationships[0]?.characterIdA, result.relationships[0]?.characterIdB])).toEqual(
        new Set(["player-1", "char-merlin-fixed"]),
      );
    });

    it("creates canonical character and maintains stable identity across aliases", async () => {
      const mockExtraction = {
        chapterSummary: "Arthur and Merlin begin the quest.",
        characters: [
          {
            name: "Merlin Ambrosius",
            aliases: ["The Old Wizard"],
            description: "Court sorcerer of Camelot.",
            status: "active advisor",
            developments: ["Revealed the prophecy to Arthur."],
          },
        ],
        relationships: [
          {
            characterA: "Arthur Pendragon",
            characterB: "Merlin Ambrosius",
            nature: "Mentor and Student",
            state: "Close advisory bond",
            developments: ["Merlin revealed the kingdom's destiny."],
          },
        ],
      };

      const provider = makeMockProvider(JSON.stringify(mockExtraction));
      const index1 = await processIndexingBatch({
        story: mockStory,
        playerCharacter: mockPlayerCharacter,
        chapterLabel: "Chapter 1",
        messages,
        existingIndex: null,
        provider,
        model: "gemini-2.5-flash",
      });

      expect(index1.characters.length).toBeGreaterThanOrEqual(2); // Arthur + Merlin
      const merlin = index1.characters.find((c) => c.canonicalName === "Merlin Ambrosius");
      expect(merlin).toBeDefined();
      expect(merlin?.aliases).toContain("The Old Wizard");
      const merlinId = merlin!.id;

      // Now index another message where Merlin is referred to by alias "The Old Wizard"
      const messages2: StoryMessage[] = [
        {
          id: "msg-2",
          storyId: "story-1",
          role: "assistant",
          content: 'The Old Wizard raised his staff: "Beware the dark valley."',
          timestamp: "2026-01-01T02:00:00Z",
        },
      ];

      const mockExtraction2 = {
        chapterSummary: "Arthur and Merlin begin the quest. The Old Wizard warned Arthur of the dark valley.",
        characters: [
          {
            name: "The Old Wizard",
            aliases: ["Myrddin"],
            description: "Ancient wise mentor.",
            status: "cautious",
            developments: ["Issued warning about the valley."],
          },
        ],
        relationships: [
          {
            characterA: "The Old Wizard",
            characterB: "Arthur Pendragon",
            nature: "Mentor and Student",
            state: "Protective caution",
            developments: ["Warned Arthur of impending danger."],
          },
        ],
      };

      const provider2 = makeMockProvider(JSON.stringify(mockExtraction2));
      const index2 = await processIndexingBatch({
        story: mockStory,
        playerCharacter: mockPlayerCharacter,
        chapterLabel: "Chapter 1",
        messages: messages2,
        existingIndex: index1,
        provider: provider2,
        model: "gemini-2.5-flash",
      });

      // Merlin's canonical ID must NOT change and no duplicate character should be created
      const merlinAfter = index2.characters.find((c) => c.id === merlinId);
      expect(merlinAfter).toBeDefined();
      expect(merlinAfter?.canonicalName).toBe("Merlin Ambrosius");
      expect(merlinAfter?.aliases).toContain("The Old Wizard");
      expect(merlinAfter?.aliases).toContain("Myrddin");

      // Verify no duplicate Merlin character was added
      const merlinMatches = index2.characters.filter(
        (c) => c.canonicalName === "Merlin Ambrosius" || c.canonicalName === "The Old Wizard",
      );
      expect(merlinMatches.length).toBe(1);

      // Verify relationship uses canonical IDs (not display name strings)
      expect(index2.relationships.length).toBe(1);
      const rel = index2.relationships[0];
      expect(rel.characterIdA).toBeDefined();
      expect(rel.characterIdB).toBeDefined();
      // Neither endpoint should be a name string like "The Old Wizard"
      expect(rel.characterIdA).not.toBe("The Old Wizard");
      expect(rel.characterIdB).not.toBe("The Old Wizard");
      expect(rel.state).toBe("Protective caution");
    });

    it("updates existing chapter summary in place with provenance", async () => {
      const mockExtraction1 = {
        chapterSummary: "Initial chapter events.",
        characters: [],
        relationships: [],
      };
      const provider1 = makeMockProvider(JSON.stringify(mockExtraction1));

      const index1 = await processIndexingBatch({
        story: mockStory,
        playerCharacter: mockPlayerCharacter,
        chapterLabel: "Chapter 1",
        messages: [{ id: "msg-1", storyId: "story-1", role: "user", content: "Hello", timestamp: "1" }],
        existingIndex: null,
        provider: provider1,
        model: "gemini-2.5-flash",
      });

      expect(index1.chapterSummaries.length).toBe(1);
      expect(index1.chapterSummaries[0].summary).toBe("Initial chapter events.");
      expect(index1.chapterSummaries[0].sourceMessageIds).toEqual(["msg-1"]);

      // Update with new message in the same chapter
      const mockExtraction2 = {
        chapterSummary: "Initial chapter events followed by deeper revelations.",
        characters: [],
        relationships: [],
      };
      const provider2 = makeMockProvider(JSON.stringify(mockExtraction2));

      const index2 = await processIndexingBatch({
        story: mockStory,
        playerCharacter: mockPlayerCharacter,
        chapterLabel: "Chapter 1",
        messages: [{ id: "msg-2", storyId: "story-1", role: "assistant", content: "World", timestamp: "2" }],
        existingIndex: index1,
        provider: provider2,
        model: "gemini-2.5-flash",
      });

      // Still exactly 1 chapter summary record, updated in-place
      expect(index2.chapterSummaries.length).toBe(1);
      expect(index2.chapterSummaries[0].summary).toBe("Initial chapter events followed by deeper revelations.");
      expect(index2.chapterSummaries[0].sourceMessageIds).toEqual(["msg-1", "msg-2"]);
    });

    it("is idempotent when reprocessing identical messages", async () => {
      const mockExtraction = {
        chapterSummary: "A quiet morning in the great hall.",
        characters: [
          {
            name: "Guinevere",
            description: "Queen of Camelot",
            status: "healthy",
            developments: ["Sat at the high table."],
          },
        ],
        relationships: [],
      };
      const provider = makeMockProvider(JSON.stringify(mockExtraction));
      const msg: StoryMessage = { id: "msg-1", storyId: "story-1", role: "assistant", content: "Prose", timestamp: "1" };

      const index1 = await processIndexingBatch({
        story: mockStory,
        playerCharacter: mockPlayerCharacter,
        chapterLabel: "Chapter 1",
        messages: [msg],
        existingIndex: null,
        provider,
        model: "gemini-2.5-flash",
      });

      // Reprocess same message
      const index2 = await processIndexingBatch({
        story: mockStory,
        playerCharacter: mockPlayerCharacter,
        chapterLabel: "Chapter 1",
        messages: [msg],
        existingIndex: index1,
        provider,
        model: "gemini-2.5-flash",
      });

      // Character count and summary count should remain unchanged
      expect(index2.chapterSummaries.length).toBe(1);
      expect(index2.characters.filter((c) => c.canonicalName === "Guinevere").length).toBe(1);
      expect(index2.chapterSummaries[0].sourceMessageIds).toEqual(["msg-1"]);
    });
  });
});
