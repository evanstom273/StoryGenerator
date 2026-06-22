import type { RpChangelogEntry, RpConfig, RpCoreStats, RpStats } from "../types/models";

export const DEFAULT_CORE_STATS: RpCoreStats = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

export const DEFAULT_RP_CONFIG: RpConfig = {
  currencyName: "Gold",
  currencyDecimals: false,
  maxHp: 100,
  startingGold: 0,
  coreStats: { ...DEFAULT_CORE_STATS },
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

export function clampStat(field: string, value: number, config: RpConfig): number {
  if (field === "hp") return Math.min(config.maxHp, Math.max(0, value));
  if (field === "gold") return Math.max(0, value);
  return Math.min(30, Math.max(1, value));
}
