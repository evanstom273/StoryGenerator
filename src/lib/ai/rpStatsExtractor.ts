import type { RpConfig, RpStats } from "../../types/models";
import type { AIProvider } from "./types";
import { clampStat, effectiveCoreStats, getStatValue, isValidStatField } from "../rpStats";

export type RpStatDelta = { field: string; delta: number; reason: string };

function safeParseJsonArray<T>(text: string): T[] | null {
  try {
    const trimmed = text.trim();
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start === -1 || end === -1 || end < start) return null;
    const slice = trimmed.slice(start, end + 1);
    const parsed = JSON.parse(slice) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as T[];
  } catch {
    return null;
  }
}

export async function extractRpStatChanges(
  assistantText: string,
  rpStats: RpStats,
  config: RpConfig,
  provider: AIProvider,
  apiKey: string,
  model: string,
): Promise<RpStatDelta[] | null> {
  const core = effectiveCoreStats(rpStats, config);

  const prompt = [
    "Analyze the story scene below and identify any stat changes implied for the PLAYER CHARACTER only.",
    "",
    `Current stats: HP ${rpStats.hp}/${config.maxHp}, ${config.currencyName} ${rpStats.gold}, STR ${core.str} DEX ${core.dex} CON ${core.con} INT ${core.int} WIS ${core.wis} CHA ${core.cha}`,
    "",
    "Valid fields: hp, gold, str, dex, con, int, wis, cha",
    "",
    'Return ONLY a JSON array: [{"field":"hp","delta":-15,"reason":"Arrow wound"}]',
    "Return [] if nothing changed. Use negative delta for decreases, positive for increases.",
    "Only include changes CLEARLY implied by the narrative. Do not invent changes.",
    "Do not change gold unless currency is explicitly awarded or spent in the scene.",
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
    const items = safeParseJsonArray<unknown>(raw);
    if (!items) return null;

    const deltas: RpStatDelta[] = [];
    for (const item of items) {
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

    return deltas.length ? deltas : null;
  } catch {
    return null;
  }
}
