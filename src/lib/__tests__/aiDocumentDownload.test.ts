import { describe, expect, it } from "vitest";
import { canDownloadAiDocumentJob } from "../aiDocumentGenerator/download";
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
