import type { RpConfig, RpStats } from "../../types/models";
import type { AIProvider } from "./types";
import { clampStat, effectiveCoreStats, getStatValue, isValidStatField } from "../rpStats";

export type RpStatDelta = { field: string; delta: number; reason: string };

export type RpExtractorResult = {
  deltas: RpStatDelta[];
  narrative?: string;
};

function safeParseExtractorResponse(text: string): { deltas: unknown[]; narrative?: string } | null {
  const trimmed = text.trim();

  // Try object format first: {"deltas":[...],"narrative":"..."}
  const objStart = trimmed.indexOf("{");
  if (objStart !== -1) {
    const objEnd = trimmed.lastIndexOf("}");
    if (objEnd > objStart) {
      try {
        const parsed = JSON.parse(trimmed.slice(objStart, objEnd + 1)) as unknown;
        if (parsed && typeof parsed === "object" && "deltas" in parsed) {
          const obj = parsed as { deltas: unknown; narrative?: unknown };
          return {
            deltas: Array.isArray(obj.deltas) ? obj.deltas : [],
            narrative: typeof obj.narrative === "string" && obj.narrative.trim() ? obj.narrative.trim() : undefined,
          };
        }
      } catch {}
    }
  }

  // Fallback: bare array
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

  const prompt = [
    "Analyze the story scene below and identify any stat changes implied for the PLAYER CHARACTER only.",
    "",
    `Current stats: HP ${rpStats.hp}/${config.maxHp}, ${config.currencyName} ${rpStats.gold}, STR ${core.str} DEX ${core.dex} CON ${core.con} INT ${core.int} WIS ${core.wis} CHA ${core.cha}`,
    goldFloorNote,
    "",
    "Valid fields: hp, gold, str, dex, con, int, wis, cha",
    "",
    'Return a JSON object in this exact format:',
    '{"deltas":[{"field":"hp","delta":-15,"reason":"Arrow wound"}],"narrative":"Short one-line summary of the RP event"}',
    "",
    "Rules for deltas:",
    "- Use [] if nothing changed. Use negative delta for decreases, positive for increases.",
    "- Only include changes CLEARLY implied by the narrative. Do not invent changes.",
    "- Do not change gold unless currency is explicitly awarded or spent in the scene.",
    "- If a purchase was attempted but blocked due to insufficient funds, do NOT deduct gold.",
    "- Core stats (str, dex, con, int, wis, cha) should ONLY change for significant, persistent events — long-term training, major illness, lasting injury, profound personal growth. A single scene or ordinary activity almost never warrants a core stat change.",
    "",
    "Rules for narrative:",
    `- Write a short one-line summary whenever something RP-relevant happened, even if deltas is [].`,
    `- RP-relevant means: any currency transaction (successful or blocked), HP damage or healing, a stat check or consequence, or a resource interaction.`,
    `- For blocked purchases write e.g. "Purchase blocked — ${config.currencyName} ${rpStats.gold} available, cost exceeded balance"`,
    `- For stat changes summarise them briefly e.g. "HP -10 from falling · Gold -5 for room and board"`,
    `- Set narrative to null if the scene had no RP-relevant content at all.`,
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
    for (const item of parsed.deltas) {
      if (!item || typeof item !== "object") continue;
      const field = (item as any).field;
      const delta = (item as any).delta;
      const reason = (item as any).reason;
      if (typeof field !== "string" || !isValidStatField(field)) continue;
      if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) continue;
      const from = getStatValue(rpStats, config, field);
      const to = clampStat(field, from + delta, config);
      if (to === from) continue;
      deltas.push({ field, delta: to - from, reason: typeof reason === "string" ? reason.trim() : field });
    }

    const narrative = parsed.narrative;
    if (!deltas.length && !narrative) return null;

    return { deltas, narrative };
  } catch {
    return null;
  }
}
