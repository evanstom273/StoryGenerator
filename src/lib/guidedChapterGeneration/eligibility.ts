import type { Story, StoryChapter, StoryMessage } from "../../types/models";
import {
	hasActiveOpenChapter,
	hasSubstantiveContentInOpenChapter,
} from "../storyText/chapterNavigation";

export function isStoryEligibleForGuidedGeneration(story: Story | null | undefined): boolean {
	if (!story) {
		return false;
	}
	if (story.readOnlyReason === "sequel_prequel") {
		return false;
	}
	if (story.isArchived) {
		return false;
	}
	if (story.lineageType === "sequel") {
		return false;
	}
	return true;
}

export function canGenerateGuidedChaptersAtWorkspace(
	messages: StoryMessage[],
	chapters: StoryChapter[],
): { ok: true } | { ok: false; reason: string } {
	if (!hasActiveOpenChapter(messages, chapters)) {
		return { ok: true };
	}

	if (hasSubstantiveContentInOpenChapter(messages, chapters)) {
		return { ok: true };
	}

	return {
		ok: false,
		reason: "Play at least one scene in the current chapter before generating new chapters.",
	};
}
