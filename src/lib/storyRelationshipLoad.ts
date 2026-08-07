import type { RelationshipIndexEntry, StoryIndexesV2 } from "../types/models";
import { safeParseJsonObject } from "./ai/json";
import { normalizeStoryStateToV2, reconcileStoryIndexes, safeParseStoryStateData } from "./storyStateV2";
import { makeRelationshipPairKey, relationshipInvolvesPlayer, buildResolvedPlayerNameVariants } from "./relationshipIndex";
import { findPlayerStoryStateEntry } from "./storyText/playerSceneName";

export type StoryRelationshipLoadOpts = {
	playerName?: string;
	playerAliases?: string[];
	universeImportedCharacters?: string[];
	messageCount?: number;
};

export function extractRawRelationshipsFromStateJson(stateJson: string): RelationshipIndexEntry[] {
	const trimmed = stateJson.trim();
	if (!trimmed) return [];

	const parsed = safeParseStoryStateData(trimmed);
	if (parsed?.indexes?.relationships?.length) {
		return parsed.indexes.relationships;
	}

	const raw = safeParseJsonObject<Record<string, unknown>>(trimmed);
	if (!raw || typeof raw !== "object") return [];

	const indexes = raw.indexes;
	if (!indexes || typeof indexes !== "object" || Array.isArray(indexes)) return [];

	const relationships = (indexes as StoryIndexesV2).relationships;
	return Array.isArray(relationships) ? relationships : [];
}

export function extractIndexesFromStateJson(stateJson: string): StoryIndexesV2 | undefined {
	const trimmed = stateJson.trim();
	if (!trimmed) return undefined;

	const parsed = safeParseStoryStateData(trimmed);
	if (parsed?.indexes) return parsed.indexes;

	const raw = safeParseJsonObject<Record<string, unknown>>(trimmed);
	if (!raw?.indexes || typeof raw.indexes !== "object" || Array.isArray(raw.indexes)) {
		return undefined;
	}
	return raw.indexes as StoryIndexesV2;
}

export function relationshipsSnapshotChanged(
	before: RelationshipIndexEntry[],
	after: RelationshipIndexEntry[],
): boolean {
	const keysBefore = new Set(before.map((entry) => makeRelationshipPairKey(entry.a, entry.b)));
	const keysAfter = new Set(after.map((entry) => makeRelationshipPairKey(entry.a, entry.b)));
	if (keysBefore.size !== keysAfter.size) return true;
	for (const key of keysBefore) {
		if (!keysAfter.has(key)) return true;
	}
	return false;
}

export function reconcileRelationshipsFromStateJson(
	stateJson: string,
	opts: StoryRelationshipLoadOpts = {},
): { relationships: RelationshipIndexEntry[]; changed: boolean; indexes?: StoryIndexesV2 } {
	const rawRelationships = extractRawRelationshipsFromStateJson(stateJson);
	const existingIndexes = extractIndexesFromStateJson(stateJson);
	const messageCount =
		opts.messageCount ??
		(typeof existingIndexes?.messageCount === "number" ? existingIndexes.messageCount : rawRelationships.length);

	const parsedState = stateJson.trim() ? safeParseStoryStateData(stateJson) : null;
	const normalizedState = parsedState ? normalizeStoryStateToV2(parsedState) : null;
	const playerEntry =
		opts.playerName && normalizedState
			? findPlayerStoryStateEntry(normalizedState, opts.playerName)
			: null;

	const reconciledIndexes = reconcileStoryIndexes(
		{ ...(existingIndexes ?? {}), relationships: rawRelationships },
		messageCount,
		{
			playerName: opts.playerName,
			playerAliases: opts.playerAliases,
			universeImportedCharacters: opts.universeImportedCharacters,
			identityRevealedAtMessage: playerEntry?.identityRevealedAtMessage,
			messageCount,
			canonicalName: playerEntry?.canonicalName,
			narrativeName: playerEntry?.narrativeName,
		},
	);

	const relationships = reconciledIndexes?.relationships ?? rawRelationships;
	const changed = relationshipsSnapshotChanged(rawRelationships, relationships);

	return {
		relationships,
		changed,
		...(reconciledIndexes ? { indexes: reconciledIndexes } : {}),
	};
}

/** Player-facing name for overview rows (the non-player endpoint). */
export function relationshipCounterparty(
	entry: RelationshipIndexEntry,
	playerName?: string,
	playerAliases?: string[],
): string {
	if (!playerName?.trim()) {
		return entry.b;
	}

	const variants = buildResolvedPlayerNameVariants({
		playerName,
		playerAliases,
	});
	const aNorm = entry.a.trim().toLowerCase();
	const bNorm = entry.b.trim().toLowerCase();

	if (variants.has(aNorm)) {
		return entry.b;
	}
	if (variants.has(bNorm)) {
		return entry.a;
	}

	return `${entry.a} ↔ ${entry.b}`;
}

export function filterPlayerRelationships(
	relationships: RelationshipIndexEntry[],
	playerName?: string,
	playerAliases?: string[],
): RelationshipIndexEntry[] {
	if (!playerName?.trim()) return relationships;
	const variants = buildResolvedPlayerNameVariants({
		playerName,
		playerAliases,
	});
	return relationships.filter((entry) => relationshipInvolvesPlayer(entry, playerName, variants));
}
