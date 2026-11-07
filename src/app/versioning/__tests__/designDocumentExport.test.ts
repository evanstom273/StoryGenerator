import { describe, expect, it } from "vitest";
import {
	DESIGN_DOCUMENT_FILENAME_STEM,
	DESIGN_DOCUMENT_TITLE,
	getDesignDocumentMarkdown,
	getDesignDocumentPlainText,
	serializeDesignDocumentPdf,
} from "../designDocumentExport";

describe("designDocumentExport", () => {
	it("bundles the canonical design document markdown", () => {
		const markdown = getDesignDocumentMarkdown();
		expect(markdown).toContain("# Story Engine — Technical Architecture & Design Document (TAD)");
		expect(markdown).toContain("## 11. Story generation pipeline");
		expect(markdown).toContain("IndexedDB");
	});

	it("produces plain text without markdown markers", () => {
		const plain = getDesignDocumentPlainText();
		expect(plain).toContain("Story Engine");
		expect(plain).not.toContain("```mermaid");
	});

	it("serializes a PDF export", () => {
		const pdf = serializeDesignDocumentPdf();
		expect(pdf.byteLength).toBeGreaterThan(1000);
	});

	it("uses stable export metadata", () => {
		expect(DESIGN_DOCUMENT_TITLE).toContain("Story Engine");
		expect(DESIGN_DOCUMENT_FILENAME_STEM).toBe("story-engine-design-document");
	});
});
