import type { StoryExportBundle, StoryMessage } from "../types/models";
import { formatDateTime, sortByTimestampAsc } from "./dates";
import { normalizeStoryStateToV2, safeParseStoryStateData } from "./storyStateV2";
import { sanitizeAssistantTranscript } from "./storyText/transcriptSanitizer";
import { cleanTextForExport } from "./storyText/exportCleaner";
import { isDirectorMessage } from "./storyText/directorMode";
import {
  createPdfDoc,
  pdfDimensions,
  heading,
  subheading,
  body,
  metaLine,
  speakerLine,
  rule,
  checkPage,
  PDF_MARGIN,
  PDF_FONT,
} from "./pdfLayout";

function trimStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
    .map((e) => e.trim())
    .slice(0, maxItems);
}

function coerceEvidenceNumbers(value: unknown): number[] {
  const raw = (value as any)?.evidence?.messageNumbers;
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => typeof e === "number" && Number.isFinite(e));
}

function formatEvidence(numbers: number[]): string {
  const sorted = Array.from(new Set(numbers))
    .filter((v) => v >= 1)
    .sort((a, b) => a - b);
  if (!sorted.length) return "";
  const visible = sorted.slice(0, 10);
  const remaining = sorted.length - visible.length;
  const base = `[Message ${visible.join(", ")}]`;
  return remaining > 0 ? `${base} (+${remaining} more)` : base;
}

function resolveTranscriptSpeaker(message: StoryMessage, playerName: string): string {
  if (message.role === "user") {
    if (isDirectorMessage(message)) return "Director";
    return message.speakerName?.trim() || playerName;
  }
  if (message.role === "system" || message.speakerType === "system") return "System";
  if (message.speakerType === "narrator") return "Narrator";
  if (message.speakerName?.trim()) return message.speakerName.trim();
  return "Narrator";
}

