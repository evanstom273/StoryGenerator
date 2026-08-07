import type { StoryChapter, StoryExportBundle, StoryMessage, StoryStateDataV2 } from "../types/models";
import { formatDateTime, sortByTimestampAsc } from "./dates";
import { getCharacterStatusLines, synthesizeCharacterStatusBullets } from "./characterStatus";
import { normalizeStoryStateToV2, safeParseStoryStateData } from "./storyStateV2";
import { isAuthorDirectiveMessage } from "./storyText/authorDirectives";
import { isContinueMessage } from "./storyText/continueMode";
import { sanitizeAssistantTranscript } from "./storyText/transcriptSanitizer";
import { cleanTextForExport } from "./storyText/exportCleaner";
import { isDirectorMessage } from "./storyText/directorMode";
import { parseSceneBlocks } from "./storyText/parseSceneBlocks";
import {
	applyNarrativeIdentityToText,
	buildNarrativeIdentityRegistry,
	resolveNarrativeDisplayName,
	resolveNarrativeProtagonistName,
	resolveNarrativeTranscriptSpeaker,
} from "./narrativeIdentity";

export function trimStringList(value: unknown, maxItems: number): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
		.map((entry) => entry.trim())
		.slice(0, maxItems);
}

export function coerceEvidenceNumbers(value: unknown): number[] {
	const raw = (value as { evidence?: { messageNumbers?: number[] } })?.evidence?.messageNumbers;
	if (!Array.isArray(raw)) {
		return [];
	}
	return raw.filter((entry) => typeof entry === "number" && Number.isFinite(entry));
}

export function formatEvidence(numbers: number[]): string {
	const sorted = Array.from(new Set(numbers))
		.filter((value) => value >= 1)
		.sort((left, right) => left - right);
	if (!sorted.length) {
		return "";
	}
	const visible = sorted.slice(0, 10);
	const remaining = sorted.length - visible.length;
	const base = `[Message ${visible.join(", ")}]`;
	return remaining > 0 ? `${base} (+${remaining} more)` : base;
}

export function resolveTranscriptSpeaker(message: StoryMessage, playerName: string): string {
	if (message.role === "user") {
		if (isAuthorDirectiveMessage(message)) {
			return message.speakerName?.trim() || "Author";
		}
		if (isContinueMessage(message)) {
			return "Continue";
		}
		if (isDirectorMessage(message)) {
			return "Director";
		}
		return message.speakerName?.trim() || playerName;
	}
	if (message.role === "system" || message.speakerType === "system") {
		return "System";
	}
	if (message.speakerType === "narrator") {
		return "Narrator";
	}
	if (message.speakerName?.trim()) {
		return message.speakerName.trim();
	}
	return "Narrator";
}

export type ArchiveEvidenceRow = {
	text: string;
	evidence: string;
};

export type ArchiveCharacterEntry = {
	name: string;
	aliases: string[];
	description: string;
	firstSeenMessage: number | null;
	lastSeenMessage: number | null;
	evidence: string;
	statusLines: string[];
};

export type ArchiveRelationshipEntry = {
	a: string;
	b: string;
	tier: string;
	summary: string;
	history: string[];
	evidence: string;
};

export type ArchiveTranscriptLine = {
	messageNumber: number;
	speaker: string;
	text: string;
};

export type ArchiveChapterEntry = {
	label: string;
	summary: string;
	endsAtIndex: number | null;
};

export type StoryArchiveContent = {
	title: string;
	metadata: {
		universe: string;
		protagonist: string;
		exportedAt: string;
		indexedAt?: string;
		indexedMessages?: number;
		transcriptMessages: number;
	};
	summary: {
		premise: string;
		protagonistFocus: string;
		currentSituation: string;
		recentDevelopments: string[];
		fallbackSummary: string;
	};
	transcript: ArchiveTranscriptLine[];
	chapterMarkers: Map<number, string>;
	characters: ArchiveCharacterEntry[];
	relationships: ArchiveRelationshipEntry[];
	worldFacts: ArchiveEvidenceRow[];
	openThreads: ArchiveEvidenceRow[];
	significantMemories: ArchiveEvidenceRow[];
	locations: Array<{ name: string; description: string; evidence: string }>;
	chapters: ArchiveChapterEntry[];
	storyStateData: StoryStateDataV2 | null;
};

function mapEvidenceRows(
	raw: unknown[],
	textKey: "fact" | "thread" | "moment",
): ArchiveEvidenceRow[] {
	return raw
		.map((entry) => {
			if (typeof entry === "string") {
				return { text: entry.trim(), evidence: "" };
			}
			const text =
				typeof (entry as Record<string, unknown>)[textKey] === "string"
					? String((entry as Record<string, unknown>)[textKey]).trim()
					: "";
			return {
				text,
				evidence: formatEvidence(coerceEvidenceNumbers(entry)),
			};
		})
		.filter((entry) => entry.text);
}

