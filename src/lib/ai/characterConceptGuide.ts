/**
 * Authoritative in-app definition of what a Player Character "Character Concept" is.
 * Used by concept generation (Randomise) and referenced when expanding a concept into a full sheet.
 */
export const CHARACTER_CONCEPT_DEFINITION = [
	"A Character Concept is not a biography or a completed character sheet.",
	"It is a concise creative pitch that defines the core idea of the character in a few sentences.",
	"A good Character Concept explains:",
	"- who the character is",
	"- how they fit into the chosen universe",
	"- any important relationships they already have (only when specified in Known ties or the Character Concept)",
	"- the central premise or hook that makes them interesting",
	"- a handful of defining personality traits",
	"It should intentionally leave the detailed Appearance, Personality, Background, and Notes to be expanded by the Character Generation system.",
	'Think of it as the answer to: "If this character walked into the first chapter of the story, what would the author need to know about them?"',
	"It should inspire the rest of the character sheet, not replace it.",
].join("\n");

export const CHARACTER_CONCEPT_EXAMPLE =
	"Jake and Amy's son. Quiet, funny, and exceptionally intelligent. A STEM prodigy who adores his parents but is hiding a life-changing secret from them: he's Spider-Man.";

export function formatCharacterConceptGuideForPrompt() {
	return [
		"Character Concept definition (follow exactly):",
		CHARACTER_CONCEPT_DEFINITION,
		"",
		"Example of a good Character Concept:",
		CHARACTER_CONCEPT_EXAMPLE,
	].join("\n");
}
