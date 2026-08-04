import type { Story, StoryChapter, StoryMessage } from "../../types/models";
import { hasActiveOpenChapter } from "../storyText/chapterNavigation";

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
	if (hasActiveOpenChapter(messages, chapters)) {
		return {
			ok: false,
			reason: "Finish or end the current chapter before generating new chapters.",
		};
	}
	return { ok: true };
}
