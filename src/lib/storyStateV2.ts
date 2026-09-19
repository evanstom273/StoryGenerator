import type {
  IndexingGap,
  MemoryArchitectureVersion,
  PlayerCharacter,
  StoryIndexesV2,
  StoryMessage,
  StoryStateData,
  StoryStateDataV2,
} from "../types/models";
import { safeParseJsonObject } from "./ai/json";
import {
	buildCharacterAllowlist,
	isIndexedPlayerCharacterDuplicate,
	buildPlayerNameVariants,
	buildResolvedPlayerNameVariants,
	reconcileRelationshipEntries,
} from "./relationshipIndex";
import { ensureIndexedCharacterStatus, dedupeStatusBullets } from "./characterStatus";
import { applyTranscriptPresenceGate } from "./transcriptPresence";
import { findPlayerStoryStateEntry } from "./storyText/playerSceneName";
import { isValidPlayerSceneName, isStoryLocalDisplayNameOverride, resolvePlayerCharacterPreferredSceneName } from "./playerCharacterPrompt";
import {
	mergeOpenThreadsAuthoritative,
	reconcileResolvedOpenThreads,
} from "./openThreads";
import {
	normalizeSceneParticipantCapabilityOverrides,
	preserveSceneParticipantCapabilityOverrides,
} from "./sceneParticipation";

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

/** Lenient parse for persistence paths — preserves indexes, rpStats, etc. when V2 validation fails. */
export function coercePartialStoryState(json: string): StoryStateData | null {
  const parsed = safeParseJsonObject<StoryStateData>(json.trim());
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  return {
    ...parsed,
    updatedAt:
      typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
        ? parsed.updatedAt
        : new Date().toISOString(),
    characters:
      parsed.characters && typeof parsed.characters === "object" && !Array.isArray(parsed.characters)
        ? parsed.characters
        : {},
    worldFacts: Array.isArray(parsed.worldFacts) ? parsed.worldFacts : [],
    unresolvedThreads: Array.isArray(parsed.unresolvedThreads) ? parsed.unresolvedThreads : [],
  };
}

export function parseStoryStateJson(json: string): StoryStateDataV2 {
  const strict = safeParseStoryStateData(json);
  if (strict) {
    return normalizeStoryStateToV2(strict);
  }
  const coerced = coercePartialStoryState(json);
  if (coerced) {
    return normalizeStoryStateToV2(coerced);
  }
  return normalizeStoryStateToV2(null);
}

function mergeStringArrayPreserve(previous?: string[], incoming?: string[]): string[] | undefined {
  const prev = Array.isArray(previous)
    ? previous.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const inc = Array.isArray(incoming)
    ? incoming.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  if (inc.length === 0) {
    return prev.length ? prev.map((entry) => entry.trim()) : undefined;
  }

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const entry of [...prev, ...inc]) {
    const trimmed = entry.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(trimmed);
  }
  return merged.length ? merged : undefined;
}

function mergeRecordPreserve<T extends Record<string, unknown>>(
  previous?: T,
  incoming?: T,
): T | undefined {
  const prev =
    previous && typeof previous === "object" && !Array.isArray(previous) ? previous : ({} as T);
  const inc =
    incoming && typeof incoming === "object" && !Array.isArray(incoming) ? incoming : ({} as T);
  if (Object.keys(inc).length === 0) {
    return Object.keys(prev).length ? prev : undefined;
  }
  return { ...prev, ...inc };
}

type IndexedEvidenceRow = {
  fact?: string;
  moment?: string;
  thread?: string;
  evidence?: { messageNumbers?: number[] };
  sourceLabel?: string;
  sourceUrl?: string;
};

function mergeIndexedEvidenceRows(
  previous: IndexedEvidenceRow[] | undefined,
  incoming: IndexedEvidenceRow[] | undefined,
  keyField: "fact" | "moment" | "thread",
  maxItems = 30,
): IndexedEvidenceRow[] | undefined {
  const prev = Array.isArray(previous) ? previous : [];
  const inc = Array.isArray(incoming) ? incoming : [];
  if (inc.length === 0) {
    return prev.length ? prev : undefined;
  }

  const byKey = new Map<string, IndexedEvidenceRow>();
  const keys: string[] = [];

  const findSimilarKey = (candidate: string): string | null => {
    const normalized = candidate.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    for (const key of keys) {
      if (stringsSimilar(key, normalized)) {
        return key;
      }
    }
    return null;
  };

  const upsert = (row: IndexedEvidenceRow) => {
    const raw = typeof row[keyField] === "string" ? row[keyField]!.trim() : "";
    if (!raw) {
      return;
    }
    const similarKey = findSimilarKey(raw);
    const key = similarKey ?? raw.toLowerCase();
    if (!similarKey) {
      keys.push(key);
    }
    const existing = byKey.get(key);
    byKey.set(
      key,
      existing
        ? {
            ...existing,
            ...row,
            [keyField]: existing[keyField] ?? raw,
            evidence: mergeEvidence(existing.evidence, row.evidence),
          }
        : row,
    );
  };

  for (const row of prev) {
    upsert(row);
  }
  for (const row of inc) {
    upsert(row);
  }

  const merged = Array.from(byKey.values()).slice(-maxItems);
  return merged.length ? merged : undefined;
}

