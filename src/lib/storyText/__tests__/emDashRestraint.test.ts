import { describe, expect, it } from "vitest";
import {
	restrainEmDashUsageInTranscript,
	sanitizeAssistantTranscript,
} from "../transcriptSanitizer";

describe("em dash restraint", () => {
	it("collapses chained em dashes inside quoted dialogue", () => {
		const input =
			'Jamie: "A: I ran as fast as I could, Dad — I tried to catch them — she\'s gone —"';
		const output = restrainEmDashUsageInTranscript(input);
		expect(output).toContain(
			'"A: I ran as fast as I could, Dad — I tried to catch them, she\'s gone —"',
		);
	});

	it("preserves a single em dash used for interruption", () => {
		const input = 'Jake: "Take a breath — who took her?"';
		expect(restrainEmDashUsageInTranscript(input)).toBe(input);
	});

	it("does not add em dashes to narrator prose outside quotes", () => {
		const input =
			"Narrator: *The heavy front door strikes the hallway wall with a violent crash.*";
		expect(restrainEmDashUsageInTranscript(input)).toBe(input);
	});

	it("sanitizes crisis dialogue without em-dash chains", () => {
		const input = [
			'Jake: "Hey, I\'ve got you. Take a breath — who took her?"',
			'Jamie: "I ran as fast as I could, Dad — I tried to catch them — she\'s gone —"',
		].join("\n");
		const { text } = sanitizeAssistantTranscript({
			text: input,
			playerName: "James Peralta (Jamie)",
		});
		expect(text).not.toMatch(/ — [^"]* — [^"]* — /);
	});
});
