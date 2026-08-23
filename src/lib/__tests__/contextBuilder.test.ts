import { describe, expect, it } from "vitest";
import {
  buildStoryChatContext,
  buildStorySummaryContext,
} from "../ai/contextBuilder";
import type {
  PlayerCharacter,
  Story,
  StoryMessage,
  Universe,
} from "../../types/models";

const universe: Universe = {
  id: "universe-1",
  name: "Test Universe",
  description: "A test universe.",
  wikiUrl: "",
  importedLore: [],
  importedCharacters: [],
  importedLocations: [],
  importedRelationships: [],
  createdAt: "2026-01-01T00:00:00.000Z",
};

const story: Story = {
  id: "story-1",
  title: "Test Story",
  universeId: universe.id,
  playerCharacterId: "player-1",
  currentSummary: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const playerCharacter: PlayerCharacter = {
  id: "player-1",
  name: "Rebecca Alvarez",
  aliases: ["Becca"],
  age: "30",
  gender: "woman",
  species: "human",
  pronouns: "she/her",
  appearance: "",
  personality: "",
  background: "",
  goals: "",
  notes: "",
  universeId: universe.id,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function assistantMessage(
  content: string,
  overrides: Partial<StoryMessage> = {},
): StoryMessage {
  return {
    id: "assistant-1",
    storyId: story.id,
    role: "assistant",
    speakerType: "narrator",
    content,
    timestamp: "2026-01-01T00:00:01.000Z",
    ...overrides,
  };
}

function buildContext(
  recentMessages: StoryMessage[] = [],
  storyOverride: Story = story,
  providerType?: "openai" | "gemini" | "openrouter" | "anthropic",
) {
  return buildStoryChatContext({
    universe,
    story: storyOverride,
    playerCharacter,
    imports: [],
    summaries: [],
    recentMessages,
    latestUserMessage: "I wait for Rosa to answer.",
    providerType,
  });
}

function onlyAssistantHistory(messages: StoryMessage[]) {
  return buildContext(messages).filter((message) => message.role === "assistant");
}

describe("contextBuilder assistant history serialization", () => {
  it("keeps a generated multi-speaker transcript instead of wrapping it as narration", () => {
    const transcript = [
      'Rosa: *She folds her arms.* "You look entirely too pleased with yourself."',
      "",
      "Narrator: *Rain taps against the kitchen window.*",
      "",
      'Maya: *She glances between them.* "Should I come back later?"',
    ].join("\n");

    const history = onlyAssistantHistory([assistantMessage(transcript)]);

    expect(history).toEqual([{ role: "assistant", content: transcript }]);
    expect(history[0]?.content).not.toContain("Narrator: Rosa:");
    expect(history[0]?.content).toContain("Rosa:");
    expect(history[0]?.content).toContain("Maya:");
  });

  it("does not add a second Narrator label to a transcript that begins with narration", () => {
    const transcript = [
      "Narrator: *The room falls quiet.*",
      "",
      'Rosa: *She reaches for her mug.* "Well?"',
    ].join("\n");

    const history = onlyAssistantHistory([assistantMessage(transcript)]);

    expect(history).toEqual([{ role: "assistant", content: transcript }]);
    expect(history[0]?.content).not.toContain("Narrator: Narrator:");
  });

  it("retains the Narrator wrapper for a plain single-narrator message", () => {
    const history = onlyAssistantHistory([
      assistantMessage("The room falls quiet."),
    ]);

    expect(history).toEqual([
      { role: "assistant", content: "Narrator: The room falls quiet." },
    ]);
  });

  it("retains manual canon speaker serialization", () => {
    const history = onlyAssistantHistory([
      assistantMessage('"The east gate closes at dusk."', {
        speakerType: "canon",
        speakerName: "Rosa",
      }),
    ]);

    expect(history).toEqual([
      {
        role: "assistant",
        content: 'Canon (Rosa): "The east gate closes at dusk."',
      },
    ]);
  });

  it("uses the same transcript-preserving serialization for summary context", () => {
    const transcript = [
      'Rosa: *She opens the door.* "Come in."',
      "",
      "Narrator: *Rebecca steps inside.*",
    ].join("\n");

    const context = buildStorySummaryContext({
      storyTitle: story.title,
      playerCharacterName: playerCharacter.name,
      playerCharacter,
      messages: [assistantMessage(transcript)],
    });

    expect(context.filter((message) => message.role === "assistant")).toEqual([
      { role: "assistant", content: transcript },
    ]);
  });
});

describe("contextBuilder scene grammar", () => {
  it("teaches one inline grammar for character and narrator blocks", () => {
    const sceneDirection = buildContext().find(
      (message) =>
        message.role === "system" && message.content.startsWith("Scene Direction"),
    )?.content;

    expect(sceneDirection).toContain(
      'Morgan: *She leans back in her chair.* "Do you think she knows?',
    );
    expect(sceneDirection).toContain(
      "Narrator: *The refrigerator hums. Neither of them reaches for their coffee.*",
    );
    expect(sceneDirection).not.toContain("Morgan:\n*leans back");
    expect(sceneDirection).not.toContain(
      "Narrator:\nThe refrigerator hums",
    );
    expect(sceneDirection).not.toContain("on their own line when switching speakers");
    expect(sceneDirection).not.toContain(
      "Asterisks are reserved exclusively for actions",
    );
  });
});

function sceneDirectionFor(
  storyOverride: Story,
  providerType?: "openai" | "gemini" | "openrouter" | "anthropic",
) {
  return buildContext([], storyOverride, providerType).find(
    (message) =>
      message.role === "system" && message.content.startsWith("Scene Direction"),
  )?.content ?? "";
}

describe("contextBuilder adult-content policy", () => {
  it("uses standard mode for stories without either persisted setting", () => {
    const direction = sceneDirectionFor(story);

    expect(direction).toContain("Adult content mode: standard.");
    expect(direction).not.toContain("mature fiction (non-graphic)");
    expect(direction).not.toContain("explicit consensual-adult fiction");
  });

  it("preserves legacy mature-fiction stories as mature non-graphic", () => {
    const direction = sceneDirectionFor({
      ...story,
      matureFictionMode: true,
    });

    expect(direction).toContain("Adult content mode: mature fiction (non-graphic).");
    expect(direction).toContain("Keep sexual intimacy non-graphic.");
    expect(direction).not.toContain("explicit consensual-adult fiction");
  });

  it("emits explicit-mode eligibility and Gemini best-effort guidance without a non-graphic contradiction", () => {
    const direction = sceneDirectionFor(
      {
        ...story,
        adultContentMode: "explicit_consensual_adults",
        matureFictionMode: true,
      },
      "gemini",
    );

    expect(direction).toContain("Adult content mode: explicit consensual-adult fiction.");
    expect(direction).toContain("every sexual participant is fictional and an adult");
    expect(direction).toContain("Consent must be established for the current interaction");
    expect(direction).toContain("Provider capability: best effort.");
    expect(direction).toContain("do not evade, weaken, or bypass provider safeguards");
    expect(direction).not.toContain("Keep sexual intimacy non-graphic.");
    expect(direction).not.toContain("Do not introduce graphic sexual content");
  });

  it("lets the new standard setting override a legacy mature true flag", () => {
    const direction = sceneDirectionFor({
      ...story,
      adultContentMode: "standard",
      matureFictionMode: true,
    });

    expect(direction).toContain("Adult content mode: standard.");
    expect(direction).not.toContain("mature fiction (non-graphic)");
  });
});
