import type { StoryExportBundle } from "../types/models";
import { buildStoryArchiveContent, type StoryArchiveContent } from "./storyArchiveContent";

function escapeMarkdownInline(value: string): string {
	return value.replace(/\r\n/g, "\n").trim();
}

function formatEvidenceSuffix(evidence: string): string {
	return evidence ? ` ${evidence}` : "";
}

function markdownHeadingId(title: string): string {
	return title
		.trim()
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

type ArchiveMarkdownSection = {
	id: string;
	title: string;
	body: string;
};

function sectionBlock(id: string, title: string, body: string): ArchiveMarkdownSection | null {
	if (!body.trim()) {
		return null;
	}

	return {
		id,
		title,
		body: `<a id="${id}"></a>\n\n## ${title}\n\n${body.trim()}\n`,
	};
}

function bulletList(items: string[]): string {
	if (!items.length) {
		return "";
	}
	return items.map((item) => `- ${item}`).join("\n");
}

function numberedList(rows: Array<{ text: string; evidence: string }>): string {
	if (!rows.length) {
		return "";
	}
	return rows
		.map((row, index) => `${index + 1}. ${row.text}${formatEvidenceSuffix(row.evidence)}`)
		.join("\n");
}

function buildTableOfContents(sections: ArchiveMarkdownSection[]): string {
	const links = sections.map((section) => `- [${section.title}](#${section.id})`);
	return `<a id="contents"></a>\n\n## Contents\n\n${links.join("\n")}`;
}

function hasSummaryContent(content: StoryArchiveContent): boolean {
	const { premise, protagonistFocus, currentSituation, recentDevelopments, fallbackSummary } =
		content.summary;
	return Boolean(
		premise ||
			protagonistFocus ||
			currentSituation ||
			recentDevelopments.length ||
			fallbackSummary,
	);
}

function buildMetadataBody(content: StoryArchiveContent): string {
	const lines = [
		`| Field | Value |`,
		`| --- | --- |`,
		`| Universe | ${content.metadata.universe} |`,
		`| Protagonist | ${content.metadata.protagonist} |`,
		`| Exported | ${content.metadata.exportedAt} |`,
	];
	if (content.metadata.indexedAt) {
		lines.push(`| Indexed | ${content.metadata.indexedAt} |`);
	}
	if (typeof content.metadata.indexedMessages === "number") {
		lines.push(`| Indexed messages | ${content.metadata.indexedMessages} |`);
	}
	lines.push(`| Transcript messages | ${content.metadata.transcriptMessages} |`);
	return lines.join("\n");
}

function buildSummaryBody(content: StoryArchiveContent): string {
	const blocks: string[] = [];
	const { premise, protagonistFocus, currentSituation, recentDevelopments, fallbackSummary } =
		content.summary;

	if (premise) {
		blocks.push(`### Premise\n\n${escapeMarkdownInline(premise)}`);
	}
	if (protagonistFocus) {
		blocks.push(`### Protagonist\n\n${escapeMarkdownInline(protagonistFocus)}`);
	}
	if (currentSituation) {
		blocks.push(`### Current Situation\n\n${escapeMarkdownInline(currentSituation)}`);
	}
	if (recentDevelopments.length) {
		blocks.push(`### Recent Developments\n\n${bulletList(recentDevelopments)}`);
	}
	if (!blocks.length && fallbackSummary) {
		blocks.push(escapeMarkdownInline(fallbackSummary));
	}
	return blocks.join("\n\n");
}

function buildTranscriptBody(content: StoryArchiveContent): string {
	if (!content.transcript.length) {
		return "_No conversation history yet._";
	}

	const lines: string[] = [];
	let lastMessageNumber = 0;

	const appendChapterEnd = (messageNumber: number) => {
		const chapterLabel = content.chapterMarkers.get(messageNumber);
		if (chapterLabel) {
			lines.push(`\n---\n\n**Chapter end:** ${chapterLabel}\n`);
		}
	};

	for (const line of content.transcript) {
		if (line.messageNumber !== lastMessageNumber) {
			if (lastMessageNumber > 0) {
				appendChapterEnd(lastMessageNumber);
			}
			lastMessageNumber = line.messageNumber;
			lines.push(`### [${line.messageNumber}]`);
		}
		const speaker = line.speaker.trim();
		const text = escapeMarkdownInline(line.text);
		if (speaker === "Narrator") {
			lines.push(`*${text.replace(/^\*+|\*+$/g, "")}*`);
		} else {
			lines.push(`**${speaker}:** ${text}`);
		}
	}

	if (lastMessageNumber > 0) {
		appendChapterEnd(lastMessageNumber);
	}

	return lines.join("\n\n");
}

function buildCharactersBody(content: StoryArchiveContent): string {
	if (!content.characters.length) {
		return "";
	}

	return content.characters
		.map((entry) => {
			const meta: string[] = [];
			if (entry.aliases.length) {
				meta.push(`**Aliases:** ${entry.aliases.join(", ")}`);
			}
			if (entry.firstSeenMessage) {
				meta.push(`**First seen:** Message ${entry.firstSeenMessage}`);
			}
			if (entry.lastSeenMessage) {
				meta.push(`**Last seen:** Message ${entry.lastSeenMessage}`);
			}
			if (entry.evidence) {
				meta.push(`**Evidence:** ${entry.evidence}`);
			}

			const parts = [`### ${entry.name}`];
			if (entry.description) {
				parts.push(escapeMarkdownInline(entry.description));
			}
			if (entry.statusLines.length) {
				parts.push(`**Status**\n\n${bulletList(entry.statusLines)}`);
			}
			if (meta.length) {
				parts.push(meta.join("\n"));
			}
			return parts.join("\n\n");
		})
		.join("\n\n---\n\n");
}

function buildRelationshipsBody(content: StoryArchiveContent): string {
	if (!content.relationships.length) {
		return "";
	}

	return content.relationships
		.map((entry) => {
			const parts = [`### ${entry.a} ↔ ${entry.b}`];
			if (entry.tier && entry.tier !== "stranger") {
				parts.push(`**Tier:** ${entry.tier.charAt(0).toUpperCase()}${entry.tier.slice(1)}`);
			}
			if (entry.summary) {
				parts.push(escapeMarkdownInline(entry.summary));
			}
			if (entry.history.length) {
				parts.push(entry.history.map((beat, index) => `${index + 1}. ${beat}`).join("\n"));
			}
			if (entry.evidence) {
				parts.push(`**Evidence:** ${entry.evidence}`);
			}
			return parts.join("\n\n");
		})
		.join("\n\n---\n\n");
}

function buildLocationsBody(content: StoryArchiveContent): string {
	if (!content.locations.length) {
		return "";
	}

	return content.locations
		.map((entry) => {
			const parts = [`### ${entry.name}`];
			if (entry.description) {
				parts.push(escapeMarkdownInline(entry.description));
			}
			if (entry.evidence) {
				parts.push(`**Evidence:** ${entry.evidence}`);
			}
			return parts.join("\n\n");
		})
		.join("\n\n");
}

function buildChaptersBody(content: StoryArchiveContent): string {
	if (!content.chapters.length) {
		return "";
	}

	return content.chapters
		.map((chapter) => {
			const parts = [`### ${chapter.label}`];
			if (chapter.endsAtIndex) {
				parts.push(`**Ends at message:** ${chapter.endsAtIndex}`);
			}
			if (chapter.summary) {
				parts.push(chapter.summary);
			}
			return parts.join("\n\n");
		})
		.join("\n\n---\n\n");
}

function buildArchiveMarkdownSections(content: StoryArchiveContent): ArchiveMarkdownSection[] {
	const sections: ArchiveMarkdownSection[] = [];

	const push = (title: string, body: string) => {
		const block = sectionBlock(markdownHeadingId(title), title, body);
		if (block) {
			sections.push(block);
		}
	};

	push("Metadata", buildMetadataBody(content));
	if (hasSummaryContent(content)) {
		push("Story Summary", buildSummaryBody(content));
	}
	push("Transcript", buildTranscriptBody(content));
	push("Characters", buildCharactersBody(content));
	push("Relationships", buildRelationshipsBody(content));
	push("World Facts", numberedList(content.worldFacts));
	push("Active Threads", numberedList(content.openThreads));
	push("Significant Memories", numberedList(content.significantMemories));
	push("Locations", buildLocationsBody(content));
	push("Chapters", buildChaptersBody(content));

	return sections;
}

export function serializeStoryArchiveMarkdown(bundle: StoryExportBundle): string {
	const content = buildStoryArchiveContent(bundle);
	const sections = buildArchiveMarkdownSections(content);

	const blocks = [
		`# ${content.title}`,
		buildTableOfContents(sections),
		...sections.map((section) => section.body),
	];

	return `${blocks.join("\n\n")}\n`;
}