function stringsSimilar(left: string, right: string): boolean {
  const normalizedLeft = left.toLowerCase().trim();
  const normalizedRight = right.toLowerCase().trim();
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  if (normalizedLeft === normalizedRight) {
    return true;
  }
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }

  const tokenize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3);
  const leftTokens = tokenize(normalizedLeft);
  const rightTokenSet = new Set(tokenize(normalizedRight));
  const overlap = leftTokens.filter((word) => rightTokenSet.has(word));
  const minTokenCount = Math.min(leftTokens.length, rightTokenSet.size);
  if (minTokenCount === 0) {
    return false;
  }
  return overlap.length >= Math.min(3, Math.ceil(minTokenCount * 0.6));
}

function dedupeSimilarStrings(values: string[] | undefined, maxItems = 8): string[] | undefined {
  if (!values?.length) {
    return undefined;
  }
  const merged: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    if (merged.some((existing) => stringsSimilar(existing, trimmed))) {
      continue;
    }
    merged.push(trimmed);
    if (merged.length >= maxItems) {
      break;
    }
  }
  return merged.length ? merged : undefined;
}

export function mergeStoryIndexesIncremental(
  previous: StoryIndexesV2 | undefined,
  incoming: StoryIndexesV2 | undefined,
  totalMessages: number,
): StoryIndexesV2 | undefined {
  if (!previous && !incoming) {
    return undefined;
  }

  const prev = previous ?? {};
  const inc = incoming ?? {};

  const mergeEntities = (
    left?: StoryIndexesV2["characters"],
    right?: StoryIndexesV2["characters"],
    kind: "character" | "location" | "item" | "faction" = "character",
  ) => {
    if (!left && !right) {
      return undefined;
    }
    const { merged } = reconcileIndexedEntities({ ...(left ?? {}), ...(right ?? {}) }, kind);
    return merged;
  };

  const messageCount = totalMessages > 0 ? totalMessages : inc.messageCount ?? prev.messageCount;

  return {
    ...prev,
    ...inc,
    ...(messageCount ? { messageCount } : {}),
    messageNumberingVersion: "1.0",
    ...(mergeEntities(prev.characters, inc.characters)
      ? { characters: mergeEntities(prev.characters, inc.characters) }
      : {}),
    ...(mergeEntities(prev.locations, inc.locations, "location")
      ? { locations: mergeEntities(prev.locations, inc.locations, "location") }
      : {}),
    ...(mergeEntities(prev.items, inc.items, "item") ? { items: mergeEntities(prev.items, inc.items, "item") } : {}),
    ...(mergeEntities(prev.factions, inc.factions, "faction")
      ? { factions: mergeEntities(prev.factions, inc.factions, "faction") }
      : {}),
    worldFacts: mergeIndexedEvidenceRows(prev.worldFacts, inc.worldFacts, "fact") as StoryIndexesV2["worldFacts"],
    significantMemories: mergeIndexedEvidenceRows(
      prev.significantMemories,
      inc.significantMemories,
      "moment",
      50,
    ) as StoryIndexesV2["significantMemories"],
    openThreads:
      inc.openThreads !== undefined
        ? mergeOpenThreadsAuthoritative(prev.openThreads, inc.openThreads)
        : prev.openThreads,
  } satisfies StoryIndexesV2;
}

function mergeLiveStringArray(
	previous?: string[],
	incoming?: string[],
	maxItems = 4,
): string[] | undefined {
	const inc = Array.isArray(incoming)
		? incoming.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
		: [];
	if (inc.length) {
		return dedupeStatusBullets(inc.map((entry) => entry.trim()), maxItems);
	}

	const prev = Array.isArray(previous)
		? previous.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
		: [];
	return prev.length ? prev.map((entry) => entry.trim()) : undefined;
}

