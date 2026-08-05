import type { StoryMessage } from "../../types/models";
import type { StoryEngineRepository } from "../repository";
import type { GuidedChapterSetupSnapshot } from "./types";
import { createEntityId } from "../ids";
import { sortByTimestampAsc } from "../dates";
import { resolveMessageChapterBoundary } from "../storyText/chapterNavigation";
import { formatChapterStartMessage } from "./chapterLabels";

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

export async function resolveOrCreateChapterStartMessage(
	repository: StoryEngineRepository,
	storyId: string,
	label: string,
	messages?: StoryMessage[],
	setup?: GuidedChapterSetupSnapshot,
): Promise<StoryMessage> {
	const transcript = messages ?? (await repository.listStoryMessages(storyId));
	const existing = findReusableChapterStartMessage(transcript, label);
	if (existing) {
		if (setup) {
			const updated: StoryMessage = {
				...existing,
				guidedChapterSetup: setup,
			};
			await repository.saveStoryMessage(updated);
			return updated;
		}
		return existing;
	}

	const boundaryLabel = normalizeChapterBoundaryLabel(label);
	const message: StoryMessage = {
		id: createEntityId("story-message"),
		storyId,
		role: "system",
		content: formatChapterStartMessage(boundaryLabel),
		timestamp: new Date().toISOString(),
		speakerType: "system",
		chapterBoundary: {
			kind: "start",
			label: boundaryLabel,
		},
		guidedChapterSetup: setup,
	};
	await repository.saveStoryMessage(message);
	return message;
}
