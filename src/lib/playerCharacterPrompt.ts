import type { PlayerCharacter, PlayerCharacterDraft } from "../types/models";

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

const CHARACTER_CONCEPT_CONSTRAINT_FIELDS = [
	"name",
	"age",
	"gender",
	"species",
	"pronouns",
	"appearance",
	"personality",
	"background",
	"notes",
] as const;

export function buildCharacterConceptConstraintsFromDraft(
	draft?: Partial<PlayerCharacterDraft>,
): Partial<Record<(typeof CHARACTER_CONCEPT_CONSTRAINT_FIELDS)[number] | "aliases", string>> {
	if (!draft) {
		return {};
	}

	const constraints: Partial<
		Record<(typeof CHARACTER_CONCEPT_CONSTRAINT_FIELDS)[number] | "aliases", string>
	> = {};

	for (const key of CHARACTER_CONCEPT_CONSTRAINT_FIELDS) {
		const value = draft[key];
		if (typeof value === "string" && value.trim()) {
			constraints[key] = value.trim();
		}
	}

	const aliases = normalizePlayerCharacterAliases(draft.aliases);
	if (aliases.length) {
		constraints.aliases = aliases.join(", ");
	}

	return constraints;
}
