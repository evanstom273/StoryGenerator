import { DIRECTOR_SPEAKER_LABEL } from "../storyText/directorMode";
import { formatDirectorNoteAuthoringGuidance } from "../storyText/directorSyntax";
import { polishDirectorBeatStaging } from "../guidedChapterGeneration/directorBeatPolish";

export function buildPlayerAssistRequest(playerCharacterName: string) {
  return [
    "Player Assist request:",
    `Write the next message for the player character: ${playerCharacterName}.`,
    "Output ONLY the player's message in the Story Engine format.",
    "Do not add commentary, options, or extra text.",
    "Do not write narration and do not write for any other speakers.",
    "Do not continue the scene beyond the player's turn.",
    "Formatting requirements:",
    `- First line: ${playerCharacterName}:`,
    "- Next lines (optional):",
    "- *Action.*",
    '- "Dialogue."',
    "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
  ].join("\n");
}

export function buildPlayerAssistContinuationRequest(
  playerCharacterName: string,
  existingText: string,
) {
  return [
    "Player Assist request:",
    `Continue the player's next message for the player character: ${playerCharacterName}.`,
    "The user has already started writing the message below. Treat it as the exact beginning of the player's message.",
    "Do NOT repeat any of the existing text. Do NOT rewrite it. Do NOT output the speaker label again.",
    "Output ONLY the continuation text to append after the existing text. No commentary. No other speakers. No narration.",
    "If the existing text ends with an open delimiter (for example *, \", ', or Name: *), continue inline immediately after it.",
    'Example: `Alex Rivera: *` should continue as `I let out a breath...`, not as a new paragraph.',
    "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
    "",
    "Existing text (do not repeat):",
    "```",
    existingText.replace(/\r\n/g, "\n"),
    "```",
  ].join("\n");
}

export function buildDirectorAssistRequest(playerCharacterName: string) {
  return [
    "Director Assist request:",
    "Write the next Director staging note for the story.",
    "A Director note tells the AI how to stage the next scene — who is present, what happens, and any key beats.",
    "Output ONLY the Director note. No commentary, options, or extra text.",
    formatDirectorNoteAuthoringGuidance(),
    "- Advance the story from where the transcript left off. Do not repeat or summarize the last scene.",
    `Keep the player character (${playerCharacterName}) consistent with canon and the current scene state.`,
  ].join("\n\n");
}

export function buildDirectorAssistContinuationRequest(existingText: string) {
  return [
    "Director Assist request:",
    "Continue the Director staging note the user has started writing below.",
    "The user has already started writing. Treat it as the exact beginning of the Director note.",
    "Do NOT repeat any of the existing text. Do NOT rewrite it. Do NOT output the 'Director:' prefix again if it is already present.",
    "Output ONLY the continuation text to append after the existing text. No commentary.",
    "If the existing text ends with an open delimiter (for example *, \", ', or Director: *), continue inline immediately after it.",
    'Example: `Director: *` should continue as `Morgan steps into the room...`, not as a new `Director:` line.',
    "",
    "Existing text (do not repeat):",
    "```",
    existingText.replace(/\r\n/g, "\n"),
    "```",
  ].join("\n");
}

export function formatDirectorAssistOutput(raw: string): string {
  let content = raw.trim();
  if (!content) {
    return `${DIRECTOR_SPEAKER_LABEL}: `;
  }

  content = content.replace(/^\s*Director:\s*/i, "").trim();
  const polished = polishDirectorBeatStaging(content);
  const beat = polished ?? `*${content.replace(/^\*+|\*+$/g, "").trim()}*`;

  return `${DIRECTOR_SPEAKER_LABEL}: ${beat}`;
}

export function formatDirectorAssistContinuation(raw: string, existingText: string): string {
  const trimmedExisting = existingText.trimEnd();
  const normalizedRaw = raw.replace(/\r\n/g, "\n");
  const normalizedExisting = trimmedExisting.replace(/\r\n/g, "\n");

  if (normalizedRaw.startsWith(normalizedExisting)) {
    return normalizedRaw.slice(normalizedExisting.length).trimStart();
  }

  if (/^\s*Director:/i.test(trimmedExisting) && /^\s*Director:\s*/i.test(normalizedRaw)) {
    return normalizedRaw.replace(/^\s*Director:\s*/i, "").trimStart();
  }

  return raw;
}
