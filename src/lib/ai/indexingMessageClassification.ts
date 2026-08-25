import type { StoryMessage } from "../../types/models";
import { isContinueMessage } from "../storyText/continueMode";

const PURE_CHAPTER_MARKER_PATTERN =
	/^(?:end\s+of\s+)?chapter\s+(?:[ivxlcdm]+|\d+)(?:\s*[:\-–—]\s*[^\n]+)?[.!?]?$/i;

function normalizeStructuralText(value: string) {
	return value
		.trim()
		.replace(/^#{1,6}\s*/, "")
		.replace(/^\*+|\*+$/g, "")
		.trim();
}

export function isPureChapterMarkerMessage(message: StoryMessage) {
	const normalized = normalizeStructuralText(message.content);
	if (!normalized || normalized.includes("\n")) return false;
	return PURE_CHAPTER_MARKER_PATTERN.test(normalized);
}

/** Persisted control/structure messages contain no story facts for the extractor. */
export function isDeterministicIndexingNoop(message: StoryMessage) {
	return isContinueMessage(message) || isPureChapterMarkerMessage(message);
}
