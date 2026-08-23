import type { AdultContentMode } from "./adultContentMode";
import type { AdultContentProviderCapability } from "./providerCapabilities";

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
	"Explicit anatomical detail, arousal, orgasm, toys, strap-ons, dildos, and queer intimacy between consenting adults are allowed when canon or staging calls for them.",
	"Match the explicitness of the Director note and prior chapters. Use the same anatomical terms the player staged (for example clit, dildo, strap-on, nipples) instead of euphemisms like internal bulb, toy, harness, or sensitive spot.",
	"Do not refuse, sanitize, fade-to-black, or substitute euphemisms unless the player explicitly asks for restraint.",
	"Keep sex scenes character-driven: consent, relationship truth, vulnerability, and consequence matter more than mechanical description for its own sake.",
].join("\n");

const ADULT_INTIMACY_SAFETY_BOUNDARY = [
	"Keep the hard safety line in place for real-world harm, illegal conduct, and exploitation.",
	"All sexual participants must be consenting adults in the fiction. Never sexualise minors, age-ambiguous characters presented as underage, coercion, trafficking, incest, bestiality, or non-consensual acts.",
	"Do not provide real-world harmful instructions, tactical abuse guidance, or celebratory cruelty.",
].join("\n");

const UNIVERSAL_SAFETY_BOUNDARY = [
	"Keep the hard safety line in place.",
	"Do not become permissive toward illegal, exploitative, predatory, abusive, or otherwise disallowed content.",
	"Do not provide real-world harmful instructions, tactical abuse guidance, or celebratory cruelty.",
].join("\n");

const STANDARD_MODE_POLICY = [
  "Adult content mode: standard.",
  "Use ordinary story-content boundaries. Do not introduce graphic sexual content or unusually graphic violence.",
  "If adult intimacy arises naturally, keep it non-graphic or transition away from explicit detail.",
].join("\n");

const MATURE_NON_GRAPHIC_MODE_POLICY = [
  "Adult content mode: mature fiction (non-graphic).",
  "Treat injury, medical aftermath, trauma, grief, recovery, and adult intimacy as legitimate in-story material when supported by canon.",
  "Keep sexual intimacy non-graphic. A fade-to-black or a focus on emotion, relationship, and aftermath is appropriate.",
].join("\n");

const EXPLICIT_CONSENTING_ADULTS_MODE_POLICY = [
  "Adult content mode: explicit consensual-adult fiction.",
  "This mode is eligible only when the story explicitly establishes that every sexual participant is fictional and an adult. Never infer adulthood from appearance, occupation, relationship status, or an ambiguous age.",
  "Consent must be established for the current interaction, remains ongoing and revocable, and may be withdrawn at any point. A relationship or earlier consent is not automatic consent for a current act.",
  "Do not sexualise minors or characters of ambiguous age. Do not portray coercion, incapacity, exploitation, abuse, or predation as consent.",
  ADULT_INTIMACY_SUPPORT,
  "When all eligibility conditions are established, follow the requested narrative detail only to the extent the active provider supports it and its policies permit.",
].join("\n");

function buildProviderCapabilityPolicy(
  capability: AdultContentProviderCapability | undefined,
) {
  if (!capability) {
    return "Provider rule: provider policies and safety controls remain authoritative. A refusal or safety block must be honored.";
  }

  if (capability === "supported") {
    return "Provider capability: supported by this Story Engine integration. Provider policies and safety controls still remain authoritative, and a refusal or safety block must be honored.";
  }

  if (capability === "best_effort") {
    return "Provider capability: best effort. The provider may generate this contextual continuation or may filter it. Honor any refusal or safety block; do not evade, weaken, or bypass provider safeguards.";
  }

  return "Provider capability: unsupported for explicit detail in this Story Engine integration. Continue non-graphically or fade to black; do not ask the provider to generate explicit sexual detail.";
}

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
  mode?: AdultContentMode;
  providerCapability?: AdultContentProviderCapability;
  /** Legacy alias retained for callers predating `mode`. */
  includeAdultIntimacy?: boolean;
  includeParity?: boolean;
  includeAnalysisFocus?: boolean;
  includeExtractionFocus?: boolean;
}) {
  // Preserve the historic helper's behaviour for callers that have not yet
  // migrated: explicit intimacy was opt-in, while the baseline policy still
  // supported mature, non-graphic fiction.
  const mode =
    opts?.mode ??
    (opts?.includeAdultIntimacy
      ? "explicit_consensual_adults"
      : "mature_non_graphic");
  const modePolicy =
    mode === "explicit_consensual_adults"
      ? EXPLICIT_CONSENTING_ADULTS_MODE_POLICY
      : mode === "mature_non_graphic"
        ? MATURE_NON_GRAPHIC_MODE_POLICY
        : STANDARD_MODE_POLICY;
  const lines = [
    mode === "standard" ? "" : GENRE_CONTEXT,
    mode === "standard" ? "" : MATURE_THEME_SUPPORT,
    mode === "standard" ? "" : EXPLORATION_RULE,
    modePolicy,
    mode === "explicit_consensual_adults"
      ? `${ADULT_INTIMACY_SAFETY_BOUNDARY}\n${UNIVERSAL_SAFETY_BOUNDARY}`
      : STRICT_SAFETY_BOUNDARY,
    mode === "explicit_consensual_adults"
      ? buildProviderCapabilityPolicy(opts?.providerCapability)
      : "",
    opts?.includeParity ? PARITY_RULE : "",
    opts?.includeAnalysisFocus
      ? [
          "For analysis or discussion, treat mature themes as valid fiction topics when discussed with empathy, seriousness, and narrative focus.",
          mode === "explicit_consensual_adults"
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
