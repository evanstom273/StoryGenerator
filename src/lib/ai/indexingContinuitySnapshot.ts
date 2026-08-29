import type {
	IndexedEntity,
	RelationshipIndexEntry,
	StoryMessage,
	StoryStateCharacterState,
	StoryStateDataV2,
} from "../../types/models";
import {
	readLegacyActiveParticipantNames,
	stripInventedSceneCapabilityOverrides,
} from "../sceneParticipation";

const ACTIVE_ENTITY_RECENCY_MESSAGES = 50;
const MAX_OPEN_THREADS = 12;
const MAX_WORLD_FACTS = 30;
const MAX_SIGNIFICANT_MEMORIES = 20;
const MAX_INDEXED_RELATIONSHIPS = 60;

export interface BuildIndexingContinuitySnapshotParams {
	state: StoryStateDataV2;
	currentMessageNumber: number;
	playerName: string;
	playerAliases?: string[];
	currentChunkMessages?: StoryMessage[];
}

function normalizeNameKey(value: string): string {
	return value.trim().toLowerCase();
}

function collectPlayerNameKeys(playerName: string, playerAliases?: string[]): Set<string> {
	const keys = new Set<string>();
	for (const value of [playerName, ...(playerAliases ?? [])]) {
		const trimmed = value.trim();
		if (trimmed) {
			keys.add(normalizeNameKey(trimmed));
		}
	}
	return keys;
}

function isRecentMessageNumber(messageNumber: number | undefined, currentMessageNumber: number): boolean {
	if (typeof messageNumber !== "number" || !Number.isFinite(messageNumber)) {
		return false;
	}
	return messageNumber >= currentMessageNumber - ACTIVE_ENTITY_RECENCY_MESSAGES;
}

function hasRecentEvidence(
	evidence: { messageNumbers?: number[] } | undefined,
	currentMessageNumber: number,
): boolean {
	const numbers = evidence?.messageNumbers;
	if (!Array.isArray(numbers) || !numbers.length) {
		return false;
	}
	return numbers.some((entry) => isRecentMessageNumber(entry, currentMessageNumber));
}

function collectMentionedNameKeys(messages: StoryMessage[] | undefined): Set<string> {
	const keys = new Set<string>();
	for (const message of messages ?? []) {
		const speaker = message.speakerName?.trim();
		if (speaker) {
			keys.add(normalizeNameKey(speaker));
		}
		const content = message.content ?? "";
		const matches = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) ?? [];
		for (const match of matches) {
			keys.add(normalizeNameKey(match));
		}
	}
	return keys;
}

function collectOpenThreadNameKeys(
	openThreads: Array<{ thread?: string }> | undefined,
): Set<string> {
	const keys = new Set<string>();
	for (const entry of openThreads ?? []) {
		const thread = entry.thread?.trim();
		if (!thread) {
			continue;
		}
		const matches = thread.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) ?? [];
		for (const match of matches) {
			keys.add(normalizeNameKey(match));
		}
	}
	return keys;
}

function isActiveCharacterName(
	name: string,
	activeNames: Set<string>,
): boolean {
	return activeNames.has(normalizeNameKey(name));
}

function characterHasLiveState(entry: StoryStateCharacterState | undefined): boolean {
	if (!entry) {
		return false;
	}
	if (Array.isArray(entry.statusBullets) && entry.statusBullets.some((bullet) => bullet.trim())) {
		return true;
	}
	if (
		Array.isArray(entry.characterStateTransient) &&
		entry.characterStateTransient.some((value) => value.trim())
	) {
		return true;
	}
	return Boolean(entry.status?.trim());
}

function collectActiveCharacterNames(params: BuildIndexingContinuitySnapshotParams): Set<string> {
	const activeNames = collectPlayerNameKeys(params.playerName, params.playerAliases);
	for (const key of collectMentionedNameKeys(params.currentChunkMessages)) {
		activeNames.add(key);
	}
	for (const key of collectOpenThreadNameKeys(params.state.indexes?.openThreads)) {
		activeNames.add(key);
	}

	const currentMessageNumber = params.currentMessageNumber;
	const state = params.state;

	for (const [name, entry] of Object.entries(state.characters ?? {})) {
		if (characterHasLiveState(entry)) {
			activeNames.add(normalizeNameKey(name));
		}
	}

	for (const [name, entry] of Object.entries(state.npcs ?? {})) {
		if (entry?.significance === "major" || entry?.significance === "recurring") {
			activeNames.add(normalizeNameKey(name));
		}
	}

	for (const [name, entry] of Object.entries(state.indexes?.characters ?? {})) {
		if (isRecentMessageNumber(entry?.lastSeenMessage, currentMessageNumber)) {
			activeNames.add(normalizeNameKey(name));
			if (entry.name?.trim()) {
				activeNames.add(normalizeNameKey(entry.name));
			}
			for (const alias of entry.aliases ?? []) {
				if (alias.trim()) {
					activeNames.add(normalizeNameKey(alias));
				}
			}
		}
	}

	for (const relationship of state.indexes?.relationships ?? []) {
		if (relationship.tier && relationship.tier !== "stranger") {
			activeNames.add(normalizeNameKey(relationship.a));
			activeNames.add(normalizeNameKey(relationship.b));
		}
	}

	for (const participant of readLegacyActiveParticipantNames(state)) {
		activeNames.add(normalizeNameKey(participant));
	}

	return activeNames;
}

