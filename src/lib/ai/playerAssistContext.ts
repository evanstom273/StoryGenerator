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
import { buildDirectorAssistContinuationRequest, buildDirectorAssistRequest, buildPlayerAssistContinuationRequest, buildPlayerAssistRequest } from "./playerAssist";
import { buildMatureFictionPolicyBlock } from "./matureFictionPolicy";
import { formatUniverseWikiSources } from "../universeSources";
import { formatPlayerCharacterIdentityForPrompt, formatPlayerCharacterKnownTiesForPrompt, resolvePlayerCharacterPreferredSceneName } from "../playerCharacterPrompt";
import { isAuthorDirectiveMessage } from "../storyText/authorDirectives";
import { isContinueMessage } from "../storyText/continueMode";
import { isDirectorMessage } from "../storyText/directorMode";
import { formatDirectorNoteAuthoringGuidance } from "../storyText/directorSyntax";

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

export function storyHasGeneratedScenes(messages: StoryMessage[]): boolean {
  return messages.some((message) => message.role === "assistant");
}

function buildAssistUniverseInfo({
  universe,
  story,
  playerCharacter,
}: {
  universe: Universe;
  story: Story;
  playerCharacter: PlayerCharacter;
}) {
  const universeMode = universe.mode ?? "referenced";
  const universeDescription = universe.description.trim() || universe.concept?.trim() || "";
  const universeConcept = universe.concept?.trim() || "";
  const universeBlueprint = universe.universeBlueprint?.trim() || "";

  return normalizeWhitespace(
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
      formatPlayerCharacterIdentityForPrompt(playerCharacter),
      formatPlayerCharacterKnownTiesForPrompt(playerCharacter),
      playerCharacter.characterConcept?.trim()
        ? `Player Concept/Role: ${playerCharacter.characterConcept.trim()}`
        : "",
      playerCharacter.background.trim() ? `Player Background: ${playerCharacter.background.trim()}` : "",
      playerCharacter.notes.trim() ? `Player Notes: ${playerCharacter.notes.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
}

function buildAssistImportedLore(imports: UniverseImport[]) {
  const mostRecentImport = imports[0];

  return mostRecentImport
    ? normalizeWhitespace(
        [
          `Source URL: ${mostRecentImport.sourceUrl}`,
          mostRecentImport.title.trim() ? `Title: ${mostRecentImport.title.trim()}` : "",
          "",
          mostRecentImport.importedText.slice(0, MAX_IMPORTED_LORE_CHARS),
        ].join("\n"),
      )
    : "No imported lore is available for this universe yet.";
}

function buildAssistSummaryBlock(story: Story, summaries: StorySummary[]) {
  const latestSummary = story.currentSummary.trim() || summaries[0]?.summary?.trim() || "";

  return latestSummary
    ? normalizeWhitespace(latestSummary)
    : "No story summary is available yet.";
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
  const universeInfo = buildAssistUniverseInfo({ universe, story, playerCharacter });
  const importedLore = buildAssistImportedLore(imports);
  const summaryBlock = buildAssistSummaryBlock(story, summaries);

  const assistGuidance = normalizeWhitespace(
    [
      "You are generating a Player Assist draft.",
      "This is a suggested player turn and is not canon until the user chooses to send it.",
      "Output only the player's message in the required format. No other speakers. No narration. No commentary.",
      "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
      "The player character sheet is authoritative canon for identity facts. Do not contradict it or introduce genre-default assumptions about the protagonist.",
      `Use "${resolvePlayerCharacterPreferredSceneName(playerCharacter)}" as the player character's preferred name. Use their specified pronouns (${playerCharacter.pronouns.trim() || "unspecified"}) and never infer he/him or she/her from name or gender.`,
      buildMatureFictionPolicyBlock({
        includeParity: true,
      }),
    ].join("\n"),
  );

  const preferredName = resolvePlayerCharacterPreferredSceneName(playerCharacter);
  const chatHistory = sortByTimestampAsc(recentMessages)
    .slice(-MAX_RECENT_MESSAGES)
    .map((message) => formatTimelineMessage(message, preferredName));

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
          ? buildPlayerAssistContinuationRequest(preferredName, effectiveExistingText)
          : buildPlayerAssistRequest(preferredName),
      ),
    },
  ];
}

export function buildDirectorAssistContext({
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
  const universeInfo = buildAssistUniverseInfo({ universe, story, playerCharacter });
  const importedLore = buildAssistImportedLore(imports);
  const summaryBlock = buildAssistSummaryBlock(story, summaries);

  const assistGuidance = normalizeWhitespace(
    [
      "You are generating a Director Assist draft.",
      "This is a suggested Director staging note and is not canon until the user sends it.",
      "The AI will use this note to stage the next scene, temporarily controlling all characters including the player character for one reply.",
      "Read the full transcript below to understand where the story currently stands.",
      "Output only the Director note in the required format. No other speakers. No narration. No commentary.",
      "Use first names for characters. Stage the immediate next beat — do not summarize prior scenes.",
      formatDirectorNoteAuthoringGuidance(),
      `Use "${resolvePlayerCharacterPreferredSceneName(playerCharacter)}" as the player character's preferred name.`,
      buildMatureFictionPolicyBlock({
        includeParity: true,
      }),
    ].join("\n"),
  );

  const preferredName = resolvePlayerCharacterPreferredSceneName(playerCharacter);
  const chatHistory = sortByTimestampAsc(recentMessages).map((message) =>
    formatTimelineMessage(message, preferredName),
  );

  const effectiveExistingText = typeof existingText === "string" ? existingText.trimEnd() : "";

  return [
    { role: "system", content: `Universe Information\n\n${universeInfo}` },
    { role: "system", content: `Imported Lore\n\n${importedLore}` },
    { role: "system", content: `Story Summary\n\n${summaryBlock}` },
    { role: "system", content: `Director Assist Mode\n\n${assistGuidance}` },
    ...chatHistory,
    {
      role: "user",
      content: normalizeWhitespace(
        effectiveExistingText
          ? buildDirectorAssistContinuationRequest(effectiveExistingText)
          : buildDirectorAssistRequest(preferredName),
      ),
    },
  ];
}
