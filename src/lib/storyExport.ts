import type {
  ExportFormat,
  PlayerCharacter,
  StoryExportBundle,
  StoryMessage,
} from "../types/models";
import { formatDateTime } from "./dates";
import { serializeStoryExportPdf } from "./storyExportPdf";
import { parseSceneBlocks } from "./storyText/parseSceneBlocks";
import { parseActionSegments } from "./storyText/parseActionSegments";
import { sanitizeAssistantTranscript } from "./storyText/transcriptSanitizer";

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
    return "";
  }

  if (message.role === "system" || message.speakerType === "system") {
    return "System";
  }

  return "Assistant";
}

function buildTranscriptLines(bundle: StoryExportBundle) {
  return bundle.messages.map((message) => {
    const speaker = resolveSpeakerLabel(message, bundle.playerCharacter);
    const prefix = speaker ? `${speaker}: ` : "";
    const content =
      message.role === "assistant"
        ? sanitizeAssistantTranscript({
            text: message.content,
            playerName: bundle.playerCharacter.name,
          }).text
        : message.content;
    const plain = parseActionSegments(content)
      .map((segment) => segment.text)
      .join("")
      .replace(/\*\*/g, "");
    return `[${formatDateTime(message.timestamp)}] ${prefix}${plain}`;
  });
}

function toJson(bundle: StoryExportBundle) {
  return JSON.stringify(bundle, null, 2);
}

function toMarkdown(bundle: StoryExportBundle) {
  let latestUserMessage: string | null = null;

  const transcript = bundle.messages
    .map((message) => {
      if (message.role === "user") {
        latestUserMessage = message.content;
        return [
          `${bundle.playerCharacter.name}:`,
          "",
          message.content,
          "",
          `Time: ${formatDateTime(message.timestamp)}`,
        ].join("\n");
      }

      if (message.role === "system" || message.speakerType === "system") {
        return [
          "System:",
          "",
          message.content,
          "",
          `Time: ${formatDateTime(message.timestamp)}`,
        ].join("\n");
      }

      const sanitized = sanitizeAssistantTranscript({
        text: message.content,
        latestUserMessage,
        playerName: bundle.playerCharacter.name,
      }).text;
      const blocks = parseSceneBlocks(sanitized);

      const blockText = blocks
        .map((block) => {
          const isNarration = !block.speakerLabel || block.speakerLabel === "Narrator";
          const lines = block.text.split("\n").map((line) => line.trim());

          const formattedLines = lines
            .filter(Boolean)
            .map((line) => {
              const isActionLine =
                line.startsWith("*") && line.endsWith("*") && line.length > 2;

              if (isActionLine) {
                return line;
              }

              if (isNarration) {
                return `*${line.replace(/^\*+|\*+$/g, "")}*`;
              }

              return line;
            });

          if (isNarration) {
            return formattedLines.join("\n");
          }

          return `${block.speakerLabel}: ${formattedLines.join(" ")}`.trim();
        })
        .filter(Boolean)
        .join("\n\n");

      return [blockText, "", `Time: ${formatDateTime(message.timestamp)}`].join("\n");
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
