import {
	createPdfDoc,
	body,
	heading,
	pdfDimensions,
	rule,
	subheading,
	PDF_MARGIN,
} from "../pdfLayout";
import type { TutorialBlock, TutorialDocument, TutorialSection } from "./tutorialContent";

function blockToPlainLines(block: TutorialBlock): string[] {
	switch (block.type) {
		case "paragraph":
			return [block.text];
		case "subheading":
			return [block.text];
		case "steps":
			return block.items.map((item, index) => `${index + 1}. ${item}`);
		case "bullets":
			return block.items.map((item) => `- ${item}`);
		case "taskbar":
			return block.items.map((item) => `${item.label} — ${item.description}`);
		case "links":
			return block.items.map((item) => `${item.label} (${item.to})`);
		default:
			return [];
	}
}

function sectionToPlainLines(section: TutorialSection): string[] {
	const lines = [section.title, ""];
	for (const block of section.blocks) {
		if (block.type === "subheading") {
			lines.push(block.text);
		}
		lines.push(...blockToPlainLines(block));
		lines.push("");
	}
	return lines;
}

export function buildTutorialMarkdown(document: TutorialDocument): string {
	const lines: string[] = [
		`# ${document.title}`,
		"",
		`*${document.appName} v${document.version}*`,
		"",
		...document.intro,
		"",
	];

	for (const section of document.sections) {
		lines.push(`## ${section.title}`, "");
		for (const block of section.blocks) {
			switch (block.type) {
				case "paragraph":
					lines.push(block.text, "");
					break;
				case "subheading":
					lines.push(`### ${block.text}`, "");
					break;
				case "steps":
					block.items.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
					lines.push("");
					break;
				case "bullets":
					block.items.forEach((item) => lines.push(`- ${item}`));
					lines.push("");
					break;
				case "taskbar":
					block.items.forEach((item) => {
						lines.push(`- **${item.label}** — ${item.description}`);
					});
					lines.push("");
					break;
				case "links":
					lines.push(
						block.items
							.map((item) => `[${item.label}](${item.to})`)
							.join(" · "),
					);
					lines.push("");
					break;
			}
		}
	}

	return lines.join("\n").trimEnd() + "\n";
}

export function buildTutorialPlainText(document: TutorialDocument): string {
	const lines: string[] = [
		document.title,
		`${document.appName} v${document.version}`,
		"",
		...document.intro,
		"",
	];

	for (const section of document.sections) {
		lines.push(section.title, "─".repeat(Math.min(section.title.length, 48)), "");
		lines.push(...sectionToPlainLines(section));
		lines.push("");
	}

	return lines.join("\n").trimEnd() + "\n";
}

export function buildTutorialPdfBytes(document: TutorialDocument): Uint8Array {
	const doc = createPdfDoc();
	const { pageW, pageH } = pdfDimensions(doc);
	let y = PDF_MARGIN;

	y = heading(doc, y, document.title, 18, pageH);
	y = body(doc, y, `${document.appName} v${document.version}`, 0, undefined, pageH);
	y += 6;

	for (const paragraph of document.intro) {
		y = body(doc, y, paragraph, 0, undefined, pageH);
	}

	for (const section of document.sections) {
		y = rule(doc, y, pageW);
		y = subheading(doc, y, section.title, pageH);

		for (const block of section.blocks) {
			if (block.type === "subheading") {
				y = body(doc, y, block.text, 0, undefined, pageH);
				continue;
			}

			const lines = blockToPlainLines(block);
			for (const line of lines) {
				const indent = block.type === "steps" || block.type === "bullets" ? 12 : 0;
				y = body(doc, y, line, indent, undefined, pageH);
			}
			y += 4;
		}
	}

	const buffer = doc.output("arraybuffer") as ArrayBuffer;
	return new Uint8Array(buffer);
}

export function buildTutorialPdfArrayBuffer(document: TutorialDocument): ArrayBuffer {
	const bytes = buildTutorialPdfBytes(document);
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function buildTutorialFilename(format: "md" | "txt" | "pdf", version: string): string {
	const stem = `story-engine-tutorial-v${version}`;
	if (format === "pdf") {
		return `${stem}.pdf`;
	}
	if (format === "txt") {
		return `${stem}.txt`;
	}
	return `${stem}.md`;
}
