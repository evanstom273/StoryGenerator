import { describe, expect, it } from "vitest";
import { GenerationFailureError } from "../ai/errors";
import {
	generateChapterStructuredDocument,
	NOVELISATION_SOURCE_PART_MAX_CHARS,
	splitNovelisationChapterSource,
} from "../aiDocumentGenerator/chapterGeneration";
import { getAiDocumentPreset } from "../aiDocumentGenerator/presets";
import { segmentUploadedSourceByChapter } from "../aiDocumentGenerator/sourceMaterial";

function chapterLabelFromSystem(system: string) {
	return system.match(/Write ONLY the novel prose for (Chapter [^\n.]+)/)?.[1]?.trim();
}

describe("scalable novelisation generation", () => {
	it("generates all 30 chapters independently and assembles them in order", async () => {
		const segments = Array.from({ length: 30 }, (_value, index) => ({
			label: `Chapter ${index + 1}`,
			transcript: `[turn] Narrator: Source material for chapter ${index + 1}.`,
		}));
		let generationCalls = 0;

		const document = await generateChapterStructuredDocument({
			preset: getAiDocumentPreset("novelisation"),
			sourceLabel: "Thirty Chapter Story",
			chapterSegments: segments,
			fullSourceMaterial: "Story: Thirty Chapter Story\n\n## Chapter 1\nSource.",
			generateChunk: async (messages) => {
				generationCalls += 1;
				const system = messages[0]!.content;
				if (system.includes("Write ONLY the novel title block")) {
					return "# Thirty Chapter Story";
				}
				const label = chapterLabelFromSystem(system);
				if (!label) {
					throw new Error("Missing chapter label in test prompt.");
				}
				return `## ${label}: Generated\n\nNovel prose for ${label}.`;
			},
		});

		const headings = [...document.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]);
		expect(headings).toHaveLength(30);
		expect(headings[0]).toBe("Chapter 1: Generated");
		expect(headings[29]).toBe("Chapter 30: Generated");
		expect(generationCalls).toBe(31);
	});

	it("splits an oversized logical chapter into multiple model requests without dropping its tail", async () => {
		const line = "Narrator: A complete source beat that should survive chunking.";
		const transcript = Array.from({ length: 700 }, (_value, index) => `${line} marker-${index}.`).join("\n");
		expect(transcript.length).toBeGreaterThan(NOVELISATION_SOURCE_PART_MAX_CHARS * 2);

		const parts = splitNovelisationChapterSource(transcript);
		expect(parts.length).toBeGreaterThan(2);
		expect(parts.join("\n")).toContain("marker-699.");

		let chapterPartCalls = 0;
		const document = await generateChapterStructuredDocument({
			preset: getAiDocumentPreset("novelisation"),
			sourceLabel: "Long Chapter Story",
			chapterSegments: [{ label: "Chapter I", transcript }],
			fullSourceMaterial: "Story: Long Chapter Story\n\n## Chapter I\nSource.",
			generateChunk: async (messages) => {
				const system = messages[0]!.content;
				if (system.includes("Write ONLY the novel title block")) {
					return "# Long Chapter Story";
				}
				chapterPartCalls += 1;
				if (system.includes("Do NOT output a chapter heading")) {
					return `Continuation prose for source part ${chapterPartCalls}.`;
				}
				return "## Chapter I: Long Day\n\nOpening prose for the long chapter.";
			},
		});

		expect(chapterPartCalls).toBe(parts.length);
		expect(document.match(/^##\s+/gm)).toHaveLength(1);
		expect(document).toContain("Continuation prose for source part");
	});

	it("can preserve full uploaded chapter text instead of silently truncating at 32k", () => {
		const body = `${"A".repeat(40000)}END-MARKER`;
		const source = `# Book\n\n## Chapter I\n\n${body}\n\n## Chapter II\n\nShort.`;

		const normal = segmentUploadedSourceByChapter(source);
		const complete = segmentUploadedSourceByChapter(source, { maxChapterChars: null });

		expect(normal[0]!.transcript).toContain("[Source truncated for model context limits.]");
		expect(normal[0]!.transcript).not.toContain("END-MARKER");
		expect(complete[0]!.transcript).toContain("END-MARKER");
		expect(complete[0]!.transcript.length).toBeGreaterThan(40000);
	});

	it("retries a refused chapter once from its canonical high-level summary", async () => {
		let transcriptAttempts = 0;
		let summaryAttempts = 0;

		const document = await generateChapterStructuredDocument({
			preset: getAiDocumentPreset("novelisation"),
			sourceLabel: "Fallback Story",
			chapterSegments: [{
				label: "Chapter IX",
				transcript: "Narrator: Full transcript that the provider refuses.",
				summary: "The family talks quietly, resolves the misunderstanding, and drives home together.",
			}],
			fullSourceMaterial: "Story: Fallback Story\n\n## Chapter IX\nSource.",
			generateChunk: async (messages) => {
				const system = messages[0]!.content;
				if (system.includes("Write ONLY the novel title block")) {
					return "# Fallback Story";
				}

				const isSummaryFallback = messages.some((message) =>
					message.content.includes("Canonical high-level summary for Chapter IX"),
				);
				if (isSummaryFallback) {
					summaryAttempts += 1;
					return "## Chapter IX: Homeward\n\nThey settle the misunderstanding and head home together.";
				}

				transcriptAttempts += 1;
				throw new GenerationFailureError({
					kind: "provider_refusal",
					stage: "response",
					summaryMessage: "The provider declined this request under its own safeguards.",
					providerName: "gemini",
					model: "gemini-test",
					attempts: 1,
					maxAttempts: 1,
					retryable: false,
					diagnostic: "status=200; provider=Gemini; stage=response; finishReason=PROHIBITED_CONTENT",
				});
			},
		});

		expect(transcriptAttempts).toBe(1);
		expect(summaryAttempts).toBe(1);
		expect(document).toContain("## Chapter IX: Homeward");
		expect(document).toContain("head home together");
	});

	it("refuses to return a novelisation when a generated chapter heading is wrong", async () => {
		await expect(
			generateChapterStructuredDocument({
				preset: getAiDocumentPreset("novelisation"),
				sourceLabel: "Broken Story",
				chapterSegments: [{ label: "Chapter I", transcript: "Narrator: Source." }],
				fullSourceMaterial: "Story: Broken Story\n\n## Chapter I\nSource.",
				generateChunk: async (messages) =>
					messages[0]!.content.includes("Write ONLY the novel title block")
						? "# Broken Story"
						: "## Chapter II: Wrong\n\nWrong chapter prose.",
			}),
		).rejects.toThrow(/expected Chapter I/i);
	});
});