function pickLocationEntries(
	locations: StoryStateDataV2["locations"],
	indexedLocations: Record<string, IndexedEntity> | undefined,
	currentMessageNumber: number,
	sceneLocation?: string,
): StoryStateDataV2["locations"] | undefined {
	const picked: NonNullable<StoryStateDataV2["locations"]> = {};
	const sceneKey = sceneLocation?.trim() ? normalizeNameKey(sceneLocation) : "";

	for (const [name, entry] of Object.entries(locations ?? {})) {
		const matchesScene = sceneKey && normalizeNameKey(name) === sceneKey;
		const indexed = indexedLocations?.[name];
		if (matchesScene || isRecentMessageNumber(indexed?.lastSeenMessage, currentMessageNumber)) {
			picked[name] = entry;
		}
	}

	return Object.keys(picked).length ? picked : undefined;
}

function pickCharacterRecordEntries(
	characters: StoryStateDataV2["characters"],
	activeNames: Set<string>,
): StoryStateDataV2["characters"] | undefined {
	if (!characters) {
		return undefined;
	}
	const picked: NonNullable<StoryStateDataV2["characters"]> = {};
	for (const [name, entry] of Object.entries(characters)) {
		if (isActiveCharacterName(name, activeNames)) {
			picked[name] = entry;
		}
	}
	return Object.keys(picked).length ? picked : undefined;
}

function pickNpcRecordEntries(
	npcs: StoryStateDataV2["npcs"],
	activeNames: Set<string>,
): StoryStateDataV2["npcs"] | undefined {
	if (!npcs) {
		return undefined;
	}
	const picked: NonNullable<StoryStateDataV2["npcs"]> = {};
	for (const [name, entry] of Object.entries(npcs)) {
		if (isActiveCharacterName(name, activeNames)) {
			picked[name] = entry;
		}
	}
	return Object.keys(picked).length ? picked : undefined;
}

function pickIndexedEntities(
	entities: Record<string, IndexedEntity> | undefined,
	activeNames: Set<string>,
	currentMessageNumber: number,
): Record<string, IndexedEntity> | undefined {
	if (!entities) {
		return undefined;
	}
	const picked: Record<string, IndexedEntity> = {};
	for (const [name, entry] of Object.entries(entities)) {
		if (
			isActiveCharacterName(name, activeNames) ||
			isActiveCharacterName(entry.name, activeNames) ||
			isRecentMessageNumber(entry.lastSeenMessage, currentMessageNumber)
		) {
			picked[name] = entry;
		}
	}
	return Object.keys(picked).length ? picked : undefined;
}

function pickIndexedRelationships(
	relationships: RelationshipIndexEntry[] | undefined,
	activeNames: Set<string>,
	currentMessageNumber: number,
): RelationshipIndexEntry[] | undefined {
	if (!relationships?.length) {
		return undefined;
	}
	const picked = relationships.filter((relationship) => {
		const involvesActive =
			isActiveCharacterName(relationship.a, activeNames) ||
			isActiveCharacterName(relationship.b, activeNames);
		const meaningfulTier = relationship.tier && relationship.tier !== "stranger";
		const recent = hasRecentEvidence(relationship.evidence, currentMessageNumber);
		return involvesActive || meaningfulTier || recent;
	});
	return picked.length ? picked.slice(0, MAX_INDEXED_RELATIONSHIPS) : undefined;
}

function pickIndexedWorldFacts(
	worldFacts: StoryIndexesV2WorldFact[] | undefined,
	currentMessageNumber: number,
): StoryIndexesV2WorldFact[] | undefined {
	if (!worldFacts?.length) {
		return undefined;
	}
	const recent = worldFacts.filter((entry) => hasRecentEvidence(entry.evidence, currentMessageNumber));
	if (recent.length >= MAX_WORLD_FACTS) {
		return recent.slice(0, MAX_WORLD_FACTS);
	}
	const picked = [...recent];
	for (const entry of worldFacts) {
		if (picked.length >= MAX_WORLD_FACTS) {
			break;
		}
		if (!picked.includes(entry)) {
			picked.push(entry);
		}
	}
	return picked.length ? picked : undefined;
}

type StoryIndexesV2WorldFact = NonNullable<NonNullable<StoryStateDataV2["indexes"]>["worldFacts"]>[number];

function pickWorldFacts(state: StoryStateDataV2): string[] {
	const facts = Array.isArray(state.worldFacts) ? state.worldFacts.filter((fact) => fact.trim()) : [];
	return facts.slice(0, MAX_WORLD_FACTS);
}

