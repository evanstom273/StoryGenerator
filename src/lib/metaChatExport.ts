import { jsPDF } from "jspdf";
import type { StoryMetaMessage } from "../types/models";
import { formatDateTime } from "./dates";
import { createMetaChatExportFilename } from "./exportFilename";

export type MetaChatExportFormat = "json" | "markdown" | "txt" | "pdf";

export { createMetaChatExportFilename };

type MetaChatExportPayload = {
  storyTitle: string;
  exportedAt: string;
  messages: StoryMetaMessage[];
};

function getMetaChatSpeakerLabel(message: StoryMetaMessage) {
  return message.role === "assistant" ? "MetaChat" : message.role === "system" ? "System" : "You";
}

function toJson(payload: MetaChatExportPayload) {
  return JSON.stringify(
    {
      kind: "meta_chat_export",
      storyTitle: payload.storyTitle,
      exportedAt: payload.exportedAt,
      messageCount: payload.messages.length,
      messages: payload.messages,
    },
    null,
    2,
  );
}

function toMarkdown(payload: MetaChatExportPayload) {
  const transcript = payload.messages
    .map((message) =>
      [
        `## ${getMetaChatSpeakerLabel(message)}`,
        "",
        message.content.trim() || "_No content_",
        "",
        `Time: ${formatDateTime(message.timestamp)}`,
      ].join("\n"),
    )
    .join("\n\n");

  return `# ${payload.storyTitle} - MetaChat

- Exported: ${formatDateTime(payload.exportedAt)}
- Message Count: ${payload.messages.length}
- Mode: Out of canon

## Transcript

${transcript || "_No MetaChat messages yet._"}
`;
}

function toText(payload: MetaChatExportPayload) {
  const transcript = payload.messages
    .map((message) => {
      const speaker = getMetaChatSpeakerLabel(message);
      return `[${formatDateTime(message.timestamp)}] ${speaker}: ${message.content.trim() || "No content"}`;
    })
    .join("\n");

  return `${payload.storyTitle} - MetaChat

Exported: ${formatDateTime(payload.exportedAt)}
Message Count: ${payload.messages.length}
Mode: Out of canon

Transcript
${transcript || "No MetaChat messages yet."}
`;
}

function toPdf(payload: MetaChatExportPayload) {
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

    for (let index = 1; index < wrapped.length; index += 1) {
      doc.text(wrapped[index] ?? "", marginX + prefixWidth, y);
      y += lineHeight;
    }

    y += 2;
  }

  writeHeading(`${payload.storyTitle} - MetaChat`, 20);
  writeHeading("Export Metadata", 14);
  writeBullet("Exported", formatDateTime(payload.exportedAt));
  writeBullet("Message Count", String(payload.messages.length));
  writeBullet("Mode", "Out of canon");
  y += 10;

  writeHeading("Transcript", 14);
  if (!payload.messages.length) {
    writeParagraph("No MetaChat messages yet.");
  }

  for (const message of payload.messages) {
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    ensureSpace(22);
    doc.text(getMetaChatSpeakerLabel(message), marginX, y);
    y += 18;

    writeParagraph(message.content.trim() || "No content");

    doc.setFont("times", "normal");
    doc.setFontSize(10);
    ensureSpace(16);
    doc.text(`Time: ${formatDateTime(message.timestamp)}`, marginX, y);
    y += 24;
  }

  return doc.output("arraybuffer") as ArrayBuffer;
}

export function serializeMetaChatExport(
  args: {
    storyTitle: string;
    messages: StoryMetaMessage[];
  },
  format: MetaChatExportFormat,
) {
  const payload: MetaChatExportPayload = {
    storyTitle: args.storyTitle,
    exportedAt: new Date().toISOString(),
    messages: args.messages,
  };

  const exporters: Record<
    MetaChatExportFormat,
    { serialize: (data: MetaChatExportPayload) => BlobPart; mimeType: string }
  > = {
    json: { serialize: toJson, mimeType: "application/json" },
    markdown: { serialize: toMarkdown, mimeType: "text/markdown" },
    txt: { serialize: toText, mimeType: "text/plain" },
    pdf: { serialize: toPdf, mimeType: "application/pdf" },
  };

  const exporter = exporters[format];
  return {
    content: exporter.serialize(payload),
    mimeType: exporter.mimeType,
  };
}