export function serializeStoryArchivePdf(
  bundle: StoryExportBundle,
): { content: Uint8Array; mimeType: string } {
  const doc = createPdfDoc();
  const { pageW, pageH } = pdfDimensions(doc);
  let y = PDF_MARGIN;

  const storyStateData = (() => {
    const json = bundle.storyState?.stateJson?.trim() ?? "";
    if (!json) return null;
    return normalizeStoryStateToV2(safeParseStoryStateData(json));
  })();

  const indexes = (storyStateData as any)?.indexes;

  // ── 1. Title + metadata ──────────────────────────────────────────────────
  y = heading(doc, y, bundle.story.title, 18, pageH);
  y = rule(doc, y, pageW);

  y = metaLine(doc, y, "Universe", bundle.universe.name, pageH);
  y = metaLine(doc, y, "Protagonist", bundle.playerCharacter.name, pageH);
  y = metaLine(doc, y, "Exported", formatDateTime(bundle.exportedAt), pageH);
  if (storyStateData?.indexedAt) {
    y = metaLine(doc, y, "Indexed", formatDateTime(storyStateData.indexedAt), pageH);
  }
  if (
    typeof storyStateData?.indexes?.messageCount === "number" &&
    Number.isFinite(storyStateData.indexes.messageCount)
  ) {
    y = metaLine(doc, y, "Indexed messages", String(Math.trunc(storyStateData.indexes.messageCount)), pageH);
  }
  y = metaLine(doc, y, "Transcript messages", String(bundle.messages.length), pageH);
  y += 6;

  // ── 2. Story summary / premise ───────────────────────────────────────────
  const premise = storyStateData?.summaries?.premise?.trim() ?? "";
  const protagonistFocus = storyStateData?.summaries?.protagonistSummary?.trim() ?? "";
  const currentSituation = storyStateData?.summaries?.currentSituation?.trim() ?? "";
  const recentDevelopments = trimStringList(storyStateData?.summaries?.recentDevelopments, 8);

  if (premise || protagonistFocus || currentSituation || recentDevelopments.length) {
    y = rule(doc, y, pageW);
    y = heading(doc, y, "Story Summary", 14, pageH);

    if (premise) {
      y = subheading(doc, y, "Premise", pageH);
      y = body(doc, y, premise, 0, undefined, pageH);
    }
    if (protagonistFocus) {
      y = subheading(doc, y, "Protagonist", pageH);
      y = body(doc, y, protagonistFocus, 0, undefined, pageH);
    }
    if (currentSituation) {
      y = subheading(doc, y, "Current Situation", pageH);
      y = body(doc, y, currentSituation, 0, undefined, pageH);
    }
    if (recentDevelopments.length) {
      y = subheading(doc, y, "Recent Developments", pageH);
      for (const dev of recentDevelopments) {
        y = body(doc, y, dev, 0, undefined, pageH);
      }
    }
  } else {
    const bestSummary =
      bundle.story.currentSummary?.trim() || storyStateData?.summaries?.worldSummary?.trim() || "";
    if (bestSummary) {
      y = rule(doc, y, pageW);
      y = heading(doc, y, "Summary", 14, pageH);
      y = body(doc, y, bestSummary, 0, undefined, pageH);
    }
  }

  // ── 3. Transcript ────────────────────────────────────────────────────────
  y = rule(doc, y, pageW);
  y = heading(doc, y, "Transcript", 14, pageH);
  y = rule(doc, y, pageW);

  const sortedMessages = sortByTimestampAsc(bundle.messages);
  let latestUserMessage: string | null = null;

  const chapterMarkers = new Map<number, string>();
  for (const chapter of bundle.chapters ?? []) {
    const idx = typeof (chapter as any)?.endsAtIndex === "number" ? Math.trunc((chapter as any).endsAtIndex) : 0;
    const label = typeof (chapter as any)?.label === "string" ? (chapter as any).label.trim() : "";
    if (idx >= 1 && label) chapterMarkers.set(idx, label);
  }

  for (let i = 0; i < sortedMessages.length; i++) {
    const message = sortedMessages[i];
    const num = i + 1;

    if (message.role === "user") latestUserMessage = message.content;

    // Message number label
    y = checkPage(doc, y, pageH, 14);
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.text(`[${num}]`, PDF_MARGIN, y);
    doc.setTextColor(0, 0, 0);
    y += 12;

    const speaker = resolveTranscriptSpeaker(message, bundle.playerCharacter.name);
    const resolvedContent =
      message.role === "assistant"
        ? sanitizeAssistantTranscript({
            text: cleanTextForExport(message.content),
            latestUserMessage,
            playerName: bundle.playerCharacter.name,
          }).text
        : message.content;

    y = speakerLine(doc, y, speaker, resolvedContent ?? "", pageH);

    const chapterLabel = chapterMarkers.get(num);
    if (chapterLabel) {
      y = checkPage(doc, y, pageH, 14);
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(9);
      doc.setTextColor(140, 140, 140);
      doc.text(`— Chapter end: ${chapterLabel} —`, PDF_MARGIN, y);
      doc.setTextColor(0, 0, 0);
      y += 14;
    }

    y = rule(doc, y, pageW);
  }

  // ── 4. Character registry ────────────────────────────────────────────────
  const characterRegistryRaw =
    indexes?.characters && typeof indexes.characters === "object" && !Array.isArray(indexes.characters)
      ? Object.values(indexes.characters)
      : [];
  const characterRegistry = (characterRegistryRaw as any[])
    .map((e) => ({
      name: typeof e?.name === "string" ? e.name.trim() : "",
      aliases: Array.isArray(e?.aliases) ? (e.aliases as unknown[]).filter((v): v is string => typeof v === "string" && !!v.trim()) : [],
      description: typeof e?.description === "string" ? e.description.trim() : "",
      firstSeenMessage: typeof e?.firstSeenMessage === "number" ? e.firstSeenMessage : null,
      lastSeenMessage: typeof e?.lastSeenMessage === "number" ? e.lastSeenMessage : null,
      evidence: formatEvidence(coerceEvidenceNumbers(e)),
      status: (() => {
        const stateEntry = (storyStateData?.characters as Record<string, any> | undefined)?.[typeof e?.name === "string" ? e.name.trim() : ""];
        const bullets = trimStringList(stateEntry?.statusBullets, 4);
        const fallback = !bullets.length && typeof stateEntry?.status === "string" && stateEntry.status.trim() ? [stateEntry.status.trim()] : [];
        return [...bullets, ...fallback].join(" | ");
      })(),
    }))
    .filter((e) => e.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (characterRegistry.length) {
    y = rule(doc, y, pageW);
    y = heading(doc, y, "Characters", 14, pageH);
    for (const entry of characterRegistry) {
      y = subheading(doc, y, entry.name, pageH);
      if (entry.aliases.length) y = metaLine(doc, y, "Aliases", entry.aliases.join(", "), pageH);
      if (entry.firstSeenMessage) y = metaLine(doc, y, "First seen", `Message ${entry.firstSeenMessage}`, pageH);
      if (entry.lastSeenMessage) y = metaLine(doc, y, "Last seen", `Message ${entry.lastSeenMessage}`, pageH);
      if (entry.description) y = body(doc, y, entry.description, 0, undefined, pageH);
      if (entry.status) y = metaLine(doc, y, "Status", entry.status, pageH);
      if (entry.evidence) y = metaLine(doc, y, "Evidence", entry.evidence, pageH);
      y += 4;
      y = rule(doc, y, pageW);
    }
  }

  // ── 5. Relationships ─────────────────────────────────────────────────────
  const relationshipRegistryRaw = Array.isArray(indexes?.relationships) ? indexes.relationships : [];
  const relationshipRegistry = (relationshipRegistryRaw as any[])
    .map((e) => ({
      a: typeof e?.a === "string" ? e.a.trim() : "",
      b: typeof e?.b === "string" ? e.b.trim() : "",
      tier: typeof e?.tier === "string" ? e.tier.trim() : "stranger",
      summary: typeof e?.summary === "string" ? e.summary.trim() : "",
      history: Array.isArray(e?.history)
        ? (e.history as unknown[])
            .map((h) => (typeof (h as any)?.summary === "string" ? (h as any).summary.trim() : ""))
            .filter(Boolean)
        : [],
      evidence: formatEvidence(coerceEvidenceNumbers(e)),
    }))
    .filter((e) => e.a && e.b);

  if (relationshipRegistry.length) {
    y = rule(doc, y, pageW);
    y = heading(doc, y, "Relationships", 14, pageH);
    for (const entry of relationshipRegistry) {
      y = subheading(doc, y, `${entry.a} <-> ${entry.b}`, pageH);
      if (entry.tier && entry.tier !== "stranger") {
        y = metaLine(doc, y, "Tier", entry.tier.charAt(0).toUpperCase() + entry.tier.slice(1), pageH);
      }
      if (entry.summary) y = body(doc, y, entry.summary, 0, undefined, pageH);
      if (entry.history.length) {
        for (let hi = 0; hi < entry.history.length; hi++) {
          y = body(doc, y, `#${hi + 1}  ${entry.history[hi]}`, 0, undefined, pageH);
        }
      }
      if (entry.evidence) y = metaLine(doc, y, "Evidence", entry.evidence, pageH);
      y += 4;
      y = rule(doc, y, pageW);
    }
  }

  // ── 6. World facts ───────────────────────────────────────────────────────
  const worldFactsRaw = Array.isArray(indexes?.worldFacts)
    ? indexes.worldFacts
    : Array.isArray((storyStateData as any)?.worldFacts)
      ? (storyStateData as any).worldFacts
      : [];
  const worldFacts = (worldFactsRaw as unknown[])
    .map((e) => {
      if (typeof e === "string") return { text: e.trim(), evidence: "" };
      const fact = typeof (e as any)?.fact === "string" ? (e as any).fact.trim() : "";
      return { text: fact, evidence: formatEvidence(coerceEvidenceNumbers(e)) };
    })
    .filter((e) => e.text);

  if (worldFacts.length) {
    y = rule(doc, y, pageW);
    y = heading(doc, y, "World Facts", 14, pageH);
    for (let i = 0; i < worldFacts.length; i++) {
      const e = worldFacts[i];
      const line = e.evidence ? `${e.text}  (${e.evidence})` : e.text;
      y = body(doc, y, `${i + 1}. ${line}`, 0, undefined, pageH);
    }
  }

  // ── 7. Active threads ────────────────────────────────────────────────────
  const openThreadsRaw = Array.isArray(indexes?.openThreads)
    ? indexes.openThreads
    : Array.isArray((storyStateData as any)?.unresolvedThreads)
      ? (storyStateData as any).unresolvedThreads
      : [];
  const openThreads = (openThreadsRaw as unknown[])
    .map((e) => {
      if (typeof e === "string") return { thread: e.trim(), evidence: "" };
      const thread = typeof (e as any)?.thread === "string" ? (e as any).thread.trim() : "";
      return { thread, evidence: formatEvidence(coerceEvidenceNumbers(e)) };
    })
    .filter((e) => e.thread);

  if (openThreads.length) {
    y = rule(doc, y, pageW);
    y = heading(doc, y, "Active Threads", 14, pageH);
    for (let i = 0; i < openThreads.length; i++) {
      const e = openThreads[i];
      const line = e.evidence ? `${e.thread}  (${e.evidence})` : e.thread;
      y = body(doc, y, `${i + 1}. ${line}`, 0, undefined, pageH);
    }
  }

  // ── 8. Chapters ──────────────────────────────────────────────────────────
  const chapters = (bundle.chapters ?? []).filter(
    (c) => typeof (c as any)?.label === "string" && (c as any).label.trim(),
  );
  if (chapters.length) {
    y = rule(doc, y, pageW);
    y = heading(doc, y, "Chapters", 14, pageH);
    for (const chapter of chapters) {
      const label = ((chapter as any).label as string).trim();
      const summary = typeof (chapter as any)?.summary === "string" ? ((chapter as any).summary as string).trim() : "";
      y = subheading(doc, y, label, pageH);
      if (summary) y = body(doc, y, summary, 0, undefined, pageH);
      y += 4;
      y = rule(doc, y, pageW);
    }
  }

  const buffer = doc.output("arraybuffer") as ArrayBuffer;
  return { content: new Uint8Array(buffer), mimeType: "application/pdf" };
}
