import type { RpChangelogEntry, RpConfig, RpCoreStats, RpDiceModifiers, RpStats } from "../types/models";

export const DEFAULT_CORE_STATS: RpCoreStats = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

export const DEFAULT_DICE_MODIFIERS: RpDiceModifiers = {
  str: 0,
  dex: 0,
  con: 0,
  int: 0,
  wis: 0,
  cha: 0,
};

export const DEFAULT_RP_CONFIG: RpConfig = {
  currencyName: "Gold",
  currencyDecimals: false,
  maxHp: 100,
  startingGold: 0,
  coreStats: { ...DEFAULT_CORE_STATS },
  allowDebt: false,
  creditLimit: null,
  diceRollsEnabled: false,
  diceModifiers: { ...DEFAULT_DICE_MODIFIERS },
};

export function defaultRpStats(config: RpConfig): RpStats {
  return {
    hp: config.maxHp,
    gold: config.startingGold,
    npcHp: {},
    changelog: [],
  };
}

export function applyStatChange(
  stats: RpStats,
  change: Omit<RpChangelogEntry, "ts">,
): RpStats {
  const entry: RpChangelogEntry = { ...change, ts: Date.now() };
  return {
    ...stats,
    hp: change.field === "hp" ? change.to : stats.hp,
    gold: change.field === "gold" ? change.to : stats.gold,
    statOverrides:
      change.field in DEFAULT_CORE_STATS
        ? { ...stats.statOverrides, [change.field]: change.to }
        : stats.statOverrides,
    npcHp:
      change.field.startsWith("npc:")
        ? (() => {
            const npcKey = change.field.slice(4);
            const existing = stats.npcHp[npcKey];
            return existing
              ? { ...stats.npcHp, [npcKey]: { ...existing, current: change.to } }
              : stats.npcHp;
          })()
        : stats.npcHp,
    changelog: [entry, ...stats.changelog].slice(0, 50),
  };
}

export function undoLastChange(stats: RpStats): RpStats {
  if (!stats.changelog.length) return stats;
  const [last, ...rest] = stats.changelog;
  return applyStatChange({ ...stats, changelog: rest }, {
    field: last.field,
    from: last.to,
    to: last.from,
    reason: `Undo: ${last.reason}`,
  });
}

export function formatGold(amount: number, config: RpConfig): string {
  const val = config.currencyDecimals ? amount.toFixed(2) : Math.floor(amount).toString();
  return `${val} ${config.currencyName}`;
}

export function effectiveCoreStats(stats: RpStats, config: RpConfig): RpCoreStats {
  return {
    ...config.coreStats,
    ...stats.statOverrides,
  };
}

const STAT_FIELDS = new Set(["hp", "gold", "str", "dex", "con", "int", "wis", "cha"]);

export function isValidStatField(field: string): boolean {
  return STAT_FIELDS.has(field);
}

export function getStatValue(stats: RpStats, config: RpConfig, field: string): number {
  if (field === "hp") return stats.hp;
  if (field === "gold") return stats.gold;
  const coreStats = effectiveCoreStats(stats, config);
  return (coreStats as Record<string, number>)[field] ?? 10;
}

function hpStateName(hp: number, maxHp: number): string {
  if (hp <= 0) return "Incapacitated";
  const pct = maxHp > 0 ? hp / maxHp : 0;
  if (pct <= 0.05) return "Incapacitated";
  if (pct <= 0.25) return "Critical condition";
  if (pct <= 0.50) return "Seriously wounded";
  if (pct <= 0.75) return "Injured";
  return "Healthy";
}

export function buildRpEventSummary(
  changes: Array<{ field: string; from: number; to: number; reason: string }>,
  config: RpConfig,
): string {
  const parts = changes.map(({ field, from, to, reason }) => {
    if (field === "hp") {
      const state = hpStateName(to, config.maxHp);
      const diff = to - from;
      const sign = diff >= 0 ? "+" : "−";
      return `HP ${sign}${Math.abs(diff)} (${from} → ${to}) — ${state}${reason ? ` · ${reason}` : ""}`;
    }
    if (field === "gold") {
      const diff = to - from;
      const sign = diff >= 0 ? "+" : "−";
      const abs = config.currencyDecimals ? Math.abs(diff).toFixed(2) : String(Math.abs(Math.floor(diff)));
      return `${config.currencyName} ${sign}${abs}${reason ? ` · ${reason}` : ""}`;
    }
    const diff = to - from;
    const sign = diff >= 0 ? "+" : "−";
    return `${field.toUpperCase()} ${sign}${Math.abs(diff)} (${from} → ${to})${reason ? ` · ${reason}` : ""}`;
  });
  return parts.join("  ·  ");
}

export function clampStat(field: string, value: number, config: RpConfig): number {
  if (field === "hp") return Math.min(config.maxHp, Math.max(0, value));
  if (field === "gold") {
    if (config.allowDebt) {
      const floor = config.creditLimit != null && config.creditLimit > 0 ? -config.creditLimit : -Infinity;
      return Math.max(floor, value);
    }
    return Math.max(0, value);
  }
  return Math.min(30, Math.max(1, value));
}
