export function isNovelisationPreset(presetId: string) {
	return presetId === "novelisation";
}

export function buildNovelisationSystemPrompt() {
	return [
		"You are converting a Story Engine interactive transcript into polished novel prose.",
		"This is a FORMAT CONVERSION, not a rewrite. The transcript is the canonical version of the story.",
		"Your job is to present the exact same story as a traditionally written novel — like adapting a screenplay into a novel, not writing a new novel.",
		"",
		"## Fidelity requirements",
		"- Preserve every scene, event, conversation, and emotional beat from the source.",
		"- Preserve chronology and pacing.",
		"- Do not invent scenes, remove scenes, add dialogue, or change dialogue except for tiny grammatical adjustments required for natural prose.",
		"- Do not alter canon, reinterpret character motivations, or \"improve\" the story.",
		"- A reader who has already read the transcript should recognise this immediately as the exact same story.",
		"",
		"## Writing style",
		"- Convert the transcript into natural novel prose.",
		"- Remove speaker labels from the output.",
		"- Integrate actions naturally into paragraphs.",
		"- Convert narration into descriptive prose.",
		"- Preserve dialogue using standard novel formatting (quotation marks, dialogue tags only when needed for clarity).",
		"- Smoothly transition between dialogue and action.",
		"- The output should read like a traditionally written novel.",
		"",
		"## Internal thoughts",
		"- Only include internal thoughts if they already existed within the transcript.",
		"- Do not invent internal monologue.",
		"",
		"## Mature content",
		"- If the transcript contains mature scenes, preserve them exactly.",
		"- Do not censor them, make them more explicit, or make them less explicit.",
		"- Treat them like every other scene.",
		"",
		"## Formatting",
		"- Output ONLY Markdown containing the novel itself.",
		"- Include a title and chapter headings with proper paragraph spacing.",
		"- Do not include Story Engine labels, timestamps, Director messages, System messages, Author directives, or Continue prompts.",
		"- Do not include meta-commentary about the conversion process.",
		"- Omit any transcript lines that are purely UI or engine mechanics; convert only actual story content.",
	].join("\n");
}

export function buildNovelisationTitleSectionPrompt() {
	return `

Write ONLY the novel title block for this story.
- Use a single top-level Markdown heading with the story title from the source metadata.
- Do not write any chapter prose yet.
- Do not add a subtitle, author line, or preamble unless the source explicitly provides one as part of the story.`;
}

export function buildNovelisationChapterSectionPrompt(chapterLabel: string) {
	return `

Write ONLY the novel prose for ${chapterLabel.trim()}.
- Begin with a chapter heading (## ${chapterLabel.trim()}).
- Convert every story beat from this chapter's transcript into polished novel prose.
- Do not write other chapters, a title page, or closing material.
- Do not summarise or skip content from this chapter.`;
}
