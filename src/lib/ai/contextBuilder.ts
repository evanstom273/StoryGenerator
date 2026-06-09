import type {
  PlayerCharacter,
  Story,
  StoryMessage,
  StoryState,
  StorySummary,
  Universe,
  UniverseImport,
} from "../../types/models";
import type { AIChatMessage } from "./types";
import { sortByTimestampAsc } from "../dates";
import { getSceneWordTarget, inferSceneDepth } from "./sceneSizing";
import { extractExplicitPlayerStateHint } from "../storyText/playerState";
import {
  formatStoryLongTermMemoryForPrompt,
  formatStorySceneStateForPrompt,
} from "./storyStateExtractor";
import { safeParseStoryStateData } from "../storyStateV2";

const MAX_IMPORTED_LORE_CHARS = 12000;
const MAX_RECENT_MESSAGES = 30;

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatTimelineMessage(
  message: StoryMessage,
  playerCharacterName: string,
): AIChatMessage {
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
    return {
      role: "assistant",
      content: normalizeWhitespace(`Narrator: ${message.content}`),
    };
  }

  return { role: "assistant", content: normalizeWhitespace(message.content) };
}

export interface BuildStoryChatContextInput {
  universe: Universe;
  story: Story;
  playerCharacter: PlayerCharacter;
  imports: UniverseImport[];
  summaries: StorySummary[];
  storyState?: StoryState | null;
  recentMessages: StoryMessage[];
  latestUserMessage: string;
}

