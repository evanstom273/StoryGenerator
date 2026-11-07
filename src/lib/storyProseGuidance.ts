/** Shared prose-quality rules for story generation and rewrite prompts. */
export function formatHumanNovelistProseGuidance(): string {
	return [
		"Prose quality:",
		"- Write like a human novelist, not an AI. Vary sentence length, pacing, and rhythm naturally.",
		"- Prefer commas and full stops over em dashes. Use an em dash only when it genuinely improves the sentence, and rarely more than once per sentence.",
		"- Let dialogue, actions, and small concrete details carry emotion. Do not repeatedly explain how characters feel.",
		"- Dialogue does not require an accompanying gesture. Use physical actions when they reveal character, advance the scene, establish spatial relationships, or communicate something the words do not.",
		"- Keep narration understated and specific. Avoid unnecessarily dramatic or inflated prose.",
		"- Avoid repetitive AI writing habits and stock phrases such as \"a beat passes\", \"lets out a breath\", \"the room falls silent\", \"the air is thick with tension\", and similar filler.",
		"- The prose should feel effortless, varied, and natural — like a contemporary novel written by a human.",
	].join("\n");
}

/**
 * Default craft guidance for story scene generation. Deliberately framed as
 * defaults so Director notes, Author declarations, guided plans and the
 * player's own style keep creative authority.
 */
export function formatNarrativeCraftGuidance(): string {
	return [
		"Writing craft defaults:",
		"These are defaults, not limits. An explicit Director note, Author declaration, guided chapter plan, or the player's own established style overrides them. If asked for slapstick, melodrama, exaggerated behaviour, dark humour, lavish description, long conversations, or specific dialogue, deliver it fully.",
		"- Write whole people, not their most famous traits. Sheets, lore, and personality notes describe who someone is, not a checklist to display every reply. Recognisability comes from judgement, priorities, relationships, and how someone talks.",
		"- Signature interests, catchphrases, and mannerisms surface when the situation genuinely invites them, then step back. Characters can be ordinary, tired, sincere, distracted, or wrong. Never amplify a trait into a parody of itself, whether the character is original or from established canon.",
		"- Characters speak because they have something to add, not because they are present. Let participation follow the scene: sometimes one or two people carry an exchange, sometimes everyone piles in. Do not rotate through the cast, give everyone a line, or keep the same speaking order from reply to reply.",
		"- Let conversation sound like conversation: short answers, plain questions, interruptions, changes of subject, imperfect phrasing, silence, someone taking a joke seriously. Not every line needs to be witty, quotable, or emotionally significant, and not everyone is equally articulate, perceptive, or funny.",
		"- Humour comes from the people and the situation. When the scene calls for comedy, sarcasm, absurdity, or drama, commit to it.",
		"- Characters have their own priorities and moods. They can disagree, misunderstand, be irritated, indifferent, or unsure; supporting characters are not a chorus of approval. Do not manufacture conflict or harmony; let reactions follow character and circumstance.",
		"- Dialogue does not require an accompanying gesture. Use physical actions when they reveal character, advance the scene, establish spatial relationships, or communicate something the words do not. Skip decorative smiles, chuckles, nods, sighs, leaning, shared glances, softening expressions, and quiet or gentle voices. Do not swap in synonyms for the same habit; cut the beat or find a specific one.",
		"- Trust the reader. Do not name, explain, or justify a feeling the dialogue or action already shows, label comfort as reassuring, or explain why a joke landed. Let significant moments stand without a closing reflection. Interiority is welcome when it adds something the reader could not infer.",
		"- Match emotional scale to the beat and the character. Build from strong player-authored beats instead of restating or amplifying them, do not automatically escalate into tears, embraces, speeches, or declarations, and preserve ambiguity the player leaves open.",
		"- Vary the shape of each reply: line and paragraph length, how many people speak, how much description, the balance of action and dialogue. Do not open every reply with setting or close every reply on a poignant line. Rich description, long conversations, and intense scenes are right when the moment earns them.",
		"- Earlier replies and story memory record what happened, not a style to copy; do not reuse their jokes or emotional descriptions.",
		"- Avoid stock phrases such as \"a beat passes\", \"lets out a breath\", and \"the air is thick with tension\".",
	].join("\n");
}

/** Short reminder placed in the final user turn, next to the transcript, where recency matters most. */
export function formatFreshBeatReminder(options: { directorNote: boolean }): string {
	const reminder =
		"continue naturally, preserving established facts without imitating previous phrasing or gestures. Let participation follow the scene rather than automatically giving every present character a line.";
	return options.directorNote
		? `Unless this note says otherwise: ${reminder}`
		: `Writing reminder: ${reminder.charAt(0).toUpperCase()}${reminder.slice(1)}`;
}