function pickSummaries(state: StoryStateDataV2) {
	if (!state.summaries || typeof state.summaries !== "object") {
		return undefined;
	}
	const recentDevelopments = Array.isArray(state.summaries.recentDevelopments)
		? state.summaries.recentDevelopments.filter((entry) => entry.trim()).slice(0, 8)
		: undefined;
	return {
		...(state.summaries.premise?.trim() ? { premise: state.summaries.premise.trim() } : {}),
		...(state.summaries.protagonistSummary?.trim()
			? { protagonistSummary: state.summaries.protagonistSummary.trim() }
			: {}),
		...(state.summaries.currentSituation?.trim()
			? { currentSituation: state.summaries.currentSituation.trim() }
			: {}),
		...(recentDevelopments?.length ? { recentDevelopments } : {}),
		...(state.summaries.relationshipSummary?.trim()
			? { relationshipSummary: state.summaries.relationshipSummary.trim() }
			: {}),
		...(state.summaries.worldSummary?.trim()
			? { worldSummary: state.summaries.worldSummary.trim() }
			: {}),
		...(state.summaries.characterSummaries &&
		typeof state.summaries.characterSummaries === "object"
			? { characterSummaries: state.summaries.characterSummaries }
			: {}),
	};
}

export function buildIndexingContinuitySnapshot(
	params: BuildIndexingContinuitySnapshotParams,
): Record<string, unknown> {
	const activeNames = collectActiveCharacterNames(params);
	const currentMessageNumber = params.currentMessageNumber;
	const state = params.state;
	const openThreads = (state.indexes?.openThreads ?? []).slice(0, MAX_OPEN_THREADS);
	const summaries = pickSummaries(state);
	const characters = pickCharacterRecordEntries(state.characters, activeNames);
	const npcs = pickNpcRecordEntries(state.npcs, activeNames);
	const locations = pickLocationEntries(
		state.locations,
		state.indexes?.locations,
		currentMessageNumber,
		state.scene?.currentLocation,
	);
	const worldFacts = pickWorldFacts(state);
	const significantMemories = [
		...(Array.isArray(state.significantMemories)
			? state.significantMemories.filter((entry) => entry.trim())
			: []),
		...(state.indexes?.significantMemories ?? [])
			.filter((entry) => hasRecentEvidence(entry.evidence, currentMessageNumber))
			.map((entry) => entry.moment.trim())
			.filter(Boolean),
	].slice(0, MAX_SIGNIFICANT_MEMORIES);
	const indexedWorldFacts = pickIndexedWorldFacts(state.indexes?.worldFacts, currentMessageNumber);
	const indexedRelationships = pickIndexedRelationships(
		state.indexes?.relationships,
		activeNames,
		currentMessageNumber,
	);
	const indexedCharacters = pickIndexedEntities(
		state.indexes?.characters,
		activeNames,
		currentMessageNumber,
	);
	const indexedLocations = pickIndexedEntities(
		state.indexes?.locations,
		activeNames,
		currentMessageNumber,
	);
	const relationshipMetrics =
		state.relationships && Object.keys(state.relationships).length
			? Object.fromEntries(
					Object.entries(state.relationships).filter(([name]) =>
						isActiveCharacterName(name, activeNames),
					),
				)
			: undefined;

	return {
		updatedAt: state.updatedAt,
		memoryArchitectureVersion: state.memoryArchitectureVersion,
		...(summaries && Object.keys(summaries).length ? { summaries } : {}),
		...(state.authorDirectives ? { authorDirectives: state.authorDirectives } : {}),
		...(state.scene
			? { scene: stripInventedSceneCapabilityOverrides(state.scene) }
			: {}),
		...(Array.isArray(state.sceneState) && state.sceneState.length
			? { sceneState: state.sceneState }
			: {}),
		...(Array.isArray(state.relationshipState) && state.relationshipState.length
			? { relationshipState: state.relationshipState }
			: {}),
		...(characters ? { characters } : {}),
		...(npcs ? { npcs } : {}),
		...(locations ? { locations } : {}),
		...(worldFacts.length ? { worldFacts } : {}),
		...(Array.isArray(state.unresolvedThreads) && state.unresolvedThreads.length
			? { unresolvedThreads: state.unresolvedThreads.slice(0, 20) }
			: {}),
		...(significantMemories.length ? { significantMemories } : {}),
		...(relationshipMetrics && Object.keys(relationshipMetrics).length
			? { relationships: relationshipMetrics }
			: {}),
		indexes: {
			...(openThreads.length ? { openThreads } : {}),
			...(indexedWorldFacts ? { worldFacts: indexedWorldFacts } : {}),
			...(indexedRelationships ? { relationships: indexedRelationships } : {}),
			...(indexedCharacters ? { characters: indexedCharacters } : {}),
			...(indexedLocations ? { locations: indexedLocations } : {}),
		},
	};
}

export function serializeIndexingContinuitySnapshot(snapshot: Record<string, unknown>): string {
	try {
		return JSON.stringify(snapshot);
	} catch {
		return "";
	}
}
