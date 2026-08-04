import type { StoryExportBundle } from "../types/models";
import { buildStoryArchiveContent } from "./storyArchiveContent";

function escapeMarkdownInline(value: string): string {
	return value.replace(/\r\n/g, "\n").trim();
}

function formatEvidenceSuffix(evidence: string): string {
	return evidence ? ` ${evidence}` : "";
}

function section(title: string, body: string): string {
	if (!body.trim()) {
		return "";
	}
	return `## ${title}\n\n${body.trim()}\n`;
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

function buildTableOfContents(content: ReturnType<typeof buildStoryArchiveContent>): string {
	const links: string[] = [
		"- [Metadata](#metadata)",
		"- [Story Summary](#story-summary)",
		"- [Transcript](#transcript)",
	];
	if (content.characters.length) {
		links.push("- [Characters](#characters)");
	}
	if (content.relationships.length) {
		links.push("- [Relationships](#relationships)");
	}
	if (content.worldFacts.length) {
		links.push("- [World Facts](#world-facts)");
	}
	if (content.openThreads.length) {
		links.push("- [Active Threads](#active-threads)");
	}
	if (content.significantMemories.length) {
		links.push("- [Significant Memories](#significant-memories)");
	}
	if (content.locations.length) {
		links.push("- [Locations](#locations)");
	}
	if (content.chapters.length) {
		links.push("- [Chapters](#chapters)");
	}
	return `## Contents\n\n${links.join("\n")}`;
}

function buildMetadataSection(content: ReturnType<typeof buildStoryArchiveContent>): string {
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
	return section("Metadata", lines.join("\n"));
}

function buildSummarySection(content: ReturnType<typeof buildStoryArchiveContent>): string {
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
	return section("Story Summary", blocks.join("\n\n"));
}

function buildTranscriptSection(content: ReturnType<typeof buildStoryArchiveContent>): string {
	if (!content.transcript.length) {
		return section("Transcript", "_No conversation history yet._");
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

	return section("Transcript", lines.join("\n\n"));
}

function buildCharactersSection(content: ReturnType<typeof buildStoryArchiveContent>): string {
	if (!content.characters.length) {
		return "";
	}

	const blocks = content.characters.map((entry) => {
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
	});

	return section("Characters", blocks.join("\n\n---\n\n"));
}

function buildRelationshipsSection(content: ReturnType<typeof buildStoryArchiveContent>): string {
	if (!content.relationships.length) {
		return "";
	}

	const blocks = content.relationships.map((entry) => {
		const parts = [`### ${entry.a} ↔ ${entry.b}`];
		if (entry.tier && entry.tier !== "stranger") {
			parts.push(`**Tier:** ${entry.tier.charAt(0).toUpperCase()}${entry.tier.slice(1)}`);
		}
		if (entry.summary) {
			parts.push(escapeMarkdownInline(entry.summary));
		}
		if (entry.history.length) {
			parts.push(
				entry.history.map((beat, index) => `${index + 1}. ${beat}`).join("\n"),
			);
		}
		if (entry.evidence) {
			parts.push(`**Evidence:** ${entry.evidence}`);
		}
		return parts.join("\n\n");
	});

	return section("Relationships", blocks.join("\n\n---\n\n"));
}

function buildLocationsSection(content: ReturnType<typeof buildStoryArchiveContent>): string {
	if (!content.locations.length) {
		return "";
	}

	const blocks = content.locations.map((entry) => {
		const parts = [`### ${entry.name}`];
		if (entry.description) {
			parts.push(escapeMarkdownInline(entry.description));
		}
		if (entry.evidence) {
			parts.push(`**Evidence:** ${entry.evidence}`);
		}
		return parts.join("\n\n");
	});

	return section("Locations", blocks.join("\n\n"));
}

function buildChaptersSection(content: ReturnType<typeof buildStoryArchiveContent>): string {
	if (!content.chapters.length) {
		return "";
	}

	const blocks = content.chapters.map((chapter) => {
		const parts = [`### ${chapter.label}`];
		if (chapter.endsAtIndex) {
			parts.push(`**Ends at message:** ${chapter.endsAtIndex}`);
		}
		if (chapter.summary) {
			parts.push(chapter.summary);
		}
		return parts.join("\n\n");
	});

	return section("Chapters", blocks.join("\n\n---\n\n"));
}

export function serializeStoryArchiveMarkdown(bundle: StoryExportBundle): string {
	const content = buildStoryArchiveContent(bundle);

	const sections = [
		`# ${content.title}`,
		buildTableOfContents(content),
		buildMetadataSection(content),
		buildSummarySection(content),
		buildTranscriptSection(content),
		buildCharactersSection(content),
		buildRelationshipsSection(content),
		section("World Facts", numberedList(content.worldFacts)),
		section("Active Threads", numberedList(content.openThreads)),
		section("Significant Memories", numberedList(content.significantMemories)),
		buildLocationsSection(content),
		buildChaptersSection(content),
	].filter((block) => block.trim());

	return `${sections.join("\n\n")}\n`;
}
