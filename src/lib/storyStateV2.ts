import type {
  MemoryArchitectureVersion,
  StoryIndexesV2,
  StoryStateData,
  StoryStateDataV2,
} from "../types/models";
import { safeParseJsonObject } from "./ai/json";
import {
  buildCharacterAllowlist,
  mergePerTurnRelationshipFields,
  reconcileRelationshipEntries,
} from "./relationshipIndex";

export function safeParseStoryStateData(json: string): StoryStateData | null {
  const parsed = safeParseJsonObject<StoryStateDataV2>(json.trim());
  if (!parsed) {
    return null;
  }

  if (!parsed.updatedAt || typeof parsed.updatedAt !== "string") {
    return null;
  }

  if (!parsed.characters || typeof parsed.characters !== "object") {
    return null;
  }

  if (!Array.isArray(parsed.worldFacts) || !Array.isArray(parsed.unresolvedThreads)) {
    return null;
  }

  if (parsed.sceneState && !Array.isArray(parsed.sceneState)) {
    return null;
  }

  if (parsed.significantMemories && !Array.isArray(parsed.significantMemories)) {
    return null;
  }

  if (parsed.relationshipState && !Array.isArray(parsed.relationshipState)) {
    return null;
  }

  if (parsed.relationships && typeof parsed.relationships !== "object") {
    return null;
  }

  if (parsed.npcs && typeof parsed.npcs !== "object") {
    return null;
  }

  if (parsed.locations && typeof parsed.locations !== "object") {
    return null;
  }

  if (parsed.summaries && typeof parsed.summaries !== "object") {
    return null;
  }

  return parsed as StoryStateData;
}

export function normalizeStoryStateToV2(data: StoryStateData | null): StoryStateDataV2 {
  if (!data) {
    return { memoryArchitectureVersion: "2.0" };
  }

  const memoryArchitectureVersion: MemoryArchitectureVersion =
    data.memoryArchitectureVersion ?? "1.0";

  const indexes =
    data.indexes && typeof data.indexes === "object" && !Array.isArray(data.indexes)
      ? data.indexes
      : undefined;
  const scene =
    data.scene && typeof data.scene === "object" && !Array.isArray(data.scene)
      ? data.scene
      : undefined;
  const threads =
    data.threads && typeof data.threads === "object" && !Array.isArray(data.threads)
      ? data.threads
      : undefined;

  return {
    ...data,
    memoryArchitectureVersion,
    indexes,
    scene,
    threads,
  };
}

export function withIndexedMetadata(
  data: StoryStateDataV2,
  opts?: { indexedAt?: string; memoryArchitectureVersion?: "2.0" },
): StoryStateDataV2 {
  const indexedAt = opts?.indexedAt ?? new Date().toISOString();

  return {
    ...data,
    indexedAt,
    memoryArchitectureVersion: opts?.memoryArchitectureVersion ?? "2.0",
  };
}

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isHighPriorityCharacterDescription(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return /(currently|now|injured|wounded|blind|coma|missing|detained|captured|wanted|fugitive|under arrest|under investigation|in hiding|transformed|poisoned|recovering|acting ruler|exposed|disguised|undercover|promoted|demoted|dead|dying)/.test(
    normalized,
  );
}

function mergeEvidence(left: any, right: any) {
  const leftNumbers = Array.isArray(left?.messageNumbers) ? left.messageNumbers : [];
  const rightNumbers = Array.isArray(right?.messageNumbers) ? right.messageNumbers : [];
  const merged = Array.from(
    new Set(
      [...leftNumbers, ...rightNumbers].filter((n) => typeof n === "number" && Number.isFinite(n) && n >= 1),
    ),
  ).sort((a, b) => a - b);
  return merged.length ? { messageNumbers: merged } : undefined;
}