function mergeCharacterStateMaps(
	previous?: StoryStateData["characters"],
	incoming?: StoryStateData["characters"],
): StoryStateData["characters"] {
	const prev =
		previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
	const inc =
		incoming && typeof incoming === "object" && !Array.isArray(incoming) ? incoming : {};
	if (!Object.keys(prev).length && !Object.keys(inc).length) {
		return {};
	}

	type CharacterGroup = {
		key: string;
		entry: NonNullable<StoryStateData["characters"]>[string];
		labels: Set<string>;
	};
	const groups: CharacterGroup[] = [];
	const allEntries = [...Object.entries(prev), ...Object.entries(inc)];
	const fullNamesByToken = new Map<string, Set<string>>();
	for (const [name, entry] of allEntries) {
		for (const label of [name, entry?.canonicalName, entry?.displayName, ...(entry?.aliases ?? [])]) {
			if (typeof label !== "string" || !label.trim()) continue;
			const normalized = normalizeEntityLabel(label);
			const tokens = normalized.split(" ").filter(Boolean);
			if (tokens.length < 2) continue;
			for (const token of tokens) {
				const values = fullNamesByToken.get(token) ?? new Set<string>();
				values.add(normalized);
				fullNamesByToken.set(token, values);
			}
		}
	}

	for (const [name, entry] of allEntries) {
		if (!name.trim() || !entry || typeof entry !== "object") {
			continue;
		}
		const rawLabels = [name, entry.canonicalName, entry.displayName, ...(entry.aliases ?? [])]
			.filter((label): label is string => typeof label === "string" && Boolean(label.trim()));
		const labels = new Set(rawLabels.map(normalizeEntityLabel));
		const explicitMatch = groups.find((group) =>
			Array.from(labels).some((label) => group.labels.has(label)),
		);
		const inferredMatches = explicitMatch
			? []
			: groups.filter((group) =>
				Array.from(labels).some((left) =>
					Array.from(group.labels).some((right) =>
						areUnambiguousNameVariants(left, right, fullNamesByToken),
					),
				),
		);
		const match = explicitMatch ?? (inferredMatches.length === 1 ? inferredMatches[0] : undefined);
		if (!match) {
			groups.push({ key: name.trim(), entry: { ...entry }, labels });
			continue;
		}

		const existing = match.entry ?? {};
		const mergedBullets = mergeLiveStringArray(
			(existing as { statusBullets?: string[] }).statusBullets,
			(entry as { statusBullets?: string[] }).statusBullets,
		);
		const mergedTransient = mergeLiveStringArray(
			(existing as { characterStateTransient?: string[] }).characterStateTransient,
			(entry as { characterStateTransient?: string[] }).characterStateTransient,
			3,
		);
		const mergedStrengths = mergeStringArrayPreserve(
			(existing as { strengths?: string[] }).strengths,
			(entry as { strengths?: string[] }).strengths,
		);
		const mergedWeaknesses = mergeStringArrayPreserve(
			(existing as { weaknesses?: string[] }).weaknesses,
			(entry as { weaknesses?: string[] }).weaknesses,
		);

		const mergedAliases = Array.from(new Set([
			...(existing.aliases ?? []),
			...(entry.aliases ?? []),
			match.key,
			name,
		]))
			.map((alias) => alias.trim())
			.filter((alias) => alias && normalizeEntityLabel(alias) !== normalizeEntityLabel(match.key))
			.slice(0, 12);
		match.entry = {
			...existing,
			...entry,
			...(mergedAliases.length ? { aliases: mergedAliases } : {}),
			...(mergedBullets ? { statusBullets: mergedBullets } : {}),
			...(mergedTransient ? { characterStateTransient: mergedTransient } : {}),
			...(mergedStrengths ? { strengths: mergedStrengths } : {}),
			...(mergedWeaknesses ? { weaknesses: mergedWeaknesses } : {}),
		};
		for (const label of labels) match.labels.add(label);
		for (const label of mergedAliases) match.labels.add(normalizeEntityLabel(label));
		if (shouldPreferExpandedName(match.key, name, fullNamesByToken)) {
			const oldKey = match.key;
			match.key = name.trim();
			match.labels.add(normalizeEntityLabel(oldKey));
			match.entry.aliases = Array.from(new Set([...(match.entry.aliases ?? []), oldKey]))
				.filter((alias) => normalizeEntityLabel(alias) !== normalizeEntityLabel(match.key))
				.slice(0, 12);
		}
	}

	return Object.fromEntries(groups.map((group) => [group.key, group.entry]));
}

