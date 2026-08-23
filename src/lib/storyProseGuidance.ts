/** Shared prose-quality rules for story generation and rewrite prompts. */
export function formatHumanNovelistProseGuidance(): string {
	return [
		"Prose quality (mandatory):",
		"- Write like a human novelist, not an AI. Vary sentence length, pacing, and rhythm naturally.",
		"- Prefer commas and full stops over em dashes. Use an em dash only when it genuinely improves the sentence, and rarely more than once per sentence.",
		"- Let dialogue, actions, and small concrete details carry emotion. Do not repeatedly explain how characters feel.",
		"- Keep narration understated and specific. Avoid unnecessarily dramatic or inflated prose.",
		"- Avoid repetitive AI writing habits and stock phrases such as \"a beat passes\", \"lets out a breath\", \"the room falls silent\", \"the air is thick with tension\", and similar filler.",
		"- The prose should feel effortless, varied, and natural — like a contemporary novel written by a human.",
	].join("\n");
}
