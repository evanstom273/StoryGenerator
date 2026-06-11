import { jsPDF } from "jspdf";
import type { StoryExportBundle, StoryMessage } from "../types/models";
import { formatDateTime, sortByTimestampAsc } from "./dates";
import { normalizeStoryStateToV2, safeParseStoryStateData } from "./storyStateV2";
import { sanitizeAssistantTranscript } from "./storyText/transcriptSanitizer";

function trimStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .slice(0, maxItems);
}

function coerceEvidenceNumbers(value: unknown): number[] {
  const raw = (value as any)?.evidence?.messageNumbers;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function formatEvidence(numbers: number[]) {
  const uniqueSorted = Array.from(new Set(numbers))
    .filter((value) => value >= 1)
    .sort((a, b) => a - b);

  if (!uniqueSorted.length) {
    return "";
  }

  const visible = uniqueSorted.slice(0, 10);
  const remaining = uniqueSorted.length - visible.length;
  const base = `[Message ${visible.join(", ")}]`;
  return remaining > 0 ? `${base} (+${remaining} more)` : base;
}

function resolveTranscriptSpeakerLabel(message: StoryMessage, playerName: string) {
  if (message.role === "user") {
    const label = message.speakerName?.trim() || playerName;
    return `USER (${label})`;
  }

  if (message.role === "system" || message.speakerType === "system") {
    return "SYSTEM";
  }

  if (message.speakerType === "narrator") {
    return "NARRATOR";
  }

  if (message.speakerName?.trim()) {
    return `CANON (${message.speakerName.trim()})`;
  }

  return "ASSISTANT";
}

export function serializeStoryArchivePdf(
  bundle: StoryExportBundle,
): { content: Uint8Array; mimeType: string } {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 56;
  const marginY = 64;
  const contentWidth = pageWidth - marginX * 2;

  let y = marginY;

  const storyStateData = (() => {
    const json = bundle.storyState?.stateJson?.trim() ?? "";
    if (!json) return null;
    const parsed = safeParseStoryStateData(json);
    return normalizeStoryStateToV2(parsed);
  })();
  const currentSceneLocation =
    typeof (storyStateData as any)?.scene?.currentLocation === "string"
      ? (storyStateData as any).scene.currentLocation.trim()
      : "";

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
    const lineHeight = Math.ceil(size * 1.55);
    const blocks = (text ?? "").replace(/\r\n/g, "\n").split("\n");
    for (const rawLine of blocks) {
      const line = rawLine ?? "";
      if (!line.trim()) {
        ensureSpace(lineHeight);
        y += lineHeight;
        continue;
      }

      const wrapped = doc.splitTextToSize(line, contentWidth);
      ensureSpace(wrapped.length * lineHeight + 4);
      for (const piece of wrapped) {
        doc.text(piece, marginX, y);
        y += lineHeight;
      }
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

  function writeSubheading(text: string) {
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(text, contentWidth);
    const lineHeight = Math.ceil(12 * 1.4);
    ensureSpace(lines.length * lineHeight + 8);
    for (const line of lines) {
      doc.text(line, marginX, y);
      y += lineHeight;
    }
    y += 4;
  }

  function writeListSection(title: string, entries: string[]) {
    const cleaned = entries.filter((entry) => typeof entry === "string" && entry.trim());
    if (!cleaned.length) {
      return;
    }

    writeSubheading(title);
    for (const entry of cleaned) {
      writeParagraph(`• ${entry}`);
    }
  }

  function writeMonospace(text: string) {
    doc.setFont("courier", "bold");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, contentWidth);
    const lineHeight = Math.ceil(10 * 1.55);
    ensureSpace(lines.length * lineHeight + 6);
    for (const line of lines) {
      doc.text(line, marginX, y);
      y += lineHeight;
    }
    y += 4;
  }

  writeHeading(bundle.story.title, 22);
  writeBullet("Universe", bundle.universe.name);
  writeBullet("Player Character", bundle.playerCharacter.name);
  writeBullet("Creation date", formatDateTime(bundle.story.createdAt));
  writeBullet("Last updated", formatDateTime(bundle.story.updatedAt));
  writeBullet("Exported", formatDateTime(bundle.exportedAt));
  y += 8;

  writeHeading("Basic Metadata", 14);
  writeBullet("Exported at", formatDateTime(bundle.exportedAt));
  if (storyStateData?.indexedAt) {
    writeBullet("Indexed at", formatDateTime(storyStateData.indexedAt));
  }
  if (storyStateData?.memoryArchitectureVersion) {
    writeBullet("Memory architecture", storyStateData.memoryArchitectureVersion);
  }
  if (typeof storyStateData?.indexes?.messageCount === "number" && Number.isFinite(storyStateData.indexes.messageCount)) {
    writeBullet("Indexed messages", String(Math.trunc(storyStateData.indexes.messageCount)));
  }
  writeBullet("Transcript messages", String(bundle.messages.length));
  y += 10;

  writeHeading("Full Transcript", 14);
  const sortedMessages = sortByTimestampAsc(bundle.messages);
  let latestUserMessage: string | null = null;
  const chapterMarkers = new Map<number, string>();
  for (const chapter of bundle.chapters ?? []) {
    const index = typeof (chapter as any)?.endsAtIndex === "number" ? Math.trunc((chapter as any).endsAtIndex) : 0;
    const label = typeof (chapter as any)?.label === "string" ? (chapter as any).label.trim() : "";
    if (index >= 1 && label) {
      chapterMarkers.set(index, label);
    }
  }

  for (let index = 0; index < sortedMessages.length; index += 1) {
    const message = sortedMessages[index];
    const number = index + 1;

    if (index > 0) {
      ensureSpace(18);
      y += 18;
    }

    if (message.role === "user") {
      latestUserMessage = message.content;
    }

    writeMonospace(`[Message ${number}]`);
    writeSubheading(resolveTranscriptSpeakerLabel(message, bundle.playerCharacter.name));

    const resolvedContent =
      message.role === "assistant"
        ? sanitizeAssistantTranscript({
            text: message.content,
            latestUserMessage,
            playerName: bundle.playerCharacter.name,
          }).text
        : message.content;
    writeParagraph((resolvedContent ?? "").trim());
    writeMonospace(`Time: ${formatDateTime(message.timestamp)}`);
    ensureSpace(18);
    y += 18;

    const chapterLabel = chapterMarkers.get(number);
    if (chapterLabel) {
      writeMonospace(`----- CHAPTER END: ${chapterLabel} -----`);
      ensureSpace(18);
      y += 18;
    }
  }

  const bestSummary = bundle.story.currentSummary?.trim() || storyStateData?.summaries?.worldSummary?.trim() || "";
  if (bestSummary) {
    writeHeading("Current Summary", 14);
    writeParagraph(bestSummary);
  }

  const indexes = (storyStateData as any)?.indexes;
  const openThreadsRaw = Array.isArray(indexes?.openThreads)
    ? indexes.openThreads
    : Array.isArray((storyStateData as any)?.unresolvedThreads)
      ? (storyStateData as any).unresolvedThreads
      : [];

  const openThreads = openThreadsRaw
    .map((entry: any) => {
      if (typeof entry === "string") {
        return { thread: entry.trim(), evidence: "" };
      }
      const thread = typeof entry?.thread === "string" ? entry.thread.trim() : "";
      const evidence = formatEvidence(coerceEvidenceNumbers(entry));
      return { thread, evidence };
    })
    .filter((entry: any) => entry.thread);

  if (openThreads.length) {
    writeHeading("Open Threads", 14);
    for (const entry of openThreads) {
      const line = entry.evidence ? `${entry.thread}  Evidence: ${entry.evidence}` : entry.thread;
      writeParagraph(`• ${line}`);
    }
    y += 10;
  }

  const characterRegistryRaw =
    indexes?.characters && typeof indexes.characters === "object" && !Array.isArray(indexes.characters)
      ? Object.values(indexes.characters)
      : [];
  const characterRegistry = characterRegistryRaw
    .map((entry: any) => ({
      name: typeof entry?.name === "string" ? entry.name.trim() : "",
      aliases: Array.isArray(entry?.aliases) ? entry.aliases.filter((v: unknown) => typeof v === "string" && v.trim()) : [],
      description: typeof entry?.description === "string" ? entry.description.trim() : "",
      firstSeenMessage: typeof entry?.firstSeenMessage === "number" ? entry.firstSeenMessage : null,
      lastSeenMessage: typeof entry?.lastSeenMessage === "number" ? entry.lastSeenMessage : null,
      evidence: formatEvidence(coerceEvidenceNumbers(entry)),
    }))
    .filter((entry: any) => entry.name)
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  if (characterRegistry.length) {
    writeHeading("Character Registry", 14);
    for (const entry of characterRegistry) {
      const stateEntry = (storyStateData?.characters as Record<string, any> | undefined)?.[entry.name];
      const statusBullets = trimStringList(stateEntry?.statusBullets, 4);
      const fallbackStatus =
        !statusBullets.length && typeof stateEntry?.status === "string" && stateEntry.status.trim()
          ? [stateEntry.status.trim()]
          : [];
      const currentState = trimStringList(stateEntry?.characterStateTransient, 4);
      writeSubheading(entry.name);
      if (entry.aliases.length) writeBullet("Aliases", entry.aliases.join(", "));
      if (entry.firstSeenMessage) writeBullet("First seen", `Message ${entry.firstSeenMessage}`);
      if (entry.lastSeenMessage) writeBullet("Last seen", `Message ${entry.lastSeenMessage}`);
      if (entry.description) writeBullet("Description", entry.description);
      if (statusBullets.length || fallbackStatus.length) {
        writeBullet("Status", [...statusBullets, ...fallbackStatus].join(" | "));
      }
      if (currentState.length) {
        writeBullet("Current state", currentState.join(" | "));
      }
      if (entry.evidence) writeBullet("Evidence", entry.evidence);
      y += 6;
    }
    y += 6;
  }

  const locationRegistryRaw =
    indexes?.locations && typeof indexes.locations === "object" && !Array.isArray(indexes.locations)
      ? Object.values(indexes.locations)
      : [];
  const locationRegistry = locationRegistryRaw
    .map((entry: any) => ({
      name: typeof entry?.name === "string" ? entry.name.trim() : "",
      aliases: Array.isArray(entry?.aliases) ? entry.aliases.filter((v: unknown) => typeof v === "string" && v.trim()) : [],
      description: typeof entry?.description === "string" ? entry.description.trim() : "",
      firstSeenMessage: typeof entry?.firstSeenMessage === "number" ? entry.firstSeenMessage : null,
      lastSeenMessage: typeof entry?.lastSeenMessage === "number" ? entry.lastSeenMessage : null,
      evidence: formatEvidence(coerceEvidenceNumbers(entry)),
    }))
    .filter((entry: any) => entry.name)
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  if (locationRegistry.length) {
    writeHeading("Location Registry", 14);
    for (const entry of locationRegistry) {
      writeSubheading(entry.name);
      if (entry.aliases.length) writeBullet("Aliases", entry.aliases.join(", "));
      if (entry.firstSeenMessage) writeBullet("First seen", `Message ${entry.firstSeenMessage}`);
      if (entry.lastSeenMessage) writeBullet("Last seen", `Message ${entry.lastSeenMessage}`);
      if (entry.description) writeBullet("Description", entry.description);
      if (currentSceneLocation && currentSceneLocation.toLowerCase() === entry.name.toLowerCase()) {
        writeBullet("Current relevance", "Active scene location");
      } else if (entry.lastSeenMessage) {
        writeBullet("Current relevance", `Last referenced around message ${entry.lastSeenMessage}`);
      }
      if (entry.evidence) writeBullet("Evidence", entry.evidence);
      y += 6;
    }
    y += 6;
  }

  const relationshipRegistryRaw = Array.isArray(indexes?.relationships) ? indexes.relationships : [];
  const relationshipRegistry = relationshipRegistryRaw
    .map((entry: any) => ({
      a: typeof entry?.a === "string" ? entry.a.trim() : "",
      b: typeof entry?.b === "string" ? entry.b.trim() : "",
      friendship: typeof entry?.friendship === "number" ? entry.friendship : null,
      trust: typeof entry?.trust === "number" ? entry.trust : null,
      respect: typeof entry?.respect === "number" ? entry.respect : null,
      loyalty: typeof entry?.loyalty === "number" ? entry.loyalty : null,
      comfort: typeof entry?.comfort === "number" ? entry.comfort : null,
      suspicion: typeof entry?.suspicion === "number" ? entry.suspicion : null,
      fear: typeof entry?.fear === "number" ? entry.fear : null,
      affection: typeof entry?.affection === "number" ? entry.affection : null,
      tension: typeof entry?.tension === "number" ? entry.tension : null,
      hostility: typeof entry?.hostility === "number" ? entry.hostility : null,
      summary: typeof entry?.summary === "string" ? entry.summary.trim() : "",
      evidence: formatEvidence(coerceEvidenceNumbers(entry)),
    }))
    .filter((entry: any) => entry.a && entry.b);

  if (relationshipRegistry.length) {
    writeHeading("Relationship Registry", 14);
    for (const entry of relationshipRegistry) {
      writeSubheading(`${entry.a} <-> ${entry.b}`);
      if (entry.friendship != null) writeBullet("Friendship", String(Math.round(entry.friendship)));
      if (entry.trust != null) writeBullet("Trust", String(Math.round(entry.trust)));
      if (entry.respect != null) writeBullet("Respect", String(Math.round(entry.respect)));
      if (entry.loyalty != null) writeBullet("Loyalty", String(Math.round(entry.loyalty)));
      if (entry.comfort != null) writeBullet("Comfort", String(Math.round(entry.comfort)));
      if (entry.suspicion != null) writeBullet("Suspicion", String(Math.round(entry.suspicion)));
      if (entry.fear != null) writeBullet("Fear", String(Math.round(entry.fear)));
      if (entry.affection != null) writeBullet("Affection", String(Math.round(entry.affection)));
      if (entry.tension != null) writeBullet("Tension", String(Math.round(entry.tension)));
      if (entry.hostility != null) writeBullet("Hostility", String(Math.round(entry.hostility)));
      if (entry.summary) writeParagraph(entry.summary);
      if (entry.evidence) writeBullet("Evidence", entry.evidence);
      y += 6;
    }
    y += 6;
  }

  const worldFactsRaw = Array.isArray(indexes?.worldFacts)
    ? indexes.worldFacts
    : Array.isArray((storyStateData as any)?.worldFacts)
      ? (storyStateData as any).worldFacts
      : [];
  const worldFacts = worldFactsRaw
    .map((entry: any) => {
      if (typeof entry === "string") {
        return { text: entry.trim(), evidence: "" };
      }
      const fact = typeof entry?.fact === "string" ? entry.fact.trim() : "";
      const evidence = formatEvidence(coerceEvidenceNumbers(entry));
      return { text: fact, evidence };
    })
    .filter((entry: any) => entry.text);

  if (worldFacts.length) {
    writeHeading("World Facts", 14);
    for (const entry of worldFacts) {
      const line = entry.evidence ? `${entry.text}  Evidence: ${entry.evidence}` : entry.text;
      writeParagraph(`• ${line}`);
    }
    y += 10;
  }

  const memoriesRaw = Array.isArray(indexes?.significantMemories)
    ? indexes.significantMemories
    : Array.isArray((storyStateData as any)?.significantMemories)
      ? (storyStateData as any).significantMemories
      : [];
  const memories = memoriesRaw
    .map((entry: any) => {
      if (typeof entry === "string") {
        return { text: entry.trim(), evidence: "" };
      }
      const moment = typeof entry?.moment === "string" ? entry.moment.trim() : "";
      const evidence = formatEvidence(coerceEvidenceNumbers(entry));
      return { text: moment, evidence };
    })
    .filter((entry: any) => entry.text);

  if (memories.length) {
    writeHeading("Significant Memories", 14);
    for (const entry of memories) {
      const line = entry.evidence ? `${entry.text}  Evidence: ${entry.evidence}` : entry.text;
      writeParagraph(`• ${line}`);
    }
    y += 10;
  }

  const appendixChunks: Array<() => void> = [];

  const premise = storyStateData?.summaries?.premise?.trim() ?? "";
  const protagonistFocus = storyStateData?.summaries?.protagonistSummary?.trim() ?? "";
  const currentSituation = storyStateData?.summaries?.currentSituation?.trim() ?? "";
  const recentDevelopments = trimStringList(storyStateData?.summaries?.recentDevelopments, 8);
  if (premise || protagonistFocus || currentSituation || recentDevelopments.length) {
    appendixChunks.push(() => {
      writeHeading("Archive Story State", 14);
      if (premise) {
        writeSubheading("Premise");
        writeParagraph(premise);
      }
      if (protagonistFocus) {
        writeSubheading("Protagonist Focus");
        writeParagraph(protagonistFocus);
      }
      if (currentSituation) {
        writeSubheading("Current Situation");
        writeParagraph(currentSituation);
      }
      if (recentDevelopments.length) {
        writeListSection("Recent Developments", recentDevelopments);
      }
      y += 10;
    });
  }

  appendixChunks.push(() => {
    writeHeading("Player Character Sheet", 14);
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
  });

  const scene = (storyStateData as any)?.scene;
  const snapshot = {
    currentLocation: typeof scene?.currentLocation === "string" ? scene.currentLocation.trim() : "",
    currentObjective: typeof scene?.currentObjective === "string" ? scene.currentObjective.trim() : "",
    activeParticipants: Array.isArray(scene?.activeParticipants)
      ? scene.activeParticipants.filter((value: unknown) => typeof value === "string" && value.trim())
      : [],
    sceneSummary: typeof scene?.sceneSummary === "string" ? scene.sceneSummary.trim() : "",
  };
  if (snapshot.currentLocation || snapshot.currentObjective || snapshot.activeParticipants.length || snapshot.sceneSummary) {
    appendixChunks.push(() => {
      writeHeading("Story State Snapshot", 14);
      if (snapshot.currentLocation) writeBullet("Current location", snapshot.currentLocation);
      if (snapshot.currentObjective) writeBullet("Current objective", snapshot.currentObjective);
      if (snapshot.activeParticipants.length) writeBullet("Active participants", snapshot.activeParticipants.join(", "));
      if (snapshot.sceneSummary) {
        writeSubheading("Scene summary");
        writeParagraph(snapshot.sceneSummary);
      }
      y += 10;
    });
  }

  const characterStatusEntries = Object.entries(storyStateData?.characters ?? {})
    .map(([name, entry]: [string, any]) => {
      const statusBullets = trimStringList(entry?.statusBullets, 5);
      const fallbackStatus =
        !statusBullets.length && typeof entry?.status === "string" && entry.status.trim()
          ? [entry.status.trim()]
          : [];
      const strengths = trimStringList(entry?.strengths, 4);
      const weaknesses = trimStringList(entry?.weaknesses, 4);
      const combinedStatus = [...statusBullets, ...fallbackStatus];

      return {
        name: name.trim(),
        status: combinedStatus,
        strengths,
        weaknesses,
      };
    })
    .filter((entry) => entry.name && (entry.status.length || entry.strengths.length || entry.weaknesses.length))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (characterStatusEntries.length) {
    appendixChunks.push(() => {
      writeHeading("Character Status", 14);
      for (const entry of characterStatusEntries) {
        writeSubheading(entry.name);
        if (entry.status.length) {
          for (const item of entry.status) {
            writeParagraph(`• ${item}`);
          }
        }
        if (entry.strengths.length) {
          writeBullet("Strengths", entry.strengths.join(", "));
        }
        if (entry.weaknesses.length) {
          writeBullet("Weaknesses", entry.weaknesses.join(", "));
        }
        y += 6;
      }
      y += 6;
    });
  }

  if (appendixChunks.length) {
    writeHeading("Appendix", 14);
    for (const chunk of appendixChunks) {
      chunk();
    }
  }

  const buffer = doc.output("arraybuffer") as ArrayBuffer;
  return { content: new Uint8Array(buffer), mimeType: "application/pdf" };
}
