import type { PlayerCharacter, StoryExportBundle, StoryMessage } from "../types/models";
import { formatDateTime } from "./dates";
import { safeParseStoryStateData, normalizeStoryStateToV2 } from "./storyStateV2";
import { parseSceneBlocks } from "./storyText/parseSceneBlocks";
import { sanitizeAssistantTranscript } from "./storyText/transcriptSanitizer";
import { cleanTextForExport } from "./storyText/exportCleaner";
import { isDirectorMessage } from "./storyText/directorMode";
import {
  createPdfDoc,
  pdfDimensions,
  heading,
  body,
  metaLine,
  speakerLine,
  rule,
  checkPage,
  PDF_MARGIN,
} from "./pdfLayout";

function resolveSpeakerLabel(message: StoryMessage, playerCharacter: PlayerCharacter): string {
  if (message.role === "user") {
    if (isDirectorMessage(message)) return "Director";
    return message.speakerName?.trim() || playerCharacter.name;
  }
  if (message.speakerName?.trim()) return message.speakerName.trim();
  if (message.speakerType === "narrator") return "Narrator";
  if (message.role === "system" || message.speakerType === "system") return "System";
  return "Narrator";
}

export function serializeStoryExportPdf(bundle: StoryExportBundle): ArrayBuffer {
  const doc = createPdfDoc();
  const { pageW, pageH } = pdfDimensions(doc);
  let y = PDF_MARGIN;

  const storyStateData = (() => {
    const json = bundle.storyState?.stateJson?.trim() ?? "";
    if (!json) return null;
    return normalizeStoryStateToV2(safeParseStoryStateData(json));
  })();

  // ── Title ────────────────────────────────────────────────────────────────
  y = heading(doc, y, bundle.story.title, 18, pageH);
  y = rule(doc, y, pageW);

  y = metaLine(doc, y, "Universe", bundle.universe.name, pageH);
  y = metaLine(doc, y, "Protagonist", bundle.playerCharacter.name, pageH);
  y = metaLine(doc, y, "Exported", formatDateTime(bundle.exportedAt), pageH);
  y += 16;

  // ── Summary ──────────────────────────────────────────────────────────────
  const summaryText =
    bundle.story.currentSummary?.trim() || storyStateData?.summaries?.worldSummary?.trim() || "";
  if (summaryText) {
    y = rule(doc, y, pageW);
    y += 12;
    y = heading(doc, y, "Summary", 14, pageH);
    y = body(doc, y, summaryText, 0, undefined, pageH);
    y += 8;
  }

  // ── Transcript ───────────────────────────────────────────────────────────
  y = rule(doc, y, pageW);
  y += 12;
  y = heading(doc, y, "Transcript", 14, pageH);
  y = rule(doc, y, pageW);
  y += 8;

  let latestUserMessage: string | null = null;

  for (const message of bundle.messages) {
    if (message.role === "system") continue;

    if (message.role === "user") {
      latestUserMessage = message.content;
      const speaker = resolveSpeakerLabel(message, bundle.playerCharacter);
      y = speakerLine(doc, y, speaker, message.content, pageH);
    } else {
      const sanitized = sanitizeAssistantTranscript({
        text: cleanTextForExport(message.content),
        latestUserMessage,
        playerName: bundle.playerCharacter.name,
      }).text;
      const blocks = parseSceneBlocks(sanitized);

      for (const block of blocks) {
        const speaker = block.speakerLabel || "Narrator";
        y = speakerLine(doc, y, speaker, block.text, pageH);
      }
    }

    y += 8;
    y = checkPage(doc, y, pageH, 10);
    y = rule(doc, y, pageW);
    y += 10;
  }

  return doc.output("arraybuffer") as ArrayBuffer;
}
