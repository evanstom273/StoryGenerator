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

  const prompt = [
    "Analyze the story scene below and identify any stat changes implied for the PLAYER CHARACTER only.",
    "",
    `Current stats: HP ${rpStats.hp}/${config.maxHp}, ${config.currencyName} ${rpStats.gold}, STR ${core.str} DEX ${core.dex} CON ${core.con} INT ${core.int} WIS ${core.wis} CHA ${core.cha}`,
    goldFloorNote,
    "",
    "Valid fields: hp, gold, str, dex, con, int, wis, cha",
    "",
    "IMPORTANT: Return ONLY a JSON object — never a bare array. Always use this exact format:",
    '{"deltas":[{"field":"hp","delta":-15,"reason":"Arrow wound"}],"narrative":"Short one-line summary"}',
    "",
    "Format examples:",
    '- Nothing RP-relevant: {"deltas":[],"narrative":null}',
    `- Blocked purchase:    {"deltas":[],"narrative":"Purchase blocked — ${config.currencyName} ${rpStats.gold} available, cost exceeded balance"}`,
    '- Gold spent:          {"deltas":[{"field":"gold","delta":-6,"reason":"snacks"}],"narrative":"Spent $6 on snacks"}',
    '- HP damage:           {"deltas":[{"field":"hp","delta":-10,"reason":"Fell off ledge"}],"narrative":"HP -10 from falling"}',
    "",
    "Rules for deltas:",
    "- Use negative delta for decreases, positive for increases.",
    "- Only include changes CLEARLY implied by the narrative. Do not invent changes.",
    "- Do not change gold unless currency is explicitly awarded or spent in the scene.",
    "- If a purchase was attempted but blocked due to insufficient funds, do NOT deduct gold — just set narrative.",
    "- Core stats (str, dex, con, int, wis, cha) should ONLY change for significant, persistent events — long-term training, major illness, lasting injury, profound personal growth. A single scene or ordinary activity almost never warrants a core stat change.",
    "",
    "Rules for narrative:",
    "- Write a short one-line summary whenever something RP-relevant happened, even if deltas is [].",
    `- RP-relevant means: any currency transaction (successful or blocked), HP damage or healing, a stat consequence, or a resource interaction.`,
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
        // Change was blocked by clamping (e.g. can't go below 0 gold)
        blockedAttempts.push({ field, reason: typeof reason === "string" ? reason.trim() : field });
        continue;
      }
      deltas.push({ field, delta: to - from, reason: typeof reason === "string" ? reason.trim() : field });
    }

    // Use AI narrative, or fall back to a code-generated one from blocked attempts
    const blockedNarrative = blockedAttempts.length
      ? blockedAttempts
          .map((b) => `${b.field === "gold" ? config.currencyName : b.field.toUpperCase()} change blocked — ${b.reason}`)
          .join(" · ")
      : undefined;

    const narrative = parsed.narrative ?? blockedNarrative;

    if (!deltas.length && !narrative) return null;
    return { deltas, narrative };
  } catch {
    return null;
  }
}
