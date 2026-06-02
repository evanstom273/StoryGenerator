import { jsPDF } from "jspdf";
import { downloadFile } from "../../lib/download";
import { APP_NAME, type ChangelogEntry } from "./version";

export type ChangelogExportFormat = "json" | "markdown" | "txt" | "pdf";

function parseSemver(version: string) {
  const [majorRaw, minorRaw, patchRaw] = version.split(".");
  const major = Number.parseInt(majorRaw ?? "", 10);
  const minor = Number.parseInt(minorRaw ?? "", 10);
  const patch = Number.parseInt(patchRaw ?? "", 10);

  return {
    major: Number.isFinite(major) ? major : 0,
    minor: Number.isFinite(minor) ? minor : 0,
    patch: Number.isFinite(patch) ? patch : 0,
  };
}

export function sortVersionsDesc(versions: string[]) {
  return [...versions].sort((left, right) => {
    const a = parseSemver(left);
    const b = parseSemver(right);
    if (a.major !== b.major) return b.major - a.major;
    if (a.minor !== b.minor) return b.minor - a.minor;
    return b.patch - a.patch;
  });
}

function formatEntryMarkdown(version: string, entry: ChangelogEntry) {
  const sections: Array<[string, string[] | undefined]> = [
    ["Fixed", entry.fixed],
    ["Added", entry.added],
    ["Known Issues", entry.knownIssues],
  ];

  const blocks: string[] = [];
  blocks.push(`## ${APP_NAME} v${version}`);
  blocks.push("");
  blocks.push(`_${entry.title}_`);
  blocks.push("");

  for (const [label, items] of sections) {
    if (!items?.length) continue;
    blocks.push(`### ${label}`);
    blocks.push("");
    blocks.push(...items.map((item) => `- ${item}`));
    blocks.push("");
  }

  return blocks.join("\n").trimEnd();
}

function formatEntryText(version: string, entry: ChangelogEntry) {
  const sections: Array<[string, string[] | undefined]> = [
    ["Fixed", entry.fixed],
    ["Added", entry.added],
    ["Known Issues", entry.knownIssues],
  ];

  const blocks: string[] = [];
  blocks.push(`${APP_NAME} v${version}`);
  blocks.push(entry.title);
  blocks.push("");

  for (const [label, items] of sections) {
    if (!items?.length) continue;
    blocks.push(label);
    blocks.push(...items.map((item) => `- ${item}`));
    blocks.push("");
  }

  return blocks.join("\n").trimEnd();
}

export function serializeFullChangelogMarkdown(entries: Record<string, ChangelogEntry>) {
  const versions = sortVersionsDesc(Object.keys(entries));
  return versions.map((version) => formatEntryMarkdown(version, entries[version]!)).join("\n\n");
}

export function serializeFullChangelogText(entries: Record<string, ChangelogEntry>) {
  const versions = sortVersionsDesc(Object.keys(entries));
  return versions.map((version) => formatEntryText(version, entries[version]!)).join("\n\n");
}

export function serializeChangelogJson(entries: Record<string, ChangelogEntry>) {
  return JSON.stringify({ appName: APP_NAME, changelog: entries }, null, 2);
}

export function serializeChangelogPdf(entries: Record<string, ChangelogEntry>): ArrayBuffer {
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

  const versions = sortVersionsDesc(Object.keys(entries));
  writeHeading(`${APP_NAME} Changelog`, 20);

  for (const version of versions) {
    const entry = entries[version]!;
    writeHeading(`v${version}`, 14);
    writeParagraph(entry.title, 11, "italic");

    const sections: Array<[string, string[] | undefined]> = [
      ["Fixed", entry.fixed],
      ["Added", entry.added],
      ["Known Issues", entry.knownIssues],
    ];

    for (const [label, items] of sections) {
      if (!items?.length) continue;
      writeHeading(label, 12);
      for (const item of items) {
        writeParagraph(`• ${item}`, 11, "normal");
      }
      y += 6;
    }

    y += 10;
  }

  return doc.output("arraybuffer") as ArrayBuffer;
}

export async function exportChangelog({
  filenameStem,
  entries,
  format,
}: {
  filenameStem: string;
  entries: Record<string, ChangelogEntry>;
  format: ChangelogExportFormat;
}) {
  if (format === "json") {
    await downloadFile(`${filenameStem}.json`, serializeChangelogJson(entries), "application/json");
    return;
  }

  if (format === "markdown") {
    await downloadFile(
      `${filenameStem}.md`,
      serializeFullChangelogMarkdown(entries),
      "text/markdown",
    );
    return;
  }

  if (format === "txt") {
    await downloadFile(`${filenameStem}.txt`, serializeFullChangelogText(entries), "text/plain");
    return;
  }

  const pdfBytes = serializeChangelogPdf(entries);
  await downloadFile(`${filenameStem}.pdf`, pdfBytes, "application/pdf");
}