function reconcileIndexedEntities(
  entities: StoryIndexesV2["characters"] | undefined,
): { merged: StoryIndexesV2["characters"] | undefined; aliasToCanonical: Map<string, string> } {
  const aliasToCanonical = new Map<string, string>();

  if (!entities || typeof entities !== "object") {
    return { merged: undefined, aliasToCanonical };
  }

  type Group = {
    key: string;
    entity: any;
    aliases: Set<string>;
  };

  const groups: Group[] = [];

  for (const [key, value] of Object.entries(entities)) {
    if (!value || typeof value !== "object") continue;
    const name = typeof (value as any).name === "string" && (value as any).name.trim() ? (value as any).name.trim() : key.trim();
    if (!name) continue;

    const aliasSet = new Set<string>();
    const pushAlias = (raw: unknown) => {
      if (typeof raw !== "string") return;
      const trimmed = raw.trim();
      if (!trimmed) return;
      aliasSet.add(trimmed);
    };
    pushAlias(key);
    pushAlias(name);
    for (const alias of Array.isArray((value as any).aliases) ? (value as any).aliases : []) {
      pushAlias(alias);
    }

    const normalizedAliases = new Set(Array.from(aliasSet).map((alias) => normalizeKey(alias)));
    const match = groups.find((group) => Array.from(normalizedAliases).some((alias) => group.aliases.has(alias)));

    if (!match) {
      groups.push({
        key: name,
        entity: { ...value, name },
        aliases: normalizedAliases,
      });
      continue;
    }

    const mergedAliases = new Set([...match.aliases, ...normalizedAliases]);
    const mergedEvidence = mergeEvidence(match.entity.evidence, (value as any).evidence);
    const nextDescription =
      typeof (value as any).description === "string" && (value as any).description.trim()
        ? (value as any).description.trim()
        : "";
    const previousDescription =
      typeof match.entity.description === "string" && match.entity.description.trim()
        ? match.entity.description.trim()
        : "";
    const shouldPreferNextDescription =
      !!nextDescription &&
      (!previousDescription ||
        isHighPriorityCharacterDescription(nextDescription) ||
        (!isHighPriorityCharacterDescription(previousDescription) &&
          nextDescription.length > previousDescription.length));

    match.aliases = mergedAliases;
    const mergedAliasList = Array.from(
      new Set([
        ...(Array.isArray(match.entity.aliases) ? match.entity.aliases : []),
        ...(Array.isArray((value as any).aliases) ? (value as any).aliases : []),
        key,
        name,
      ]),
    )
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item && item !== match.entity.name)
      .slice(0, 12);

    match.entity = {
      ...match.entity,
      ...(typeof (value as any).id === "string" && (value as any).id.trim() ? { id: (value as any).id.trim() } : {}),
      name: match.entity.name,
      ...(mergedAliasList.length ? { aliases: mergedAliasList } : {}),
      ...(shouldPreferNextDescription ? { description: nextDescription } : {}),
      ...(mergedEvidence?.messageNumbers?.length
        ? {
            firstSeenMessage: Math.min(...mergedEvidence.messageNumbers),
            lastSeenMessage: Math.max(...mergedEvidence.messageNumbers),
          }
        : {
            ...(typeof (value as any).firstSeenMessage === "number" && Number.isFinite((value as any).firstSeenMessage)
              ? {
                  firstSeenMessage:
                    typeof match.entity.firstSeenMessage === "number"
                      ? Math.min(match.entity.firstSeenMessage, Math.trunc((value as any).firstSeenMessage))
                      : Math.trunc((value as any).firstSeenMessage),
                }
              : {}),
            ...(typeof (value as any).lastSeenMessage === "number" && Number.isFinite((value as any).lastSeenMessage)
              ? {
                  lastSeenMessage:
                    typeof match.entity.lastSeenMessage === "number"
                      ? Math.max(match.entity.lastSeenMessage, Math.trunc((value as any).lastSeenMessage))
                      : Math.trunc((value as any).lastSeenMessage),
                }
              : {}),
          }),
      ...(mergedEvidence ? { evidence: mergedEvidence } : {}),
    };
  }

  const merged: Record<string, any> = {};
  for (const group of groups) {
    merged[group.key] = group.entity;

    aliasToCanonical.set(normalizeKey(group.key), group.key);
    aliasToCanonical.set(normalizeKey(group.entity.name), group.key);
    for (const alias of Array.isArray(group.entity.aliases) ? group.entity.aliases : []) {
      aliasToCanonical.set(normalizeKey(alias), group.key);
    }
  }

  return { merged: Object.keys(merged).length ? merged : undefined, aliasToCanonical };
}

export function reconcileStoryIndexes(
  indexes: StoryIndexesV2 | undefined,
  totalMessages: number,
  opts?: {
    playerName?: string;
    universeImportedCharacters?: string[];
  },
): StoryIndexesV2 | undefined {
  if (!indexes || typeof indexes !== "object") {
    return undefined;
  }

  const messageCount = totalMessages > 0 ? totalMessages : indexes.messageCount;

  const { merged: characters, aliasToCanonical } = reconcileIndexedEntities(indexes.characters);

  const allowlist = buildCharacterAllowlist({
    playerName: opts?.playerName ?? "",
    indexedCharacters: characters ?? indexes.characters,
    universeImportedCharacters: opts?.universeImportedCharacters,
    existingRelationships: indexes.relationships,
  });

  const relationships = reconcileRelationshipEntries(indexes.relationships, aliasToCanonical, {
    playerName: opts?.playerName,
    allowlist,
    indexedCharacters: characters ?? indexes.characters,
    universeImportedCharacters: opts?.universeImportedCharacters,
  });

  return {
    ...indexes,
    ...(messageCount ? { messageCount } : {}),
    messageNumberingVersion: "1.0",
    ...(characters ? { characters } : {}),
    ...(relationships ? { relationships } : {}),
  };
}

