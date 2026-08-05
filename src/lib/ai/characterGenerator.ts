import type { AIProviderType, Universe } from "../../types/models";
import { formatUniverseWikiSources } from "../universeSources";

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

export function getCharacterGeneratorProviderHint(providerType: AIProviderType) {
  if (providerType === "gemini") {
    return "Gemini: follow the strict JSON-only requirement.";
  }

  return "OpenAI: follow the strict JSON-only requirement.";
}
