import type { RpConfig, RpStats, StoryMessage } from "../types/models";
import { effectiveCoreStats } from "./rpStats";
import {
  createPdfDoc,
  pdfDimensions,
  heading,
  body,
  metaLine,
  speakerLine,
  rule,
  PDF_MARGIN,
} from "./pdfLayout";

export interface RpExportData {
  storyTitle: string;
  exportedAt: string;
  rpStats: RpStats;
  rpConfig: RpConfig;
  messages: StoryMessage[];
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

function coreStatEntries(rpStats: RpStats, rpConfig: RpConfig) {
  const core = effectiveCoreStats(rpStats, rpConfig);
  return [
    ["STR", core.str],
    ["DEX", core.dex],
    ["CON", core.con],
    ["INT", core.int],
    ["WIS", core.wis],
    ["CHA", core.cha],
  ] as [string, number][];
}

// ── JSON ─────────────────────────────────────────────────────────────────────

export function buildRpExportJson(data: RpExportData): string {
  const { storyTitle, exportedAt, rpStats, rpConfig, messages } = data;
  const core = effectiveCoreStats(rpStats, rpConfig);

  const payload = {
    story: { title: storyTitle, exportedAt },
    characterSheet: {
      hp: { current: rpStats.hp, max: rpConfig.maxHp },
      [rpConfig.currencyName.toLowerCase() || "gold"]: rpStats.gold,
      str: core.str,
      dex: core.dex,
      con: core.con,
      int: core.int,
      wis: core.wis,
      cha: core.cha,
    },
    npcHp: Object.fromEntries(
      Object.entries(rpStats.npcHp).map(([k, v]) => [
        k,
        { name: v.name, current: v.current, max: v.max },
      ]),
    ),
    changelog: rpStats.changelog.map((e) => ({
      date: formatDate(e.ts),
      field: e.field,
      from: e.from,
      to: e.to,
      reason: e.reason,
    })),
    transcript: messages.map((m) => ({
      role: m.role,
      speaker: m.speakerName ?? (m.role === "user" ? "Player" : "Narrator"),
      content: m.content,
      timestamp: new Date(m.timestamp).toISOString(),
    })),
  };

  return JSON.stringify(payload, null, 2);
}

// ── Markdown ──────────────────────────────────────────────────────────────────

export function buildRpExportMarkdown(data: RpExportData): string {
  const { storyTitle, exportedAt, rpStats, rpConfig, messages } = data;
  const lines: string[] = [];

  lines.push(`# ${storyTitle} — RP Export`);
  lines.push(`*Exported ${new Date(exportedAt).toLocaleString()}*`);
  lines.push("");

  // Character Sheet
  lines.push("## Character Sheet");
  lines.push("");
  lines.push("| Stat | Value |");
  lines.push("|---|---|");
  lines.push(`| HP | ${rpStats.hp} / ${rpConfig.maxHp} |`);
  lines.push(`| ${rpConfig.currencyName} | ${rpStats.gold} |`);
  for (const [label, val] of coreStatEntries(rpStats, rpConfig)) {
    lines.push(`| ${label} | ${val} |`);
  }
  lines.push("");

  // NPC HP
  const npcEntries = Object.values(rpStats.npcHp);
  if (npcEntries.length > 0) {
    lines.push("## NPC HP");
    lines.push("");
    lines.push("| Name | Current | Max |");
    lines.push("|---|---|---|");
    for (const npc of npcEntries) {
      lines.push(`| ${npc.name} | ${npc.current} | ${npc.max} |`);
    }
    lines.push("");
  }

  // Changelog
  lines.push("## Stat Changelog");
  lines.push("");
  if (rpStats.changelog.length === 0) {
    lines.push("*No changes recorded.*");
  } else {
    lines.push("| # | When | Field | From | To | Reason |");
    lines.push("|---|---|---|---|---|---|");
    rpStats.changelog.forEach((e, i) => {
      lines.push(
        `| ${i + 1} | ${formatDate(e.ts)} | ${e.field} | ${e.from} | ${e.to} | ${e.reason} |`,
      );
    });
  }
  lines.push("");

  // Transcript
  lines.push("## Story Transcript");
  lines.push("");
  for (const msg of messages) {
    const speaker = msg.speakerName ?? (msg.role === "user" ? "Player" : "Narrator");
    lines.push(`**${speaker}:** ${msg.content}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// ── Plain text ────────────────────────────────────────────────────────────────

export function buildRpExportText(data: RpExportData): string {
  const { storyTitle, exportedAt, rpStats, rpConfig, messages } = data;
  const lines: string[] = [];

  lines.push(`${storyTitle} — RP Export`);
  lines.push(`Exported ${new Date(exportedAt).toLocaleString()}`);
  lines.push("=".repeat(60));
  lines.push("");

  lines.push("CHARACTER SHEET");
  lines.push("-".repeat(30));
  lines.push(`HP: ${rpStats.hp} / ${rpConfig.maxHp}`);
  lines.push(`${rpConfig.currencyName}: ${rpStats.gold}`);
  for (const [label, val] of coreStatEntries(rpStats, rpConfig)) {
    lines.push(`${label}: ${val}`);
  }
  lines.push("");

  const npcEntries = Object.values(rpStats.npcHp);
  if (npcEntries.length > 0) {
    lines.push("NPC HP");
    lines.push("-".repeat(30));
    for (const npc of npcEntries) {
      lines.push(`${npc.name}: ${npc.current} / ${npc.max}`);
    }
    lines.push("");
  }

  lines.push("STAT CHANGELOG");
  lines.push("-".repeat(30));
  if (rpStats.changelog.length === 0) {
    lines.push("No changes recorded.");
  } else {
    rpStats.changelog.forEach((e, i) => {
      lines.push(`${i + 1}. [${formatDate(e.ts)}] ${e.field}: ${e.from} -> ${e.to} (${e.reason})`);
    });
  }
  lines.push("");

  lines.push("STORY TRANSCRIPT");
  lines.push("=".repeat(60));
  lines.push("");
  for (const msg of messages) {
    const speaker = msg.speakerName ?? (msg.role === "user" ? "Player" : "Narrator");
    lines.push(`${speaker}:`);
    lines.push(msg.content);
    lines.push("");
    lines.push("-".repeat(40));
    lines.push("");
  }

  return lines.join("\n");
}

// ── PDF (jsPDF) ───────────────────────────────────────────────────────────────

export async function buildRpExportPdf(data: RpExportData): Promise<Blob> {
  const { storyTitle, exportedAt, rpStats, rpConfig, messages } = data;

  const doc = createPdfDoc();
  const { pageW, pageH } = pdfDimensions(doc);
  let y = PDF_MARGIN;

  // Title
  y = heading(doc, y, `${storyTitle} — RP Export`, 18, pageH);
  y = body(doc, y, `Exported ${new Date(exportedAt).toLocaleString()}`, 0, undefined, pageH);
  y += 6;
  y = rule(doc, y, pageW);

  // Character Sheet
  y = heading(doc, y, "Character Sheet", 14, pageH);
  y = metaLine(doc, y, "HP", `${rpStats.hp} / ${rpConfig.maxHp}`, pageH);
  y = metaLine(doc, y, rpConfig.currencyName, String(rpStats.gold), pageH);
  for (const [label, val] of coreStatEntries(rpStats, rpConfig)) {
    y = metaLine(doc, y, label, String(val), pageH);
  }
  y += 4;
  y = rule(doc, y, pageW);

  // NPC HP
  const npcEntries = Object.values(rpStats.npcHp);
  if (npcEntries.length > 0) {
    y = heading(doc, y, "NPC HP", 14, pageH);
    for (const npc of npcEntries) {
      y = metaLine(doc, y, npc.name, `${npc.current} / ${npc.max}`, pageH);
    }
    y += 4;
    y = rule(doc, y, pageW);
  }

  // Changelog
  y = heading(doc, y, "Stat Changelog", 14, pageH);
  if (rpStats.changelog.length === 0) {
    y = body(doc, y, "No changes recorded.", 0, undefined, pageH);
  } else {
    rpStats.changelog.forEach((e, i) => {
      y = body(doc, y, `${i + 1}. [${formatDate(e.ts)}] ${e.field}: ${e.from} → ${e.to} — ${e.reason}`, 0, undefined, pageH);
    });
  }
  y += 4;
  y = rule(doc, y, pageW);

  // Transcript
  y = heading(doc, y, "Story Transcript", 14, pageH);
  y = rule(doc, y, pageW);
  for (const msg of messages) {
    const speaker = msg.speakerName ?? (msg.role === "user" ? "Player" : "Narrator");
    y = speakerLine(doc, y, speaker, msg.content, pageH);
    y = rule(doc, y, pageW);
  }

  return doc.output("blob");
}
