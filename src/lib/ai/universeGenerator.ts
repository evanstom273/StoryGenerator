import type { Universe } from "../../types/models";

export type UniverseField =
  | "name"
  | "genreTheme"
  | "tone"
  | "eraTechLevel"
  | "powerSystemRules"
  | "coreConflict"
  | "everydayLifeVibe"
  | "canonGuardrails"
  | "playerBoundaries"
  | "ratingContentNotes"
  | "lorePrimer"
  | "keyFactions"
  | "keyLocations"
  | "characterArchetypes"
  | "notes";

export interface UniverseGeneratorInput {
  universeIdea?: string;
  fields?: UniverseField[];
  existing?: Partial<Record<UniverseField, string>>;
  importedLoreText?: string;
  existingUniverse?: Universe;
}

function buildExistingUniverseInfo(universe: Universe) {
  const primer = universe.lorePrimer?.trim() || universe.description.trim();
  return [
    `Universe Name: ${universe.name}`,
    primer ? `Lore Primer: ${primer}` : "",
    universe.genreTheme?.trim() ? `Genre/Theme: ${universe.genreTheme.trim()}` : "",
    universe.tone?.trim() ? `Tone: ${universe.tone.trim()}` : "",
    universe.eraTechLevel?.trim() ? `Era / Tech Level: ${universe.eraTechLevel.trim()}` : "",
    universe.coreConflict?.trim() ? `Core Conflict: ${universe.coreConflict.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildUniverseGeneratorSystemPrompt({
  universeIdea,
  fields,
  existing,
  importedLoreText,
  existingUniverse,
}: UniverseGeneratorInput) {
  const requested = fields?.length ? fields.join(", ") : "all";
  const ideaBlock = universeIdea?.trim()
    ? `Universe Idea (authoritative):\n${universeIdea.trim()}`
    : "No universe idea was provided.";
  const loreBlock = importedLoreText?.trim()
    ? `Imported Lore (reference only):\n${importedLoreText.trim()}`
    : "No imported lore is available.";

  const lockedFields = (existing
    ? Object.entries(existing)
        .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
        .filter(([key]) => !(fields ?? []).includes(key as UniverseField))
        .map(([key, value]) => `${key}: ${(value as string).trim()}`)
    : []) as string[];

  const lockedBlock = lockedFields.length
    ? ["User-entered locked fields (authoritative, do not change):", ...lockedFields].join(
        "\n",
      )
    : "No locked user-entered fields were provided.";

  const existingUniverseBlock = existingUniverse
    ? ["Existing Universe (reference only):", buildExistingUniverseInfo(existingUniverse)].join(
        "\n",
      )
    : "No existing universe record is available.";

  return [
    "You are a universe pack generator for a fictional setting.",
    "Setting coherence, tone consistency, and clean authorial guardrails are the highest priority.",
    "Return STRICT JSON only. No markdown. No code fences. No commentary.",
    "When some fields are already provided by the user, treat them as authoritative and use them as constraints.",
    `Generate: ${requested}.`,
    "JSON schema (exact keys):",
    '{ "name": string, "genreTheme": string, "tone": string, "eraTechLevel": string, "powerSystemRules": string, "coreConflict": string, "everydayLifeVibe": string, "canonGuardrails": string, "playerBoundaries": string, "ratingContentNotes": string, "lorePrimer": string, "keyFactions": string, "keyLocations": string, "characterArchetypes": string, "notes": string }',
    "All values must be plain text strings (no nested objects, no arrays).",
    "Use short paragraphs and bullet-style lines only where appropriate. Avoid excessive verbosity.",
    "Asterisks are reserved for actions in story text; do not use asterisks for emphasis in any field values.",
    "",
    ideaBlock,
    "",
    existingUniverseBlock,
    "",
    loreBlock,
    "",
    lockedBlock,
  ].join("\n");
}

