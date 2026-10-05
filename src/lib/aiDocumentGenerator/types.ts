export type AiDocumentStructure = "single" | "chapter-by-chapter";

export type AiDocumentOutputFormat = "markdown" | "epub" | "gemini-audio-wav";

export interface ChapterSourceSegment {
	label: string;
	transcript: string;
	/** High-level canonical chapter summary used only as a provider-refusal fallback. */
	summary?: string;
}

export interface AiDocumentGenerationResult {
	filename: string;
	mimeType: string;
	content: string | ArrayBuffer;
}
