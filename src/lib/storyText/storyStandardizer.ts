import {
  normalizeQuotedDialogueContent,
  splitDialogueQuoteRegions,
} from "./dialogueQuoteRegions";
import { parseActionSegments } from "./parseActionSegments";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function stripWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed.replace(/^"+/, "").replace(/"+$/, "").trim();
}

function stripWrappingAsterisks(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("*") && trimmed.endsWith("*")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed.replace(/^\*+/, "").replace(/\*+$/, "").trim();
}

function removeStrayAsterisks(value: string) {
  return value.replace(/\*/g, "").trim();
}

function getPlayerNameVariants(playerName: string | null | undefined) {
  const trimmed = playerName?.trim() ?? "";
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
  return Array.from(variants);
}

function looksLikeVerbToken(token: string) {
  const lower = token.toLowerCase();
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
    "smile",
    "smiled",
    "glance",
    "glanced",
  ]);

  return (
    auxiliaryVerbs.has(lower) ||
    irregularVerbs.has(lower) ||
    lower.endsWith("ed") ||
    lower.endsWith("ing") ||
    lower.endsWith("s")
  );
}

function looksLikeDialogue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith('"')) {
    return true;
  }
  if (/[!?]/.test(trimmed)) {
    return true;
  }
  if (
    /\b(I|you|we|me|my|your|our|I'm|you're|we're|don't|can't|won't|didn't|isn't|aren't|wasn't|weren't)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/\.\.\.$/.test(trimmed)) {
    return true;
  }
  return false;
}

import { isDeniedSpeakerLabel } from "../relationshipIndex";
import { looksLikeNarrationContinuation } from "./parseSceneBlocks";

// Words that start sentences but are never character names (shared with parseSceneBlocks).
const NOT_A_SPEAKER = new Set([
  "He", "She", "They", "It", "We", "You", "I", "His", "Her", "Their", "Its",
  "The", "A", "An", "And", "But", "Or", "So", "Then", "Now",
  "Later", "Meanwhile", "Outside", "Inside", "Suddenly", "Time",
  "Note", "Warning", "However", "Therefore", "Eventually", "Finally",
  "Scene", "Chapter", "Part", "First", "Next",
]);

function isLikelySpeakerLabel(label: string): boolean {
  if (!label || label.includes(",")) return false;
  if (isDeniedSpeakerLabel(label)) return false;
  const words = label.trim().split(/\s+/);
  if (words.length > 4) return false;
  // Every word must start with uppercase OR be a number ("Paramedic 1", "Guard 2")
  if (!words.every((w) => /^[A-Z]/.test(w) || /^\d/.test(w))) return false;
  if (words.length === 1 && NOT_A_SPEAKER.has(words[0]!)) return false;
  return true;
}

function isSpeakerHeaderOnly(line: string) {
  const match = line.match(/^([^\n:]{1,48})(:|\s[-—])\s*$/);
  if (!match) {
    return null;
  }
  const label = match[1]?.trim();
  if (!label || !isLikelySpeakerLabel(label)) {
    return null;
  }
  return label;
}

function parseInlineSpeakerLine(line: string) {
  const match = line.match(/^([^\n:]{1,48})(:|\s[-—])\s+(.+)\s*$/);
  if (!match) {
    return null;
  }
  const label = match[1]?.trim();
  const remainder = match[3]?.trim();
  if (!label || !remainder || !isLikelySpeakerLabel(label)) {
    return null;
  }
  if (looksLikeNarrationContinuation(remainder)) {
    return null;
  }
  return { speakerLabel: label, text: remainder };
}

function sanitizeDialogueContent(value: string) {
  const unwrapped = stripWrappingQuotes(value);
  const normalized = normalizeWhitespace(unwrapped);
  return normalized.replace(/"/g, "'").trim();
}

function sanitizeActionContent(value: string) {
  const unwrapped = stripWrappingAsterisks(value);
  const withoutQuotes = unwrapped.replace(/"/g, "'").trim();
  const normalized = normalizeWhitespace(withoutQuotes);
  return removeStrayAsterisks(normalized);
}

function wrapAction(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return `*${trimmed}*`;
}

function wrapDialogue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return `"${trimmed}"`;
}

const PSEUDO_SPEAKER_COLON_FRAGMENT =
  /^[A-Za-z][a-zA-Z''-]*(?:\s+[A-Za-z][a-zA-Z''-]*){0,3}:\s*$/;

function isPseudoSpeakerColonFragment(value: string) {
  return PSEUDO_SPEAKER_COLON_FRAGMENT.test(value.trim());
}


export type StoryFormatIssue = {
  code: string;
  detail: string;
  line?: string;
};

function validateStandardText(text: string): StoryFormatIssue[] {
  const issues: StoryFormatIssue[] = [];
  const lines = normalizeNewlines(text).split("\n");

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      continue;
    }

    const speakerMatch = trimmed.match(/^([^:\n]{1,48}):\s*(.*)$/);
    if (speakerMatch) {
      const remainder = speakerMatch[2] ?? "";
      if (!remainder.trim()) {
        issues.push({ code: "empty-speaker-line", detail: "Speaker line has no content.", line: trimmed });
        continue;
      }

      const removedActions = remainder.replace(/\*[^*]+\*/g, "");
      const removedDialogue = removedActions.replace(/"[^"]+"/g, "");
      const leftover = removedDialogue.trim();
      if (leftover) {
        issues.push({
          code: "unformatted-speaker-text",
          detail: "Speaker line contains text outside action/dialogue formatting.",
          line: trimmed,
        });
      }

      const strayAsterisks = removedActions.includes("*") || remainder.includes("**");
      if (strayAsterisks) {
        issues.push({ code: "unbalanced-asterisks", detail: "Speaker line has stray '*'.", line: trimmed });
      }

      const strayQuotes = removedDialogue.includes('"');
      if (strayQuotes) {
        issues.push({ code: "unbalanced-quotes", detail: "Speaker line has stray '\"'.", line: trimmed });
      }

      continue;
    }

    if (trimmed.includes("*") || trimmed.includes("**")) {
      issues.push({
        code: "narration-has-asterisks",
        detail: "Narration must not contain action markers (*...*).",
        line: trimmed,
      });
    }
    if (trimmed.includes('"')) {
      issues.push({
        code: "narration-has-quotes",
        detail: "Narration must not contain dialogue quotes.",
        line: trimmed,
      });
    }
  }

  return issues;
}

