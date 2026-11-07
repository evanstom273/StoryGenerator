import type { EntityId } from "../types/models";

export type UniverseLinkedEntity = {
	universeId: EntityId;
	universeIds?: EntityId[];
};

export function normalizeUniverseIds(ids: EntityId[]): EntityId[] {
	const seen = new Set<string>();
	const result: EntityId[] = [];

	for (const id of ids) {
		const trimmed = id.trim();
		if (!trimmed || seen.has(trimmed)) {
			continue;
		}
		seen.add(trimmed);
		result.push(trimmed);
	}

	return result;
}

export function getUniverseIds(entity: UniverseLinkedEntity): EntityId[] {
	if (entity.universeIds?.length) {
		return normalizeUniverseIds(entity.universeIds);
	}
	if (entity.universeId?.trim()) {
		return [entity.universeId.trim()];
	}
	return [];
}

export function resolvePrimaryUniverseId(entity: UniverseLinkedEntity): EntityId {
	return getUniverseIds(entity)[0] ?? "";
}

export function characterMatchesUniverses(
	character: UniverseLinkedEntity,
	selectedUniverseIds: EntityId[],
): boolean {
	const selected = normalizeUniverseIds(selectedUniverseIds);
	if (!selected.length) {
		return false;
	}
	const characterIds = getUniverseIds(character);
	return characterIds.some((id) => selected.includes(id));
}

export function formatUniverseNames(
	universeIds: EntityId[],
	nameById: Map<EntityId, string>,
): string {
	return normalizeUniverseIds(universeIds)
		.map((id) => nameById.get(id) ?? "Unknown universe")
		.join(", ");
}

export function parseUniverseIdsParam(value: string | null | undefined): EntityId[] {
	if (!value?.trim()) {
		return [];
	}
	return normalizeUniverseIds(value.split(",").map((part) => part.trim()));
}
