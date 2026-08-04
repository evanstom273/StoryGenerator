import type { StoryExportBundle } from "../types/models";
import { buildStoryArchiveContent } from "./storyArchiveContent";
import {
	createPdfDoc,
	pdfDimensions,
	heading,
	subheading,
	body,
	metaLine,
	speakerLine,
	rule,
	checkPage,
	PDF_MARGIN,
	PDF_FONT,
} from "./pdfLayout";

export function serializeStoryArchivePdf(
	bundle: StoryExportBundle,
): { content: Uint8Array; mimeType: string } {
	const doc = createPdfDoc();
	const { pageW, pageH } = pdfDimensions(doc);
	let y = PDF_MARGIN;
	const content = buildStoryArchiveContent(bundle);

	y = heading(doc, y, content.title, 18, pageH);
	y = rule(doc, y, pageW);

	y = metaLine(doc, y, "Universe", content.metadata.universe, pageH);
	y = metaLine(doc, y, "Protagonist", content.metadata.protagonist, pageH);
	y = metaLine(doc, y, "Exported", content.metadata.exportedAt, pageH);
	if (content.metadata.indexedAt) {
		y = metaLine(doc, y, "Indexed", content.metadata.indexedAt, pageH);
	}
	if (typeof content.metadata.indexedMessages === "number") {
		y = metaLine(doc, y, "Indexed messages", String(content.metadata.indexedMessages), pageH);
	}
	y = metaLine(doc, y, "Transcript messages", String(content.metadata.transcriptMessages), pageH);
	y += 6;

	const { premise, protagonistFocus, currentSituation, recentDevelopments, fallbackSummary } =
		content.summary;
	if (premise || protagonistFocus || currentSituation || recentDevelopments.length) {
		y = rule(doc, y, pageW);
		y = heading(doc, y, "Story Summary", 14, pageH);
		if (premise) {
			y = subheading(doc, y, "Premise", pageH);
			y = body(doc, y, premise, 0, undefined, pageH);
		}
		if (protagonistFocus) {
			y = subheading(doc, y, "Protagonist", pageH);
			y = body(doc, y, protagonistFocus, 0, undefined, pageH);
		}
		if (currentSituation) {
			y = subheading(doc, y, "Current Situation", pageH);
			y = body(doc, y, currentSituation, 0, undefined, pageH);
		}
		if (recentDevelopments.length) {
			y = subheading(doc, y, "Recent Developments", pageH);
			for (const dev of recentDevelopments) {
				y = body(doc, y, dev, 0, undefined, pageH);
			}
		}
	} else if (fallbackSummary) {
		y = rule(doc, y, pageW);
		y = heading(doc, y, "Summary", 14, pageH);
		y = body(doc, y, fallbackSummary, 0, undefined, pageH);
	}

	y = rule(doc, y, pageW);
	y = heading(doc, y, "Transcript", 14, pageH);
	y = rule(doc, y, pageW);

	let lastMessageNumber = 0;
	for (const line of content.transcript) {
		if (line.messageNumber !== lastMessageNumber) {
			if (lastMessageNumber > 0) {
				const chapterLabel = content.chapterMarkers.get(lastMessageNumber);
				if (chapterLabel) {
					y = checkPage(doc, y, pageH, 14);
					doc.setFont(PDF_FONT, "bold");
					doc.setFontSize(9);
					doc.setTextColor(140, 140, 140);
					doc.text(`— Chapter end: ${chapterLabel} —`, PDF_MARGIN, y);
					doc.setTextColor(0, 0, 0);
					y += 14;
				}
			}
			lastMessageNumber = line.messageNumber;
			y = checkPage(doc, y, pageH, 14);
			doc.setFont(PDF_FONT, "bold");
			doc.setFontSize(9);
			doc.setTextColor(140, 140, 140);
			doc.text(`[${line.messageNumber}]`, PDF_MARGIN, y);
			doc.setTextColor(0, 0, 0);
			y += 12;
		}
		y = speakerLine(doc, y, line.speaker, line.text ?? "", pageH);
	}

	if (lastMessageNumber > 0) {
		const chapterLabel = content.chapterMarkers.get(lastMessageNumber);
		if (chapterLabel) {
			y = checkPage(doc, y, pageH, 14);
			doc.setFont(PDF_FONT, "bold");
			doc.setFontSize(9);
			doc.setTextColor(140, 140, 140);
			doc.text(`— Chapter end: ${chapterLabel} —`, PDF_MARGIN, y);
			doc.setTextColor(0, 0, 0);
			y += 14;
		}
		y = rule(doc, y, pageW);
	}

	if (content.characters.length) {
		y = rule(doc, y, pageW);
		y = heading(doc, y, "Characters", 14, pageH);
		for (const entry of content.characters) {
			y = subheading(doc, y, entry.name, pageH);
			if (entry.aliases.length) {
				y = metaLine(doc, y, "Aliases", entry.aliases.join(", "), pageH);
			}
			if (entry.firstSeenMessage) {
				y = metaLine(doc, y, "First seen", `Message ${entry.firstSeenMessage}`, pageH);
			}
			if (entry.lastSeenMessage) {
				y = metaLine(doc, y, "Last seen", `Message ${entry.lastSeenMessage}`, pageH);
			}
			if (entry.description) {
				y = body(doc, y, entry.description, 0, undefined, pageH);
			}
			if (entry.statusLines.length) {
				y = metaLine(doc, y, "Status", entry.statusLines.join(" | "), pageH);
			}
			if (entry.evidence) {
				y = metaLine(doc, y, "Evidence", entry.evidence, pageH);
			}
			y += 4;
			y = rule(doc, y, pageW);
		}
	}

	if (content.relationships.length) {
		y = rule(doc, y, pageW);
		y = heading(doc, y, "Relationships", 14, pageH);
		for (const entry of content.relationships) {
			y = subheading(doc, y, `${entry.a} <-> ${entry.b}`, pageH);
			if (entry.tier && entry.tier !== "stranger") {
				y = metaLine(doc, y, "Tier", entry.tier.charAt(0).toUpperCase() + entry.tier.slice(1), pageH);
			}
			if (entry.summary) {
				y = body(doc, y, entry.summary, 0, undefined, pageH);
			}
			for (let hi = 0; hi < entry.history.length; hi += 1) {
				y = body(doc, y, `#${hi + 1}  ${entry.history[hi]}`, 0, undefined, pageH);
			}
			if (entry.evidence) {
				y = metaLine(doc, y, "Evidence", entry.evidence, pageH);
			}
			y += 4;
			y = rule(doc, y, pageW);
		}
	}

	if (content.worldFacts.length) {
		y = rule(doc, y, pageW);
		y = heading(doc, y, "World Facts", 14, pageH);
		for (let i = 0; i < content.worldFacts.length; i += 1) {
			const row = content.worldFacts[i]!;
			const line = row.evidence ? `${row.text}  (${row.evidence})` : row.text;
			y = body(doc, y, `${i + 1}. ${line}`, 0, undefined, pageH);
		}
	}

	if (content.openThreads.length) {
		y = rule(doc, y, pageW);
		y = heading(doc, y, "Active Threads", 14, pageH);
		for (let i = 0; i < content.openThreads.length; i += 1) {
			const row = content.openThreads[i]!;
			const line = row.evidence ? `${row.text}  (${row.evidence})` : row.text;
			y = body(doc, y, `${i + 1}. ${line}`, 0, undefined, pageH);
		}
	}

	if (content.significantMemories.length) {
		y = rule(doc, y, pageW);
		y = heading(doc, y, "Significant Memories", 14, pageH);
		for (let i = 0; i < content.significantMemories.length; i += 1) {
			const row = content.significantMemories[i]!;
			const line = row.evidence ? `${row.text}  (${row.evidence})` : row.text;
			y = body(doc, y, `${i + 1}. ${line}`, 0, undefined, pageH);
		}
	}

	if (content.locations.length) {
		y = rule(doc, y, pageW);
		y = heading(doc, y, "Locations", 14, pageH);
		for (const entry of content.locations) {
			y = subheading(doc, y, entry.name, pageH);
			if (entry.description) {
				y = body(doc, y, entry.description, 0, undefined, pageH);
			}
			if (entry.evidence) {
				y = metaLine(doc, y, "Evidence", entry.evidence, pageH);
			}
			y += 4;
			y = rule(doc, y, pageW);
		}
	}

	if (content.chapters.length) {
		y = rule(doc, y, pageW);
		y = heading(doc, y, "Chapters", 14, pageH);
		for (const chapter of content.chapters) {
			y = subheading(doc, y, chapter.label, pageH);
			if (chapter.summary) {
				y = body(doc, y, chapter.summary, 0, undefined, pageH);
			}
			y += 4;
			y = rule(doc, y, pageW);
		}
	}

	const buffer = doc.output("arraybuffer") as ArrayBuffer;
	return { content: new Uint8Array(buffer), mimeType: "application/pdf" };
}
