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

export function normalizePlayerCharacterKnownTies(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const seen = new Set<string>();
	const knownTies: string[] = [];

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
		knownTies.push(trimmed);

		if (knownTies.length >= 16) {
			break;
		}
	}

	return knownTies;
}

export function formatPlayerCharacterKnownTiesForPrompt(
	character: Pick<PlayerCharacter, "knownTies">,
): string | null {
	const knownTies = normalizePlayerCharacterKnownTies(character.knownTies);
	if (!knownTies.length) {
		return null;
	}

	return `Known ties: ${knownTies.join("; ")}`;
}

export function formatCharacterKnownTiesConstraint(
	draft?: Partial<Pick<PlayerCharacterDraft, "knownTies">>,
): string | null {
	const knownTies = normalizePlayerCharacterKnownTies(draft?.knownTies);
	if (!knownTies.length) {
		return null;
	}

	return [
		"Known ties (only these canon characters may be referenced by name):",
		...knownTies.map((tie) => `- ${tie}`),
	].join("\n");
}

export function formatAntiCanonSprawlGuidance(hasKnownTies: boolean): string {
	return [
		"Universe canon characters:",
		"- Imported lore may describe a large cast. Do not reference every famous character from the setting.",
		"- Do not assume the player character knows, works with, or is related to the main ensemble unless listed in Known ties or clearly implied by the Character Concept.",
		"- Prefer original hooks, everyday life, and off-screen connections over roping in the full main cast.",
		hasKnownTies
			? "- Only the Known ties listed above may be named. Do not add extra canon characters beyond those ties and any people explicitly named in the Character Concept."
			: "- No Known ties were specified. Do not name-drop major canon characters unless the Character Concept explicitly names them (for example, parents or mentors).",
	].join("\n");
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

export function formatCharacterConceptAliasesConstraint(
	draft?: Partial<Pick<PlayerCharacterDraft, "name" | "aliases">>,
): string | null {
	const name = draft?.name?.trim() ?? "";
	const aliases = normalizePlayerCharacterAliases(draft?.aliases).filter(
		(alias) => !name || alias.toLowerCase() !== name.toLowerCase(),
	);

	if (!aliases.length) {
		return null;
	}

	return [
		`Also known as (recognition names only): ${aliases.join(", ")}`,
		"Aliases are alternate names the character may be called in the story. They are ambiguous — for example, \"Static\" could be a content-creator handle, a hacktivist alias, a stage name, a furry persona, a nickname, or something else entirely.",
		"Do not assume a secret identity, criminal activity, or specific profession from alias text alone. Only mention an alias if it fits the concept you chose independently.",
	].join("\n");
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

	return constraints;
}
