import type { ExportFormat, PlayerCharacter, StoryExportBundle, StoryMessage } from "../types/models";
import { formatDateTime } from "./dates";
import { serializeStoryExportPdf } from "./storyExportPdf";
import { parseActionSegments } from "./storyText/parseActionSegments";
import { parseSceneBlocks } from "./storyText/parseSceneBlocks";
import {
  normalizePlayerCharacterAliases,
  normalizePlayerCharacterKnownTies,
  resolvePlayerCharacterSceneName,
} from "./playerCharacterPrompt";
import { resolveUserTranscriptSpeaker } from "./storyText/directorMode";

function resolveSpeakerLabel(
  message: StoryMessage,
  playerCharacter: PlayerCharacter,
  playerSceneName?: string,
) {
  if (message.role === "user") {
    return resolveUserTranscriptSpeaker(message, {
      legalName: playerCharacter.name,
      sceneName: playerSceneName,
    });
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
  const playerSceneName = resolvePlayerCharacterSceneName(bundle.playerCharacter, {
    recentMessages: bundle.messages,
  });

  return bundle.messages.flatMap((message) => {
    const timestamp = `[${formatDateTime(message.timestamp)}] `;
    if (message.role !== "assistant") {
      const speaker = resolveSpeakerLabel(message, bundle.playerCharacter, playerSceneName);
      const prefix = speaker ? `${speaker}: ` : "";
      const plain = parseActionSegments(message.content)
        .map((segment) => segment.text)
        .join("")
        .replace(/\*\*/g, "");
      return [`${timestamp}${prefix}${plain}`];
    }

    const metadataSpeaker = resolveSpeakerLabel(message, bundle.playerCharacter, playerSceneName);
    return parseSceneBlocks(message.content).map((block) => {
      const blockSpeaker = block.speakerLabel?.trim();
      const speaker = blockSpeaker && !/^narrator$/i.test(blockSpeaker)
        ? blockSpeaker
        : !blockSpeaker && !/^narrator$/i.test(metadataSpeaker) && metadataSpeaker !== "Assistant"
          ? metadataSpeaker
          : "";
      const prefix = speaker ? `${speaker}: ` : "";
      const plain = parseActionSegments(block.text)
        .map((segment) => segment.text)
        .join("")
        .replace(/\*\*/g, "");
      return `${timestamp}${prefix}${plain}`;
    });
  });
}

function toJson(bundle: StoryExportBundle) {
  return JSON.stringify(bundle, null, 2);
}

function toMarkdown(bundle: StoryExportBundle) {
  return toText(bundle);
}

function toText(bundle: StoryExportBundle) {
  return `${bundle.story.title}

Story
- Universe: ${bundle.universe.name}
- Player Character: ${bundle.playerCharacter.name}
- Created: ${formatDateTime(bundle.story.createdAt)}
- Updated: ${formatDateTime(bundle.story.updatedAt)}

Universe
- Name: ${bundle.universe.name}
- Wiki URL: ${bundle.universe.wikiUrl || "Not provided"}
- Description: ${bundle.universe.description || "No description"}

Player Character
- Name: ${bundle.playerCharacter.name}
- Age: ${bundle.playerCharacter.age || "Not specified"}
- Gender: ${bundle.playerCharacter.gender || "Not specified"}
- Species: ${bundle.playerCharacter.species || "Not specified"}
- Pronouns: ${bundle.playerCharacter.pronouns || "Not specified"}
- Appearance: ${bundle.playerCharacter.appearance || "Not specified"}
- Personality: ${bundle.playerCharacter.personality || "Not specified"}
- Background: ${bundle.playerCharacter.background || "Not specified"}
- Goals: ${bundle.playerCharacter.goals || "Not specified"}
${normalizePlayerCharacterAliases(bundle.playerCharacter.aliases).length ? `- Aliases: ${normalizePlayerCharacterAliases(bundle.playerCharacter.aliases).join(", ")}` : ""}
${normalizePlayerCharacterKnownTies(bundle.playerCharacter.knownTies).length ? `- Known ties: ${normalizePlayerCharacterKnownTies(bundle.playerCharacter.knownTies).join("; ")}` : ""}
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
