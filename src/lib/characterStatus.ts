import type { RelationshipIndexEntry, StoryStateCharacterState, StoryStateDataV2 } from "../types/models";

function trimStringList(value: unknown, maxItems: number): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
		.map((entry) => entry.trim())
		.slice(0, maxItems);
}

function normalizeName(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function dedupeBullets(bullets: string[], maxItems = 4): string[] {
	const seen = new Set<string>();
	const merged: string[] = [];
	for (const bullet of bullets) {
		const trimmed = bullet.trim();
		const key = trimmed.toLowerCase();
		if (!trimmed || seen.has(key)) {
			continue;
		}
		seen.add(key);
		merged.push(trimmed);
		if (merged.length >= maxItems) {
			break;
		}
	}
	return merged;
}

function firstSentence(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		return "";
	}
	const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/);
	return (match?.[1] ?? trimmed).trim();
}

function findRelationshipForCharacter(
	relationships: RelationshipIndexEntry[] | undefined,
	characterName: string,
	playerName?: string,
): RelationshipIndexEntry | undefined {
	if (!relationships?.length) {
		return undefined;
	}

	const characterNorm = normalizeName(characterName);
	const playerNorm = playerName?.trim() ? normalizeName(playerName) : "";

	if (playerNorm) {
		const playerRel = relationships.find(
			(entry) =>
				(normalizeName(entry.a) === playerNorm && normalizeName(entry.b) === characterNorm) ||
				(normalizeName(entry.b) === playerNorm && normalizeName(entry.a) === characterNorm),
		);
		if (playerRel) {
			return playerRel;
		}
	}

	return relationships.find(
		(entry) => normalizeName(entry.a) === characterNorm || normalizeName(entry.b) === characterNorm,
	);
}

export function synthesizeCharacterStatusBullets(
	characterName: string,
	state: StoryStateDataV2,
	opts?: { playerName?: string },
): string[] {
	const entry = state.characters?.[characterName];
	const existing = trimStringList((entry as StoryStateCharacterState & { statusBullets?: string[] })?.statusBullets, 4);
	if (existing.length) {
		return existing;
	}

	if (typeof entry?.status === "string" && entry.status.trim()) {
		return [entry.status.trim()];
	}

	const transient = trimStringList((entry as StoryStateCharacterState & { characterStateTransient?: string[] })?.characterStateTransient, 3);
	const bullets: string[] = [...transient];

	const relationship = findRelationshipForCharacter(
		state.indexes?.relationships,
		characterName,
		opts?.playerName,
	);
	if (relationship?.arc?.statusPhrase?.trim()) {
		bullets.push(relationship.arc.statusPhrase.trim());
	}
	if (relationship?.history?.length) {
		const latest = relationship.history[relationship.history.length - 1];
		if (latest?.summary?.trim()) {
			bullets.push(latest.summary.trim());
		}
	}
	if (relationship?.summary?.trim()) {
		bullets.push(firstSentence(relationship.summary));
	}

	return dedupeBullets(bullets, 4);
}

export function getCharacterStatusLines(
	character: StoryStateCharacterState | null | undefined,
	fallbackBullets?: string[],
): string[] {
	const bullets = trimStringList((character as { statusBullets?: string[] })?.statusBullets, 4);
	if (bullets.length) {
		return bullets;
	}

	if (typeof character?.status === "string" && character.status.trim()) {
		return [character.status.trim()];
	}

	if (fallbackBullets?.length) {
		return dedupeBullets(fallbackBullets, 4);
	}

	return trimStringList((character as { notes?: string[] })?.notes, 3);
}

export function listIndexedCharacterNames(state: StoryStateDataV2 | null | undefined): string[] {
	const names = new Set<string>();
	const indexes = state?.indexes?.characters;
	if (indexes && typeof indexes === "object") {
		for (const entity of Object.values(indexes)) {
			if (entity?.name?.trim()) {
				names.add(entity.name.trim());
			}
		}
	}

	if (state?.characters && typeof state.characters === "object") {
		for (const name of Object.keys(state.characters)) {
			if (name.trim()) {
				names.add(name.trim());
			}
		}
	}

	return Array.from(names).sort((left, right) => left.localeCompare(right));
}

export function ensureIndexedCharacterStatus(
	state: StoryStateDataV2,
	opts?: { playerName?: string },
): StoryStateDataV2 {
	const indexed = state.indexes?.characters;
	if (!indexed || typeof indexed !== "object") {
		return state;
	}

	const characters: Record<string, StoryStateCharacterState> = {
		...(state.characters ?? {}),
	};

	for (const entity of Object.values(indexed)) {
		const name = entity?.name?.trim();
		if (!name) {
			continue;
		}

		const existing = characters[name] ?? {};
		const currentBullets = trimStringList((existing as { statusBullets?: string[] })?.statusBullets, 4);
		if (currentBullets.length) {
			continue;
		}

		const synthesized = synthesizeCharacterStatusBullets(name, { ...state, characters }, opts);
		if (!synthesized.length) {
			continue;
		}

		characters[name] = {
			...existing,
			canonicalName: existing.canonicalName ?? name,
			statusBullets: synthesized,
		};
	}

	return {
		...state,
		characters,
	};
}
