import type { StoryChapter, StoryMessage } from "../../types/models";
import { sortByTimestampAsc } from "../dates";
import { isContinueMessage } from "../storyText/continueMode";
import { isDirectorMessage } from "../storyText/directorMode";
import {
	resolveChapterEndMessageIndex,
	resolveNextChapterStartIndex,
} from "../storyText/chapterNavigation";

const PRIOR_TAIL_MESSAGE_LIMIT = 14;
const PRIOR_MESSAGE_CHAR_LIMIT = 420;
const PRIOR_BLOCK_CHAR_LIMIT = 2800;

function sortMessages(messages: StoryMessage[]): StoryMessage[] {
	return sortByTimestampAsc(messages);
}

function formatPriorMessageLine(message: StoryMessage, playerName: string): string | null {
	if (isContinueMessage(message)) {
		return null;
	}

	if (message.role === "system") {
		const boundary = message.chapterBoundary;
		if (boundary?.kind === "start") {
			return `[${boundary.label} begins]`;
		}
		if (boundary?.kind === "end") {
			return `[${boundary.label} ends]`;
		}
		return null;
	}

	const content = message.content.trim().replace(/\s+/g, " ");
	if (!content) {
		return null;
	}

	if (isDirectorMessage(message)) {
		return `Director: ${content.slice(0, PRIOR_MESSAGE_CHAR_LIMIT)}`;
	}

	if (message.role === "user") {
		const speaker = message.speakerName?.trim() || playerName;
		return `${speaker}: ${content.slice(0, PRIOR_MESSAGE_CHAR_LIMIT)}`;
	}

	return content.slice(0, PRIOR_MESSAGE_CHAR_LIMIT);
}

export function getLastClosedChapterMessages(
	messages: StoryMessage[],
	chapters: StoryChapter[],
): { chapter: StoryChapter | null; chapterMessages: StoryMessage[] } {
	const sortedChapters = [...chapters].sort((left, right) => left.endsAtIndex - right.endsAtIndex);
	if (!sortedChapters.length) {
		const sortedMessages = sortMessages(messages);
		if (!sortedMessages.length) {
			return { chapter: null, chapterMessages: [] };
		}
		return {
			chapter: null,
			chapterMessages: sortedMessages.slice(-PRIOR_TAIL_MESSAGE_LIMIT),
		};
	}

	const lastChapter = sortedChapters[sortedChapters.length - 1]!;
	const previousChapter =
		sortedChapters.length >= 2 ? sortedChapters[sortedChapters.length - 2] : null;
	const sortedMessages = sortMessages(messages);
	const endIndex = resolveChapterEndMessageIndex(messages, lastChapter);
	if (endIndex === null) {
		return { chapter: lastChapter, chapterMessages: [] };
	}

	let startIndex = 0;
	if (previousChapter) {
		const nextIndex = resolveNextChapterStartIndex(messages, previousChapter);
		startIndex = nextIndex ?? 0;
	}

	return {
		chapter: lastChapter,
		chapterMessages: sortedMessages.slice(startIndex, endIndex + 1),
	};
}

export function wantsContinuationFromPriorChapter(text: string | undefined): boolean {
	const normalized = text?.trim().toLowerCase() ?? "";
	if (!normalized) {
		return false;
	}

	return (
		/\bcontinue\s+(from|where|after|at)\b/.test(normalized) ||
		/\b(previous|last)\s+chapter\b/.test(normalized) ||
		/\bpick\s+up\s+where\b/.test(normalized) ||
		/\bwhere\s+we\s+left\s+off\b/.test(normalized)
	);
}

export function buildPriorChapterContinuationContext(params: {
	messages: StoryMessage[];
	chapters: StoryChapter[];
	storySummary?: string;
	playerName: string;
	overallDirection?: string;
}): string | undefined {
	const { chapter, chapterMessages } = getLastClosedChapterMessages(
		params.messages,
		params.chapters,
	);

	const hasStoryContent = chapterMessages.length > 0;
	const explicitContinue = wantsContinuationFromPriorChapter(params.overallDirection);
	const hasClosedChapter = Boolean(params.chapters.length);

	if (!hasStoryContent && !params.storySummary?.trim()) {
		return undefined;
	}

	if (!hasClosedChapter && !explicitContinue && chapterMessages.length < 3) {
		return undefined;
	}

	const tailMessages = chapterMessages.slice(-PRIOR_TAIL_MESSAGE_LIMIT);
	const transcriptTail = tailMessages
		.map((message) => formatPriorMessageLine(message, params.playerName))
		.filter((line): line is string => Boolean(line));

	if (!transcriptTail.length && !params.storySummary?.trim()) {
		return undefined;
	}

	const parts = [
		"Continue from where the existing story left off.",
		"The first generated scene must follow realistically from the previous chapter's final beats — do not restart, skip ahead, or invent an unrelated opening.",
	];

	if (chapter?.label) {
		parts.push(`Last closed chapter: ${chapter.label}`);
	}
	if (chapter?.summary?.trim()) {
		parts.push(`Chapter archive summary:\n${chapter.summary.trim()}`);
	}
	if (params.storySummary?.trim()) {
		parts.push(`Current story situation:\n${params.storySummary.trim()}`);
	}
	if (transcriptTail.length) {
		parts.push(
			"Final transcript beats to continue from (mandatory):",
			transcriptTail.map((line) => `- ${line}`).join("\n"),
		);
	}

	if (explicitContinue && params.overallDirection?.trim()) {
		parts.push(`Planner direction:\n${params.overallDirection.trim()}`);
	}

	let block = parts.join("\n\n");
	if (block.length > PRIOR_BLOCK_CHAR_LIMIT) {
		block = `${block.slice(0, PRIOR_BLOCK_CHAR_LIMIT).trim()}…`;
	}

	return block;
}
