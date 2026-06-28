import type { PendingTransaction, RpConfig, RpStats } from "../../types/models";
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
  /** undefined = no change; null = clear pending; object = set/update pending */
  pendingTransaction?: PendingTransaction | null;
};

export type RpExtractorContext = {
  characterBackground?: string;
  universeLore?: string;
  playerMessage?: string;
  pendingTransaction?: PendingTransaction;
};

function safeParseExtractorResponse(text: string): { deltas: unknown[]; narrative?: string; npcHpChanges?: unknown[]; pendingTransaction?: unknown } | null {
  const trimmed = text.trim();

  const objStart = trimmed.indexOf("{");
  if (objStart !== -1) {
    const objEnd = trimmed.lastIndexOf("}");
    if (objEnd > objStart) {
      try {
        const parsed = JSON.parse(trimmed.slice(objStart, objEnd + 1)) as unknown;
        if (parsed && typeof parsed === "object" && "deltas" in parsed) {
          const obj = parsed as { deltas: unknown; narrative?: unknown; npcHpChanges?: unknown; pendingTransaction?: unknown };
          const hasPendingField = "pendingTransaction" in obj;
          return {
            deltas: Array.isArray(obj.deltas) ? obj.deltas : [],
            narrative: typeof obj.narrative === "string" && obj.narrative.trim() ? obj.narrative.trim() : undefined,
            npcHpChanges: Array.isArray(obj.npcHpChanges) ? obj.npcHpChanges : undefined,
            // Only include the key when it was actually present in the response
            ...(hasPendingField ? { pendingTransaction: obj.pendingTransaction } : {}),
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

  const pendingTxContext = context?.pendingTransaction
    ? `Pending transaction: ${context.pendingTransaction.description} · ${config.currencyName}${context.pendingTransaction.amount}`
    : `Pending transaction: None`;

  const prompt = [
    "Analyze the story scene below and identify stat changes for the PLAYER CHARACTER, any NPC health events, and time elapsed.",
    "",
    `Current player stats: HP ${rpStats.hp}/${config.maxHp}, ${config.currencyName} ${rpStats.gold}, STR ${core.str} DEX ${core.dex} CON ${core.con} INT ${core.int} WIS ${core.wis} CHA ${core.cha}`,
    goldFloorNote,
    pendingTxContext,
    `Current NPC HP: ${npcHpContext}`,
    settingContext,
    "",
    "Valid player fields: hp, gold, str, dex, con, int, wis, cha",
    "",
    "PRICE RULE: When an NPC states a price verbatim (e.g. 'eight-fifty' = 8.50, 'five eighty-seven' = 5.87, 'twelve fifty' = 12.50), use EXACTLY that number for pendingTransaction.amount. Benchmarks are a fallback ONLY when no price is stated — they must NEVER override a spoken price.",
    "AMOUNT LOCK: Once pendingTransaction.amount is set from a stated price, do NOT change it for inferred extras (bag fees, taxes, tips). Only update if an NPC explicitly states a new total (e.g. 'With the bag that's $8.75').",
    "",
    "IMPORTANT: Return ONLY a JSON object. Always use this exact format:",
    '{"deltas":[{"field":"hp","delta":-15,"reason":"Arrow wound"}],"narrative":"Short one-line summary","npcHpChanges":[]}',
    "",
    "Format examples (pendingTransaction shown where relevant):",
    '- Nothing RP-relevant:   {"deltas":[],"narrative":null,"npcHpChanges":[]}',
    `- Blocked purchase:      {"deltas":[],"narrative":"Purchase blocked — ${config.currencyName} ${rpStats.gold} available, cost exceeded balance","npcHpChanges":[]}`,
    '- Spoken price (pending):{"deltas":[],"narrative":"Cashier says eight-fifty for snacks","npcHpChanges":[],"pendingTransaction":{"description":"snacks","amount":8.50}}',
    '- Price stated (pending):{"deltas":[],"narrative":"Cashier rings up $5.87 for snacks","npcHpChanges":[],"pendingTransaction":{"description":"snacks","amount":5.87}}',
    '- Awaiting payment:      {"deltas":[],"narrative":"Awaiting $5.87 payment","npcHpChanges":[],"pendingTransaction":{"description":"snacks","amount":5.87}}',
    '- Payment completed:     {"deltas":[{"field":"gold","delta":-5.87,"reason":"snacks"}],"narrative":"Paid $5.87 for snacks","npcHpChanges":[],"pendingTransaction":null}',
    '- Transaction cancelled: {"deltas":[],"narrative":"Left without buying","npcHpChanges":[],"pendingTransaction":null}',
    '- Gold spent (no prior pending, inferred): {"deltas":[{"field":"gold","delta":-5,"reason":"coffee"}],"narrative":"Spent ~$5 on coffee","npcHpChanges":[]}',
    '- Wages earned:          {"deltas":[{"field":"gold","delta":85,"reason":"4-hour shift at grocery store"}],"narrative":"Earned $85 after shift","npcHpChanges":[]}',
    '- HP damage:             {"deltas":[{"field":"hp","delta":-10,"reason":"Fell off ledge"}],"narrative":"HP -10 from falling","npcHpChanges":[]}',
    '- HP healing:            {"deltas":[{"field":"hp","delta":8,"reason":"Ibuprofen relieved headache"}],"narrative":"HP +8 from painkillers","npcHpChanges":[]}',
    '- NPC health event:      {"deltas":[],"narrative":"Gladys collapsed with a cardiac event","npcHpChanges":[{"npcKey":"gladys","name":"Gladys","delta":-50,"maxHp":75,"reason":"cardiac seizure"}]}',
    '- Sleep / rest:          {"deltas":[{"field":"hp","delta":20,"reason":"Full night sleep"}],"narrative":"Slept through the night, feeling better","npcHpChanges":[]}',
    "",
    "Rules for pendingTransaction:",
    "- Use pendingTransaction to track a purchase that has been started but not yet paid.",
    "- Set pendingTransaction to {description, amount} when a price is announced or confirmed but payment is not complete (cashier states price, machine shows total, etc.).",
    "- If the exact price is stated verbatim in the dialogue (e.g. cashier says 'Five eighty-seven' = $5.87, or 'That'll be £12.50'), capture that EXACT amount in pendingTransaction.amount — do not round or approximate.",
    "- Keep the same pendingTransaction object (repeat it) if payment is still awaited in a subsequent scene.",
    "- Set pendingTransaction to null when: (a) payment is completed — also add the gold delta, (b) the transaction is abandoned/cancelled/refused.",
    "- Omit the pendingTransaction field entirely if this scene has nothing to do with any transaction.",
    "- When completing a payment: use the EXACT pendingTransaction.amount from context for the gold delta — do NOT re-infer the price.",
    "",
    "Rules for player deltas:",
    "- Use negative delta for decreases, positive for increases.",
    "- Only include changes CLEARLY implied by the narrative. Do not invent changes.",
    `- Add a gold delta ONLY when the transaction is FULLY COMPLETE — money handed over AND goods/service received. Do NOT deduct if the price is just being stated, a machine is prompting for payment, or the player is selecting items.`,
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
    ...(context?.playerMessage ? [`Player: ${context.playerMessage.slice(0, 500)}`] : []),
    `Narrator: ${assistantText.slice(0, 2000)}`,
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

    // Parse pendingTransaction: undefined = field absent (no change), null = clear, object = set
    let pendingTransaction: PendingTransaction | null | undefined = undefined;
    if ("pendingTransaction" in parsed) {
      const pt = parsed.pendingTransaction;
      if (pt === null) {
        pendingTransaction = null;
      } else if (pt && typeof pt === "object") {
        const desc = (pt as any).description;
        const amt = (pt as any).amount;
        if (typeof desc === "string" && desc.trim() && typeof amt === "number" && amt > 0) {
          pendingTransaction = { description: desc.trim(), amount: amt };
        }
      }
    }

    if (!deltas.length && !narrative && !npcHpChanges.length && pendingTransaction === undefined) return null;
    return {
      deltas,
      narrative,
      npcHpChanges: npcHpChanges.length ? npcHpChanges : undefined,
      ...(pendingTransaction !== undefined ? { pendingTransaction } : {}),
    };
  } catch {
    return null;
  }
}
