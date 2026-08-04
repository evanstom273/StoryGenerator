import type { PlayerCharacter } from "../types/models";

export function normalizePlayerCharacterAliases(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const seen = new Set<string>();
	const aliases: string[] = [];

	for (const item of value) {
		if (typeof item !== "string") {
			continue;
		}

		const trimmed = item.trim();
		if (!trimmed) {
			continue;
		}

		const key = trimmed.toLowerCase();
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		aliases.push(trimmed);

		if (aliases.length >= 24) {
			break;
		}
	}

	return aliases;
}

export function formatPlayerCharacterAliasesForPrompt(
	character: Pick<PlayerCharacter, "name" | "aliases">,
): string | null {
	const name = character.name.trim();
	const aliases = normalizePlayerCharacterAliases(character.aliases).filter(
		(alias) => alias.toLowerCase() !== name.toLowerCase(),
	);

	if (!aliases.length) {
		return null;
	}

	return `Also known as: ${aliases.join(", ")}`;
}
