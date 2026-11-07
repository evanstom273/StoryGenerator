import { jsPDF } from "jspdf";
import { downloadFile } from "../../lib/download";
import { APP_NAME, APP_VERSION } from "./version";
import designDocumentMarkdown from "../../docs/STORY_ENGINE_DESIGN_DOCUMENT.md?raw";

export type DesignDocumentExportFormat = "markdown" | "txt" | "pdf";

export const DESIGN_DOCUMENT_TITLE = `${APP_NAME} — Technical Architecture & Design Document`;
export const DESIGN_DOCUMENT_FILENAME_STEM = "story-engine-design-document";

function stripMarkdownForPlainText(markdown: string) {
	return markdown
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/\*([^*]+)\*/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/^```[\s\S]*?```/gm, "")
		.replace(/^>\s?/gm, "")
		.replace(/\|/g, " ")
		.replace(/---+/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function getDesignDocumentMarkdown() {
	return designDocumentMarkdown.trim();
}

export function getDesignDocumentPlainText() {
	return stripMarkdownForPlainText(getDesignDocumentMarkdown());
}

export function serializeDesignDocumentPdf(): ArrayBuffer {
	const doc = new jsPDF({ unit: "pt", format: "letter" });
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const margin = 48;
	const maxWidth = pageWidth - margin * 2;
	let y = margin;

	const writeHeading = (text: string, size: number) => {
		doc.setFont("helvetica", "bold");
		doc.setFontSize(size);
		const lines = doc.splitTextToSize(text, maxWidth) as string[];
		for (const line of lines) {
			if (y > pageHeight - margin) {
				doc.addPage();
				y = margin;
			}
			doc.text(line, margin, y);
			y += size * 1.35;
		}
		y += 4;
	};

	const writeParagraph = (text: string, size = 10) => {
		doc.setFont("helvetica", "normal");
		doc.setFontSize(size);
		const lines = doc.splitTextToSize(text, maxWidth) as string[];
		for (const line of lines) {
			if (y > pageHeight - margin) {
				doc.addPage();
				y = margin;
			}
			doc.text(line, margin, y);
			y += size * 1.45;
		}
		y += 6;
	};

	writeHeading(DESIGN_DOCUMENT_TITLE, 18);
	writeParagraph(`Application version ${APP_VERSION}. Exported ${new Date().toLocaleString()}.`, 10);
	writeParagraph(
		"This PDF is a plain-text rendering of the canonical design document. For tables, diagrams, and full formatting, use the Markdown download.",
		9,
	);

	for (const rawLine of getDesignDocumentPlainText().split("\n")) {
		const line = rawLine.trim();
		if (!line) {
			y += 4;
			continue;
		}

		if (/^\d+\.\s/.test(line) && line.length < 120) {
			writeHeading(line, 12);
			continue;
		}

		if (line.endsWith(":") && line.length < 80 && !line.includes(".")) {
			writeHeading(line, 11);
			continue;
		}

		writeParagraph(line, 9);
	}

	return doc.output("arraybuffer");
}

export async function exportDesignDocument({
	format,
	filenameStem = DESIGN_DOCUMENT_FILENAME_STEM,
}: {
	format: DesignDocumentExportFormat;
	filenameStem?: string;
}) {
	if (format === "markdown") {
		await downloadFile(
			`${filenameStem}.md`,
			getDesignDocumentMarkdown(),
			"text/markdown;charset=utf-8",
		);
		return;
	}

	if (format === "txt") {
		await downloadFile(`${filenameStem}.txt`, getDesignDocumentPlainText(), "text/plain;charset=utf-8");
		return;
	}

	const pdfBytes = serializeDesignDocumentPdf();
	await downloadFile(`${filenameStem}.pdf`, pdfBytes, "application/pdf");
}
