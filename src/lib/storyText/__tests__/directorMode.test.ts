import { describe, expect, it } from "vitest";
import type { StoryMessage } from "../../../types/models";
import {
	isPlayerLegalNameDirectorBeat,
	resolveUserTranscriptSpeaker,
} from "../directorMode";

function makeUserMessage(
	overrides: Partial<StoryMessage> & Pick<StoryMessage, "content">,
): StoryMessage {
	return {
		id: "msg-1",
		storyId: "story-1",
		role: "user",
		timestamp: "2026-08-07T18:00:00.000Z",
		speakerType: "player",
		speakerName: "Silas Thorne",
		...overrides,
	};
}

describe("directorMode legal-name beats", () => {
	it("treats legal-name scene direction as Director when scene name differs", () => {
		const message = makeUserMessage({
			content:
				"*The Patrol Officer, a young kid called Mercer, points down the alleyway with a trembling flashlight.*",
		});

		expect(isPlayerLegalNameDirectorBeat(message, "Silas Thorne", "Mark Owen")).toBe(true);
		expect(
			resolveUserTranscriptSpeaker(message, {
				legalName: "Silas Thorne",
				sceneName: "Mark Owen",
			}),
		).toBe("Director");
	});

	it("keeps in-character scene-name speech as the scene name", () => {
		const message = makeUserMessage({
			speakerName: "Mark",
			content: '"My name is Mark Owen."',
		});

		expect(isPlayerLegalNameDirectorBeat(message, "Silas Thorne", "Mark Owen")).toBe(false);
		expect(
			resolveUserTranscriptSpeaker(message, {
				legalName: "Silas Thorne",
				sceneName: "Mark Owen",
			}),
		).toBe("Mark");
	});

	it("does not relabel legal-name beats when legal and scene names match", () => {
		const message = makeUserMessage({
			speakerName: "Jamie Potter",
			content: "*She opens the door.*",
		});

		expect(isPlayerLegalNameDirectorBeat(message, "Jamie Potter", "Jamie Potter")).toBe(false);
		expect(
			resolveUserTranscriptSpeaker(message, {
				legalName: "Jamie Potter",
				sceneName: "Jamie Potter",
			}),
		).toBe("Jamie Potter");
	});

	it("shows the scene name instead of the stored legal name on chapter markers", () => {
		const message = makeUserMessage({
			speakerName: "Jamie Peralta",
			content: "*End of Chapter I.*",
		});

		expect(
			resolveUserTranscriptSpeaker(message, {
				legalName: "Jamie Peralta",
				sceneName: "Jamie",
			}),
		).toBe("Jamie");
	});
});
