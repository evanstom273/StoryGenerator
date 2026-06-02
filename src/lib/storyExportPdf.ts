import { jsPDF } from "jspdf";
import type { PlayerCharacter, StoryExportBundle, StoryMessage } from "../types/models";
import { formatDateTime } from "./dates";
import { parseActionSegments } from "./storyText/parseActionSegments";
import { parseSceneBlocks } from "./storyText/parseSceneBlocks";
import { sanitizeAssistantTranscript } from "./storyText/transcriptSanitizer";

function resolveSpeakerLabel(message: StoryMessage, playerCharacter: PlayerCharacter) {
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

function isActionLine(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith("*") && trimmed.endsWith("*") && trimmed.length > 2;
}

export function serializeStoryExportPdf(bundle: StoryExportBundle): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 56;
  const marginY = 64;
  const contentWidth = pageWidth - marginX * 2;

  let y = marginY;

  function ensureSpace(nextHeight: number) {
    if (y + nextHeight <= pageHeight - marginY) {
      return;
    }
    doc.addPage();
    y = marginY;
  }

  function writeHeading(text: string, size: number) {
    doc.setFont("times", "bold");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, contentWidth);
    const lineHeight = Math.ceil(size * 1.25);
    ensureSpace(lines.length * lineHeight + 8);
    for (const line of lines) {
      doc.text(line, marginX, y);
      y += lineHeight;
    }
    y += 10;
  }

  function writeParagraph(text: string, size = 11, style: "normal" | "italic" | "bold" = "normal") {
    doc.setFont("times", style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, contentWidth);
    const lineHeight = Math.ceil(size * 1.55);
    ensureSpace(lines.length * lineHeight + 6);
    for (const line of lines) {
      doc.text(line, marginX, y);
      y += lineHeight;
    }
    y += 8;
  }

  function writeBullet(label: string, value: string) {
    const size = 11;
    doc.setFont("times", "bold");
    doc.setFontSize(size);
    const prefix = `${label}: `;
    const prefixWidth = doc.getTextWidth(prefix);
    const maxWidth = Math.max(80, contentWidth - prefixWidth);

    const wrapped = doc.splitTextToSize(value, maxWidth);
    const lineHeight = Math.ceil(size * 1.55);
    ensureSpace(wrapped.length * lineHeight + 4);

    doc.text(prefix, marginX, y);
    doc.setFont("times", "normal");
    doc.text(wrapped[0] ?? "", marginX + prefixWidth, y);
    y += lineHeight;

    for (let i = 1; i < wrapped.length; i += 1) {
      doc.text(wrapped[i] ?? "", marginX + prefixWidth, y);
      y += lineHeight;
    }

    y += 2;
  }

  writeHeading(bundle.story.title, 20);

  writeHeading("Story", 14);
  writeBullet("Universe", bundle.universe.name);
  writeBullet("Player Character", bundle.playerCharacter.name);
  writeBullet("Created", formatDateTime(bundle.story.createdAt));
  writeBullet("Updated", formatDateTime(bundle.story.updatedAt));
  y += 10;

  writeHeading("Opening Prompt", 14);
  writeParagraph(bundle.story.openingPrompt || "No opening prompt.");

  writeHeading("Current Summary", 14);
  writeParagraph(bundle.story.currentSummary || "No summary yet.");

  writeHeading("Universe Snapshot", 14);
  writeBullet("Name", bundle.universe.name);
  writeBullet("Wiki URL", bundle.universe.wikiUrl || "Not provided");
  writeBullet("Description", bundle.universe.description || "No description");
  y += 10;

  writeHeading("Player Character Snapshot", 14);
  writeBullet("Name", bundle.playerCharacter.name);
  writeBullet("Age", bundle.playerCharacter.age || "Not specified");
  writeBullet("Gender", bundle.playerCharacter.gender || "Not specified");
  writeBullet("Species", bundle.playerCharacter.species || "Not specified");
  writeBullet("Pronouns", bundle.playerCharacter.pronouns || "Not specified");
  writeBullet("Appearance", bundle.playerCharacter.appearance || "Not specified");
  writeBullet("Personality", bundle.playerCharacter.personality || "Not specified");
  writeBullet("Background", bundle.playerCharacter.background || "Not specified");
  writeBullet("Goals", bundle.playerCharacter.goals || "Not specified");
  writeBullet("Notes", bundle.playerCharacter.notes || "Not specified");
  y += 10;

  writeHeading("Transcript", 14);

  let latestUserMessage: string | null = null;

  for (const message of bundle.messages) {
    const speaker = resolveSpeakerLabel(message, bundle.playerCharacter);
    const timestamp = formatDateTime(message.timestamp);

    if (message.role === "user") {
      latestUserMessage = message.content;
    }

    if (speaker) {
      doc.setFont("times", "bold");
      doc.setFontSize(12);
      ensureSpace(24);
      doc.text(speaker, marginX, y);
      y += 18;
    }

    if (message.role === "assistant") {
      const sanitized = sanitizeAssistantTranscript({
        text: message.content,
        latestUserMessage,
        playerName: bundle.playerCharacter.name,
      }).text;
      const blocks = parseSceneBlocks(sanitized);

      for (const block of blocks) {
        const isNarration = !block.speakerLabel || block.speakerLabel === "Narrator";

        if (!isNarration && block.speakerLabel) {
          doc.setFont("times", "bold");
          doc.setFontSize(12);
          ensureSpace(18);
          doc.text(block.speakerLabel, marginX, y);
          y += 18;
        }

        const lines = block.text.replace(/\r\n/g, "\n").split("\n");
        for (const rawLine of lines) {
          const line = rawLine ?? "";
          if (!line.trim()) {
            y += 10;
            continue;
          }

          const segments = parseActionSegments(line);
          const action = isActionLine(line);
          const containsInlineAction = segments.some((segment) => segment.type === "action");
          const style: "normal" | "italic" | "bold" =
            isNarration || action || containsInlineAction ? "italic" : "normal";
          const text = segments.map((segment) => segment.text).join("").replace(/\*\*/g, "");
          writeParagraph(text, 11, style);
        }
      }
    } else {
      const lines = (message.content || "").replace(/\r\n/g, "\n").split("\n");
      for (const rawLine of lines) {
        const line = rawLine ?? "";
        if (!line.trim()) {
          y += 10;
          continue;
        }

        const segments = parseActionSegments(line);
        const containsInlineAction = segments.some((segment) => segment.type === "action");
        const text = segments.map((segment) => segment.text).join("").replace(/\*\*/g, "");
        writeParagraph(text, 11, containsInlineAction ? "italic" : "normal");
      }
    }

    doc.setFont("times", "normal");
    doc.setFontSize(10);
    ensureSpace(16);
    doc.text(`Time: ${timestamp}`, marginX, y);
    y += 18;
  }

  return doc.output("arraybuffer") as ArrayBuffer;
}