export function buildStoryArchiveContent(bundle: StoryExportBundle): StoryArchiveContent {
	const storyStateData = (() => {
		const json = bundle.storyState?.stateJson?.trim() ?? "";
		if (!json) {
			return null;
		}
		const parsed = safeParseStoryStateData(json);
		return parsed ? normalizeStoryStateToV2(parsed) : null;
	})();

	const indexes = storyStateData?.indexes;
	const sortedMessages = sortByTimestampAsc(bundle.messages);
	const narrativeRegistry = buildNarrativeIdentityRegistry({
		storyState: storyStateData,
		playerCharacter: bundle.playerCharacter,
		messages: sortedMessages,
		messageCount: sortedMessages.length,
	});
	const redact = (text: string) =>
		applyNarrativeIdentityToText(text, narrativeRegistry, {
			messageCount: sortedMessages.length,
		});
	const chapterMarkers = new Map<number, string>();
	for (const chapter of bundle.chapters ?? []) {
		const idx =
			typeof chapter.endsAtIndex === "number" && Number.isFinite(chapter.endsAtIndex)
				? Math.trunc(chapter.endsAtIndex)
				: 0;
		const label = chapter.label?.trim() ?? "";
		if (idx >= 1 && label) {
			chapterMarkers.set(idx, label);
		}
	}

	let latestUserMessage: string | null = null;
	const transcript: ArchiveTranscriptLine[] = [];
	for (let index = 0; index < sortedMessages.length; index += 1) {
		const message = sortedMessages[index]!;
		const messageNumber = index + 1;
		if (message.role === "user") {
			latestUserMessage = message.content;
		}

		const resolvedContent =
			message.role === "assistant"
				? sanitizeAssistantTranscript({
						text: cleanTextForExport(message.content),
						latestUserMessage,
						playerName: bundle.playerCharacter.name,
					}).text
				 : message.content;

		if (message.role === "assistant") {
			const blocks = parseSceneBlocks(resolvedContent ?? "");
			if (blocks.length) {
				for (const block of blocks) {
					const speaker =
						block.speakerLabel?.trim() ||
						resolveTranscriptSpeaker(message, bundle.playerCharacter.name);
					transcript.push({
						messageNumber,
						speaker: resolveNarrativeTranscriptSpeaker(speaker, narrativeRegistry, {
							messageCount: sortedMessages.length,
						}),
						text: redact(block.text ?? ""),
					});
				}
			} else {
				transcript.push({
					messageNumber,
					speaker: resolveNarrativeTranscriptSpeaker(
						resolveTranscriptSpeaker(message, bundle.playerCharacter.name),
						narrativeRegistry,
						{ messageCount: sortedMessages.length },
					),
					text: redact(resolvedContent ?? ""),
				});
			}
		} else {
			transcript.push({
				messageNumber,
				speaker: resolveNarrativeTranscriptSpeaker(
					resolveTranscriptSpeaker(message, bundle.playerCharacter.name),
					narrativeRegistry,
					{ messageCount: sortedMessages.length },
				),
				text: redact(resolvedContent ?? ""),
			});
		}
	}

	const characterRegistryRaw =
		indexes?.characters && typeof indexes.characters === "object" && !Array.isArray(indexes.characters)
			? Object.values(indexes.characters)
			: [];
	const characters = (characterRegistryRaw as Array<Record<string, unknown>>)
		.map((entry) => {
			const name = typeof entry.name === "string" ? entry.name.trim() : "";
			const aliases = Array.isArray(entry.aliases)
				? entry.aliases.filter(
						(value): value is string => typeof value === "string" && value.trim().length > 0,
					)
				: [];
			const characterName = name;
			const stateEntry = storyStateData?.characters?.[characterName];
			const synthesized =
				storyStateData && characterName
					? synthesizeCharacterStatusBullets(characterName, storyStateData, {
							playerName: bundle.playerCharacter.name,
						})
					: [];
			return {
				name: resolveNarrativeDisplayName(name, narrativeRegistry, {
					messageCount: sortedMessages.length,
				}),
				aliases: aliases
					.map((alias) =>
						resolveNarrativeDisplayName(alias, narrativeRegistry, {
							messageCount: sortedMessages.length,
						}),
					)
					.filter((alias, index, list) => alias && list.indexOf(alias) === index),
				description: redact(typeof entry.description === "string" ? entry.description.trim() : ""),
				firstSeenMessage:
					typeof entry.firstSeenMessage === "number" ? Math.trunc(entry.firstSeenMessage) : null,
				lastSeenMessage:
					typeof entry.lastSeenMessage === "number" ? Math.trunc(entry.lastSeenMessage) : null,
				evidence: formatEvidence(coerceEvidenceNumbers(entry)),
				statusLines: getCharacterStatusLines(stateEntry, synthesized).map(redact),
			};
		})
		.filter((entry) => entry.name)
		.sort((left, right) => left.name.localeCompare(right.name));

	const relationships = (Array.isArray(indexes?.relationships) ? indexes.relationships : [])
		.map((entry) => ({
			a: resolveNarrativeDisplayName(
				typeof entry.a === "string" ? entry.a.trim() : "",
				narrativeRegistry,
				{ messageCount: sortedMessages.length },
			),
			b: resolveNarrativeDisplayName(
				typeof entry.b === "string" ? entry.b.trim() : "",
				narrativeRegistry,
				{ messageCount: sortedMessages.length },
			),
			tier: typeof entry.tier === "string" ? entry.tier.trim() : "stranger",
			summary: redact(typeof entry.summary === "string" ? entry.summary.trim() : ""),
			history: Array.isArray(entry.history)
				? entry.history
						.map((beat) => redact(typeof beat.summary === "string" ? beat.summary.trim() : ""))
						.filter(Boolean)
				: [],
			evidence: formatEvidence(coerceEvidenceNumbers(entry)),
		}))
		.filter((entry) => entry.a && entry.b);

	const worldFactsRaw = Array.isArray(indexes?.worldFacts)
		? indexes.worldFacts
		: Array.isArray(storyStateData?.worldFacts)
			? storyStateData.worldFacts
			: [];
	const worldFacts = mapEvidenceRows(worldFactsRaw as unknown[], "fact").map((entry) => ({
		...entry,
		text: redact(entry.text),
	}));

	const openThreadsRaw = Array.isArray(indexes?.openThreads)
		? indexes.openThreads
		: Array.isArray(storyStateData?.unresolvedThreads)
			? storyStateData.unresolvedThreads
			: [];
	const openThreads = mapEvidenceRows(openThreadsRaw as unknown[], "thread").map((entry) => ({
		...entry,
		text: redact(entry.text),
	}));

	const significantMemoriesRaw = Array.isArray(indexes?.significantMemories)
		? indexes.significantMemories
		: Array.isArray(storyStateData?.significantMemories)
			? storyStateData.significantMemories
			: [];
	const significantMemories = mapEvidenceRows(significantMemoriesRaw as unknown[], "moment").map(
		(entry) => ({
			...entry,
			text: redact(entry.text),
		}),
	);

	const locationsRaw =
		indexes?.locations && typeof indexes.locations === "object" && !Array.isArray(indexes.locations)
			? Object.values(indexes.locations)
			: [];
	const locations = (locationsRaw as Array<Record<string, unknown>>)
		.map((entry) => {
			const name = typeof entry.name === "string" ? entry.name.trim() : "";
			return {
				name,
				description: redact(
					typeof entry.description === "string" ? entry.description.trim() : "",
				),
				evidence: formatEvidence(coerceEvidenceNumbers(entry)),
			};
		})
		.filter((entry) => entry.name)
		.sort((left, right) => left.name.localeCompare(right.name));

	const chapters = (bundle.chapters ?? [])
		.filter((chapter: StoryChapter) => chapter.label?.trim())
		.map((chapter) => ({
			label: chapter.label.trim(),
			summary: redact(chapter.summary?.trim() ?? ""),
			endsAtIndex:
				typeof chapter.endsAtIndex === "number" && Number.isFinite(chapter.endsAtIndex)
					? Math.trunc(chapter.endsAtIndex)
					: null,
		}));

	const premise = redact(storyStateData?.summaries?.premise?.trim() ?? "");
	const protagonistFocus = redact(storyStateData?.summaries?.protagonistSummary?.trim() ?? "");
	const currentSituation = redact(storyStateData?.summaries?.currentSituation?.trim() ?? "");
	const recentDevelopments = trimStringList(storyStateData?.summaries?.recentDevelopments, 12).map(
		redact,
	);
	const fallbackSummary = redact(
		bundle.story.currentSummary?.trim() || storyStateData?.summaries?.worldSummary?.trim() || "",
	);

	return {
		title: bundle.story.title,
		metadata: {
			universe: bundle.universe.name,
			protagonist: resolveNarrativeProtagonistName(
				bundle.playerCharacter,
				storyStateData,
				sortedMessages,
			),
			exportedAt: formatDateTime(bundle.exportedAt),
			...(storyStateData?.indexedAt ? { indexedAt: formatDateTime(storyStateData.indexedAt) } : {}),
			...(typeof indexes?.messageCount === "number" && Number.isFinite(indexes.messageCount)
				? { indexedMessages: Math.trunc(indexes.messageCount) }
				: {}),
			transcriptMessages: bundle.messages.length,
		},
		summary: {
			premise,
			protagonistFocus,
			currentSituation,
			recentDevelopments,
			fallbackSummary,
		},
		transcript,
		chapterMarkers,
		characters,
		relationships,
		worldFacts,
		openThreads,
		significantMemories,
		locations,
		chapters,
		storyStateData,
	};
}