export function mergeStoryStateForIndexing(
  previous: StoryStateDataV2,
  incoming: StoryStateDataV2,
  indexes: StoryIndexesV2 | undefined,
): StoryStateDataV2 {
  const mergedSummaries = {
    ...(previous.summaries ?? {}),
    ...(incoming.summaries ?? {}),
  };
  const recentDevelopments = dedupeSimilarStrings(
    mergeStringArrayPreserve(
      previous.summaries?.recentDevelopments,
      incoming.summaries?.recentDevelopments,
    ),
    8,
  );
  if (recentDevelopments) {
    mergedSummaries.recentDevelopments = recentDevelopments;
  }
  const characterSummaries = {
    ...(previous.summaries?.characterSummaries ?? {}),
    ...(incoming.summaries?.characterSummaries ?? {}),
  };
  if (Object.keys(characterSummaries).length) {
    mergedSummaries.characterSummaries = characterSummaries;
  }

  return {
    ...previous,
    ...incoming,
    memoryArchitectureVersion: "2.0",
    updatedAt: incoming.updatedAt ?? previous.updatedAt,
    characters: mergeCharacterStateMaps(previous.characters, incoming.characters),
    worldFacts:
      mergeStringArrayPreserve(previous.worldFacts, incoming.worldFacts) ??
      previous.worldFacts ??
      incoming.worldFacts ??
      [],
    unresolvedThreads:
      mergeStringArrayPreserve(previous.unresolvedThreads, incoming.unresolvedThreads) ??
      previous.unresolvedThreads ??
      incoming.unresolvedThreads ??
      [],
    significantMemories: mergeStringArrayPreserve(
      previous.significantMemories,
      incoming.significantMemories,
    ),
    relationshipState: mergeStringArrayPreserve(
      previous.relationshipState,
      incoming.relationshipState,
    ),
    sceneState: mergeStringArrayPreserve(previous.sceneState, incoming.sceneState),
    npcs: mergeRecordPreserve(
      previous.npcs as Record<string, unknown> | undefined,
      incoming.npcs as Record<string, unknown> | undefined,
    ) as StoryStateDataV2["npcs"],
    locations: mergeRecordPreserve(
      previous.locations as Record<string, unknown> | undefined,
      incoming.locations as Record<string, unknown> | undefined,
    ) as StoryStateDataV2["locations"],
    relationships: mergeRecordPreserve(
      previous.relationships as Record<string, unknown> | undefined,
      incoming.relationships as Record<string, unknown> | undefined,
    ) as StoryStateDataV2["relationships"],
    summaries: Object.keys(mergedSummaries).length ? mergedSummaries : previous.summaries,
    currentSituationIdentityBasis: previous.currentSituationIdentityBasis,
    playerIdentityOverride: previous.playerIdentityOverride,
    scene: preserveSceneParticipantCapabilityOverrides(previous, {
      ...(previous.scene ?? {}),
      ...(incoming.scene ?? {}),
    }),
    threads: { ...(previous.threads ?? {}), ...(incoming.threads ?? {}) },
    authorDirectives: incoming.authorDirectives ?? previous.authorDirectives,
    rpStats: incoming.rpStats ?? previous.rpStats,
    indexes,
    indexedAt: previous.indexedAt,
    lastIndexedAt: previous.lastIndexedAt,
    lastDeepIndexedAt: previous.lastDeepIndexedAt,
    lastAutoDeepIndexedAt: previous.lastAutoDeepIndexedAt,
    lastIndexedMessageCount: previous.lastIndexedMessageCount,
    lastDeepIndexedMessageCount: previous.lastDeepIndexedMessageCount,
    lastDeepIndexAttemptedMessageCount: previous.lastDeepIndexAttemptedMessageCount,
    lastDeepIndexedTranscriptFingerprint: previous.lastDeepIndexedTranscriptFingerprint,
    indexingGaps: previous.indexingGaps,
    lastAutoDeepIndexedMessageCount: previous.lastAutoDeepIndexedMessageCount,
    messagesSinceDeepIndexUpdate: previous.messagesSinceDeepIndexUpdate,
  };
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
      ? {
          ...data.scene,
          ...(normalizeSceneParticipantCapabilityOverrides(
            data.scene.participantCapabilityOverrides,
          ).length
            ? {
                participantCapabilityOverrides: normalizeSceneParticipantCapabilityOverrides(
                  data.scene.participantCapabilityOverrides,
                ),
              }
            : { participantCapabilityOverrides: undefined }),
        }
      : undefined;
  if (scene && !scene.participantCapabilityOverrides?.length) {
    delete scene.participantCapabilityOverrides;
  }
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

function normalizeEntityLabel(value: string) {
  return value
    .trim()
    .replace(/^(?:mr|mrs|ms|miss|dr|doctor|detective|captain|officer|professor)\.?\s+/i, "")
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeKey(value: string) {
  return normalizeEntityLabel(value);
}

function areUnambiguousNameVariants(
  left: string,
  right: string,
  fullNamesByToken: Map<string, Set<string>>,
) {
  if (!left || !right || left === right) return left === right;
  const leftTokens = left.split(" ").filter(Boolean);
  const rightTokens = right.split(" ").filter(Boolean);
  const [short, full] = leftTokens.length === 1 && rightTokens.length > 1
    ? [left, right]
    : rightTokens.length === 1 && leftTokens.length > 1
      ? [right, left]
      : ["", ""];
  if (!short || !full || short.length < 3 || !full.split(" ").includes(short)) {
    return false;
  }
  const candidates = fullNamesByToken.get(short);
  return candidates?.size === 1 && candidates.has(full);
}

function shouldPreferExpandedName(
  current: string,
  candidate: string,
  fullNamesByToken: Map<string, Set<string>>,
) {
  const currentNormalized = normalizeEntityLabel(current);
  const candidateNormalized = normalizeEntityLabel(candidate);
  return (
    currentNormalized.split(" ").length === 1 &&
    candidateNormalized.split(" ").length > 1 &&
    areUnambiguousNameVariants(currentNormalized, candidateNormalized, fullNamesByToken)
  );
}

function stableEntityId(kind: "character" | "location" | "item" | "faction", seed: string) {
  const normalized = normalizeEntityLabel(seed) || "unknown";
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${kind}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
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

function normalizedDescriptionTokens(value: unknown) {
  if (typeof value !== "string") return new Set<string>();
  const stopWords = new Set(["this", "that", "with", "from", "into", "where", "which", "story", "place", "space", "location"]);
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
      .split(/\s+/)
      .map((token) => token.replace(/(?:ation|ing|ed|s)$/i, ""))
      .filter((token) => token.length >= 4 && !stopWords.has(token)),
  );
}

function descriptionsIdentifySameLocation(left: any, right: any) {
  const leftName = normalizeKey(left?.name ?? "");
  const rightName = normalizeKey(right?.name ?? "");
  const leftDescription = normalizeKey(left?.description ?? "");
  const rightDescription = normalizeKey(right?.description ?? "");
  if (
    (leftName && rightDescription.includes(leftName)) ||
    (rightName && leftDescription.includes(rightName))
  ) {
    return true;
  }

  const leftEvidence = new Set<number>(left?.evidence?.messageNumbers ?? []);
  const sharesEvidence = (right?.evidence?.messageNumbers ?? []).some((number: number) => leftEvidence.has(number));
  if (!sharesEvidence) return false;

  const leftTokens = normalizedDescriptionTokens(left?.description);
  const rightTokens = normalizedDescriptionTokens(right?.description);
  if (leftTokens.size < 2 || rightTokens.size < 2) return false;
  const overlap = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  return overlap >= 2 && overlap / Math.min(leftTokens.size, rightTokens.size) >= 0.6;
}

function reconcileIndexedEntities(
  entities: StoryIndexesV2["characters"] | undefined,
  kind: "character" | "location" | "item" | "faction" = "character",
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

  const rawEntries = Object.entries(entities).filter(([, value]) => value && typeof value === "object");
  const fullNamesByToken = new Map<string, Set<string>>();
  for (const [key, value] of rawEntries) {
    const labels = [key, (value as any).name, ...((value as any).aliases ?? [])];
    for (const label of labels) {
      if (typeof label !== "string" || !label.trim()) continue;
      const normalized = normalizeKey(label);
      const tokens = normalized.split(" ").filter(Boolean);
      if (tokens.length < 2) continue;
      for (const token of tokens) {
        const names = fullNamesByToken.get(token) ?? new Set<string>();
        names.add(normalized);
        fullNamesByToken.set(token, names);
      }
    }
  }

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
    const stableId = typeof (value as any).id === "string" && (value as any).id.trim()
      ? (value as any).id.trim()
      : "";
    const explicitMatch = groups.find((group) =>
      (stableId && group.entity.id === stableId) ||
      Array.from(normalizedAliases).some((alias) => group.aliases.has(alias)),
    );
    const inferredMatches = explicitMatch
      ? []
      : groups.filter((group) =>
          Array.from(normalizedAliases).some((left) =>
            Array.from(group.aliases).some((right) =>
              areUnambiguousNameVariants(left, right, fullNamesByToken),
            ),
          ) ||
          (kind === "location" && descriptionsIdentifySameLocation(group.entity, value)),
        );
    const match = explicitMatch ?? (inferredMatches.length === 1 ? inferredMatches[0] : undefined);

    if (!match) {
      groups.push({
        key: name,
        entity: { ...value, id: stableId || stableEntityId(kind, name), name },
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

    const oldKey = match.key;
    if (shouldPreferExpandedName(match.key, name, fullNamesByToken)) {
      match.key = name;
      mergedAliases.add(normalizeKey(oldKey));
    }
    match.aliases = mergedAliases;
    const mergedAliasList = Array.from(
      new Set([
        ...(Array.isArray(match.entity.aliases) ? match.entity.aliases : []),
        ...(Array.isArray((value as any).aliases) ? (value as any).aliases : []),
        key,
        oldKey,
        name,
      ]),
    )
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item && normalizeKey(item) !== normalizeKey(match.key))
      .slice(0, 12);

    match.entity = {
      ...match.entity,
      id: match.entity.id || stableId || stableEntityId(kind, match.key),
      name: match.key,
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
    group.entity = {
      ...group.entity,
      id: group.entity.id || stableEntityId(kind, group.key),
      name: group.key,
    };
    merged[group.key] = group.entity;

    aliasToCanonical.set(normalizeKey(group.key), group.key);
    aliasToCanonical.set(normalizeKey(group.entity.name), group.key);
    for (const alias of Array.isArray(group.entity.aliases) ? group.entity.aliases : []) {
      aliasToCanonical.set(normalizeKey(alias), group.key);
    }
  }

  return { merged: Object.keys(merged).length ? merged : undefined, aliasToCanonical };
}

const RELATIONAL_CHARACTER_ALIASES: Record<string, string[]> = {
  father: ["dad", "daddy", "father", "my dad", "my father"],
  mother: ["mom", "mum", "mommy", "mummy", "mother", "my mom", "my mum", "my mother"],
  brother: ["brother", "my brother"],
  sister: ["sister", "my sister"],
  son: ["son", "my son"],
  daughter: ["daughter", "my daughter"],
};

function classifyFamilyRole(value: string) {
  const normalized = normalizeKey(value);
  for (const [role, aliases] of Object.entries(RELATIONAL_CHARACTER_ALIASES)) {
    if (aliases.some((alias) => new RegExp(`\\b${alias.replace(/ /g, "\\s+")}\\b`, "i").test(normalized))) {
      return role;
    }
  }
  return null;
}

function isRelationalCharacterLabel(value: string) {
  const normalized = normalizeKey(value).replace(/^my /, "");
  return Object.values(RELATIONAL_CHARACTER_ALIASES)
    .flat()
    .some((alias) => normalizeKey(alias).replace(/^my /, "") === normalized);
}

function addRelationalAliasesToCharacters(
  characters: StoryIndexesV2["characters"] | undefined,
  relationships: StoryIndexesV2["relationships"] | undefined,
  playerName: string | undefined,
  playerAliases: string[] | undefined,
) {
  if (!characters || !playerName) return characters;
  const playerVariants = buildPlayerNameVariants(playerName, playerAliases);
  const candidates = new Map<string, Set<string>>();
  const addCandidate = (role: string | null, name: string) => {
    if (!role || !name.trim() || isRelationalCharacterLabel(name)) return;
    const names = candidates.get(role) ?? new Set<string>();
    names.add(name.trim());
    candidates.set(role, names);
  };

  for (const [key, entity] of Object.entries(characters)) {
    addCandidate(classifyFamilyRole(entity?.description ?? ""), key);
  }
  for (const relationship of relationships ?? []) {
    const leftIsPlayer = playerVariants.has(normalizeKey(relationship.a));
    const rightIsPlayer = playerVariants.has(normalizeKey(relationship.b));
    if (leftIsPlayer === rightIsPlayer) continue;
    const other = leftIsPlayer ? relationship.b : relationship.a;
    const evidenceText = [
      relationship.summary,
      ...(relationship.history ?? []).map((entry) => entry.summary),
    ].filter(Boolean).join(" ");
    addCandidate(classifyFamilyRole(evidenceText), other);
  }

  const cloned = Object.fromEntries(
    Object.entries(characters).map(([key, entity]) => [key, { ...entity, aliases: [...(entity.aliases ?? [])] }]),
  );
  for (const [role, names] of candidates) {
    if (names.size !== 1) continue;
    const candidateName = Array.from(names)[0]!;
    const match = Object.entries(cloned).find(([key, entity]) =>
      [key, entity.name, ...(entity.aliases ?? [])].some(
        (label) => normalizeKey(label) === normalizeKey(candidateName),
      ),
    );
    if (!match) continue;
    const [key, entity] = match;
    cloned[key] = {
      ...entity,
      aliases: Array.from(new Set([...(entity.aliases ?? []), ...(RELATIONAL_CHARACTER_ALIASES[role] ?? [])])),
    };
  }
  return cloned;
}

export function reconcileStoryIndexes(
  indexes: StoryIndexesV2 | undefined,
  totalMessages: number,
  opts?: {
    playerName?: string;
    playerAliases?: string[];
    universeImportedCharacters?: string[];
    identityRevealedAtMessage?: number;
    messageCount?: number;
    canonicalName?: string;
    narrativeName?: string;
  },
): StoryIndexesV2 | undefined {
  if (!indexes || typeof indexes !== "object") {
    return undefined;
  }

  const messageCount = totalMessages > 0 ? totalMessages : indexes.messageCount;

  const charactersWithRelationalAliases = addRelationalAliasesToCharacters(
    indexes.characters,
    indexes.relationships,
    opts?.playerName,
    opts?.playerAliases,
  );
  const { merged: rawCharacters, aliasToCanonical } = reconcileIndexedEntities(charactersWithRelationalAliases, "character");
  const { merged: normalizedLocations } = reconcileIndexedEntities(indexes.locations, "location");
  const { merged: normalizedItems } = reconcileIndexedEntities(indexes.items, "item");
  const { merged: normalizedFactions } = reconcileIndexedEntities(indexes.factions, "faction");

  const playerVariants = opts?.playerName
    ? buildResolvedPlayerNameVariants({
        playerName: opts.playerName,
        playerAliases: opts.playerAliases,
        indexedCharacters: rawCharacters ?? indexes.characters,
      })
    : undefined;

  const characters =
    rawCharacters && playerVariants
      ? Object.fromEntries(
          Object.entries(rawCharacters).filter(
            ([key, entity]) => !isIndexedPlayerCharacterDuplicate(key, entity, playerVariants),
          ),
        )
      : rawCharacters;

  const normalizedCharacters =
    characters && Object.keys(characters).length ? characters : undefined;

  const allowlist = buildCharacterAllowlist({
    playerName: opts?.playerName ?? "",
    playerAliases: opts?.playerAliases,
    indexedCharacters: rawCharacters ?? indexes.characters,
    universeImportedCharacters: opts?.universeImportedCharacters,
    existingRelationships: indexes.relationships,
  });

  const relationships = reconcileRelationshipEntries(indexes.relationships, aliasToCanonical, {
    playerName: opts?.playerName,
    playerAliases: opts?.playerAliases,
    allowlist,
    indexedCharacters: rawCharacters ?? indexes.characters,
    universeImportedCharacters: opts?.universeImportedCharacters,
    identityRevealedAtMessage: opts?.identityRevealedAtMessage,
    messageCount: opts?.messageCount ?? messageCount,
    canonicalName: opts?.canonicalName,
    narrativeName: opts?.narrativeName,
    entityIds: new Map(
      Object.entries(rawCharacters ?? {}).flatMap(([key, entity]) => {
        const id = entity.id?.trim();
        if (!id) return [];
        return [key, entity.name, ...(entity.aliases ?? [])].map(
          (label) => [normalizeKey(label), id] as const,
        );
      }),
    ),
  });

  return {
    ...indexes,
    ...(messageCount ? { messageCount } : {}),
    messageNumberingVersion: "1.0",
    ...(normalizedCharacters ? { characters: normalizedCharacters } : {}),
    ...(normalizedLocations ? { locations: normalizedLocations } : {}),
    ...(normalizedItems ? { items: normalizedItems } : {}),
    ...(normalizedFactions ? { factions: normalizedFactions } : {}),
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
  playerAliases?: string[];
  playerCharacter?: Pick<PlayerCharacter, "name" | "aliases">;
  messages?: StoryMessage[];
  universeImportedCharacters?: string[];
  deepIndexProgress?: {
    completedMessageCount: number;
    attemptedMessageCount: number;
    gaps: IndexingGap[];
  };
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
  const playerEntry = params.playerName
    ? findPlayerStoryStateEntry(normalized, params.playerName)
    : null;
  let reconciledIndexes = reconcileStoryIndexes(normalized.indexes, params.totalMessages, {
    playerName: params.playerName,
    playerAliases: params.playerAliases,
    universeImportedCharacters: params.universeImportedCharacters,
    identityRevealedAtMessage: playerEntry?.identityRevealedAtMessage,
    messageCount: params.totalMessages,
    canonicalName: playerEntry?.canonicalName,
    narrativeName: playerEntry?.narrativeName,
  });

  const base: StoryStateDataV2 = params.mode === "deep"
    ? {
        ...normalized,
        memoryArchitectureVersion: "2.0",
        indexes: reconciledIndexes,
        // These fields are primary/user-authored state, not rebuildable index prose.
        rpStats: normalized.rpStats ?? previousV2.rpStats,
        authorDirectives: normalized.authorDirectives ?? previousV2.authorDirectives,
        playerIdentityOverride:
          normalized.playerIdentityOverride ?? previousV2.playerIdentityOverride,
      }
    : {
        ...previousV2,
        ...normalized,
        memoryArchitectureVersion: "2.0",
        indexes: reconciledIndexes,
      };

  const deepIndexProgress = params.deepIndexProgress
    ? {
        completedMessageCount: Math.max(
          0,
          Math.min(params.totalMessages, Math.trunc(params.deepIndexProgress.completedMessageCount)),
        ),
        attemptedMessageCount: Math.max(
          0,
          Math.min(params.totalMessages, Math.trunc(params.deepIndexProgress.attemptedMessageCount)),
        ),
        gaps: params.deepIndexProgress.gaps,
      }
    : {
        completedMessageCount: params.totalMessages,
        attemptedMessageCount: params.totalMessages,
        gaps: [] as IndexingGap[],
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
                lastAutoDeepIndexedMessageCount: deepIndexProgress.completedMessageCount,
              }
            : {}),
          lastIndexedMessageCount: deepIndexProgress.completedMessageCount,
          lastDeepIndexedMessageCount: deepIndexProgress.completedMessageCount,
          lastDeepIndexAttemptedMessageCount: Math.max(
            deepIndexProgress.completedMessageCount,
            deepIndexProgress.attemptedMessageCount,
          ),
          indexingGaps: deepIndexProgress.gaps,
          messagesSinceDeepIndexUpdate: Math.max(
            0,
            params.totalMessages - deepIndexProgress.completedMessageCount,
          ),
        }, { indexedAt: params.now, memoryArchitectureVersion: "2.0" })
      : withIndexedMetadata({
          ...base,
          lastIndexedAt: params.now,
          lastIndexedMessageCount: params.totalMessages,
        }, { indexedAt: params.now, memoryArchitectureVersion: "2.0" });

  const withStatus = ensureIndexedCharacterStatus(
    applyOpenThreadReconciliation(stamped, {
      playerName: params.playerName,
      totalMessages: params.totalMessages,
    }),
    { playerName: params.playerName },
  );

  const playerCharacter =
    params.playerCharacter ??
    (params.playerName
      ? { name: params.playerName, aliases: params.playerAliases ?? [] }
      : null);
  const gated =
    playerCharacter && params.messages?.length
      ? applyTranscriptPresenceGate(withStatus, params.messages, playerCharacter, {
          messageCount: params.totalMessages,
        })
      : withStatus;

  return JSON.stringify(gated);
}

export function applyOpenThreadReconciliation(
  state: StoryStateDataV2,
  opts?: { playerName?: string; totalMessages?: number },
): StoryStateDataV2 {
  if (!state.indexes?.openThreads?.length) {
    return state;
  }

  const reconciled = reconcileResolvedOpenThreads(state.indexes.openThreads, state, opts);
  const nextIndexes = { ...state.indexes };
  if (reconciled?.length) {
    nextIndexes.openThreads = reconciled;
  } else {
    delete nextIndexes.openThreads;
  }
  return {
    ...state,
    indexes: nextIndexes,
  };
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

export function repairCorruptedPlayerIdentityInStoryState(
	storyState: StoryStateData | StoryStateDataV2 | null | undefined,
	character: Pick<PlayerCharacter, "name" | "aliases">,
): { state: StoryStateData | StoryStateDataV2 | null; changed: boolean } {
	if (!storyState?.characters) {
		return { state: storyState ?? null, changed: false };
	}

	const legalName = character.name.trim();
	const sheetPreferred = resolvePlayerCharacterPreferredSceneName(character);
	const entry = findPlayerStoryStateEntry(storyState, legalName);
	const displayName = entry?.displayName?.trim();
	if (!displayName) {
		return { state: storyState, changed: false };
	}

	const shouldStrip =
		!isValidPlayerSceneName(displayName) ||
		!isStoryLocalDisplayNameOverride(displayName, legalName, sheetPreferred);
	if (!shouldStrip || !entry) {
		return { state: storyState, changed: false };
	}

	const entryKey =
		Object.entries(storyState.characters).find(([, value]) => value === entry)?.[0] ??
		legalName;
	const { displayName: _removed, ...rest } = entry;

	return {
		state: {
			...storyState,
			updatedAt: new Date().toISOString(),
			characters: {
				...storyState.characters,
				[entryKey]: rest,
			},
		},
		changed: true,
	};
}

export function mergeStoryLocalPlayerIdentityIntoState(
	storyState: StoryStateData | StoryStateDataV2 | null | undefined,
	character: Pick<PlayerCharacter, "name" | "aliases" | "pronouns"> & Partial<Pick<PlayerCharacter, "id">>,
	identity: {
		sceneName: string;
		pronouns: string;
		hasInStoryTransition: boolean;
		sourceMessageId?: string;
		source?: "player_turn" | "director_instruction" | "author_instruction";
	},
): StoryStateData | StoryStateDataV2 | null {
	if (!identity.hasInStoryTransition) {
		return storyState ?? null;
	}
	const baseState = storyState ?? {
		updatedAt: new Date().toISOString(),
		characters: {},
		worldFacts: [],
		unresolvedThreads: [],
	};

	const trimmedLegal = character.name.trim();
	const trimmedScene = identity.sceneName.trim();
	const trimmedPronouns = identity.pronouns.trim();
	if (!trimmedLegal || !trimmedScene || !trimmedPronouns) {
		return storyState ?? null;
	}
	if (!isValidPlayerSceneName(trimmedScene)) {
		return storyState ?? null;
	}

	const existingEntry = findPlayerStoryStateEntry(baseState, trimmedLegal);
	const primaryAlias = resolvePlayerCharacterPreferredSceneName(character);
	const hasNameOverride = isStoryLocalDisplayNameOverride(trimmedScene, trimmedLegal, primaryAlias);
	const hasPronounOverride = trimmedPronouns.toLowerCase() !== character.pronouns.trim().toLowerCase();
	const hasExplicitProvenance = Boolean(
		character.id && identity.sourceMessageId?.trim() && identity.source,
	);
	// Preserve an explicit return to sheet defaults too. Otherwise an older
	// story-local override could reappear after the source turn leaves context.
	if (!hasNameOverride && !hasPronounOverride && !hasExplicitProvenance) {
		return storyState ?? null;
	}

	const existingKey =
		Object.entries(baseState.characters ?? {}).find(([, entry]) => entry === existingEntry)?.[0] ??
		(baseState.characters?.[trimmedLegal] ? trimmedLegal : trimmedLegal);

	const priorAliases = new Set(
		(existingEntry?.aliases ?? [])
			.map((alias) => alias.trim())
			.filter(Boolean),
	);
	if (
		primaryAlias.toLowerCase() !== trimmedScene.toLowerCase() &&
		primaryAlias.toLowerCase() !== trimmedLegal.toLowerCase()
	) {
		priorAliases.add(primaryAlias);
	}

	const nextEntry = {
		...(existingEntry ?? {}),
		canonicalName: trimmedLegal,
		...(hasNameOverride ? { displayName: trimmedScene } : { displayName: undefined }),
		pronouns: trimmedPronouns,
		...(priorAliases.size ? { aliases: Array.from(priorAliases).slice(0, 12) } : {}),
	};

	return {
		...baseState,
		updatedAt: new Date().toISOString(),
		...(character.id && identity.sourceMessageId && identity.source
			? {
				playerIdentityOverride: {
					playerCharacterId: character.id,
					sourceMessageId: identity.sourceMessageId,
					source: identity.source,
					...(hasNameOverride ? { sceneName: trimmedScene } : {}),
					pronouns: trimmedPronouns,
				},
			}
			: {}),
		characters: {
			...(baseState.characters ?? {}),
			[existingKey]: nextEntry,
		},
	};
}
