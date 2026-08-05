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
	const trimmed = text
		.trim()
		.replace(/^```(?:\w+)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1).trim();
	}
	return trimmed;
}

const INCOMPLETE_TRAILING_WORDS =
	/^(a|an|the|in|on|with|for|to|and|or|but|as|at|by|from|of|that|who|which|when|while|because)$/i;

export function looksLikeBiographyOpener(text: string, characterName?: string) {
	const firstSentence = (text.split(/(?<=[.!?])\s+/)[0] ?? text).trim();
	const name = characterName?.trim();

	if (name) {
		const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (new RegExp(`^${escapedName}\\s+is\\s+(a|an)\\b`, "i").test(firstSentence)) {
			return true;
		}
	}

	return /^[A-Z][^.!?]{0,120}\s+is\s+(a|an)\s+/i.test(firstSentence);
}

export function isCompleteCharacterConcept(text: string, characterName?: string) {
	const concept = normalizeGeneratedCharacterConcept(text);
	if (!concept) {
		return false;
	}

	if (looksLikeBiographyOpener(concept, characterName)) {
		return false;
	}

	const words = concept.split(/\s+/).filter(Boolean);
	if (words.length < 18) {
		return false;
	}

	if (!/[.!?]["']?$/.test(concept.trim())) {
		return false;
	}

	const lastWord = words[words.length - 1]?.replace(/[.!?,;:"']+$/g, "") ?? "";
	if (INCOMPLETE_TRAILING_WORDS.test(lastWord)) {
		return false;
	}

	const sentences = concept
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim())
		.filter(Boolean);

	return sentences.length >= 2;
}

export const CHARACTER_CONCEPT_MAX_ATTEMPTS = 3;

export function buildCharacterConceptUserPrompt(attempt: number) {
	if (attempt <= 0) {
		return [
			"Write the character concept now.",
			"Output 2–4 complete sentences as a creative pitch.",
			"End with proper punctuation. Do not stop mid-sentence.",
		].join(" ");
	}

	return [
		"Your previous attempt was incomplete, truncated, or read like a biography opener.",
		"Write a NEW complete character concept: 2–4 full sentences.",
		"Pitch the role, core tension, and what makes them fun to play.",
		'Do not start with "[Name] is a...". Do not stop mid-sentence.',
	].join(" ");
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
		"This is a creative brief for the author/player — not a biography, not an opening paragraph of a novel, and not a character sheet.",
		"Output 2–4 complete sentences as a pitch: role, vibe, core tension, and what makes them fun to play.",
		"Each sentence must be grammatically complete. Never stop mid-sentence or mid-thought.",
		"Do not open with \"[Name] is a...\" or similar encyclopedia-style intros.",
		"Do not list appearance traits, timelines, or stat blocks.",
		"Honor all provided character constraints; weave them into the pitch naturally.",
		"If a universe is provided, make the concept authentic to that setting.",
		"If no universe is provided, keep the concept original and setting-flexible.",
		"Return plain text only. No markdown. No JSON. No headings. No labels. No commentary.",
		"Asterisks are reserved for actions in story text; do not use asterisks for emphasis.",
		"",
		"GOOD example (pitch):",
		"\"A sharp-tongued rookie detective who plays the clown to hide how carefully they're watching everyone in the room. Core tension: protect their friends vs. blow the whistle on corruption they can't yet prove. Fun to play as the one who jokes first and notices second.\"",
		"",
		"BAD example (do not do this):",
		"\"Jamie Peralta is a fast-talking, fifteen-year-old high schooler caught in an\"",
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
