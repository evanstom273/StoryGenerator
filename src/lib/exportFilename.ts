import type { ExportFormat } from "../types/models";

function pad(value: number) {
	return String(value).padStart(2, "0");
}

/** Local wall-clock timestamp for download filenames (not UTC). */
export function formatLocalExportTimestamp(date = new Date()): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function sanitizeExportSlug(value: string, maxLength = 80): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, maxLength);
}

export function createStoryExportFilename(title: string, format: ExportFormat, exportedAt = new Date()) {
	const slug = sanitizeExportSlug(title) || "story-engine-story";
	const timestamp = formatLocalExportTimestamp(exportedAt);
	const archiveSuffix = format === "archive_pdf" || format === "markdown" ? "-archive" : "";
	const extension =
		format === "json"
			? "json"
			: format === "markdown"
				? "md"
				: format === "pdf" || format === "archive_pdf"
					? "pdf"
					: "txt";

	return `${slug}${archiveSuffix}-${timestamp}.${extension}`;
}

export function createMetaChatExportFilename(
	title: string,
	format: "json" | "markdown" | "txt" | "pdf",
	exportedAt = new Date(),
) {
	const slug = sanitizeExportSlug(title) || "story-engine";
	const timestamp = formatLocalExportTimestamp(exportedAt);
	const extension = format === "markdown" ? "md" : format;
	return `${slug}-meta-chat-${timestamp}.${extension}`;
}

export function buildStoryAudiobookFilename(storyTitle: string, exportedAt = new Date()) {
	const slug = sanitizeExportSlug(storyTitle) || "story";
	const timestamp = formatLocalExportTimestamp(exportedAt);
	return `${slug}-story-audiobook-${timestamp}.wav`;
}
