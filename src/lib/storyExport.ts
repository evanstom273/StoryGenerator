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
  // Story Index is derived/rebuildable narrative memory, not portable story content.
  const { storyIndex: _storyIndex, ...portableBundle } = bundle;
  return JSON.stringify(portableBundle, null, 2);
}

function toMarkdown(bundle: StoryExportBundle) {
  const lines: string[] = [];

  lines.push(`# ${bundle.story.title}`);
  lines.push("");
  lines.push("## Story Details");
  lines.push(`- **Universe:** ${bundle.universe.name}`);
  lines.push(`- **Player Character:** ${bundle.playerCharacter.name}`);
  lines.push(`- **Created:** ${formatDateTime(bundle.story.createdAt)}`);
  lines.push(`- **Updated:** ${formatDateTime(bundle.story.updatedAt)}`);
  lines.push("");

  lines.push("## Universe");
  lines.push(`- **Name:** ${bundle.universe.name}`);
  lines.push(`- **Wiki URL:** ${bundle.universe.wikiUrl || "Not provided"}`);
  lines.push(`- **Description:** ${bundle.universe.description || "No description"}`);
  lines.push("");

  lines.push("## Player Character");
  lines.push(`- **Name:** ${bundle.playerCharacter.name}`);
  lines.push(`- **Age:** ${bundle.playerCharacter.age || "Not specified"}`);
  lines.push(`- **Gender:** ${bundle.playerCharacter.gender || "Not specified"}`);
  lines.push(`- **Species:** ${bundle.playerCharacter.species || "Not specified"}`);
  lines.push(`- **Pronouns:** ${bundle.playerCharacter.pronouns || "Not specified"}`);
  lines.push(`- **Appearance:** ${bundle.playerCharacter.appearance || "Not specified"}`);
  lines.push(`- **Personality:** ${bundle.playerCharacter.personality || "Not specified"}`);
  lines.push(`- **Background:** ${bundle.playerCharacter.background || "Not specified"}`);
  lines.push(`- **Goals:** ${bundle.playerCharacter.goals || "Not specified"}`);
  const aliases = normalizePlayerCharacterAliases(bundle.playerCharacter.aliases);
  if (aliases.length) {
    lines.push(`- **Aliases:** ${aliases.join(", ")}`);
  }
  const ties = normalizePlayerCharacterKnownTies(bundle.playerCharacter.knownTies);
  if (ties.length) {
    lines.push(`- **Known ties:** ${ties.join("; ")}`);
  }
  lines.push(`- **Notes:** ${bundle.playerCharacter.notes || "Not specified"}`);
  lines.push("");


  lines.push("## Transcript");
  lines.push("");
  const transcript = buildTranscriptLines(bundle);
  lines.push(transcript.length ? transcript.join("\n") : "No conversation history yet.");
  lines.push("");

  return lines.join("\n");
}

function toText(bundle: StoryExportBundle) {
  let text = `${bundle.story.title}

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
`;


  text += `
Transcript
${buildTranscriptLines(bundle).join("\n") || "No conversation history yet."}
`;

  return text;
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
