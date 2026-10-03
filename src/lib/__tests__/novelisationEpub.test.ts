import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
	EPUB_MIME_TYPE,
	parseNovelisationMarkdown,
	serializeNovelisationEpub,
} from "../aiDocumentGenerator/epub";

const NOVEL = `# Tactical Juice Boxes

## Chapter I

Opening paragraph.

"Hello," Lauren said.

## Chapter II: The Wardrobe

Second chapter prose.
`;

describe("novelisation EPUB", () => {
	it("parses the title and chapter boundaries from generated novelisation Markdown", () => {
		const parsed = parseNovelisationMarkdown(NOVEL);

		expect(parsed.title).toBe("Tactical Juice Boxes");
		expect(parsed.chapters.map((chapter) => chapter.title)).toEqual([
			"Chapter I",
			"Chapter II: The Wardrobe",
		]);
		expect(parsed.chapters.map((chapter) => chapter.filename)).toEqual([
			"chapter-001.xhtml",
			"chapter-002.xhtml",
		]);
	});

	it("builds an EPUB with structural chapter markers, navigation and one XHTML file per chapter", () => {
		const bytes = serializeNovelisationEpub(NOVEL);
		const files = unzipSync(bytes);

		expect(strFromU8(files.mimetype)).toBe(EPUB_MIME_TYPE);
		expect(files["META-INF/container.xml"]).toBeDefined();
		expect(files["OEBPS/content.opf"]).toBeDefined();
		expect(files["OEBPS/nav.xhtml"]).toBeDefined();
		expect(files["OEBPS/toc.ncx"]).toBeDefined();
		expect(files["OEBPS/chapter-001.xhtml"]).toBeDefined();
		expect(files["OEBPS/chapter-002.xhtml"]).toBeDefined();

		const nav = strFromU8(files["OEBPS/nav.xhtml"]);
		expect(nav).toContain('href="chapter-001.xhtml">Chapter I</a>');
		expect(nav).toContain('href="chapter-002.xhtml">Chapter II: The Wardrobe</a>');

		const chapterOne = strFromU8(files["OEBPS/chapter-001.xhtml"]);
		expect(chapterOne).toContain("<h1>Chapter I</h1>");
		expect(chapterOne).toContain("<p>Opening paragraph.</p>");

		const chapterTwo = strFromU8(files["OEBPS/chapter-002.xhtml"]);
		expect(chapterTwo).toContain("<h1>Chapter II: The Wardrobe</h1>");

		const packageDocument = strFromU8(files["OEBPS/content.opf"]);
		expect(packageDocument).toContain('properties="nav"');
		expect(packageDocument).toContain('idref="chapter-1"');
		expect(packageDocument).toContain('idref="chapter-2"');
	});

	it("stores the EPUB mimetype as the first uncompressed ZIP entry", () => {
		const bytes = serializeNovelisationEpub(NOVEL);
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

		expect(view.getUint32(0, true)).toBe(0x04034b50);
		expect(view.getUint16(8, true)).toBe(0);

		const nameLength = view.getUint16(26, true);
		const extraLength = view.getUint16(28, true);
		const filenameStart = 30;
		const filename = strFromU8(
			bytes.subarray(filenameStart, filenameStart + nameLength),
		);
		expect(filename).toBe("mimetype");
		expect(extraLength).toBe(0);
	});

	it("falls back to a single chapter when a document has no explicit chapter headings", () => {
		const parsed = parseNovelisationMarkdown("# Short Story\n\nJust one scene.");
		expect(parsed.chapters).toHaveLength(1);
		expect(parsed.chapters[0].title).toBe("Chapter I");
		expect(parsed.chapters[0].markdown).toBe("Just one scene.");
	});
});
