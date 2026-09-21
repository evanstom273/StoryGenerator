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

  if (bundle.storyIndex) {
    const idx = bundle.storyIndex;
    lines.push("## Story Index");
    lines.push("");

    lines.push("### Chapter Summaries");
    lines.push("");
    if (idx.chapterSummaries.length === 0) {
      lines.push("*No chapter summaries indexed.*");
      lines.push("");
    } else {
      for (const ch of idx.chapterSummaries) {
        lines.push(`#### ${ch.chapterLabel}`);
        lines.push(`*Source messages: ${ch.sourceMessageIds.length}*`);
        lines.push("");
        lines.push(ch.summary.trim());
        lines.push("");
      }
    }

    lines.push("### Characters");
    lines.push("");
    if (idx.characters.length === 0) {
      lines.push("*No characters indexed.*");
      lines.push("");
    } else {
      for (const char of idx.characters) {
        const status = char.status ? ` (${char.status})` : "";
        lines.push(`#### ${char.canonicalName}${status}`);
        lines.push(`- **Aliases:** ${char.aliases.length ? char.aliases.join(", ") : "None"}`);
        if (char.description) {
          lines.push(`- **Description:** ${char.description}`);
        }
        if (char.developments.length) {
          lines.push("- **Key Developments:**");
          for (const dev of char.developments) {
            lines.push(`  - ${dev}`);
          }
        }
        lines.push(`- **Provenance:** ${char.provenance.length} source message${char.provenance.length === 1 ? "" : "s"}`);
        lines.push("");
      }
    }

    lines.push("### Relationships");
    lines.push("");
    if (idx.relationships.length === 0) {
      lines.push("*No relationships indexed.*");
      lines.push("");
    } else {
      const charMap = new Map(idx.characters.map((c) => [c.id, c.canonicalName]));
      // Prefer the Story Index's current canonical identity. Only fall back to
      // the original player-character sheet name if the protagonist has no
      // indexed character record yet.
      if (bundle.playerCharacter && !charMap.has(bundle.playerCharacter.id)) {
        charMap.set(bundle.playerCharacter.id, bundle.playerCharacter.name);
      }
      for (const rel of idx.relationships) {
        const nameA = charMap.get(rel.characterIdA) || rel.characterIdA;
        const nameB = charMap.get(rel.characterIdB) || rel.characterIdB;
        const state = rel.state ? ` (${rel.state})` : "";
        lines.push(`#### ${nameA} & ${nameB}${state}`);
        lines.push(`- **Nature:** ${rel.nature}`);
        if (rel.developments.length) {
          lines.push("- **Key Developments:**");
          for (const dev of rel.developments) {
            lines.push(`  - ${dev}`);
          }
        }
        lines.push(`- **Provenance:** ${rel.provenance.length} source message${rel.provenance.length === 1 ? "" : "s"}`);
        lines.push("");
      }
    }
  }

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

  if (bundle.storyIndex) {
    const idx = bundle.storyIndex;
    text += `
Story Index

Chapter Summaries:
${idx.chapterSummaries.length ? idx.chapterSummaries.map((ch) => `[${ch.chapterLabel}] (${ch.sourceMessageIds.length} messages):\n${ch.summary}`).join("\n\n") : "No chapter summaries indexed."}

Characters:
${idx.characters.length ? idx.characters.map((c) => `- ${c.canonicalName}${c.status ? ` (${c.status})` : ""}\n  Aliases: ${c.aliases.join(", ") || "None"}\n  Description: ${c.description || "None"}\n  Developments: ${c.developments.join("; ") || "None"}\n  Provenance: ${c.provenance.length} messages`).join("\n\n") : "No characters indexed."}

Relationships:
${idx.relationships.length ? idx.relationships.map((r) => {
  const charMap = new Map(idx.characters.map((c) => [c.id, c.canonicalName]));
  // Prefer the Story Index's current canonical identity. Only fall back to
  // the original player-character sheet name if the protagonist has no
  // indexed character record yet.
  if (bundle.playerCharacter && !charMap.has(bundle.playerCharacter.id)) {
    charMap.set(bundle.playerCharacter.id, bundle.playerCharacter.name);
  }
  const nameA = charMap.get(r.characterIdA) || r.characterIdA;
  const nameB = charMap.get(r.characterIdB) || r.characterIdB;
  return `- ${nameA} & ${nameB}${r.state ? ` (${r.state})` : ""}\n  Nature: ${r.nature}\n  Developments: ${r.developments.join("; ") || "None"}\n  Provenance: ${r.provenance.length} messages`;
}).join("\n\n") : "No relationships indexed."}
`;
  }

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
