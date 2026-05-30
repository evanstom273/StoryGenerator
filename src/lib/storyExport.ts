import type {
  ExportFormat,
  PlayerCharacter,
  StoryExportBundle,
  StoryMessage,
} from "../types/models";
import { formatDateTime } from "./dates";
import { serializeStoryExportPdf } from "./storyExportPdf";

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
      return `### ${speaker}\n\n${message.content}\n\nTime: ${formatDateTime(message.timestamp)}`;
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
- Gender: ${bundle.playerCharacter.gender || "Not specified"}
- Pronouns: ${bundle.playerCharacter.pronouns || "Not specified"}
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
- Gender: ${bundle.playerCharacter.gender || "Not specified"}
- Pronouns: ${bundle.playerCharacter.pronouns || "Not specified"}
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
  const exporters: Record<
    ExportFormat,
    { serialize: (data: StoryExportBundle) => BlobPart; mimeType: string }
  > = {
    json: { serialize: toJson, mimeType: "application/json" },
    markdown: { serialize: toMarkdown, mimeType: "text/markdown" },
    txt: { serialize: toText, mimeType: "text/plain" },
    pdf: { serialize: serializeStoryExportPdf, mimeType: "application/pdf" },
  };

  const exporter = exporters[format] ?? exporters.txt;
  return { content: exporter.serialize(bundle), mimeType: exporter.mimeType };
}
