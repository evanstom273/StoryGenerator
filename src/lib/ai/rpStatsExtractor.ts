import type { RpConfig, RpStats } from "../../types/models";
import type { AIProvider } from "./types";
import { clampStat, effectiveCoreStats, getStatValue, isValidStatField } from "../rpStats";

export type RpStatDelta = { field: string; delta: number; reason: string };

export type NpcHpChange = {
  npcKey: string;
  name: string;
  delta: number;
  maxHp?: number;
  reason: string;
};

export type RpExtractorResult = {
  deltas: RpStatDelta[];
  narrative?: string;
  npcHpChanges?: NpcHpChange[];
};

function safeParseExtractorResponse(text: string): { deltas: unknown[]; narrative?: string; npcHpChanges?: unknown[] } | null {
  const trimmed = text.trim();

  // Try object format first: {"deltas":[...],"narrative":"...","npcHpChanges":[...]}
  const objStart = trimmed.indexOf("{");
  if (objStart !== -1) {
    const objEnd = trimmed.lastIndexOf("}");
    if (objEnd > objStart) {
      try {
        const parsed = JSON.parse(trimmed.slice(objStart, objEnd + 1)) as unknown;
        if (parsed && typeof parsed === "object" && "deltas" in parsed) {
          const obj = parsed as { deltas: unknown; narrative?: unknown; npcHpChanges?: unknown };
          return {
            deltas: Array.isArray(obj.deltas) ? obj.deltas : [],
            narrative: typeof obj.narrative === "string" && obj.narrative.trim() ? obj.narrative.trim() : undefined,
            npcHpChanges: Array.isArray(obj.npcHpChanges) ? obj.npcHpChanges : undefined,
          };
        }
      } catch {}
    }
  }

  // Fallback: bare array (old format — no narrative available)
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      if (Array.isArray(parsed)) return { deltas: parsed };
    } catch {}
  }

  return null;
}

