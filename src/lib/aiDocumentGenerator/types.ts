export type AiDocumentStructure = "single" | "chapter-by-chapter";

export type AiDocumentOutputFormat = "markdown" | "gemini-audio-wav";

export interface ChapterSourceSegment {
	label: string;
	transcript: string;
}

export interface AiDocumentGenerationResult {
	filename: string;
	mimeType: string;
	content: string | ArrayBuffer;
}
