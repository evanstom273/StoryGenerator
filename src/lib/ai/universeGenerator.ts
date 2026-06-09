export function buildUniverseBlueprintSystemPrompt(params: {
  universeName: string;
  concept: string;
  genreTheme?: string;
  tone?: string;
  existingBlueprint?: string;
}) {
  const { universeName, concept, genreTheme, tone, existingBlueprint } = params;

  const blueprintGuidance = [
    "Write a single Universe Blueprint text block with clear headings.",
    "Use these headings (in this order), each as a markdown-style heading line (e.g. '## Overview'):",
    "- Overview",
    "- Tone & Themes",
    "- Tech/Magic/Power Rules (if applicable)",
    "- Core Conflict(s)",
    "- Factions (short list)",
    "- Key Locations (short list)",
    "- Archetypes (short list)",
    "- Guardrails / Canon Rules",
    "- Player Boundaries",
    "",
    "Keep it readable, compact, and immediately usable as canon.",
    "Do not use asterisks for emphasis.",
  ].join("\n");

  const existingBlueprintBlock = existingBlueprint?.trim()
    ? ["Existing Blueprint (reference only):", "```", existingBlueprint.trim(), "```"].join("\n")
    : "No existing blueprint is available.";

  return [
    "You are generating a Universe Blueprint for a custom universe.",
    "The blueprint is authoritative canon for the setting and will be given to the model in future story prompts.",
    "Return STRICT JSON only. No markdown. No code fences. No commentary.",
    'JSON schema (exact keys): { "universeBlueprint": string }',
    "The universeBlueprint value must be plain text containing the blueprint headings and content.",
    "",
    `Universe Name: ${universeName.trim()}`,
    genreTheme?.trim() ? `Genre/Theme: ${genreTheme.trim()}` : "",
    tone?.trim() ? `Tone: ${tone.trim()}` : "",
    "",
    "Universe Concept (authoritative):",
    concept.trim(),
    "",
    blueprintGuidance,
    "",
    existingBlueprintBlock,
  ]
    .filter(Boolean)
    .join("\n");
}
