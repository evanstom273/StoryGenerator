import { describe, expect, it } from "vitest";
import {
	canDownloadAiDocumentJob,
	prepareAiDocumentJobDownload,
} from "../aiDocumentGenerator/download";
import { EPUB_MIME_TYPE } from "../aiDocumentGenerator/epub";
import type { BackgroundJob } from "../../types/models";

function makeJob(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
	return {
		id: "job-1",
		type: "ai_document",
		createdAt: "2026-01-01T00:00:00.000Z",
		status: "complete",
		result: {
			aiDocumentFilename: "story-podcast.md",
			aiDocumentMarkdown: "# Podcast\n\nHost one: Hello.",
		},
		...overrides,
	};
}

describe("aiDocumentDownload", () => {
	it("allows download for completed markdown ai_document jobs", () => {
		expect(canDownloadAiDocumentJob(makeJob())).toBe(true);
	});

	it("prepares EPUB bytes when a completed job uses an .epub filename", () => {
		const job = makeJob({
			result: {
				aiDocumentFilename: "story-novelisation.epub",
				aiDocumentMarkdown: "# Story\n\n## Chapter I\n\nOpening scene.",
			},
		});

		const prepared = prepareAiDocumentJobDownload(job);
		expect(prepared.filename).toBe("story-novelisation.epub");
		expect(prepared.mimeType).toBe(EPUB_MIME_TYPE);
		expect(prepared.content).toBeInstanceOf(Uint8Array);
	});

	it("rejects jobs without stored markdown", () => {
		expect(
			canDownloadAiDocumentJob(
				makeJob({
					result: {
						aiDocumentFilename: "story-podcast.md",
					},
				}),
			),
		).toBe(false);
	});

	it("rejects non-markdown job types", () => {
		expect(
			canDownloadAiDocumentJob(
				makeJob({
					type: "podcast_audio",
				}),
			),
		).toBe(false);
	});
});
