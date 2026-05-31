import { parseSceneBlocks } from "./parseSceneBlocks";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripQuotedSegments(value: string) {
  return value
    .replace(/"[^"]*"/g, "")
    .replace(/“[^”]*”/g, "")
    .replace(/'[^']*'/g, "");
}

function getSpeakerLabelIfAny(line: string) {
  const match = line.match(/^([^:\n]{1,48}):\s*/);
  if (!match) {
    return null;
  }
  const label = match[1]?.trim();
  if (!label) {
    return null;
  }
  return label;
}

function getPlayerNameVariants(playerName: string) {
  const trimmed = playerName.trim();
  if (!trimmed) {
    return [];
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const firstToken = tokens[0] ?? "";
  const lastToken = tokens.length > 1 ? tokens[tokens.length - 1] : "";
  const variants = new Set<string>();
  variants.add(trimmed);
  if (firstToken && firstToken.length >= 2) {
    variants.add(firstToken);
  }
  if (lastToken && lastToken.length >= 2) {
    variants.add(lastToken);
  }

  const quotedMatches = trimmed.matchAll(/"([^"]{2,64})"/g);
  for (const match of quotedMatches) {
    const value = match[1]?.trim() ?? "";
    if (!value) continue;
    variants.add(value);
    for (const token of value.split(/\s+/).filter(Boolean)) {
      if (token.length >= 2) variants.add(token);
    }
  }

  const parenMatches = trimmed.matchAll(/\(([^)]{2,64})\)/g);
  for (const match of parenMatches) {
    const value = match[1]?.trim() ?? "";
    if (!value) continue;
    variants.add(value);
    for (const token of value.split(/\s+/).filter(Boolean)) {
      if (token.length >= 2) variants.add(token);
    }
  }

  return Array.from(variants);
}

function looksLikeVerbToken(token: string, auxiliaryVerbs: Set<string>) {
  const lower = token.toLowerCase();
  const irregularVerbs = new Set([
    "am",
    "be",
    "been",
    "being",
    "do",
    "did",
    "done",
    "go",
    "went",
    "gone",
    "come",
    "came",
    "run",
    "ran",
    "sit",
    "sat",
    "stand",
    "stood",
    "say",
    "said",
    "see",
    "saw",
    "hear",
    "heard",
    "take",
    "took",
    "taken",
    "give",
    "gave",
    "given",
    "make",
    "made",
    "get",
    "got",
    "gotten",
    "feel",
    "felt",
    "nod",
    "nods",
    "shake",
    "shook",
  ]);

  return (
    auxiliaryVerbs.has(lower) ||
    irregularVerbs.has(lower) ||
    lower.endsWith("ed") ||
    lower.endsWith("ing") ||
    lower.endsWith("s")
  );
}

export type PlayerOwnershipViolation = {
  rule: string;
  match: string;
  line?: string;
};

export function getPlayerCharacterAuthorshipViolation({
  playerName,
  text,
}: {
  playerName: string;
  text: string;
}) {
  const variants = getPlayerNameVariants(playerName);
  if (!variants.length) {
    return null;
  }

  const auxiliaryVerbs = new Set([
    "is",
    "was",
    "are",
    "were",
    "has",
    "had",
    "will",
    "would",
    "can",
    "could",
    "should",
    "might",
    "must",
  ]);

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const lowerVariants = variants.map((value) => value.toLowerCase());
  let pronounWindow = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const speakerLabel = getSpeakerLabelIfAny(trimmed);
    if (speakerLabel && !lowerVariants.includes(speakerLabel.toLowerCase())) {
      continue;
    }

    const candidate = stripQuotedSegments(trimmed);
    if (!candidate) {
      continue;
    }

    if (pronounWindow > 0) {
      const pronounMatch = candidate.match(/^(He|She|They)\s+([a-zA-Z']{2,})\b/);
      if (pronounMatch && pronounMatch[2] && looksLikeVerbToken(pronounMatch[2], auxiliaryVerbs)) {
        return { rule: "pronoun-continuation", match: pronounMatch[0], line: trimmed };
      }
      pronounWindow = Math.max(0, pronounWindow - 1);
    }

    if (
      lowerVariants.some((variant) => {
        const escaped = escapeRegex(variant);
        return new RegExp(`\\b${escaped}\\b`, "i").test(candidate);
      })
    ) {
      pronounWindow = 2;
    }

    const youMatch = candidate.match(/^You\s+([a-zA-Z']{2,})\b/);
    if (youMatch && youMatch[1] && looksLikeVerbToken(youMatch[1], auxiliaryVerbs)) {
      return { rule: "second-person", match: youMatch[0], line: trimmed };
    }
  }

  for (const variant of variants) {
    const escaped = escapeRegex(variant);
    const headerPattern = new RegExp(`^\\s*${escaped}\\s*(?::|[-—])\\s*`, "im");
    if (headerPattern.test(text)) {
      return { rule: "speaker-header", match: variant };
    }
  }

  const blocks = parseSceneBlocks(text);
  if (
    blocks.some((block) => {
      const label = block.speakerLabel?.trim();
      if (!label) {
        return false;
      }
      return lowerVariants.includes(label.toLowerCase());
    })
  ) {
    return { rule: "scene-block-speaker", match: playerName };
  }

  const punctuationAfterName = new Set([",", "—", "-", ":", "?", "!"]);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const speakerLabel = getSpeakerLabelIfAny(trimmed);
    if (speakerLabel && !lowerVariants.includes(speakerLabel.toLowerCase())) {
      continue;
    }

    const candidate = stripQuotedSegments(trimmed);
    if (!candidate) {
      continue;
    }

    for (const variant of variants) {
      const escaped = escapeRegex(variant);
      const prefixPattern = new RegExp(`^\\*?\\s*${escaped}(\\b|\\s)`, "i");
      const prefixMatch = candidate.match(prefixPattern);
      if (!prefixMatch) {
        const inlineSubjectPattern = new RegExp(`\\b${escaped}\\b\\s+([a-zA-Z']{2,})\\b`, "i");
        const inlineMatch = candidate.match(inlineSubjectPattern);
        if (!inlineMatch) {
          continue;
        }

        const afterToken = candidate.slice((inlineMatch.index ?? 0) + (inlineMatch[0]?.length ?? 0));
        const nextChar = afterToken.trimStart()[0] ?? "";
        if (punctuationAfterName.has(nextChar)) {
          continue;
        }

        const token = inlineMatch[1]?.toLowerCase() ?? "";
        const looksLikeVerb = looksLikeVerbToken(token, auxiliaryVerbs);

        if (looksLikeVerb) {
          return { rule: "inline-subject-verb", match: inlineMatch[0], line: trimmed };
        }

        continue;
      }

      const after = candidate.slice(prefixMatch[0].length);
      const nextChar = after.trimStart()[0] ?? "";
      if (punctuationAfterName.has(nextChar)) {
        continue;
      }

      const verbMatch = after.trimStart().match(/^([a-zA-Z']{2,})\b/);
      if (!verbMatch) {
        continue;
      }

      const token = verbMatch[1]?.toLowerCase() ?? "";
      const looksLikeVerb = looksLikeVerbToken(token, auxiliaryVerbs);

      if (looksLikeVerb) {
        return { rule: "line-start-subject-verb", match: `${variant} ${verbMatch[1]}`, line: trimmed };
      }
    }
  }

  return null;
}

export function detectPlayerCharacterAuthorshipViolation({
  playerName,
  text,
}: {
  playerName: string;
  text: string;
}) {
  return Boolean(getPlayerCharacterAuthorshipViolation({ playerName, text }));
}
