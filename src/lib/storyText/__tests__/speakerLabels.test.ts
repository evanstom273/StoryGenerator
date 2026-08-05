import { describe, expect, it } from "vitest";
import {
	normalizeEmbeddedNicknameMentions,
	normalizeSceneSpeakerLabel,
	normalizeSpeakerNamesInTranscript,
} from "../speakerLabels";
import { sanitizeAssistantTranscript } from "../transcriptSanitizer";

describe("speakerLabels", () => {
	it("normalizes quoted-nickname speaker labels to first name", () => {
		expect(normalizeSceneSpeakerLabel('Rebecca "Becca" Alvarez')).toBe("Rebecca");
		expect(normalizeSceneSpeakerLabel("Jake Peralta")).toBe("Jake");
		expect(normalizeSceneSpeakerLabel("Marcus")).toBe("Marcus");
		expect(normalizeSceneSpeakerLabel("Narrator")).toBe("Narrator");
		expect(normalizeSceneSpeakerLabel("Jamie's")).toBe("Jamie's");
	});

	it("collapses embedded nickname mentions in prose", () => {
		expect(
			normalizeEmbeddedNicknameMentions(
				'Rebecca "Becca" Alvarez steps into Room 204.',
			),
		).toBe("Rebecca steps into Room 204.");
	});

	it("normalizes speaker labels in transcript lines", () => {
		const input =
			'Rebecca "Becca" Alvarez: *walks over to her desk.* "Hello, class."';
		expect(normalizeSpeakerNamesInTranscript(input)).toBe(
			'Rebecca: *walks over to her desk.* "Hello, class."',
		);
	});

	it("does not collapse quoted dialogue when normalizing prose names", () => {
		const input = 'Marcus: "We are the Blood Brothers now."';
		expect(normalizeSpeakerNamesInTranscript(input)).toBe(
			'Marcus: "We are the Blood Brothers now."',
		);
	});
});

describe("quoted nickname transcript validation", () => {
	it("accepts classroom scene with quoted nickname names after normalization", () => {
		const input = `Narrator: *The classroom chatter is cut short as the door swings wide open. Rebecca "Becca" Alvarez steps into Room 204, looking completely unfazed and holding a thin Manila folder under her arm. She glances over the room with a practiced eye that instantly restores order without a single raised voice.*
Rebecca "Becca" Alvarez: *walks over to her desk and sets the folder down beside her travel mug* "Alright, everyone, take your seats and open your notebooks to page forty-two."
Marcus: *slumps down in his seat, sighing loudly* "Man, I thought we were getting a cool substitute."
Jordan: *chuckles softly, shaking his head as he opens his binder* "So no mystery?"
Maya: *sets her paperback down on her desk with a faint smirk* "Told you."`;

		const result = sanitizeAssistantTranscript({ text: input });

		expect(result.formatValid).toBe(true);
		expect(result.text).toContain("Rebecca:");
		expect(result.text).not.toContain('"Becca"');
		expect(result.text).not.toContain("'Becca'");
		expect(result.text).toMatch(
			/Narrator: \*The classroom chatter is cut short as the door swings wide open\. Rebecca steps into Room 204/i,
		);
	});
});
