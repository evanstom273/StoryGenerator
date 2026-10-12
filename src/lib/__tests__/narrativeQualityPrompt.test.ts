import { describe, expect, it } from "vitest";
import { buildStoryChatContext, buildStorySummaryContext } from "../ai/contextBuilder";
import { METACHAT_SYSTEM_PROMPT } from "../../features/metachat/responseGenerator";
import {
  formatHumanNovelistProseGuidance,
  formatNarrativeCraftGuidance,
} from "../storyProseGuidance";
import type {
  PlayerCharacter,
  Story,
  StoryIndex,
  StoryMessage,
  StoryState,
  Universe,
  UniverseImport,
} from "../../types/models";
import type { AIChatMessage } from "../ai/types";

/**
 * Prompt size on main before this pass, measured with the minimal fixture in the
 * size test below (Scene Direction block / whole request). Guards prompt growth.
 */
const BASELINE_CHARS = {
  player: { sceneDirection: 18_120, total: 19_683 },
  director: { sceneDirection: 19_571, total: 20_277 },
};

const NOW = "2026-01-01T00:00:00.000Z";

const referencedUniverse: Universe = {
  id: "universe-ref",
  name: "Harlow Street",
  mode: "referenced",
  description: "A long-running ensemble sitcom about a family-run bakery.",
  wikiUrl: "",
  importedLore: [],
  importedCharacters: [],
  importedLocations: [],
  importedRelationships: [],
  createdAt: NOW,
};

const customUniverse: Universe = {
  ...referencedUniverse,
  id: "universe-custom",
  name: "The Salt Flats",
  mode: "custom",
  description: "",
  concept: "A remote research station on a dried lake.",
  tone: "Quiet, wry, occasionally tense.",
};

const lore: UniverseImport = {
  id: "import-1",
  universeId: referencedUniverse.id,
  sourceUrl: "https://example.test/wiki/harlow-street",
  title: "Harlow Street",
  importedText:
    "Dora Hale runs the bakery. Personality: meticulous, obsessed with schedules, quotes her late father constantly. Pip Hale: the youngest, a prankster.",
  importedAt: NOW,
};

const player: PlayerCharacter = {
  id: "player-1",
  name: "Nell Hale",
  aliases: [],
  age: "34",
  gender: "woman",
  species: "human",
  pronouns: "she/her",
  appearance: "",
  personality: "Dry, patient, avoids conflict until she can't.",
  background: "Moved home after a divorce.",
  goals: "",
  notes: "",
  universeId: referencedUniverse.id,
  createdAt: NOW,
};

const importedCousin: PlayerCharacter = {
  ...player,
  id: "imported-1",
  name: "Theo Marsh",
  personality: "Loud, generous, terrible with money.",
  background: "Family friend who never left.",
};

const story: Story = {
  id: "story-1",
  title: "Proving Time",
  universeId: referencedUniverse.id,
  playerCharacterId: player.id,
  currentSummary: "",
  createdAt: NOW,
  updatedAt: NOW,
};

const storyState: StoryState = {
  id: "state-1",
  storyId: story.id,
  stateJson: JSON.stringify({
    authorDirectives: {
      canon: ["The bakery lease ends in March."],
      retcons: [],
      hiddenSecrets: [],
      revealedSecrets: [],
      revealDirectives: [],
    },
  }),
  updatedAt: NOW,
};

const storyIndex: StoryIndex = {
  storyId: story.id,
  chapterSummaries: [
    {
      chapterId: "chapter-1",
      chapterLabel: "Chapter 1",
      summary: "Nell moves back into the flat above the bakery and argues with Dora about the ovens.",
      sourceMessageIds: ["m1"],
      lastIndexedMessageId: "m1",
      updatedAt: NOW,
    },
  ],
  characters: [
    {
      id: "c-dora",
      canonicalName: "Dora Hale",
      aliases: ["Dora"],
      description: "Nell's older sister.",
      status: "Stressed about the lease.",
      developments: [],
      provenance: [],
      updatedAt: NOW,
    },
  ],
  relationships: [],
  indexedMessageCount: 1,
  updatedAt: NOW,
};

function message(overrides: Partial<StoryMessage>): StoryMessage {
  return {
    id: `m-${Math.random()}`,
    storyId: story.id,
    role: "assistant",
    speakerType: "narrator",
    content: "",
    timestamp: NOW,
    ...overrides,
  };
}

const history: StoryMessage[] = [
  message({
    role: "assistant",
    content: 'Dora: "The ovens are fine." *She does not look up from the ledger.*\n\nPip: "They are on fire."',
  }),
];

type Scenario = {
  name: string;
  universe: Universe;
  latestUserMessage: string;
  speakerType?: StoryMessage["speakerType"];
};

const scenarios: Scenario[] = [
  {
    name: "light family conversation with established characters",
    universe: referencedUniverse,
    latestUserMessage: "So who ate the last almond croissant?",
  },
  {
    name: "serious conversation with the same characters",
    universe: referencedUniverse,
    latestUserMessage: "I put the eviction letter on the counter. \"We need to talk about the lease.\"",
  },
  {
    name: "ensemble scene where not everyone needs to speak",
    universe: referencedUniverse,
    latestUserMessage: "I walk into the kitchen where Dora, Pip, Theo and Gran are all waiting.",
  },
  {
    name: "original-character scene without franchise knowledge",
    universe: customUniverse,
    latestUserMessage: "I check the water readings again.",
  },
  {
    name: "Director requests exaggerated comedy",
    universe: referencedUniverse,
    latestUserMessage:
      "*Pip's prank goes spectacularly wrong. Play it as over-the-top slapstick and melodrama; everyone overreacts.*",
    speakerType: "director",
  },
];

