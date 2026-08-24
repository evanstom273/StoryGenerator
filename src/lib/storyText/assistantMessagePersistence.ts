import type { StoryMessage, StorySpeakerAttributionAudit } from "../../types/models";

export function buildManualAssistantEdit(
	currentMessage: StoryMessage,
	content: string,
	editedAt: string,
): StoryMessage {
	return {
		...currentMessage,
		content: content.trim(),
		speakerAttribution: undefined,
		editedAt,
		revision: (currentMessage.revision ?? 0) + 1,
	};
}

export function buildAssistantCandidateSelection(
	currentMessage: StoryMessage,
	content: string,
	speakerAttribution?: StorySpeakerAttributionAudit,
): StoryMessage {
	return {
		...currentMessage,
		content,
		speakerAttribution,
		revision: (currentMessage.revision ?? 0) + 1,
	};
}
