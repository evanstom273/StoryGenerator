import type {
	EntityId,
	PlayerCharacter,
	Story,
	StoryStateData,
	StoryStateDataV2,
} from "../types/models";
import {
	formatPlayerCharacterKnownTiesForPrompt,
	normalizePlayerCharacterAliases,
} from "./playerCharacterPrompt";
import { findPlayerStoryStateEntry } from "./storyText/playerSceneName";

const MAX_IMPORTED_CHARACTERS = 32;

export function normalizeStoryImportedCharacterIds(value: unknown): EntityId[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const seen = new Set<string>();
	const ids: EntityId[] = [];

	for (const item of value) {
		if (typeof item !== "string") {
			continue;
		}

		const trimmed = item.trim();
		if (!trimmed || seen.has(trimmed)) {
			continue;
		}

		seen.add(trimmed);
		ids.push(trimmed);

		if (ids.length >= MAX_IMPORTED_CHARACTERS) {
			break;
		}
	}

	return ids;
}

export function resolveStoryImportedCharacters(
	story: Pick<Story, "importedCharacterIds" | "playerCharacterId">,
	allCharacters: PlayerCharacter[],
): PlayerCharacter[] {
	const ids = normalizeStoryImportedCharacterIds(story.importedCharacterIds);
	if (!ids.length) {
		return [];
	}

	const byId = new Map(allCharacters.map((character) => [character.id, character]));
	const resolved: PlayerCharacter[] = [];
	const seen = new Set<string>();

	for (const id of ids) {
		if (id === story.playerCharacterId) {
			continue;
		}

		const character = byId.get(id);
		if (!character || seen.has(character.id)) {
			continue;
		}

		seen.add(character.id);
		resolved.push(character);
	}

	return resolved;
}

export async function loadStoryImportedCharacters(
	story: Pick<Story, "importedCharacterIds" | "playerCharacterId">,
	getPlayerCharacter: (id: string) => Promise<PlayerCharacter | null | undefined>,
): Promise<PlayerCharacter[]> {
	const ids = normalizeStoryImportedCharacterIds(story.importedCharacterIds);
	if (!ids.length) {
		return [];
	}

	const resolved: PlayerCharacter[] = [];
	const seen = new Set<string>();

	for (const id of ids) {
		if (id === story.playerCharacterId || seen.has(id)) {
			continue;
		}

		const character = await getPlayerCharacter(id);
		if (!character) {
			continue;
		}

		seen.add(character.id);
		resolved.push(character);
	}

	return resolved;
}

export function collectStoryImportedCharacterAllowlistNames(
	characters: PlayerCharacter[],
): string[] {
	const names: string[] = [];
	const seen = new Set<string>();

	const add = (raw: string | null | undefined) => {
		const trimmed = raw?.trim();
		if (!trimmed) {
			return;
		}

		const key = trimmed.toLowerCase();
		if (seen.has(key)) {
			return;
		}

		seen.add(key);
		names.push(trimmed);
	};

	for (const character of characters) {
		add(character.name);
		for (const alias of normalizePlayerCharacterAliases(character.aliases)) {
			add(alias);
		}
	}

	return names;
}

export function mergeImportedCharacterAllowlist(
	universeImportedCharacters: string[] | undefined,
	storyImportedCharacters: PlayerCharacter[],
): string[] {
	const merged = [...(universeImportedCharacters ?? [])];
	const seen = new Set(merged.map((entry) => entry.trim().toLowerCase()));

	for (const name of collectStoryImportedCharacterAllowlistNames(storyImportedCharacters)) {
		const key = name.trim().toLowerCase();
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		merged.push(name);
	}

	return merged;
}

export function buildStoryImportedCharacterAllowlist(
	story: Pick<Story, "importedCharacterIds" | "playerCharacterId" | "universePackSnapshot">,
	allCharacters: PlayerCharacter[],
): string[] {
	return mergeImportedCharacterAllowlist(
		story.universePackSnapshot?.universe?.importedCharacters ?? [],
		resolveStoryImportedCharacters(story, allCharacters),
	);
}

function formatImportedCharacterState(
	character: Pick<PlayerCharacter, "name">,
	storyState?: StoryStateData | StoryStateDataV2 | null,
): string | null {
	const entry = findPlayerStoryStateEntry(storyState, character.name);
	if (!entry) {
		return null;
	}

	const parts: string[] = [];
	const statusBullets = Array.isArray(entry.statusBullets)
		? entry.statusBullets.map((bullet) => bullet.trim()).filter(Boolean).slice(0, 4)
		: [];
	const transient = Array.isArray(entry.characterStateTransient)
		? entry.characterStateTransient.map((item) => item.trim()).filter(Boolean).slice(0, 3)
		: [];

	if (entry.status?.trim()) {
		parts.push(`Current status: ${entry.status.trim()}`);
	}
	if (statusBullets.length) {
		parts.push(`Current scene state: ${statusBullets.join("; ")}`);
	}
	if (transient.length) {
		parts.push(`Transient state: ${transient.join("; ")}`);
	}

	return parts.length ? parts.join("\n") : null;
}

function formatImportedCharacterProfile(
	character: PlayerCharacter,
	storyState?: StoryStateData | StoryStateDataV2 | null,
): string {
	const aliases = normalizePlayerCharacterAliases(character.aliases).filter(
		(alias) => alias.toLowerCase() !== character.name.trim().toLowerCase(),
	);
	const knownTies = formatPlayerCharacterKnownTiesForPrompt(character);
	const stateBlock = formatImportedCharacterState(character, storyState);

	return [
		`Name: ${character.name.trim()}`,
		aliases.length ? `Aliases: ${aliases.join(", ")}` : "",
		character.appearance.trim() ? `Appearance: ${character.appearance.trim()}` : "",
		character.personality.trim() ? `Personality: ${character.personality.trim()}` : "",
		character.background.trim() ? `Background: ${character.background.trim()}` : "",
		character.notes.trim() ? `Notes: ${character.notes.trim()}` : "",
		knownTies,
		stateBlock,
	]
		.filter(Boolean)
		.join("\n");
}

export function formatStoryImportedCharactersForPrompt(
	characters: PlayerCharacter[],
	storyState?: StoryStateData | StoryStateDataV2 | null,
): string | null {
	if (!characters.length) {
		return null;
	}

	return [
		"Imported story characters (known to this story — treat like universe canon when referenced; do not auto-insert into scenes):",
		...characters.map((character) => formatImportedCharacterProfile(character, storyState)),
	].join("\n\n");
}
