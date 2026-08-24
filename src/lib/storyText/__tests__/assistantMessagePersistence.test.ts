import { describe, expect, it } from "vitest";
import type { StoryMessage, StorySpeakerAttributionAudit } from "../../../types/models";
import {
	buildAssistantCandidateSelection,
	buildManualAssistantEdit,
} from "../assistantMessagePersistence";

const originalMessage: StoryMessage = {
	id: "message-1",
	storyId: "story-1",
	role: "assistant",
	content: "Rebecca: Original response.",
	createdAt: "2026-08-24T12:00:00.000Z",
	editedAt: "2026-08-24T12:05:00.000Z",
	revision: 3,
	speakerAttribution: {
		version: 1,
		repairedAt: "2026-08-24T12:00:00.000Z",
		repairs: [],
	},
};

describe("assistant message persistence", () => {
	it("preserves an authoritative manual Rosa/Rebecca correction without semantic repair", () => {
		const content = `
Rosa: *She stays flat on her back across the sofa.* "I'm not moving."

Rebecca: *She lies down beside Rosa.* "Neither am I."
`;

		const edited = buildManualAssistantEdit(
			originalMessage,
			content,
			"2026-08-24T12:10:00.000Z",
		);

		expect(edited.content).toBe(content.trim());
		expect(edited.content.match(/^[^:\n]+:/gm)).toEqual(["Rosa:", "Rebecca:"]);
		expect(edited.speakerAttribution).toBeUndefined();
		expect(edited.editedAt).toBe("2026-08-24T12:10:00.000Z");
		expect(edited.revision).toBe(4);
	});

	it("restores a selected candidate and its attribution without marking a new manual edit", () => {
		const attribution: StorySpeakerAttributionAudit = {
			version: 1,
			repairedAt: "2026-08-24T12:15:00.000Z",
			repairs: [
				{
					lineNumber: 1,
					from: "Rebecca",
					to: "Rosa",
					evidence: ["named-player-action-target"],
				},
			],
		};
		const candidate = "Rosa: Candidate bytes.\n\nRebecca: Separate player block.";

		const selected = buildAssistantCandidateSelection(
			originalMessage,
			candidate,
			attribution,
		);

		expect(selected.content).toBe(candidate);
		expect(selected.speakerAttribution).toEqual(attribution);
		expect(selected.editedAt).toBe(originalMessage.editedAt);
		expect(selected.revision).toBe(4);
	});
});
