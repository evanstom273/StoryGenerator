import type { AIProvider } from "./types";

type DiceStat = "str" | "dex" | "con" | "int" | "wis" | "cha";

const SYSTEM_PROMPT = `You are a tabletop RPG rules assistant. Given a player's action, pick the single most relevant stat.

Stats:
- str: physical strength, lifting, melee attacks, breaking things
- dex: agility, stealth, ranged attacks, dodging, sleight of hand
- con: endurance, resisting pain/poison/illness, holding breath
- int: knowledge, memory, puzzles, arcana, investigation
- wis: perception, insight, survival, reading people, intuition
- cha: persuasion, deception, intimidation, performance, social influence

Respond with ONLY valid JSON in this exact format: {"stat":"<name>"}`;

export async function selectDiceStat(
  actionText: string,
  provider: AIProvider,
  apiKey: string,
  model: string,
): Promise<DiceStat> {
  const result = await provider.generateResponse({
    apiKey,
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: actionText.slice(0, 500) },
    ],
    timeoutMs: 10_000,
  });

  const trimmed = result.content.trim();
  const objStart = trimmed.indexOf("{");
  const objEnd = trimmed.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const parsed = JSON.parse(trimmed.slice(objStart, objEnd + 1)) as unknown;
      if (parsed && typeof parsed === "object" && "stat" in parsed) {
        const stat = (parsed as { stat: unknown }).stat;
        if (typeof stat === "string" && ["str", "dex", "con", "int", "wis", "cha"].includes(stat)) {
          return stat as DiceStat;
        }
      }
    } catch {}
  }

  return "cha";
}
