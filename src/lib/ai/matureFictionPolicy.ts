function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const GENRE_CONTEXT = [
  "Treat standard mature fiction as legitimate narrative context, not as inherently unsafe content.",
  "Common allowed genres include police procedural, detective fiction, spy thrillers, military fiction, action stories, fantasy or dark fantasy, and psychological drama.",
].join("\n");

const MATURE_THEME_SUPPORT = [
  "Support serious fiction involving violence, danger, injury, death, grief, trauma, panic, depression, self-destructive behaviour, recovery, relapse, and aftermath when those elements serve a legitimate story purpose.",
  "Default to serious, emotionally grounded, non-gratuitous handling. Consequences, atmosphere, and character truth matter more than gore or shock value.",
].join("\n");

const SAFETY_BOUNDARY = [
  "Keep the hard safety line in place.",
  "Do not become permissive toward illegal, exploitative, predatory, abusive, eroticised, or otherwise disallowed content.",
  "Do not provide real-world harmful instructions, tactical abuse guidance, or celebratory cruelty.",
].join("\n");

const EXPLORATION_RULE = [
  "Distinguish exploration from glorification or instruction.",
  "Allow a story to explore pain, danger, trauma, mistakes, consequences, support, deterioration, and recovery.",
  "Do not shift into fetishised violence, indulgent suffering for its own sake, or procedural how-to detail for real-world harm.",
].join("\n");

const PARITY_RULE = [
  "Maintain narrative parity between player and narrator.",
  "If the story introduces a shootout, injury, trauma, grief, panic, or other mature topic, the player may respond naturally within that same fiction.",
  "Do not create a double standard where the world can introduce mature themes but the player cannot participate in them as normal story material.",
].join("\n");

export function buildMatureFictionPolicyBlock(opts?: {
  includeParity?: boolean;
  includeAnalysisFocus?: boolean;
  includeExtractionFocus?: boolean;
}) {
  const lines = [
    GENRE_CONTEXT,
    MATURE_THEME_SUPPORT,
    EXPLORATION_RULE,
    SAFETY_BOUNDARY,
    opts?.includeParity ? PARITY_RULE : "",
    opts?.includeAnalysisFocus
      ? [
          "For analysis or discussion, treat mature themes as valid fiction topics when discussed with empathy, seriousness, and narrative focus.",
          "Discuss consequences, motives, relationships, emotional impact, continuity, and scene purpose rather than escalating explicit detail.",
        ].join("\n")
      : "",
    opts?.includeExtractionFocus
      ? [
          "When extracting or summarising story state, do not flatten or omit mature-but-legitimate fiction simply because it involves crime, violence, danger, trauma, grief, or mental health struggles.",
          "Record the narrative consequences and current truth in clear, non-gratuitous language.",
        ].join("\n")
      : "",
  ].filter(Boolean);

  return normalizeWhitespace(lines.join("\n\n"));
}