export async function extractRpStatChanges(
  assistantText: string,
  rpStats: RpStats,
  config: RpConfig,
  provider: AIProvider,
  apiKey: string,
  model: string,
): Promise<RpExtractorResult | null> {
  const core = effectiveCoreStats(rpStats, config);

  const goldFloor = config.allowDebt
    ? (config.creditLimit != null && config.creditLimit > 0 ? -config.creditLimit : null)
    : 0;
  const goldFloorNote = goldFloor === null
    ? `Gold floor: unlimited debt allowed.`
    : `Gold floor: ${goldFloor} (${config.allowDebt ? "debt enabled" : "no debt"}).`;

  const npcHpEntries = Object.entries(rpStats.npcHp);
  const npcHpContext = npcHpEntries.length
    ? npcHpEntries.map(([, v]) => `${v.name}: ${v.current}/${v.max}`).join(", ")
    : "None";

  const prompt = [
    "Analyze the story scene below and identify stat changes for the PLAYER CHARACTER and any NPCs with significant physical health events.",
    "",
    `Current player stats: HP ${rpStats.hp}/${config.maxHp}, ${config.currencyName} ${rpStats.gold}, STR ${core.str} DEX ${core.dex} CON ${core.con} INT ${core.int} WIS ${core.wis} CHA ${core.cha}`,
    goldFloorNote,
    `Current NPC HP: ${npcHpContext}`,
    "",
    "Valid player fields: hp, gold, str, dex, con, int, wis, cha",
    "",
    "IMPORTANT: Return ONLY a JSON object. Always use this exact format:",
    '{"deltas":[{"field":"hp","delta":-15,"reason":"Arrow wound"}],"narrative":"Short one-line summary","npcHpChanges":[]}',
    "",
    "Format examples:",
    '- Nothing RP-relevant: {"deltas":[],"narrative":null,"npcHpChanges":[]}',
    `- Blocked purchase:    {"deltas":[],"narrative":"Purchase blocked — ${config.currencyName} ${rpStats.gold} available, cost exceeded balance","npcHpChanges":[]}`,
    '- Gold spent:          {"deltas":[{"field":"gold","delta":-6,"reason":"snacks"}],"narrative":"Spent $6 on snacks","npcHpChanges":[]}',
    '- HP damage:           {"deltas":[{"field":"hp","delta":-10,"reason":"Fell off ledge"}],"narrative":"HP -10 from falling","npcHpChanges":[]}',
    '- HP healing:          {"deltas":[{"field":"hp","delta":8,"reason":"Ibuprofen relieved headache"}],"narrative":"HP +8 from painkillers","npcHpChanges":[]}',
    '- NPC health event:    {"deltas":[],"narrative":"Gladys collapsed with a cardiac event","npcHpChanges":[{"npcKey":"gladys","name":"Gladys","delta":-50,"maxHp":75,"reason":"cardiac seizure"}]}',
    "",
    "Rules for player deltas:",
    "- Use negative delta for decreases, positive for increases.",
    "- Only include changes CLEARLY implied by the narrative. Do not invent changes.",
    "- Do not change gold unless currency is explicitly awarded or spent in the scene.",
    "- If a purchase was attempted but blocked due to insufficient funds, do NOT deduct gold — just set narrative.",
    "- HP can increase (healing). Apply a positive hp delta when the player takes medication and explicitly feels better (e.g. painkillers reducing a headache → +5 to +10 HP), receives direct medical treatment (+10 to +25 HP), or significantly rests/sleeps (+15 to +30 HP). Be conservative — over-the-counter pain relief is +5 to +10 HP max.",
    "- Core stats (str, dex, con, int, wis, cha) should ONLY change for significant, persistent events — long-term training, major illness, lasting injury, profound personal growth. A single scene or ordinary activity almost never warrants a core stat change.",
    "",
    "Rules for npcHpChanges:",
    "- Track named NPCs who suffer or recover from significant PHYSICAL health events in this scene only.",
    "- Severity guide: cardiac arrest/seizure → delta -40 to -60; serious injury (stab, gunshot, heavy blow) → delta -20 to -40; minor injury (punch, fall) → delta -5 to -15; medical treatment/healing → positive delta.",
    "- For NEW NPCs (not in Current NPC HP): include maxHp estimate — 100 for average adult, 75 for elderly/frail, 60 for child, 150 for large/strong.",
    "- For EXISTING NPCs: omit maxHp entirely.",
    "- npcKey must be a lowercase slug of the NPC's name (e.g. 'mr_rossi', 'gladys').",
    "- Do NOT track NPCs for emotional distress, arguments, or non-physical events.",
    "- Do NOT invent NPC health changes — only include clearly implied physical harm or recovery.",
    "",
    "Rules for narrative:",
    "- Write a short one-line summary whenever something RP-relevant happened, even if deltas is [].",
    `- RP-relevant means: any currency transaction (successful or blocked), HP damage or healing, a stat consequence, an NPC health event, or a resource interaction.`,
    `- For blocked purchases always write a narrative even though deltas is [].`,
    "- Set narrative to null only if the scene had absolutely no RP-relevant content.",
    "",
    "Story scene:",
    assistantText.slice(0, 2000),
  ].join("\n");

  try {
    const result = await provider.generateResponse({
      apiKey,
      model,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = result.content.trim();
    const parsed = safeParseExtractorResponse(raw);
    if (!parsed) return null;

    const deltas: RpStatDelta[] = [];
    const blockedAttempts: Array<{ field: string; reason: string }> = [];

    for (const item of parsed.deltas) {
      if (!item || typeof item !== "object") continue;
      const field = (item as any).field;
      const delta = (item as any).delta;
      const reason = (item as any).reason;
      if (typeof field !== "string" || !isValidStatField(field)) continue;
      if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) continue;
      const from = getStatValue(rpStats, config, field);
      const to = clampStat(field, from + delta, config);
      if (to === from) {
        blockedAttempts.push({ field, reason: typeof reason === "string" ? reason.trim() : field });
        continue;
      }
      deltas.push({ field, delta: to - from, reason: typeof reason === "string" ? reason.trim() : field });
    }

    // Parse NPC HP changes
    const npcHpChanges: NpcHpChange[] = [];
    for (const item of parsed.npcHpChanges ?? []) {
      if (!item || typeof item !== "object") continue;
      const npcKey = (item as any).npcKey;
      const name = (item as any).name;
      const delta = (item as any).delta;
      const maxHp = (item as any).maxHp;
      const reason = (item as any).reason;
      if (typeof npcKey !== "string" || !npcKey.trim()) continue;
      if (typeof name !== "string" || !name.trim()) continue;
      if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) continue;
      npcHpChanges.push({
        npcKey: npcKey.trim().toLowerCase().replace(/\s+/g, "_"),
        name: name.trim(),
        delta,
        maxHp: typeof maxHp === "number" && maxHp > 0 ? Math.round(maxHp) : undefined,
        reason: typeof reason === "string" ? reason.trim() : name.trim(),
      });
    }

    const blockedNarrative = blockedAttempts.length
      ? blockedAttempts
          .map((b) => `${b.field === "gold" ? config.currencyName : b.field.toUpperCase()} change blocked — ${b.reason}`)
          .join(" · ")
      : undefined;

    const narrative = parsed.narrative ?? blockedNarrative;

    if (!deltas.length && !narrative && !npcHpChanges.length) return null;
    return { deltas, narrative, npcHpChanges: npcHpChanges.length ? npcHpChanges : undefined };
  } catch {
    return null;
  }
}
