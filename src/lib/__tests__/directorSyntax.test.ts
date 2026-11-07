import { describe, expect, it } from "vitest";
import {
	DIRECTOR_NOTE_SYNTAX_EXAMPLE,
	formatDirectorNoteAuthoringGuidance,
	formatDirectorNoteComposerHint,
	formatDirectorNoteInterpretationGuidance,
} from "../storyText/directorSyntax";

describe("directorSyntax", () => {
	it("includes the canonical syntax example with a gist parenthetical", () => {
		expect(DIRECTOR_NOTE_SYNTAX_EXAMPLE).toContain('Director: *');
		expect(DIRECTOR_NOTE_SYNTAX_EXAMPLE).toContain('("I didn\'t take it")');
	});

	it("documents authoring syntax for Generate Direction", () => {
		const guidance = formatDirectorNoteAuthoringGuidance();

		expect(guidance).toContain("Director note syntax:");
		expect(guidance).toContain('("approximate dialogue")');
		expect(guidance).toContain(DIRECTOR_NOTE_SYNTAX_EXAMPLE);
	});

	it("documents interpretation rules for scene generation", () => {
		const guidance = formatDirectorNoteInterpretationGuidance();

		expect(guidance).toContain("Director note interpretation:");
		expect(guidance).toContain('("gist")');
		expect(guidance).toContain("Never echo gist text word-for-word");
	});

	it("provides a short composer hint", () => {
		expect(formatDirectorNoteComposerHint()).toContain('Director: *beat*');
		expect(formatDirectorNoteComposerHint()).toContain('("gist")');
	});
});
