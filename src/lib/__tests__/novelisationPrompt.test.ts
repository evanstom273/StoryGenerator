import { describe, expect, it } from "vitest";
import {
	assembleNovelisationDocument,
	dedupeNovelisationChapterSections,
	extractNovelisationTitleSourceMaterial,
	parseNovelisationChapterLabel,
	stripNovelisationTitleOverflow,
} from "../aiDocumentGenerator/novelisationPrompt";

describe("novelisationPrompt", () => {
	it("parses author-supplied chapter titles", () => {
		expect(parseNovelisationChapterLabel("Chapter II: Principal's Office")).toEqual({
			rawLabel: "Chapter II: Principal's Office",
			baseLabel: "Chapter II",
			authorTitle: "Principal's Office",
		});
	});

	it("treats bare chapter labels as untitled", () => {
		expect(parseNovelisationChapterLabel("Chapter II")).toEqual({
			rawLabel: "Chapter II",
			baseLabel: "Chapter II",
			authorTitle: null,
		});
	});

	it("extracts metadata-only source for the title step", () => {
		const fullSource = [
			"Story: Jamie's Tales",
			"Universe: School Days",
			"Protagonist: Jamie",
			"Summary: A school adventure.",
			"",
			"## Chapter I",
			"",
			"[2026-01-01] Narrator: Hello world.",
			"",
			"## Chapter II",
			"",
			"[2026-01-02] Narrator: Another scene.",
		].join("\n");

		const titleSource = extractNovelisationTitleSourceMaterial(fullSource, [
			"Chapter I",
			"Chapter II",
		]);

		expect(titleSource).toContain("Story: Jamie's Tales");
		expect(titleSource).toContain("Chapters in order (2): Chapter I · Chapter II");
		expect(titleSource).toContain("Do not novelise transcript content");
		expect(titleSource).not.toContain("Hello world");
	});

	it("strips chapter prose accidentally generated during the title step", () => {
		const intro = [
			"# Jamie's Tales",
			"",
			"## Chapter I",
			"",
			"Some prose that should not be here.",
		].join("\n");

		expect(stripNovelisationTitleOverflow(intro)).toBe("# Jamie's Tales");
	});

	it("dedupes repeated chapter sections by heading", () => {
		const sections = [
			"## Chapter I\n\nFirst version.",
			"## Chapter II\n\nMiddle chapter.",
			"## Chapter I\n\nDuplicate chapter.",
		];

		expect(dedupeNovelisationChapterSections(sections)).toEqual([
			"## Chapter I\n\nFirst version.",
			"## Chapter II\n\nMiddle chapter.",
		]);
	});

	it("assembles the final novel document once per chapter", () => {
		const output = assembleNovelisationDocument(
			"# Jamie's Tales\n\n## Chapter I\n\nOverflow.",
			["## Chapter I\n\nOpening scene.", "## Chapter II\n\nNext scene."],
		);

		expect(output).toBe(
			["# Jamie's Tales", "## Chapter I\n\nOpening scene.", "## Chapter II\n\nNext scene."].join(
				"\n\n",
			),
		);
		expect(output.match(/^## Chapter I$/gm)?.length).toBe(1);
	});
});