export function finalizeStoryStateForSave(params: {
  parsedState: StoryStateData;
  previousStateJson?: string;
  totalMessages: number;
  now: string;
  mode: "auto" | "deep";
  deepIndexTrigger?: "auto" | "manual";
  playerName?: string;
  universeImportedCharacters?: string[];
}): string {
  const previous = (() => {
    const json = params.previousStateJson?.trim() ?? "";
    if (!json) return null;
    const v2 = safeParseStoryStateData(json);
    if (v2) return v2;
    // Raw states (no V2 metadata yet) still carry rpStats — preserve it
    try {
      const raw = JSON.parse(json) as unknown;
      if (raw && typeof raw === "object" && "rpStats" in raw) {
        return { rpStats: (raw as Record<string, unknown>).rpStats } as StoryStateData;
      }
    } catch {}
    return null;
  })();
  const previousV2 = normalizeStoryStateToV2(previous);

  const normalized = normalizeStoryStateToV2(params.parsedState);
  let reconciledIndexes = reconcileStoryIndexes(normalized.indexes, params.totalMessages, {
    playerName: params.playerName,
    universeImportedCharacters: params.universeImportedCharacters,
  });

  // For deep reindex, preserve per-turn data (npcInnerLife, arc, numeric metrics)
  // accumulated in the existing relationship entries — the AI reindex only produces
  // structural fields (tier, summary, history, evidence) and must not wipe live data.
  if (params.mode === "deep" && reconciledIndexes?.relationships && previousV2.indexes?.relationships) {
    const merged = mergePerTurnRelationshipFields(
      reconciledIndexes.relationships,
      previousV2.indexes.relationships,
    );
    reconciledIndexes = { ...reconciledIndexes, ...(merged ? { relationships: merged } : {}) };
  }

  const base: StoryStateDataV2 = {
    ...previousV2,
    ...normalized,
    memoryArchitectureVersion: "2.0",
    indexes: reconciledIndexes,
  };

  const stamped =
    params.mode === "deep"
      ? withIndexedMetadata({
          ...base,
          lastIndexedAt: params.now,
          lastDeepIndexedAt: params.now,
          ...(params.deepIndexTrigger === "auto"
            ? {
                lastAutoDeepIndexedAt: params.now,
                lastAutoDeepIndexedMessageCount: params.totalMessages,
              }
            : {}),
          lastIndexedMessageCount: params.totalMessages,
          lastDeepIndexedMessageCount: params.totalMessages,
          messagesSinceDeepIndexUpdate: 0,
        }, { indexedAt: params.now, memoryArchitectureVersion: "2.0" })
      : withIndexedMetadata({
          ...base,
          lastIndexedAt: params.now,
          lastIndexedMessageCount: params.totalMessages,
        }, { indexedAt: params.now, memoryArchitectureVersion: "2.0" });

  return JSON.stringify(stamped);
}

function trimStringArray(value: unknown, maxItems = 12): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const trimmed = value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .slice(0, maxItems);

  return trimmed.length ? trimmed : undefined;
}

export function createSequelStoryStateData(params: {
  sourceState: StoryStateData | null;
  sourceSummary: string;
  now: string;
}): StoryStateDataV2 {
  const source = normalizeStoryStateToV2(params.sourceState);
  const currentSituation = trimStringArray(
    [
      source.summaries?.currentSituation,
      params.sourceSummary,
      source.scene?.sceneSummary,
    ],
    2,
  )?.[0];

  return {
    ...source,
    updatedAt: params.now,
    indexedAt: params.now,
    lastIndexedAt: params.now,
    lastDeepIndexedAt: params.now,
    memoryArchitectureVersion: "2.0",
    worldFacts: trimStringArray(source.worldFacts, 40) ?? [],
    unresolvedThreads:
      trimStringArray(source.unresolvedThreads, 24) ??
      trimStringArray(source.threads?.openThreads, 24) ??
      [],
    significantMemories: trimStringArray(source.significantMemories, 24) ?? [],
    relationshipState: trimStringArray(source.relationshipState, 20) ?? [],
    sceneState: undefined,
    scene: undefined,
    summaries: {
      ...(source.summaries ?? {}),
      ...(currentSituation ? { currentSituation } : {}),
      recentDevelopments: trimStringArray(source.summaries?.recentDevelopments, 12),
    },
    threads: source.threads?.openThreads?.length
      ? { openThreads: trimStringArray(source.threads.openThreads, 24) }
      : undefined,
    rpStats: source.rpStats
      ? {
          ...source.rpStats,
          pendingTransaction: undefined,
          pendingConditionSuggestion: undefined,
        }
      : undefined,
  };
}
