import type { RpConfig, RpStats, StoryMessage } from "../types/models";
import { effectiveCoreStats } from "./rpStats";

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
  const { default: jsPDF } = await import("jspdf");
  const { storyTitle, exportedAt, rpStats, rpConfig, messages } = data;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  function checkPage(needed = 24) {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function heading(text: string, size = 16) {
    checkPage(size + 12);
    doc.setFontSize(size);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin, y);
    y += size + 6;
  }

  function subheading(text: string) {
    checkPage(14);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin, y);
    y += 16;
  }

  function body(text: string, indent = 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(text, contentW - indent);
    for (const line of wrapped) {
      checkPage(13);
      doc.text(line as string, margin + indent, y);
      y += 13;
    }
  }

  function rule() {
    checkPage(10);
    doc.setDrawColor(180, 180, 180);
    doc.line(margin, y, pageW - margin, y);
    y += 8;
  }

  // Title
  heading(`${storyTitle} — RP Export`, 18);
  body(`Exported ${new Date(exportedAt).toLocaleString()}`);
  y += 8;
  rule();

  // Character Sheet
  heading("Character Sheet");
  body(`HP: ${rpStats.hp} / ${rpConfig.maxHp}`);
  body(`${rpConfig.currencyName}: ${rpStats.gold}`);
  for (const [label, val] of coreStatEntries(rpStats, rpConfig)) {
    body(`${label}: ${val}`);
  }
  y += 6;

  // NPC HP
  const npcEntries = Object.values(rpStats.npcHp);
  if (npcEntries.length > 0) {
    heading("NPC HP");
    for (const npc of npcEntries) {
      body(`${npc.name}: ${npc.current} / ${npc.max}`);
    }
    y += 6;
  }

  // Changelog
  heading("Stat Changelog");
  if (rpStats.changelog.length === 0) {
    body("No changes recorded.");
  } else {
    rpStats.changelog.forEach((e, i) => {
      body(`${i + 1}. [${formatDate(e.ts)}] ${e.field}: ${e.from} -> ${e.to}`, 0);
      body(`   ${e.reason}`, 12);
    });
  }
  y += 6;

  // Transcript
  heading("Story Transcript");
  rule();
  for (const msg of messages) {
    const speaker = msg.speakerName ?? (msg.role === "user" ? "Player" : "Narrator");
    subheading(speaker);
    body(msg.content);
    y += 4;
    rule();
  }

  return doc.output("blob");
}
