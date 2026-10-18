import type { PlayerCharacter } from "../types/models";
import { normalizeLinkedCharacterIds, normalizePlayerCharacterAliases } from "./playerCharacterPrompt";

export interface LinkedCharacterSheet {
	character: PlayerCharacter;
	/** Names of the sheets that link to this one. */
	linkedFrom: string[];
}

/**
 * Resolves the sheets linked from `sources`, one hop only so prompts cannot
 * snowball. Missing IDs are skipped; `excludeIds` drops sheets already present
 * elsewhere in the prompt (for example the player or imported characters).
 */
export function resolveLinkedCharacterSheets(
	sources: readonly PlayerCharacter[],
	allCharacters: readonly PlayerCharacter[],
	options?: { excludeIds?: Iterable<string> },
): LinkedCharacterSheet[] {
	const byId = new Map(allCharacters.map((character) => [character.id, character]));
	const excluded = new Set(options?.excludeIds ?? []);
	for (const source of sources) excluded.add(source.id);

	const resolved = new Map<string, LinkedCharacterSheet>();
	for (const source of sources) {
		for (const id of normalizeLinkedCharacterIds(source.linkedCharacterIds, source.id)) {
			if (excluded.has(id)) continue;
			const character = byId.get(id);
			if (!character) continue;
			const entry = resolved.get(id) ?? { character, linkedFrom: [] };
			const sourceName = source.name.trim();
			if (sourceName && !entry.linkedFrom.includes(sourceName)) entry.linkedFrom.push(sourceName);
			resolved.set(id, entry);
		}
	}
	return [...resolved.values()];
}

/** IDs in the character's links that no longer resolve to a sheet. */
export function findMissingLinkedCharacterIds(
	linkedCharacterIds: readonly string[] | undefined,
	allCharacters: readonly PlayerCharacter[],
): string[] {
	const known = new Set(allCharacters.map((character) => character.id));
	return normalizeLinkedCharacterIds(linkedCharacterIds).filter((id) => !known.has(id));
}

function clip(value: string | undefined, maxChars?: number) {
	const trimmed = value?.trim() ?? "";
	if (!trimmed || !maxChars || trimmed.length <= maxChars) return trimmed;
	return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}

export function formatLinkedCharacterSheetsForPrompt(
	entries: readonly LinkedCharacterSheet[],
	options?: { maxFieldChars?: number; universeNameById?: (id: string) => string | undefined },
): string | null {
	if (!entries.length) return null;

	const sheets = entries.map(({ character, linkedFrom }) => {
		const max = options?.maxFieldChars;
		const aliases = normalizePlayerCharacterAliases(character.aliases).filter(
			(alias) => alias.toLowerCase() !== character.name.trim().toLowerCase(),
		);
		const identity = [
			character.pronouns.trim() ? `pronouns ${character.pronouns.trim()}` : "",
			character.gender.trim(),
			character.age.trim() ? `age ${character.age.trim()}` : "",
			character.species?.trim() ?? "",
		].filter(Boolean);
		const universe = options?.universeNameById?.(character.universeId);
		return [
			`Name: ${character.name.trim()}`,
			`Sheet ID: ${character.id}`,
			universe ? `Universe: ${universe}` : "",
			linkedFrom.length ? `Linked from: ${linkedFrom.join(", ")}` : "",
			aliases.length ? `Aliases: ${aliases.join(", ")}` : "",
			identity.length ? `Identity: ${identity.join(", ")}` : "",
			clip(character.characterConcept, max) ? `Concept: ${clip(character.characterConcept, max)}` : "",
			clip(character.personality, max) ? `Personality: ${clip(character.personality, max)}` : "",
			clip(character.background, max) ? `Background: ${clip(character.background, max)}` : "",
			clip(character.appearance, max) ? `Appearance: ${clip(character.appearance, max)}` : "",
		]
			.filter(Boolean)
			.join("\n");
	});

	return [
		"Linked character sheets (the exact people the sheets above refer to):",
		"When a sheet mentions one of these people, it means exactly this sheet (same Sheet ID), not another character with the same or a similar name. Being linked does not place them in a scene.",
		...sheets,
	].join("\n\n");
}

/**
 * Applies ID changes to every character's links: a string remaps, null removes.
 * Returns only the characters whose links changed, ready to save.
 */
export function remapLinkedCharacterIds(
	characters: readonly PlayerCharacter[],
	changes: ReadonlyMap<string, string | null>,
): PlayerCharacter[] {
	const updated: PlayerCharacter[] = [];
	for (const character of characters) {
		const current = normalizeLinkedCharacterIds(character.linkedCharacterIds, character.id);
		if (!current.some((id) => changes.has(id))) continue;
		const next = normalizeLinkedCharacterIds(
			current.map((id) => (changes.has(id) ? changes.get(id) : id)).filter((id): id is string => Boolean(id)),
			character.id,
		);
		updated.push({ ...character, linkedCharacterIds: next.length ? next : undefined });
	}
	return updated;
}
