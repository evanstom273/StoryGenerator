import type { PendingTransaction, RpConfig, RpStats } from "../../types/models";
import type { AIProvider } from "./types";
import { clampStat, getStatValue, isValidStatField } from "../rpStats";
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
	suggestedCondition?: string;
	characterStateSummary?: string;
};

export type RpExtractorContext = {
	characterBackground?: string;
	universeLore?: string;
	playerMessage?: string;
	pendingTransaction?: PendingTransaction;
};

type ParsedExtractorResponse = {
	deltas: unknown[];
	narrative?: string;
	npcHpChanges?: unknown[];
	pendingTransaction?: unknown;
	suggestedCondition?: string;
	characterStateSummary?: string;
};

function safeParseExtractorResponse(text: string): ParsedExtractorResponse | null {
	const trimmed = text.trim();

	const objStart = trimmed.indexOf("{");
	if (objStart !== -1) {
		const objEnd = trimmed.lastIndexOf("}");
		if (objEnd > objStart) {
			try {
				const parsed = JSON.parse(trimmed.slice(objStart, objEnd + 1)) as unknown;
				if (parsed && typeof parsed === "object" && "deltas" in parsed) {
					const obj = parsed as Record<string, unknown>;
					const hasPendingField = "pendingTransaction" in obj;
					return {
						deltas: Array.isArray(obj.deltas) ? obj.deltas : [],
						narrative: typeof obj.narrative === "string" && obj.narrative.trim() ? obj.narrative.trim() : undefined,
						npcHpChanges: Array.isArray(obj.npcHpChanges) ? obj.npcHpChanges : undefined,
						...(hasPendingField ? { pendingTransaction: obj.pendingTransaction } : {}),
						suggestedCondition: typeof obj.suggestedCondition === "string" && obj.suggestedCondition.trim() ? obj.suggestedCondition.trim() : undefined,
						characterStateSummary: typeof obj.characterStateSummary === "string" && obj.characterStateSummary.trim() ? obj.characterStateSummary.trim() : undefined,
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
		`Current player stats: HP ${rpStats.hp}/${config.maxHp}, ${config.currencyName} ${rpStats.gold}`,
		goldFloorNote,
		pendingTxContext,
		`Current NPC HP: ${npcHpContext}`,
		settingContext,
		"",
		"Valid player fields: hp, gold",
		"",
		"PRICE RULE: When an NPC states a price verbatim (e.g. 'eight-fifty' = 8.50, 'five eighty-seven' = 5.87, 'twelve fifty' = 12.50), use EXACTLY that number for pendingTransaction.amount. Benchmarks are a fallback ONLY when no price is stated — they must NEVER override a spoken price.",
		"AMOUNT LOCK: Once pendingTransaction.amount is set from a stated price, do NOT change it for inferred extras (bag fees, taxes, tips). Only update if an NPC explicitly states a new total (e.g. 'With the bag that's $8.75').",
		"",
		"IMPORTANT: Return ONLY a JSON object. Always use this exact format:",
		'{"deltas":[{"field":"hp","delta":-15,"reason":"Arrow wound"}],"narrative":"Short one-line summary","npcHpChanges":[],"characterStateSummary":"Player is at home dealing with family tension."}',
		"All four top-level keys (deltas, narrative, npcHpChanges, characterStateSummary) must appear in every response.",
		"",
		"Format examples (pendingTransaction shown where relevant):",
		'- Nothing RP-relevant:   {"deltas":[],"narrative":null,"npcHpChanges":[],"characterStateSummary":"Player is resting at home."}',
		`- Blocked purchase:      {"deltas":[],"narrative":"Purchase blocked — ${config.currencyName} ${rpStats.gold} available, cost exceeded balance","npcHpChanges":[],"characterStateSummary":"Player is at the store."}`,
		'- Spoken price (pending):{"deltas":[],"narrative":"Cashier says eight-fifty for snacks","npcHpChanges":[],"pendingTransaction":{"description":"snacks","amount":8.50},"characterStateSummary":"Player is at the checkout."}',
		'- Payment completed:     {"deltas":[{"field":"gold","delta":-5.87,"reason":"snacks"}],"narrative":"Paid $5.87 for snacks","npcHpChanges":[],"pendingTransaction":null,"characterStateSummary":"Player left the store with snacks."}',
		'- HP damage:             {"deltas":[{"field":"hp","delta":-10,"reason":"Fell off ledge"}],"narrative":"HP -10 from falling","npcHpChanges":[],"characterStateSummary":"Player is injured after a fall."}',
		"",
		"Rules for pendingTransaction:",
		"- Use pendingTransaction to track a purchase that has been started but not yet paid.",
		"- Set pendingTransaction to null when payment completes or the transaction is abandoned.",
		"- Omit pendingTransaction when this scene has nothing to do with any transaction.",
		"",
		"Rules for player deltas:",
		"- Use negative delta for decreases, positive for increases.",
		"- Only include changes CLEARLY implied by the narrative. Do not invent changes.",
		"- Be conservative.",
		"",
		"Rules for npcHpChanges:",
		"- Track named NPCs who suffer or recover from significant PHYSICAL health events in this scene only.",
		"- Do NOT track NPCs for emotional distress or non-physical events.",
		"",
		"Rules for narrative:",
		"- Write a short one-line summary whenever something RP-relevant happened, even if deltas is [].",
		"- Set narrative to null only if the scene had absolutely no RP-relevant content.",
		"",
		"CONDITIONS:",
		"If a significant status-changing event occurred in this scene (hospital admission, surgery, diagnosis, arrest, major injury), set \"suggestedCondition\" to a short label.",
		"- Omit suggestedCondition entirely if nothing significant happened.",
		"",
		"CHARACTER STATE:",
		"Set \"characterStateSummary\" to 1-3 sentences describing the player character's current situation in present tense, third person. Always include this field.",
		"",
		"Do NOT track relationship tiers, trust, affection, or other social metrics here. Relationships are updated separately by story indexing.",
		"",
		`Era/genre price benchmarks for ${config.currencyName} (defer to setting context when available):`,
		`MODERN: Coffee $3–6 · Fast food $8–15 · Sit-down meal $15–35`,
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

		if (!deltas.length && !narrative && !npcHpChanges.length && pendingTransaction === undefined
				&& !parsed.suggestedCondition && !parsed.characterStateSummary) return null;
		return {
			deltas,
			narrative,
			npcHpChanges: npcHpChanges.length ? npcHpChanges : undefined,
			...(pendingTransaction !== undefined ? { pendingTransaction } : {}),
			...(parsed.suggestedCondition ? { suggestedCondition: parsed.suggestedCondition } : {}),
			...(parsed.characterStateSummary ? { characterStateSummary: parsed.characterStateSummary } : {}),
		};
	} catch {
		return null;
	}
}
