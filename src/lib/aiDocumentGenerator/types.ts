export type AiDocumentStructure = "single" | "chapter-by-chapter";

export type AiDocumentOutputFormat = "markdown" | "epub" | "gemini-audio-wav";

export interface ChapterSourceSegment {
	label: string;
	transcript: string;
}

export interface AiDocumentGenerationResult {
	filename: string;
	mimeType: string;
	content: string | ArrayBuffer;
}
