import { DIRECTOR_SPEAKER_LABEL } from "./directorMode";

export const DIRECTOR_NOTE_SYNTAX_EXAMPLE =
	'Director: *Morgan confronts Alex about the file. Alex ("I didn\'t take it") tries to deflect.*';

export function formatDirectorNoteAuthoringGuidance() {
	return [
		"Director note syntax:",
		`- Prefix the line with ${DIRECTOR_SPEAKER_LABEL}:`,
		"- Write staging as prose inside one pair of asterisks.",
		"- Describe who is present, what happens, and key emotional beats — not a full script.",
		'- Optional dialogue gists: after a character beat, add ("approximate dialogue") in parentheses.',
		"- Gists are intent only. The AI should paraphrase them in the character's voice — never copy them verbatim.",
		`- Example: ${DIRECTOR_NOTE_SYNTAX_EXAMPLE}`,
	].join("\n");
}

export function formatDirectorNoteInterpretationGuidance() {
	return [
		"Director note interpretation:",
		"- The Director note is out-of-character staging guidance, not in-world dialogue or narration.",
		"- Realize prose beats inside *...* as scene action, blocking, and story movement.",
		'- Treat ("gist") parentheticals after a character as approximate dialogue intent only.',
		"- Write the actual spoken line in that character's voice with fresh wording. Never echo gist text word-for-word.",
		"- Do not repeat the Director note verbatim in the scene output.",
	].join("\n");
}

export function formatDirectorNoteComposerHint() {
	return `${DIRECTOR_SPEAKER_LABEL}: *beat* — optional ("gist") for approximate dialogue`;
}
