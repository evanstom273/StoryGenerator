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
import { buildPlayerAssistRequest } from "./playerAssist";

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
}: {
  universe: Universe;
  story: Story;
  playerCharacter: PlayerCharacter;
  imports: UniverseImport[];
  summaries: StorySummary[];
  recentMessages: StoryMessage[];
}): AIChatMessage[] {
  const mostRecentImport = imports[0];
  const latestSummary = story.currentSummary.trim() || summaries[0]?.summary?.trim() || "";

  const universeInfo = normalizeWhitespace(
    [
      `Universe Name: ${universe.name}`,
      universe.description.trim() ? `Universe Description: ${universe.description.trim()}` : "",
      universe.wikiUrl.trim() ? `Universe Wiki URL: ${universe.wikiUrl.trim()}` : "",
      `Story Title: ${story.title}`,
      `Player Character: ${playerCharacter.name}`,
      playerCharacter.gender.trim() ? `Player Gender: ${playerCharacter.gender.trim()}` : "",
      playerCharacter.pronouns.trim() ? `Player Pronouns: ${playerCharacter.pronouns.trim()}` : "",
      story.openingPrompt.trim()
        ? `Opening Prompt (canon setup):\n${story.openingPrompt.trim()}`
        : "",
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
    ].join("\n"),
  );

  const chatHistory = sortByTimestampAsc(recentMessages)
    .slice(-MAX_RECENT_MESSAGES)
    .map((message) => formatTimelineMessage(message, playerCharacter.name));

  return [
    { role: "system", content: `Universe Information\n\n${universeInfo}` },
    { role: "system", content: `Imported Lore\n\n${importedLore}` },
    { role: "system", content: `Story Summary\n\n${summaryBlock}` },
    { role: "system", content: `Player Assist Mode\n\n${assistGuidance}` },
    ...chatHistory,
    { role: "user", content: normalizeWhitespace(buildPlayerAssistRequest(playerCharacter.name)) },
  ];
}
