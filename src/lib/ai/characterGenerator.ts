import type { AIProviderType, Universe } from "../../types/models";
import { formatUniverseWikiSources } from "../universeSources";

export type CharacterConceptConstraintField =
	| "name"
	| "age"
	| "gender"
	| "species"
	| "pronouns"
	| "appearance"
	| "personality"
	| "background"
	| "notes"
	| "aliases";

export interface CharacterConceptGeneratorInput {
	universe?: Universe | null;
	importedLoreText?: string;
	existing?: Partial<Record<CharacterConceptConstraintField, string>>;
}

export type PlayerCharacterField =
  | "name"
  | "age"
  | "gender"
  | "species"
  | "pronouns"
  | "appearance"
  | "personality"
  | "background"
  | "notes";

export interface CharacterGeneratorInput {
  universe: Universe;
  importedLoreText?: string;
  fields?: PlayerCharacterField[];
  existing?: Partial<Record<PlayerCharacterField, string>>;
  characterConcept?: string;
}

function buildUniverseInfo(universe: Universe) {
  return [
    `Universe Name: ${universe.name}`,
    universe.description.trim() ? `Universe Description: ${universe.description.trim()}` : "",
    formatUniverseWikiSources(universe).length
      ? `Universe Sources:\n${formatUniverseWikiSources(universe).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCharacterGeneratorSystemPrompt({
  universe,
  importedLoreText,
  fields,
  existing,
  characterConcept,
}: CharacterGeneratorInput) {
  const requested = fields?.length ? fields.join(", ") : "all";
  const loreBlock = importedLoreText?.trim()
    ? `Imported Lore (reference only):\n${importedLoreText.trim()}`
    : "No imported lore is available.";
  const conceptBlock = characterConcept?.trim()
    ? `Character Concept (authoritative):\n${characterConcept.trim()}`
    : "No character concept was provided.";

  const lockedFields = (existing
    ? Object.entries(existing)
        .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
        .filter(([key]) => !(fields ?? []).includes(key as PlayerCharacterField))
        .map(([key, value]) => `${key}: ${(value as string).trim()}`)
    : []) as string[];

  const lockedBlock = lockedFields.length
    ? ["User-entered locked fields (authoritative, do not change):", ...lockedFields].join(
        "\n",
      )
    : "No locked user-entered fields were provided.";

  return [
    "You are a character generator for a fictional universe.",
    "Character authenticity and setting fit are the highest priority.",
    "Do not contradict canon. If uncertain, stay generic but setting-appropriate.",
    "When some fields are already provided by the user, treat them as authoritative and use them as constraints for generating the missing fields.",
    "Do not contradict locked fields. Make generated fields consistent with them (age, gender, pronouns, name, etc.).",
    "Return STRICT JSON only. No markdown. No code fences. No commentary.",
    `Generate: ${requested}.`,
    "JSON schema (exact keys):",
    '{ "name": string, "age": string, "gender": string, "species": string, "pronouns": string, "appearance": string, "personality": string, "background": string, "notes": string }',
    "All values must be plain text strings (no nested objects, no arrays).",
    "If pronouns are provided or implied by the existing request, keep them consistent and do not invent conflicting pronouns.",
    "Asterisks are reserved for actions in story text; do not use asterisks for emphasis in any field values.",
    "",
    buildUniverseInfo(universe),
    "",
    loreBlock,
    "",
    conceptBlock,
    "",
    lockedBlock,
  ].join("\n");
}

function buildUniverseContextBlock(universe: Universe, importedLoreText?: string) {
	const loreBlock = importedLoreText?.trim()
		? `Imported Lore (reference only):\n${importedLoreText.trim()}`
		: "No imported lore is available.";

	return [
		`Universe Name: ${universe.name}`,
		universe.description.trim() ? `Universe Description: ${universe.description.trim()}` : "",
		universe.concept?.trim() ? `Universe Concept: ${universe.concept.trim()}` : "",
		universe.genreTheme?.trim() ? `Genre/Theme: ${universe.genreTheme.trim()}` : "",
		universe.tone?.trim() ? `Tone: ${universe.tone.trim()}` : "",
		formatUniverseWikiSources(universe).length
			? `Universe Sources:\n${formatUniverseWikiSources(universe).join("\n")}`
			: "",
		loreBlock,
	]
		.filter(Boolean)
		.join("\n");
}

export function normalizeGeneratedCharacterConcept(text: string) {
	const trimmed = text.trim().replace(/^```[\w]*\n?|```$/g, "").trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1).trim();
	}
	return trimmed;
}

export function buildCharacterConceptGeneratorSystemPrompt({
	universe,
	importedLoreText,
	existing,
}: CharacterConceptGeneratorInput) {
	const constraintLines = existing
		? Object.entries(existing)
				.filter(([, value]) => typeof value === "string" && value.trim().length > 0)
				.map(([key, value]) => `${key}: ${(value as string).trim()}`)
		: [];

	const constraintsBlock = constraintLines.length
		? ["Existing character fields (authoritative constraints; do not contradict):", ...constraintLines].join(
				"\n",
			)
		: "No existing character fields were provided.";

	const universeBlock = universe
		? buildUniverseContextBlock(universe, importedLoreText)
		: "No universe is selected. Invent an original, broadly appealing character concept that could fit many settings.";

	return [
		"You are a creative writing assistant generating a Character Concept for a roleplay character.",
		"Output a single concise character concept only: a writing prompt or character pitch, not a biography.",
		"Keep it to 2–4 sentences. Focus on vibe, role, core tension, and what makes them fun to play.",
		"Do not write appearance lists, backstory timelines, or stat blocks.",
		"Do not contradict any provided character constraints.",
		"If a universe is provided, make the concept authentic to that setting.",
		"If no universe is provided, keep the concept original and setting-flexible.",
		"Return plain text only. No markdown. No JSON. No headings. No commentary.",
		"Asterisks are reserved for actions in story text; do not use asterisks for emphasis.",
		"",
		universeBlock,
		"",
		constraintsBlock,
	].join("\n");
}

export function getCharacterGeneratorProviderHint(providerType: AIProviderType) {
  if (providerType === "gemini") {
    return "Gemini: follow the strict JSON-only requirement.";
  }

  return "OpenAI: follow the strict JSON-only requirement.";
}
