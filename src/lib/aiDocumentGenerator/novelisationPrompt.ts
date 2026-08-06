export function isNovelisationPreset(presetId: string) {
	return presetId === "novelisation";
}

export interface NovelisationChapterLabel {
	rawLabel: string;
	baseLabel: string;
	authorTitle: string | null;
}

export function parseNovelisationChapterLabel(label: string): NovelisationChapterLabel {
	const trimmed = label.trim();
	const colonIndex = trimmed.indexOf(":");
	if (colonIndex > 0) {
		const baseLabel = trimmed.slice(0, colonIndex).trim();
		const authorTitle = trimmed.slice(colonIndex + 1).trim();
		if (baseLabel && authorTitle) {
			return {
				rawLabel: trimmed,
				baseLabel,
				authorTitle,
			};
		}
	}

	return {
		rawLabel: trimmed,
		baseLabel: trimmed,
		authorTitle: null,
	};
}

export function buildNovelisationSystemPrompt() {
	return [
		"You are a professional novel adaptor converting a Story Engine interactive transcript into polished novel prose.",
		"This is FORMAT ADAPTATION, not co-authorship. The transcript is the canonical version of the story.",
		"Transform how the story reads — never what happens in it.",
		"",
		"## Fidelity requirements",
		"- Preserve every scene, event, conversation, and emotional beat from the source.",
		"- Preserve chronology and pacing.",
		"- Do not invent scenes, remove scenes, add dialogue, or change what characters say except for tiny grammatical adjustments required for natural prose.",
		"- Do not invent internal monologue unless it already existed in the transcript.",
		"- Do not alter canon, reinterpret character motivations, or \"improve\" the story.",
		"- A reader who has already read the transcript should recognise this immediately as the exact same story.",
		"",
		"## Prose adaptation (not literal translation)",
		"- Write like a traditionally published novel, not a transcript with labels removed.",
		"- Convert actions into natural narrative prose. Avoid mechanical transcript phrasing (e.g. stacking actions as bare present-participle openings).",
		"- Use varied sentence rhythm, natural transitions, and immersive description while keeping every event exactly as written.",
		"- Merge adjacent short narration or dialogue beats into flowing paragraphs where appropriate.",
		"- Do not leave one Story Engine message per paragraph by default — group related beats naturally.",
		"- Preserve dialogue faithfully; use standard novel formatting (quotation marks, dialogue tags only when needed).",
		"- Remove speaker labels from the output.",
		"",
		"## Internal thoughts",
		"- Only include internal thoughts if they already existed within the transcript.",
		"",
		"## Mature content",
		"- If the transcript contains mature scenes, preserve them exactly.",
		"- Do not censor them, make them more explicit, or make them less explicit.",
		"",
		"## Formatting",
		"- Output ONLY Markdown containing the novel itself.",
		"- Include a title and chapter headings with consistent spacing between chapters.",
		"- Each chapter must appear exactly once, in source order.",
		"- Do not include Story Engine labels, timestamps, Director messages, System messages, Author directives, or Continue prompts.",
		"- Do not include meta-commentary about the conversion process.",
		"- Omit any transcript lines that are purely UI or engine mechanics; convert only actual story content.",
	].join("\n");
}

export function buildNovelisationTitleSectionPrompt() {
	return `

Write ONLY the novel title block for this step.
- Output a single top-level Markdown heading (#) with the story title from the source metadata.
- Do NOT write any chapter headings, chapter prose, summaries, or transcript conversion in this step.
- Do NOT repeat or preview chapter content.
- Do not add a subtitle, author line, or preamble unless the source explicitly provides one as part of the story.`;
}

export function buildNovelisationChapterSectionPrompt(chapterLabel: string) {
	const parsed = parseNovelisationChapterLabel(chapterLabel);
	const headingRule = parsed.authorTitle
		? `- Begin with this chapter heading exactly: ## ${parsed.rawLabel}`
		: `- Begin with: ## ${parsed.baseLabel}: [Your concise chapter title]
- Generate a short, novel-appropriate chapter title (typically 2–6 words) based only on events in this chapter.
- Avoid spoilers and clickbait. Keep the tone natural, not melodramatic.
- Use only the chapter number/label from the source (${parsed.baseLabel}); do not rename the chapter numbering.`;

	return `

Write ONLY the novel prose for ${parsed.rawLabel}.
${headingRule}
- Convert every story beat from this chapter's transcript into polished, professionally adapted novel prose.
- Do not write other chapters, the book title, or closing material.
- Do not summarise or skip content from this chapter.
- Do not duplicate content from other chapters.`;
}

export function extractNovelisationTitleSourceMaterial(
	fullSourceMaterial: string,
	chapterLabels: string[],
): string {
	const chapterSectionStart = fullSourceMaterial.search(/\n##\s+/);
	const header =
		chapterSectionStart > 0
			? fullSourceMaterial.slice(0, chapterSectionStart).trim()
			: fullSourceMaterial
					.split("\n")
					.filter((line) => line.trim() && !line.startsWith("["))
					.slice(0, 8)
					.join("\n")
					.trim();

	return [
		header,
		"",
		`Chapters in order (${chapterLabels.length}): ${chapterLabels.join(" · ")}`,
		"",
		"Metadata reference only for the title step. Do not novelise transcript content in this response.",
	].join("\n");
}

export function stripNovelisationTitleOverflow(introduction: string): string {
	const lines = introduction.split("\n");
	const kept: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (/^##\s+/.test(trimmed) && kept.length > 0) {
			break;
		}
		kept.push(line);
	}

	return kept.join("\n").trim();
}

export function dedupeNovelisationChapterSections(chapterSections: string[]): string[] {
	const seenHeadings = new Set<string>();
	const deduped: string[] = [];

	for (const section of chapterSections) {
		const trimmed = section.trim();
		if (!trimmed) {
			continue;
		}

		const headingMatch = trimmed.match(/^##\s+(.+)$/m);
		const headingKey = headingMatch?.[1]?.trim().toLowerCase() ?? trimmed.slice(0, 120).toLowerCase();
		if (seenHeadings.has(headingKey)) {
			continue;
		}

		seenHeadings.add(headingKey);
		deduped.push(trimmed);
	}

	return deduped;
}

export function assembleNovelisationDocument(introduction: string, chapterSections: string[]): string {
	const titleBlock = stripNovelisationTitleOverflow(introduction);
	const chapters = dedupeNovelisationChapterSections(chapterSections);
	return [titleBlock, ...chapters].filter(Boolean).join("\n\n");
}
