import type { StoryMessage } from "../../types/models";
import { STORY_HISTORY_DIVIDER_MESSAGE } from "./types";

export function isStoryHistoryDividerMessage(message: StoryMessage): boolean {
	return (
		message.role === "system" &&
		(message.content.includes("Generated Story History Complete") ||
			message.content === STORY_HISTORY_DIVIDER_MESSAGE)
	);
}