function build(scenario: Scenario): AIChatMessage[] {
  return buildStoryChatContext({
    universe: scenario.universe,
    story: { ...story, universeId: scenario.universe.id },
    playerCharacter: player,
    imports: scenario.universe.mode === "referenced" ? [lore] : [],
    storyState,
    storyIndex,
    importedStoryCharacters: [importedCousin],
    recentMessages: history,
    latestUserMessage: scenario.latestUserMessage,
    latestUserMessageSpeakerType: scenario.speakerType ?? "player",
    providerType: "gemini",
  });
}

function sceneDirection(context: AIChatMessage[]) {
  return context.find((entry) => entry.content.startsWith("Scene Direction"))?.content ?? "";
}

function allText(context: AIChatMessage[]) {
  return context.map((entry) => entry.content).join("\n\n");
}

describe.each(scenarios)("narrative quality prompt: $name", (scenario) => {
  const context = build(scenario);
  const direction = sceneDirection(context);
  const isDirector = scenario.speakerType === "director";

  it("includes the craft defaults exactly once, with Director precedence stated", () => {
    expect(allText(context).split("Writing craft defaults:").length - 1).toBe(1);
    expect(direction).toContain(formatNarrativeCraftGuidance());
    expect(direction).toContain("These are defaults, not limits. An explicit Director note");
  });

  it("keeps character sheets, imported characters, author declarations and memory", () => {
    const text = allText(context);
    expect(text).toContain("Universe Information");
    expect(text).toContain("Player Background: Moved home after a divorce.");
    expect(text).toContain("Theo Marsh");
    expect(text).toContain("The bakery lease ends in March.");
    expect(text).toContain("Indexed Story Memory");
    expect(text).toContain("Nell moves back into the flat above the bakery");
  });

  it("ends with the latest turn and a fresh-beat reminder that defers to the Director", () => {
    const latest = context[context.length - 1];
    expect(latest?.role).toBe("user");
    expect(latest?.content).toContain(scenario.latestUserMessage);
    if (isDirector) {
      expect(latest?.content.startsWith("Director note for the next scene only:")).toBe(true);
      expect(latest?.content).toContain("Unless this note says otherwise: continue naturally, preserving established facts");
      expect(direction).toContain("If the Director explicitly asks for exact wording, use that dialogue as written.");
    } else {
      expect(latest?.content).toContain("Writing reminder: Continue naturally, preserving established facts");
      // The reminder must sit above the canon marker so it is never read as player canon.
      expect(latest!.content.indexOf("Writing reminder")).toBeLessThan(
        latest!.content.indexOf("AUTHORITATIVE LATEST TURN"),
      );
      expect(direction).not.toContain("use that dialogue as written");
    }
  });

  it("contains no encoding damage or franchise-specific names", () => {
    const text = allText(context);
    expect(text).not.toMatch(/â€|Ã/);
    expect(direction).not.toMatch(/\b(Rosa|Casey|Elena|Harbor District)\b/);
  });
});

describe("narrative quality prompt structure", () => {
  it.each(["player", "director"] as const)("does not grow the %s-turn prompt beyond the pre-change size", (kind) => {
    const minimalUniverse: Universe = { ...customUniverse, id: "u", name: "U", mode: undefined, description: "d", concept: undefined, tone: undefined };
    const minimalPlayer: PlayerCharacter = { ...player, name: "Ana", age: "", gender: "", species: "", personality: "", background: "" };
    const context = buildStoryChatContext({
      universe: minimalUniverse,
      story: { ...story, title: "T" },
      playerCharacter: minimalPlayer,
      imports: [],
      recentMessages: [],
      latestUserMessage: "Hello there.",
      latestUserMessageSpeakerType: kind,
    });
    expect(sceneDirection(context).length).toBeLessThanOrEqual(BASELINE_CHARS[kind].sceneDirection);
    expect(allText(context).length).toBeLessThanOrEqual(BASELINE_CHARS[kind].total);
  });

  it("drops the duplicated voice-performance directives that encouraged caricature", () => {
    const direction = sceneDirection(build(scenarios[0]!));
    expect(direction).not.toContain("Character authenticity is the highest priority");
    expect(direction).not.toContain("Write each character exactly as they appear in canon");
    expect(direction).not.toContain("Drive the story forward with complications");
    expect(direction).toContain("Canon behaviour includes their ordinary moments");
  });

  it("only gives referenced universes the fan-fiction lore line", () => {
    expect(sceneDirection(build(scenarios[3]!))).not.toContain("This is fan fiction set in a referenced universe");
  });

  it("does not model a gesture on every example dialogue line", () => {
    const direction = sceneDirection(build(scenarios[0]!));
    const exampleLines = direction
      .split("\n")
      .filter((line) => /^(Morgan|Alex): /.test(line));
    expect(exampleLines.length).toBeGreaterThan(0);
    expect(exampleLines.some((line) => !line.includes("*"))).toBe(true);
    expect(direction).not.toMatch(/leans back|nods slowly|sets down her mug|glances toward/);
  });

  it("keeps fiction craft guidance out of summaries and MetaChat", () => {
    const summary = buildStorySummaryContext({
      storyTitle: story.title,
      playerCharacterName: player.name,
      messages: history,
    });
    expect(allText(summary)).not.toContain("Writing craft defaults");
    expect(METACHAT_SYSTEM_PROMPT).not.toContain("Writing craft defaults");
  });

  it("keeps the short prose block used by validation rewrites", () => {
    expect(formatHumanNovelistProseGuidance()).toContain("Dialogue does not require an accompanying gesture.");
    expect(formatHumanNovelistProseGuidance()).toContain("establish spatial relationships");
    expect(formatHumanNovelistProseGuidance()).not.toContain("Writing craft defaults");
  });
});
