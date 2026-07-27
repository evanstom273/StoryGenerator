import type {
  PlayerCharacter,
  Story,
  StoryMessage,
  StorySummary,
  Universe,
  UniverseImport,
} from "../../types/models";
import type { AIChatMessage } from "./types";
import { sortByTimestampAsc } from "../dates";
import { buildPlayerAssistContinuationRequest, buildPlayerAssistRequest } from "./playerAssist";
import { buildMatureFictionPolicyBlock } from "./matureFictionPolicy";
import { formatUniverseWikiSources } from "../universeSources";
import { isAuthorDirectiveMessage } from "../storyText/authorDirectives";
import { isContinueMessage } from "../storyText/continueMode";
import { isDirectorMessage } from "../storyText/directorMode";

const MAX_IMPORTED_LORE_CHARS = 12000;
const MAX_RECENT_MESSAGES = 30;

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatTimelineMessage(message: StoryMessage, playerCharacterName: string): AIChatMessage {
  if (message.role === "system") {
    return { role: "system", content: normalizeWhitespace(message.content) };
  }

  if (message.role === "user") {
    if (isAuthorDirectiveMessage(message)) {
      return {
        role: "user",
        content: normalizeWhitespace(
          `${message.speakerName?.trim() || "Author"}: ${message.content}`,
        ),
      };
    }

    if (isContinueMessage(message)) {
      return {
        role: "user",
        content: normalizeWhitespace(`Continue: ${message.content}`),
      };
    }

    if (isDirectorMessage(message)) {
      return {
        role: "user",
        content: normalizeWhitespace(`Director: ${message.content}`),
      };
    }

    return {
      role: "user",
      content: normalizeWhitespace(`Player (${playerCharacterName}): ${message.content}`),
    };
  }

  if (message.speakerType === "canon") {
    const speaker = message.speakerName?.trim() || "Unknown";
    return {
      role: "assistant",
      content: normalizeWhitespace(`Canon (${speaker}): ${message.content}`),
    };
  }

  if (message.speakerType === "narrator") {
    return { role: "assistant", content: normalizeWhitespace(`Narrator: ${message.content}`) };
  }

  return { role: "assistant", content: normalizeWhitespace(message.content) };
}

export function buildPlayerAssistContext({
  universe,
  story,
  playerCharacter,
  imports,
  summaries,
  recentMessages,
  existingText,
}: {
  universe: Universe;
  story: Story;
  playerCharacter: PlayerCharacter;
  imports: UniverseImport[];
  summaries: StorySummary[];
  recentMessages: StoryMessage[];
  existingText?: string;
}): AIChatMessage[] {
  const mostRecentImport = imports[0];
  const latestSummary = story.currentSummary.trim() || summaries[0]?.summary?.trim() || "";
  const universeMode = universe.mode ?? "referenced";
  const universeDescription = universe.description.trim() || universe.concept?.trim() || "";
  const universeConcept = universe.concept?.trim() || "";
  const universeBlueprint = universe.universeBlueprint?.trim() || "";

  const universeInfo = normalizeWhitespace(
    [
      `Universe Name: ${universe.name}`,
      `Universe Mode: ${universeMode}`,
      universeDescription ? `Universe Description: ${universeDescription}` : "",
      universeMode === "custom" && universeConcept ? `Universe Concept: ${universeConcept}` : "",
      universeMode === "custom" && universe.genreTheme?.trim()
        ? `Genre/Theme: ${universe.genreTheme.trim()}`
        : "",
      universeMode === "custom" && universe.tone?.trim() ? `Tone: ${universe.tone.trim()}` : "",
      universeMode === "custom" && universeBlueprint
        ? `Universe Blueprint:\n\n${universeBlueprint}`
        : "",
      universeMode === "referenced" && formatUniverseWikiSources(universe).length
        ? `Reference sources (highest precedence first):\n${formatUniverseWikiSources(universe).join("\n")}`
        : "",
      universeMode === "referenced" && universe.notes?.trim() ? `Notes: ${universe.notes.trim()}` : "",
      `Story Title: ${story.title}`,
      `Player Character: ${playerCharacter.name}`,
      playerCharacter.age.trim() ? `Player Age: ${playerCharacter.age.trim()}` : "",
      playerCharacter.gender.trim() ? `Player Gender: ${playerCharacter.gender.trim()}` : "",
      playerCharacter.species?.trim()
        ? `Player Species: ${playerCharacter.species.trim()}`
        : "",
      playerCharacter.pronouns.trim() ? `Player Pronouns: ${playerCharacter.pronouns.trim()}` : "",
      playerCharacter.characterConcept?.trim()
        ? `Player Concept/Role: ${playerCharacter.characterConcept.trim()}`
        : "",
      playerCharacter.background.trim() ? `Player Background: ${playerCharacter.background.trim()}` : "",
      playerCharacter.goals.trim() ? `Player Goals: ${playerCharacter.goals.trim()}` : "",
      playerCharacter.notes.trim() ? `Player Notes: ${playerCharacter.notes.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  );

  const importedLore = mostRecentImport
    ? normalizeWhitespace(
        [
          `Source URL: ${mostRecentImport.sourceUrl}`,
          mostRecentImport.title.trim() ? `Title: ${mostRecentImport.title.trim()}` : "",
          "",
          mostRecentImport.importedText.slice(0, MAX_IMPORTED_LORE_CHARS),
        ].join("\n"),
      )
    : "No imported lore is available for this universe yet.";

  const summaryBlock = latestSummary
    ? normalizeWhitespace(latestSummary)
    : "No story summary is available yet.";

  const assistGuidance = normalizeWhitespace(
    [
      "You are generating a Player Assist draft.",
      "This is a suggested player turn and is not canon until the user chooses to send it.",
      "Output only the player's message in the required format. No other speakers. No narration. No commentary.",
      "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
      "The player character sheet is authoritative canon for identity facts. Do not contradict it or introduce genre-default assumptions about the protagonist.",
      buildMatureFictionPolicyBlock({
        includeParity: true,
      }),
    ].join("\n"),
  );

  const chatHistory = sortByTimestampAsc(recentMessages)
    .slice(-MAX_RECENT_MESSAGES)
    .map((message) => formatTimelineMessage(message, playerCharacter.name));

  const effectiveExistingText = typeof existingText === "string" ? existingText.trimEnd() : "";

  return [
    { role: "system", content: `Universe Information\n\n${universeInfo}` },
    { role: "system", content: `Imported Lore\n\n${importedLore}` },
    { role: "system", content: `Story Summary\n\n${summaryBlock}` },
    { role: "system", content: `Player Assist Mode\n\n${assistGuidance}` },
    ...chatHistory,
    {
      role: "user",
      content: normalizeWhitespace(
        effectiveExistingText
          ? buildPlayerAssistContinuationRequest(playerCharacter.name, effectiveExistingText)
          : buildPlayerAssistRequest(playerCharacter.name),
      ),
    },
  ];
}