export function standardizeAssistantStoryText(args: {
  text: string;
  playerName?: string | null;
}) {
  const lines = normalizeNewlines(args.text).split("\n");
  const output: string[] = [];
  const issues: StoryFormatIssue[] = [];

  const playerVariants = getPlayerNameVariants(args.playerName).map((value) => value.toLowerCase());
  function isPlayerLabel(label: string) {
    return playerVariants.includes(label.trim().toLowerCase());
  }

  const stopNames = new Set([
    "He", "She", "They", "It", "We", "You", "I", "His", "Her", "Their", "Its",
    "The", "A", "An", "And", "But", "Or", "So", "Then", "Now",
    "Later", "Meanwhile", "Outside", "Inside", "Suddenly", "Time",
    "Note", "Warning", "However", "Therefore", "Eventually", "Finally",
    "Scene", "Chapter", "Part", "First", "Next",
  ]);

  let currentSpeaker: string | null = null;
  let speakerSegments: string[] = [];

  function collapseAdjacentDialogueFragments(value: string) {
    let next = value;
    while (true) {
      const updated = next.replace(/"([^"]+)"\s*"([^"]+)"/g, (_match, left, right) => {
        const merged = normalizeWhitespace(`${left ?? ""} ${right ?? ""}`);
        return `"${merged}"`;
      });
      if (updated === next) {
        break;
      }
      next = updated;
    }
    return next;
  }

  function looksLikeMultiActorAction(action: string) {
    const normalized = normalizeWhitespace(action);
    const lower = normalized.toLowerCase();
    if (!lower) {
      return false;
    }

    if (
      lower.startsWith("everyone ") ||
      lower.startsWith("they ") ||
      lower.startsWith("all ") ||
      lower.startsWith("both ")
    ) {
      return true;
    }

    if (lower.startsWith("the ")) {
      if (
        /\b(officers|senior officers|crew|team|staff|group|everyone|all of them|both of them)\b/i.test(
          normalized,
        )
      ) {
        return true;
      }
    }

    if (
      /\b(senior officers|the officers|the crew|the command staff|everyone|all of them|both of them)\b/i.test(
        normalized,
      )
    ) {
      return true;
    }

    return false;
  }

  function flushSpeaker() {
    if (!currentSpeaker) {
      return;
    }
    const combined = collapseAdjacentDialogueFragments(
      speakerSegments.join(" ").replace(/\s+/g, " ").trim(),
    );
    if (combined) {
      output.push(`${currentSpeaker}: ${combined}`.trim());
    }
    currentSpeaker = null;
    speakerSegments = [];
  }

  function pushNarration(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }
    const cleaned = sanitizeActionContent(trimmed);
    if (!cleaned) {
      return;
    }
    output.push(cleaned);
  }

  function pushSpeakerAction(rawAction: string) {
    const action = sanitizeActionContent(rawAction);
    if (!action) {
      return;
    }

    if (looksLikeMultiActorAction(action)) {
      flushSpeaker();
      pushNarration(action);
      return;
    }

    speakerSegments.push(wrapAction(action));
  }

  function pushSpeakerDialogue(rawDialogue: string) {
    const quotedMatches = Array.from(rawDialogue.matchAll(/"([^"]+)"/g))
      .map((match) => match[1] ?? "")
      .map((value) => value.trim())
      .filter(Boolean);
    const dialogue = sanitizeDialogueContent(
      quotedMatches.length ? quotedMatches.join(" ") : rawDialogue,
    );
    if (!dialogue) {
      return;
    }
    speakerSegments.push(wrapDialogue(dialogue));
  }

  function pushUnquotedSpeakerContent(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }

    if (isPseudoSpeakerColonFragment(trimmed)) {
      return;
    }

    const leadingAction = trimmed.match(/^(\*[^*]{2,}\*)\s*(.*)$/);
    if (leadingAction) {
      const action = sanitizeActionContent(leadingAction[1] ?? "");
      const tail = (leadingAction[2] ?? "").trim();
      if (action) {
        pushSpeakerAction(action);
      }
      if (tail) {
        pushUnquotedSpeakerContent(tail);
      }
      return;
    }

    for (const segment of parseActionSegments(trimmed)) {
      if (segment.type === "action") {
        pushSpeakerAction(segment.text);
        continue;
      }

      const text = segment.text.trim();
      if (!text || isPseudoSpeakerColonFragment(text)) {
        continue;
      }

      if (looksLikeDialogue(text)) {
        pushSpeakerDialogue(text);
      } else {
        pushSpeakerAction(text);
      }
    }
  }

  function pushSpeakerContent(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }

    for (const region of splitDialogueQuoteRegions(trimmed)) {
      if (region.kind === "quoted") {
        const dialogue = sanitizeDialogueContent(normalizeQuotedDialogueContent(region.text));
        if (dialogue) {
          speakerSegments.push(wrapDialogue(dialogue));
        }
        continue;
      }

      pushUnquotedSpeakerContent(region.text);
    }
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed === "---" || trimmed === "***") {
      flushSpeaker();
      if (output.length && output[output.length - 1] !== "") {
        output.push("");
      }
      continue;
    }

    if (!trimmed) {
      if (currentSpeaker) {
        if (speakerSegments.length > 0) {
          flushSpeaker();
        }
      }
      if (output.length && output[output.length - 1] !== "") {
        output.push("");
      }
      continue;
    }

    const headerOnly = isSpeakerHeaderOnly(trimmed);
    if (headerOnly) {
      if (currentSpeaker && currentSpeaker === headerOnly) {
        continue;
      }
      flushSpeaker();
      currentSpeaker = headerOnly;
      speakerSegments = [];
      continue;
    }

    const inlineSpeaker = parseInlineSpeakerLine(trimmed);
    if (inlineSpeaker) {
      if (currentSpeaker && currentSpeaker === inlineSpeaker.speakerLabel) {
        pushSpeakerContent(inlineSpeaker.text);
        continue;
      }
      flushSpeaker();
      currentSpeaker = inlineSpeaker.speakerLabel;
      speakerSegments = [];
      pushSpeakerContent(inlineSpeaker.text);
      continue;
    }

    if (currentSpeaker) {
      pushSpeakerContent(trimmed);
      continue;
    }

    const thirdPersonMatch = trimmed.match(
      /^([A-Z][a-zA-Z']{1,30}(?:\s+[A-Z][a-zA-Z']{1,30}){0,2})\s+([a-zA-Z']{2,})\b(.+)?$/,
    );
    if (thirdPersonMatch) {
      const label = thirdPersonMatch[1]?.trim() ?? "";
      const token = thirdPersonMatch[2]?.trim() ?? "";
      if (label && !stopNames.has(label) && !isPlayerLabel(label) && looksLikeVerbToken(token)) {
        flushSpeaker();
        currentSpeaker = label;
        speakerSegments = [];
        pushSpeakerContent(trimmed.slice(label.length).trimStart());
        continue;
      }
    }

    const standaloneWrappedLine = trimmed.startsWith("*") && trimmed.endsWith("*");
    if (standaloneWrappedLine) {
      const unwrapped = stripWrappingAsterisks(trimmed);
      const wrappedPronounAction = unwrapped.match(/^(He|She|They)\s+([a-zA-Z']{2,})\b/);
      if (wrappedPronounAction && looksLikeVerbToken(wrappedPronounAction[2] ?? "")) {
        issues.push({
          code: "missing-speaker-label",
          detail: "Action appears without a speaker label.",
          line: trimmed,
        });
      }
      pushNarration(unwrapped);
      continue;
    }

    const orphanedPronoun = trimmed.match(/^(He|She|They)\s+([a-zA-Z']{2,})\b/);
    if (orphanedPronoun && looksLikeVerbToken(orphanedPronoun[2] ?? "")) {
      issues.push({
        code: "missing-speaker-label",
        detail: "Pronoun action appears without a speaker label.",
        line: trimmed,
      });
      pushNarration(trimmed);
      continue;
    }

    if (trimmed.startsWith('"') || looksLikeDialogue(trimmed)) {
      issues.push({
        code: "missing-speaker-label",
        detail: "Dialogue/action appears without a speaker label.",
        line: trimmed,
      });
      pushNarration(stripWrappingQuotes(trimmed));
      continue;
    }

    pushNarration(trimmed);
  }

  flushSpeaker();

  const standardized = output
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const validationIssues = validateStandardText(standardized);
  const allIssues = [...issues, ...validationIssues];

  return {
    text: standardized,
    valid: allIssues.length === 0,
    issues: allIssues,
  };
}
