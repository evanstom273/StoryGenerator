import type { StoryChapter, StoryMessage } from "../../types/models";
import { getNextChapterBannerLabel } from "../ai/chapterBannerLabel";
import {
	countGeneratedChapters,
	getLatestChapterStartMessage,
	hasActiveOpenChapter,
	hasSubstantiveContentInOpenChapter,
	resolveMessageChapterBoundary,
} from "../storyText/chapterNavigation";

export function resolveUpcomingChapterLabels(
	messages: StoryMessage[],
	chapters: StoryChapter[],
	count: number,
): string[] {
	if (
		hasActiveOpenChapter(messages, chapters) &&
		!hasSubstantiveContentInOpenChapter(messages, chapters)
	) {
		const startMessage = getLatestChapterStartMessage(messages, chapters);
		const boundary = startMessage ? resolveMessageChapterBoundary(startMessage) : null;
		if (boundary?.kind === "start" && boundary.label?.trim()) {
			const labels: string[] = [];
			let current = boundary.label.trim();
			for (let index = 0; index < count; index += 1) {
				labels.push(current);
				current = getNextChapterBannerLabel(current);
			}
			return labels;
		}
	}

	const generatedCount = countGeneratedChapters(messages, chapters);
	let label = "Chapter I";
	if (generatedCount > 0) {
		const sorted = [...chapters].sort((left, right) => left.endsAtIndex - right.endsAtIndex);
		const lastClosed = sorted[sorted.length - 1];
		label = getNextChapterBannerLabel(lastClosed?.label ?? "Chapter I");
	} else if (messages.length > 0) {
		label = getNextChapterBannerLabel("Chapter I");
	}

	const labels: string[] = [];
	let current = label;
	for (let index = 0; index < count; index += 1) {
		labels.push(current);
		current = getNextChapterBannerLabel(current);
	}
	return labels;
}

export function formatChapterStartMessage(label: string): string {
	return label.endsWith(".") ? label : `${label}.`;
}

export function formatChapterEndMessage(label: string): string {
	const trimmed = label.trim();
	return `End of ${trimmed}`;
}