export function buildStoryChatContext({
  universe,
  story,
  playerCharacter,
  imports,
  summaries,
  storyState,
  recentMessages,
  latestUserMessage,
}: BuildStoryChatContextInput): AIChatMessage[] {
  const sceneDepth = inferSceneDepth(latestUserMessage);
  const wordTarget = getSceneWordTarget(sceneDepth);
  const mostRecentImport = imports[0];
  const latestSummary = story.currentSummary.trim() || summaries[0]?.summary?.trim() || "";
  const playerStateHint = extractExplicitPlayerStateHint({
    playerName: playerCharacter.name,
    recentMessages,
  });

  const universeMode = universe.mode ?? "referenced";
  const universeConcept = universe.concept?.trim() || universe.description.trim();
  const universeBlueprint = universe.universeBlueprint?.trim() || "";

  const universeInfo = normalizeWhitespace(
    [
      `Universe Name: ${universe.name}`,
      `Universe Mode: ${universeMode}`,
      universeMode === "custom" && universeConcept ? `Universe Concept: ${universeConcept}` : "",
      universeMode === "custom" && universe.genreTheme?.trim()
        ? `Genre/Theme: ${universe.genreTheme.trim()}`
        : "",
      universeMode === "custom" && universe.tone?.trim() ? `Tone: ${universe.tone.trim()}` : "",
      universeMode === "custom" && universeBlueprint
        ? `Universe Blueprint:\n\n${universeBlueprint}`
        : "",
      universeMode === "referenced" && universe.wikiUrl.trim()
        ? `Reference URL: ${universe.wikiUrl.trim()}`
        : "",
      universeMode === "referenced" && universe.notes?.trim() ? `Notes: ${universe.notes.trim()}` : "",
      `Story Title: ${story.title}`,
      `Player Character: ${playerCharacter.name}`,
      playerCharacter.gender.trim() ? `Player Gender: ${playerCharacter.gender.trim()}` : "",
      playerCharacter.species?.trim()
        ? `Player Species: ${playerCharacter.species.trim()}`
        : "",
      playerCharacter.pronouns.trim() ? `Player Pronouns: ${playerCharacter.pronouns.trim()}` : "",
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

  const storyStateBlock = (() => {
    const json = storyState?.stateJson?.trim();
    if (!json) {
      return { longTerm: "No long-term memory is recorded yet.", scene: "" };
    }

    const parsed = safeParseStoryStateData(json);
    if (!parsed) {
      return { longTerm: "Story state is present but could not be parsed.", scene: "" };
    }

    return {
      longTerm:
        formatStoryLongTermMemoryForPrompt(parsed) || "No long-term memory is recorded yet.",
      scene: formatStorySceneStateForPrompt(parsed),
    };
  })();

  const sceneGuidance = normalizeWhitespace(
    [
      "Core philosophy: the player is the author. You portray the world: canon characters, NPCs, locations, and consequences.",
      "The transcript is canon and defines the authoritative state. Expand the player's setup rather than replacing it.",
      "Do not automatically introduce cases, missions, mysteries, assignments, emergencies, villains, or conflicts simply because the story has started.",
      "Character interaction alone is a valid scene.",
      "Name resolution rule: treat nicknames, shortened names, last-name references, and informal variants as referring to the same character unless the story explicitly introduces a separate person.",
      "Use Long-Term Memory name preferences: if a character has a displayName or aliases recorded, prefer the displayName for speaker headers and how other characters address them.",
      "Formality rule: if identity and familiarity are established, prefer first names over formal titles (Detective/Doctor/Captain) unless the scene is explicitly formal or a title is being used for emphasis.",
      "If the player introduces an unknown situation, unidentified person, undisclosed discovery, unexplained emergency, mystery, secret, or unusual event, do not invent or reveal the underlying explanation. React, investigate, speculate, and ask questions, but do not resolve the mystery unless the player explicitly provides the answer.",
      "Information ownership: do not invent facts that could only have been communicated by the player character off-screen. If NPCs lack details, they must ask clarifying questions instead of asserting specifics as if the player already said them.",
      "Never put words in the player's mouth. Do not write lines like 'You're saying X' / 'You said X' unless X is explicitly present in the player's message or already established in prior story events/state.",
      "Treat the player's latest message as canon scene state that has already happened. Do not re-describe it in different words. Continue from the next beat: reactions, consequences, and new information from the world.",
      "You are generating a collaborative story scene inside the universe above.",
      "Assume the scene persists between messages. Do not reintroduce unchanged environments or participants.",
      playerStateHint
        ? `Player State (explicit): ${playerStateHint}`
        : "Preserve all explicitly stated player character states (absent, silent, travelling, waiting, etc.).",
      `Scene depth: ${sceneDepth}. Target length: ${wordTarget.minWords}-${wordTarget.maxWords} words.`,
      sceneDepth === "light"
        ? "Light interaction: prioritize dialogue and character voice; keep narration minimal; no scene resets; only brief actions when necessary."
        : sceneDepth === "major"
          ? "Major scene: allow richer emotion and escalation, but stay anchored in the current scene; no unnecessary re-establishing shots."
          : "Standard scene: balanced dialogue and narration; advance the moment naturally without over-writing routine beats.",
      "One player message equals one scene. A scene can include multiple speakers, narration, actions, and scene progression.",
      "Dynamically choose which canon characters are present and react based on context. Not everyone needs to speak; silence can matter.",
      "Prioritize character interactions and relationships over environment description.",
      "Character authenticity is the highest priority. Characters must sound like themselves.",
      "Maintain character authenticity: personality, speech patterns, relationships, and emotional continuity.",
      "Relationship awareness: characters should behave differently depending on who they are speaking to and their power dynamics.",
      "Avoid generic AI phrasing; match each character's cadence, vocabulary, humor/formality, and emotional baseline.",
      "Do not generate suggested player lines or options unless explicitly asked via Player Assist. Focus on canon characters, NPCs, and narration.",
      "Drive the story forward with complications, discoveries, and tension, but never remove player agency.",
      "Never move, speak for, think for, feel for, or act on behalf of the player character.",
      "Never introduce the player character into the scene unless the transcript/story state or the player's latest message established them there. Do not narrate the player character arriving, acting, speaking, thinking, or reacting.",
      "When the player character is present, other characters may address them, but always wait for the player's response.",
      "Asterisks are reserved exclusively for actions. Never use asterisks for emphasis, sarcasm, or formatting.",
      "Actions should read like prose, not stage directions. Avoid repetitive filler actions (nods/looks/shrugs) unless truly warranted.",
      "Interpret any *...* text in the conversation as an action and react to it naturally.",
      "When an unknown person is required, generate a new NPC instead of pulling a canon character by default.",
      "Canon characters should appear only if already present, introduced by the player, or logically located in the scene.",
      "Output format guidance:",
      "- Use speaker headers like 'Jake:' and 'Amy:' on their own line when switching speakers.",
      "- Use 'Narrator:' only for pure scene-setting/environment narration. Do not use Narrator lines to describe character actions when a character is the actor.",
      "- When a character acts, write it as *...* within that character's block (immediately under their name) instead of as third-person narration.",
      "- Place actions as *...* on their own line between dialogue lines. Actions should be full sentences.",
      '- When writing dialogue, prefer quoted lines like "So what now?" on their own line.',
    ].join("\n"),
  );

  const recentWindow =
    summaryBlock !== "No story summary is available yet." && storyState?.stateJson?.trim()
      ? 14
      : MAX_RECENT_MESSAGES;

  const chatHistory = sortByTimestampAsc(recentMessages)
    .slice(-recentWindow)
    .map((message) => formatTimelineMessage(message, playerCharacter.name));

  return [
    { role: "system", content: `Universe Information\n\n${universeInfo}` },
    { role: "system", content: `Imported Lore\n\n${importedLore}` },
    { role: "system", content: `Story Summary\n\n${summaryBlock}` },
    { role: "system", content: `Long-Term Memory\n\n${storyStateBlock.longTerm}` },
    ...(storyStateBlock.scene
      ? [{ role: "system" as const, content: `Current Scene State\n\n${storyStateBlock.scene}` }]
      : []),
    { role: "system", content: `Scene Direction\n\n${sceneGuidance}` },
    ...chatHistory,
    { role: "user", content: normalizeWhitespace(latestUserMessage) },
  ];
}

export function buildStorySummaryContext({
  storyTitle,
  playerCharacterName,
  messages,
}: {
  storyTitle: string;
  playerCharacterName: string;
  messages: StoryMessage[];
}): AIChatMessage[] {
  const chatHistory = sortByTimestampAsc(messages)
    .slice(-MAX_RECENT_MESSAGES)
    .map((message) => formatTimelineMessage(message, playerCharacterName));

  return [{ role: "system", content: `Conversation transcript for "${storyTitle}".` }, ...chatHistory];
}
