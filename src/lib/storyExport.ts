import type {
  ExportFormat,
  PlayerCharacter,
  StoryExportBundle,
  StoryMessage,
  StoryStateData,
} from "../types/models";
import { formatDateTime } from "./dates";
import { serializeStoryExportPdf } from "./storyExportPdf";
import { serializeStoryArchivePdf } from "./storyArchivePdf";
import { serializeStoryArchiveMarkdown } from "./storyArchiveMarkdown";
import { parseActionSegments } from "./storyText/parseActionSegments";
import { isAuthorDirectiveMessage } from "./storyText/authorDirectives";
import { isContinueMessage } from "./storyText/continueMode";
import { sanitizeAssistantTranscript } from "./storyText/transcriptSanitizer";
import { cleanTextForExport } from "./storyText/exportCleaner";
import { isDirectorMessage } from "./storyText/directorMode";

function resolveCurrentSummary(bundle: StoryExportBundle) {
  const direct = bundle.story.currentSummary?.trim();
  if (direct) {
    return direct;
  }

  const stateJson = bundle.storyState?.stateJson;
  if (!stateJson) {
    return "";
  }

  try {
    const parsed = JSON.parse(stateJson) as StoryStateData;
    const worldSummary = parsed?.summaries?.worldSummary;
    if (typeof worldSummary === "string" && worldSummary.trim()) {
      return worldSummary.trim();
    }
  } catch {}

  return "";
}

function normalizeBundleForExport(bundle: StoryExportBundle) {
  const resolvedSummary = resolveCurrentSummary(bundle);

  if (resolvedSummary && bundle.story.currentSummary !== resolvedSummary) {
    return {
      ...bundle,
      story: {
        ...bundle.story,
        currentSummary: resolvedSummary,
      },
    };
  }

  return bundle;
}

function resolveSpeakerLabel(
  message: StoryMessage,
  playerCharacter: PlayerCharacter,
) {
  if (message.role === "user") {
    if (isAuthorDirectiveMessage(message)) {
      return message.speakerName?.trim() || "Author";
    }

    if (isContinueMessage(message)) {
      return "Continue";
    }

    if (isDirectorMessage(message)) {
      return "Director";
    }

    return message.speakerName?.trim() || playerCharacter.name;
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
            text: cleanTextForExport(message.content),
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
  return serializeStoryArchiveMarkdown(bundle);
}

function toText(bundle: StoryExportBundle) {
  return `${bundle.story.title}

Story
- Universe: ${bundle.universe.name}
- Player Character: ${bundle.playerCharacter.name}
- Created: ${formatDateTime(bundle.story.createdAt)}
- Updated: ${formatDateTime(bundle.story.updatedAt)}

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
- Species: ${bundle.playerCharacter.species || "Not specified"}
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
  const normalizedBundle = normalizeBundleForExport(bundle);
  const exporters: Record<
    ExportFormat,
    { serialize: (data: StoryExportBundle) => BlobPart; mimeType: string }
  > = {
    json: { serialize: toJson, mimeType: "application/json" },
    markdown: { serialize: toMarkdown, mimeType: "text/markdown" },
    txt: { serialize: toText, mimeType: "text/plain" },
    pdf: { serialize: serializeStoryExportPdf, mimeType: "application/pdf" },
    archive_pdf: {
      serialize: (data) => serializeStoryArchivePdf(data).content as unknown as BlobPart,
      mimeType: "application/pdf",
    },
  };

  const exporter = exporters[format] ?? exporters.txt;
  return { content: exporter.serialize(normalizedBundle), mimeType: exporter.mimeType };
}
