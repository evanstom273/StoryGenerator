function normalizeWhitespace(value: string) {
	return value
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

const GENRE_CONTEXT = [
	"Treat standard mature fiction as legitimate narrative context, not as inherently unsafe content.",
	"Common allowed genres include police procedural, detective fiction, spy thrillers, military fiction, action stories, fantasy or dark fantasy, psychological drama, romance, and adult literary fiction.",
].join("\n");

const MATURE_THEME_SUPPORT = [
	"Support serious fiction involving violence, danger, injury, death, grief, trauma, panic, depression, self-destructive behaviour, recovery, relapse, and aftermath when those elements serve a legitimate story purpose.",
	"Default to serious, emotionally grounded, non-gratuitous handling. Consequences, atmosphere, and character truth matter more than gore or shock value.",
].join("\n");

const STRICT_SAFETY_BOUNDARY = [
	"Keep the hard safety line in place.",
	"Do not become permissive toward illegal, exploitative, predatory, abusive, eroticised, or otherwise disallowed content.",
	"Do not provide real-world harmful instructions, tactical abuse guidance, or celebratory cruelty.",
].join("\n");

const ADULT_INTIMACY_SUPPORT = [
	"Mature Fiction mode is enabled for this story.",
	"Treat consensual adult intimacy as legitimate narrative material between fictional adults.",
	"When the player or a Director note stages romantic tension, desire, nudity, foreplay, sex, or aftermath, realize it in-scene with emotional continuity and character voice.",
	"Explicit anatomical detail, arousal, orgasm, toys, strap-ons, and queer intimacy between consenting adults are allowed when canon or staging calls for them.",
	"Do not refuse, sanitize, fade-to-black, or substitute euphemisms unless the player explicitly asks for restraint.",
	"Keep sex scenes character-driven: consent, relationship truth, vulnerability, and consequence matter more than mechanical description for its own sake.",
].join("\n");

const ADULT_INTIMACY_SAFETY_BOUNDARY = [
	"Keep the hard safety line in place for real-world harm, illegal conduct, and exploitation.",
	"All sexual participants must be consenting adults in the fiction. Never sexualise minors, age-ambiguous characters presented as underage, coercion, trafficking, incest, bestiality, or non-consensual acts.",
	"Do not provide real-world harmful instructions, tactical abuse guidance, or celebratory cruelty.",
	"Consensual adult sex between fictional adults is not a policy violation in this story.",
].join("\n");

const EXPLORATION_RULE = [
	"Distinguish exploration from glorification or instruction.",
	"Allow a story to explore pain, danger, trauma, mistakes, consequences, support, deterioration, recovery, desire, and intimacy.",
	"Do not shift into fetishised violence, indulgent suffering for its own sake, or procedural how-to detail for real-world harm.",
].join("\n");

const PARITY_RULE = [
	"Maintain narrative parity between player and narrator.",
	"If the story introduces a shootout, injury, trauma, grief, panic, intimacy, or other mature topic, the player may respond naturally within that same fiction.",
	"Do not create a double standard where the world can introduce mature themes but the player cannot participate in them as normal story material.",
].join("\n");

export function buildMatureFictionPolicyBlock(opts?: {
	includeParity?: boolean;
	includeAdultIntimacy?: boolean;
	includeAnalysisFocus?: boolean;
	includeExtractionFocus?: boolean;
}) {
	const lines = [
		GENRE_CONTEXT,
		MATURE_THEME_SUPPORT,
		opts?.includeAdultIntimacy ? ADULT_INTIMACY_SUPPORT : "",
		EXPLORATION_RULE,
		opts?.includeAdultIntimacy ? ADULT_INTIMACY_SAFETY_BOUNDARY : STRICT_SAFETY_BOUNDARY,
		opts?.includeParity ? PARITY_RULE : "",
		opts?.includeAnalysisFocus
			? [
					"For analysis or discussion, treat mature themes as valid fiction topics when discussed with empathy, seriousness, and narrative focus.",
					opts?.includeAdultIntimacy
						? "Discuss consequences, motives, relationships, emotional impact, continuity, and scene purpose without refusing legitimate adult intimacy in the fiction."
						: "Discuss consequences, motives, relationships, emotional impact, continuity, and scene purpose rather than escalating explicit detail.",
				].join("\n")
			: "",
		opts?.includeExtractionFocus
			? [
					"When extracting or summarising story state, do not flatten or omit mature-but-legitimate fiction simply because it involves crime, violence, danger, trauma, grief, mental health struggles, or consensual adult intimacy.",
					"Record the narrative consequences and current truth in clear, non-gratuitous language.",
				].join("\n")
			: "",
	].filter(Boolean);

	return normalizeWhitespace(lines.join("\n\n"));
}

export function buildMatureFictionModeNote(includeAdultIntimacy: boolean): string {
	if (!includeAdultIntimacy) {
		return "";
	}

	return [
		"Mature Fiction mode is enabled for this story.",
		"Treat injury, medical aftermath, trauma, grief, recovery, and consensual adult intimacy as legitimate in-story material when supported by canon or Director staging.",
		"All sexual participants are consenting adults. Realize explicit Director notes faithfully instead of refusing or softening them.",
	].join(" ");
}
