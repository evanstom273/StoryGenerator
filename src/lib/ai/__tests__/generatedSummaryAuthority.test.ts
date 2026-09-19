import { describe, expect, it } from "vitest";
import type { PlayerCharacter, StoryMessage } from "../../../types/models";
import { protectGeneratedSummaryPlayerFacts } from "../generatedSummaryAuthority";

const player = {
  name: "Jamie Peralta",
  aliases: ["Lyra"],
  age: "15",
} as Pick<PlayerCharacter, "name" | "aliases" | "age">;

function message(content: string): StoryMessage {
  return {
    id: "message-1",
    storyId: "story-1",
    role: "user",
    content,
    timestamp: "2026-01-01T00:00:00.000Z",
  };
}

describe("generated summary authority", () => {
  it("corrects an unsupported generated age mutation before persistence", () => {
    const protectedText = protectGeneratedSummaryPlayerFacts(
      "Lyra, now a sixteen-year-old, tells her parents the truth.",
      player,
      [message("Call me Lyra from now on. I use she/her pronouns.")],
    );

    expect(protectedText).toContain("fifteen-year-old");
    expect(protectedText).not.toContain("sixteen-year-old");
  });

  it("allows an age change explicitly established for the player in the transcript", () => {
    const protectedText = protectGeneratedSummaryPlayerFacts(
      "Lyra is now sixteen years old.",
      player,
      [message("Lyra turns sixteen today, surrounded by her family.")],
    );

    expect(protectedText).toContain("sixteen years old");
  });

  it("does not rewrite another character's supported age", () => {
    const protectedText = protectGeneratedSummaryPlayerFacts(
      "Amy says that Rosa is sixteen years old. Lyra listens.",
      player,
      [message("Rosa is sixteen years old.")],
    );

    expect(protectedText).toContain("Rosa is sixteen years old");
  });
});
