import type {
  MemoryArchitectureVersion,
  RelationshipIndexEntry,
  StoryIndexesV2,
  StoryStateData,
  StoryStateDataV2,
} from "../types/models";
import { safeParseJsonObject } from "./ai/json";

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

function mergeRelationship(left: RelationshipIndexEntry, right: RelationshipIndexEntry): RelationshipIndexEntry {
  const pick = <T>(next: T | undefined, prev: T | undefined) => (next !== undefined ? next : prev);
  const summary = typeof right.summary === "string" && right.summary.trim()
    ? right.summary.trim()
    : typeof left.summary === "string" && left.summary.trim()
      ? left.summary.trim()
      : undefined;
  const evidence = mergeEvidence(left.evidence, right.evidence);

  return {
    a: left.a,
    b: left.b,
    ...(pick(right.friendship, left.friendship) !== undefined
      ? { friendship: pick(right.friendship, left.friendship) }
      : {}),
    ...(pick(right.trust, left.trust) !== undefined ? { trust: pick(right.trust, left.trust) } : {}),
    ...(pick(right.respect, left.respect) !== undefined ? { respect: pick(right.respect, left.respect) } : {}),
    ...(pick(right.loyalty, left.loyalty) !== undefined ? { loyalty: pick(right.loyalty, left.loyalty) } : {}),
    ...(pick(right.tension, left.tension) !== undefined ? { tension: pick(right.tension, left.tension) } : {}),
    ...(pick(right.hostility, left.hostility) !== undefined ? { hostility: pick(right.hostility, left.hostility) } : {}),
    ...(summary ? { summary } : {}),
    ...(evidence ? { evidence } : {}),
  };
}

function reconcileRelationships(
  relationships: RelationshipIndexEntry[] | undefined,
  aliasToCanonical: Map<string, string>,
) {
  if (!relationships?.length) {
    return undefined;
  }

  const byPair = new Map<string, RelationshipIndexEntry>();

  for (const entry of relationships) {
    const rawA = typeof entry.a === "string" ? entry.a.trim() : "";
    const rawB = typeof entry.b === "string" ? entry.b.trim() : "";
    if (!rawA || !rawB) {
      continue;
    }

    const canonicalA = aliasToCanonical.get(normalizeKey(rawA)) ?? rawA;
    const canonicalB = aliasToCanonical.get(normalizeKey(rawB)) ?? rawB;
    const keyA = normalizeKey(canonicalA);
    const keyB = normalizeKey(canonicalB);
    const ordered =
      keyA <= keyB ? { a: canonicalA, b: canonicalB, ka: keyA, kb: keyB } : { a: canonicalB, b: canonicalA, ka: keyB, kb: keyA };
    const pairKey = `${ordered.ka}::${ordered.kb}`;

    const normalizedEntry: RelationshipIndexEntry = {
      a: ordered.a,
      b: ordered.b,
      ...(typeof entry.friendship === "number" ? { friendship: entry.friendship } : {}),
      ...(typeof entry.trust === "number" ? { trust: entry.trust } : {}),
      ...(typeof entry.respect === "number" ? { respect: entry.respect } : {}),
      ...(typeof entry.loyalty === "number" ? { loyalty: entry.loyalty } : {}),
      ...(typeof entry.tension === "number" ? { tension: entry.tension } : {}),
      ...(typeof entry.hostility === "number" ? { hostility: entry.hostility } : {}),
      ...(typeof entry.summary === "string" && entry.summary.trim() ? { summary: entry.summary.trim() } : {}),
      ...(mergeEvidence(entry.evidence, undefined) ? { evidence: mergeEvidence(entry.evidence, undefined) } : {}),
    };

    const existing = byPair.get(pairKey);
    byPair.set(pairKey, existing ? mergeRelationship(existing, normalizedEntry) : normalizedEntry);
  }

  const merged = Array.from(byPair.values());
  return merged.length ? merged : undefined;
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
): StoryIndexesV2 | undefined {
  if (!indexes || typeof indexes !== "object") {
    return undefined;
  }

  const messageCount = totalMessages > 0 ? totalMessages : indexes.messageCount;

  const { merged: characters, aliasToCanonical } = reconcileIndexedEntities(indexes.characters);

  const relationships = reconcileRelationships(indexes.relationships, aliasToCanonical);

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
}): string {
  const previous = (() => {
    const json = params.previousStateJson?.trim() ?? "";
    if (!json) return null;
    return safeParseStoryStateData(json);
  })();
  const previousV2 = normalizeStoryStateToV2(previous);

  const normalized = normalizeStoryStateToV2(params.parsedState);
  const reconciledIndexes = reconcileStoryIndexes(normalized.indexes, params.totalMessages);

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
