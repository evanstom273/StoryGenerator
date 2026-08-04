import type { StoryMessage } from "../../types/models";
import { sortByTimestampAsc } from "../dates";
import { resolveMessageChapterBoundary } from "../storyText/chapterNavigation";

function normalizeChapterBoundaryLabel(label: string): string {
	return label.trim().replace(/\.$/, "");
}

/**
 * Reuse a chapter-start banner the author already placed at the transcript tail
 * (e.g. typing "Chapter II." before Generate Chapters) instead of posting a duplicate.
 */
export function findReusableChapterStartMessage(
	messages: StoryMessage[],
	label: string,
): StoryMessage | null {
	const normalized = normalizeChapterBoundaryLabel(label);
	const sorted = sortByTimestampAsc(messages);

	for (let index = sorted.length - 1; index >= 0; index -= 1) {
		const message = sorted[index]!;
		const boundary = resolveMessageChapterBoundary(message);
		if (boundary?.kind !== "start") {
			continue;
		}
		if (normalizeChapterBoundaryLabel(boundary.label ?? "") !== normalized) {
			continue;
		}

		const hasLaterChapterStart = sorted
			.slice(index + 1)
			.some((later) => resolveMessageChapterBoundary(later)?.kind === "start");
		if (hasLaterChapterStart) {
			continue;
		}

		return message;
	}

	return null;
}
