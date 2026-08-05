import { describe, expect, it } from "vitest";
import {
	isSubstantialTranscriptText,
	shouldAcceptRepairedTranscriptDespiteFormatIssues,
} from "../transcriptSanitizer";

describe("transcript validation policy", () => {
	it("treats repaired transcripts with enough content as saveable", () => {
		const longText =
			'Jake: *nods slowly and sets his coffee down on the desk.* "Hello."\n\nNarrator: *The room goes quiet while everyone waits for an answer.*';
		expect(isSubstantialTranscriptText(longText)).toBe(true);
		expect(
			shouldAcceptRepairedTranscriptDespiteFormatIssues({
				formatValid: false,
				text: longText,
			}),
		).toBe(true);
	});

	it("rejects short broken transcripts for format bypass", () => {
		expect(isSubstantialTranscriptText("Jake: hi")).toBe(false);
		expect(
			shouldAcceptRepairedTranscriptDespiteFormatIssues({
				formatValid: false,
				text: "Jake: hi",
			}),
		).toBe(false);
	});

	it("does not bypass when format is already valid", () => {
		const text =
			'Jake: *nods slowly and sets his coffee down on the desk.* "Hello."\n\nNarrator: *The room goes quiet while everyone waits for an answer.*';
		expect(
			shouldAcceptRepairedTranscriptDespiteFormatIssues({
				formatValid: true,
				text,
			}),
		).toBe(false);
	});
});
