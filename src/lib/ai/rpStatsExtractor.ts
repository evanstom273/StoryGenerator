import type { RpConfig, RpStats } from "../../types/models";
import type { AIProvider } from "./types";
import { clampStat, effectiveCoreStats, getStatValue, isValidStatField } from "../rpStats";
import { formatTime } from "../rpTime";

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
  timeAdvanceMinutes?: number;
};

export type RpExtractorContext = {
  characterBackground?: string;
  universeLore?: string;
};

function safeParseExtractorResponse(text: string): { deltas: unknown[]; narrative?: string; npcHpChanges?: unknown[]; timeAdvanceMinutes?: number } | null {
  const trimmed = text.trim();

  const objStart = trimmed.indexOf("{");
  if (objStart !== -1) {
    const objEnd = trimmed.lastIndexOf("}");
    if (objEnd > objStart) {
      try {
        const parsed = JSON.parse(trimmed.slice(objStart, objEnd + 1)) as unknown;
        if (parsed && typeof parsed === "object" && "deltas" in parsed) {
          const obj = parsed as { deltas: unknown; narrative?: unknown; npcHpChanges?: unknown; timeAdvanceMinutes?: unknown };
          return {
            deltas: Array.isArray(obj.deltas) ? obj.deltas : [],
            narrative: typeof obj.narrative === "string" && obj.narrative.trim() ? obj.narrative.trim() : undefined,
            npcHpChanges: Array.isArray(obj.npcHpChanges) ? obj.npcHpChanges : undefined,
            timeAdvanceMinutes: typeof obj.timeAdvanceMinutes === "number" && obj.timeAdvanceMinutes > 0
              ? Math.round(obj.timeAdvanceMinutes)
              : undefined,
          };
        }
      } catch {}
    }
  }

  // Fallback: bare array (old format)
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
  context?: RpExtractorContext,
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

  const timeContext = rpStats.timeState ? `Current in-story time: ${formatTime(rpStats.timeState, config)}` : "";

  const settingContext = [
    context?.universeLore ? `Setting/universe: ${context.universeLore.slice(0, 400)}` : "",
    context?.characterBackground ? `Character background: ${context.characterBackground.slice(0, 300)}` : "",
    timeContext,
  ].filter(Boolean).join("\n");

  const prompt = [
    "Analyze the story scene below and identify stat changes for the PLAYER CHARACTER, any NPC health events, and time elapsed.",
    "",
    `Current player stats: HP ${rpStats.hp}/${config.maxHp}, ${config.currencyName} ${rpStats.gold}, STR ${core.str} DEX ${core.dex} CON ${core.con} INT ${core.int} WIS ${core.wis} CHA ${core.cha}`,
    goldFloorNote,
    `Current NPC HP: ${npcHpContext}`,
    settingContext,
    "",
    "Valid player fields: hp, gold, str, dex, con, int, wis, cha",
    "",
    "IMPORTANT: Return ONLY a JSON object. Always use this exact format:",
    '{"deltas":[{"field":"hp","delta":-15,"reason":"Arrow wound"}],"narrative":"Short one-line summary","npcHpChanges":[],"timeAdvanceMinutes":10}',
    "",
    "Format examples:",
    '- Nothing RP-relevant: {"deltas":[],"narrative":null,"npcHpChanges":[],"timeAdvanceMinutes":5}',
    `- Blocked purchase:    {"deltas":[],"narrative":"Purchase blocked — ${config.currencyName} ${rpStats.gold} available, cost exceeded balance","npcHpChanges":[],"timeAdvanceMinutes":5}`,
    '- Gold spent (explicit price): {"deltas":[{"field":"gold","delta":-6,"reason":"snacks"}],"narrative":"Spent $6 on snacks","npcHpChanges":[],"timeAdvanceMinutes":15}',
    '- Gold spent (inferred price): {"deltas":[{"field":"gold","delta":-5,"reason":"coffee"}],"narrative":"Spent ~$5 on coffee","npcHpChanges":[],"timeAdvanceMinutes":10}',
    '- Wages earned:        {"deltas":[{"field":"gold","delta":85,"reason":"4-hour shift at grocery store"}],"narrative":"Earned $85 after shift","npcHpChanges":[],"timeAdvanceMinutes":240}',
    '- HP damage:           {"deltas":[{"field":"hp","delta":-10,"reason":"Fell off ledge"}],"narrative":"HP -10 from falling","npcHpChanges":[],"timeAdvanceMinutes":5}',
    '- HP healing:          {"deltas":[{"field":"hp","delta":8,"reason":"Ibuprofen relieved headache"}],"narrative":"HP +8 from painkillers","npcHpChanges":[],"timeAdvanceMinutes":30}',
    '- NPC health event:    {"deltas":[],"narrative":"Gladys collapsed with a cardiac event","npcHpChanges":[{"npcKey":"gladys","name":"Gladys","delta":-50,"maxHp":75,"reason":"cardiac seizure"}],"timeAdvanceMinutes":15}',
    '- Sleep / rest:        {"deltas":[{"field":"hp","delta":20,"reason":"Full night sleep"}],"narrative":"Slept through the night, feeling better","npcHpChanges":[],"timeAdvanceMinutes":480}',
    "",
    "Rules for player deltas:",
    "- Use negative delta for decreases, positive for increases.",
    "- Only include changes CLEARLY implied by the narrative. Do not invent changes.",
    `- Include a gold delta whenever money changes hands in the scene, even if no explicit price is stated. Infer a realistic amount using the era/genre benchmarks below and the setting context.`,
    `- For SPENDING: negative delta. For EARNING (wages, tips, rewards, found money, sold items, completing work): positive delta.`,
    "- Be conservative — use the low end of each range for casual/everyday transactions.",
    "- If clearly gifted, comped, paid by someone else, or if the character did not participate in the transaction: do NOT apply a delta.",
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
    "Rules for timeAdvanceMinutes:",
    "- Estimate in-story minutes elapsed during this scene.",
    "- Brief conversation / instant action: 5–15 min",
    "- Short task (buying something, short walk, quick errand): 15–30 min",
    "- Meal, studying, light shopping, social visit: 30–120 min",
    "- Short journey within a city / neighbourhood: 20–60 min",
    "- Long journey (city to city, road trip, train/plane): 120–480 min",
    "- Work shift (4–8 hrs): 240–480 min",
    "- Sleep / overnight rest: 360–540 min",
    "- Recovery, medical stay: 480–1440 min or more",
    "- Explicit multi-day skip (next week, three months later): calculate as days × 1440",
    "- Set to 0 or null if time is indeterminate or the scene is instantaneous.",
    "",
    "Rules for narrative:",
    "- Write a short one-line summary whenever something RP-relevant happened, even if deltas is [].",
    `- RP-relevant means: any currency transaction (successful or blocked), HP damage or healing, a stat consequence, an NPC health event, or a resource interaction.`,
    `- For blocked purchases always write a narrative even though deltas is [].`,
    "- Set narrative to null only if the scene had absolutely no RP-relevant content.",
    "",
    `Era/genre price benchmarks for ${config.currencyName} (defer to setting context and universe lore when available):`,
    `MODERN: Coffee $3–6 · Fast food $8–15 · Sit-down meal $15–35 · Bus/subway $2–4 · Rideshare short $10–20 · Rideshare long $25–60 · Haircut $20–50 · Bar drink $5–12 · Movie $12–20 · Doctor/urgent care $100–300 · Prescription $10–50 · Grocery run (small) $20–60 · Clothing item $20–80 · Min-wage shift (4–8 hrs) $50–120 · Tips $10–50`,
    `FANTASY/RPG: Tavern meal+drink 5–10 sp · Night's lodging 5 sp–2 gp · Rope (50ft) 1 gp · Dagger 2 gp · Short sword 10 gp · Potion of healing 50 gp · Horse 75 gp · Laborer day wage 1–4 sp · Artisan day 5–20 sp`,
    `HISTORICAL/PRE-INDUSTRIAL: Bread 1–2 d · Ale (pint) 1 d · Inn night 2–6 d · Laborer (day) 1–4 d · Chicken 1 d`,
    `SCI-FI/FUTURISTIC: Food/drink 5–25 cr · Transit 1–5 cr · Basic tool 50–200 cr · Service 50–500 cr · Shift wages 100–400 cr`,
    "",
    "Story scene:",
    assistantText.slice(0, 2000),
  ].filter(line => line !== undefined).join("\n");

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
    const timeAdvanceMinutes = parsed.timeAdvanceMinutes;

    if (!deltas.length && !narrative && !npcHpChanges.length && !timeAdvanceMinutes) return null;
    return {
      deltas,
      narrative,
      npcHpChanges: npcHpChanges.length ? npcHpChanges : undefined,
      timeAdvanceMinutes,
    };
  } catch {
    return null;
  }
}
