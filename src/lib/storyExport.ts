import type {
  ExportFormat,
  PlayerCharacter,
  StoryExportBundle,
  StoryMessage,
} from "../types/models";
import { formatDateTime } from "./dates";

function resolveSpeakerLabel(
  message: StoryMessage,
  playerCharacter: PlayerCharacter,
) {
  if (message.role === "user") {
    return playerCharacter.name;
  }

  if (message.speakerName?.trim()) {
    return message.speakerName.trim();
  }

  if (message.speakerType === "narrator") {
    return "Narrator";
  }

  if (message.role === "system" || message.speakerType === "system") {
    return "System";
  }

  return "Assistant";
}

function buildTranscriptLines(bundle: StoryExportBundle) {
  return bundle.messages.map((message) => {
    const speaker = resolveSpeakerLabel(message, bundle.playerCharacter);
    return `[${formatDateTime(message.timestamp)}] ${speaker}: ${message.content}`;
  });
}

function toJson(bundle: StoryExportBundle) {
  return JSON.stringify(bundle, null, 2);
}

function toMarkdown(bundle: StoryExportBundle) {
  const transcript = bundle.messages
    .map((message) => {
      const speaker = resolveSpeakerLabel(message, bundle.playerCharacter);
      return `### ${speaker}\n\n${message.content}\n\n*${formatDateTime(message.timestamp)}*`;
    })
    .join("\n\n");

  return `# ${bundle.story.title}

## Story

- Universe: ${bundle.universe.name}
- Player Character: ${bundle.playerCharacter.name}
- Created: ${formatDateTime(bundle.story.createdAt)}
- Updated: ${formatDateTime(bundle.story.updatedAt)}

## Opening Prompt

${bundle.story.openingPrompt}

## Current Summary

${bundle.story.currentSummary || "_No summary yet._"}

## Universe Snapshot

- Name: ${bundle.universe.name}
- Wiki URL: ${bundle.universe.wikiUrl || "Not provided"}
- Description: ${bundle.universe.description || "No description"}

## Player Character Snapshot

- Name: ${bundle.playerCharacter.name}
- Age: ${bundle.playerCharacter.age || "Not specified"}
- Appearance: ${bundle.playerCharacter.appearance || "Not specified"}
- Personality: ${bundle.playerCharacter.personality || "Not specified"}
- Background: ${bundle.playerCharacter.background || "Not specified"}
- Goals: ${bundle.playerCharacter.goals || "Not specified"}
- Notes: ${bundle.playerCharacter.notes || "Not specified"}

## Transcript

${transcript || "_No conversation history yet._"}
`;
}

function toText(bundle: StoryExportBundle) {
  return `${bundle.story.title}

Story
- Universe: ${bundle.universe.name}
- Player Character: ${bundle.playerCharacter.name}
- Created: ${formatDateTime(bundle.story.createdAt)}
- Updated: ${formatDateTime(bundle.story.updatedAt)}

Opening Prompt
${bundle.story.openingPrompt}

Current Summary
${bundle.story.currentSummary || "No summary yet."}

Universe
- Name: ${bundle.universe.name}
- Wiki URL: ${bundle.universe.wikiUrl || "Not provided"}
- Description: ${bundle.universe.description || "No description"}

Player Character
- Name: ${bundle.playerCharacter.name}
- Age: ${bundle.playerCharacter.age || "Not specified"}
- Appearance: ${bundle.playerCharacter.appearance || "Not specified"}
- Personality: ${bundle.playerCharacter.personality || "Not specified"}
- Background: ${bundle.playerCharacter.background || "Not specified"}
- Goals: ${bundle.playerCharacter.goals || "Not specified"}
- Notes: ${bundle.playerCharacter.notes || "Not specified"}

Transcript
${buildTranscriptLines(bundle).join("\n") || "No conversation history yet."}
`;
}

export function serializeStoryExport(
  bundle: StoryExportBundle,
  format: ExportFormat,
) {
  if (format === "json") {
    return { content: toJson(bundle), mimeType: "application/json" };
  }

  if (format === "markdown") {
    return { content: toMarkdown(bundle), mimeType: "text/markdown" };
  }

  return { content: toText(bundle), mimeType: "text/plain" };
}

