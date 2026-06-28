import type { StoryMessage } from "../../types/models";
import { standardizeAssistantStoryText } from "./storyStandardizer";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function isSpeakerHeader(line: string) {
  const match = line.match(/^([^\n:]{1,48})(:|\s[-—])\s*$/);
  if (!match) {
    return null;
  }

  const label = match[1]?.trim();
  return label ? label : null;
}

function parseInlineSpeakerLine(line: string) {
  const match = line.match(/^([^\n:]{1,48})(:|\s[-—])\s+(.+)\s*$/);
  if (!match) {
    return null;
  }

  const label = match[1]?.trim();
  const remainder = match[3]?.trim();

  if (!label || !remainder) {
    return null;
  }

  if (label === "Time") {
    return null;
  }

  return { speakerLabel: label, text: remainder };
}

function wrapAsAction(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("*") && trimmed.endsWith("*") && trimmed.length > 2) {
    return trimmed;
  }
  return `*${trimmed}*`;
}

function ensureQuoted(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 2) {
    return trimmed;
  }
  const unwrapped = trimmed.replace(/^"+/, "").replace(/"+$/, "").trim();
  return `"${unwrapped}"`;
}

function looksLikeDialogue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("*")) {
    return false;
  }
  if (/[!?]/.test(trimmed)) {
    return true;
  }
  if (/\b(I|you|we|me|my|your|our|I'm|you're|we're|don't|can't|won't|didn't|isn't)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

function formatInlineSpeakerText(remainder: string) {
  const trimmed = remainder.trim();
  if (!trimmed) {
    return "";
  }

  const quoteIndex = trimmed.indexOf('"');
  if (quoteIndex === -1) {
    const leadingAction = trimmed.match(/^(\*[^*]{2,}\*)\s+(.+)$/);
    if (leadingAction) {
      const action = leadingAction[1]?.trim() ?? "";
      const tail = leadingAction[2]?.trim() ?? "";
      if (tail) {
        return `${action} ${looksLikeDialogue(tail) ? ensureQuoted(tail) : tail}`.trim();
      }
      return action;
    }

    if (trimmed.includes("*")) {
      return trimmed;
    }

    if (looksLikeDialogue(trimmed)) {
      return ensureQuoted(trimmed);
    }

    return wrapAsAction(trimmed);
  }

  const actionPart = trimmed.slice(0, quoteIndex).trim();
  const dialoguePart = trimmed.slice(quoteIndex).trim();
  const parts: string[] = [];
  if (actionPart) {
    parts.push(wrapAsAction(actionPart));
  }
  if (dialoguePart) {
    parts.push(dialoguePart);
  }
  return parts.join(" ").trim() || trimmed;
}

function normalizeThirdPersonActions(text: string, playerName: string | null | undefined) {
  const stopNames = new Set([
    "The",
    "A",
    "An",
    "And",
    "But",
    "Or",
    "So",
    "Then",
    "Now",
    "Later",
    "Meanwhile",
    "Outside",
    "Inside",
    "Suddenly",
    "Time",
  ]);

  const playerVariants = getPlayerNameVariants(playerName).map((value) => value.toLowerCase());
  function isPlayerLabel(label: string) {
    return playerVariants.includes(label.trim().toLowerCase());
  }

  const lines = normalizeNewlines(text).split("\n");
  const output: string[] = [];
  let currentSpeaker: string | undefined;
  let pendingSpeaker: string | undefined;
  let pendingParts: string[] = [];

  function flushPending() {
    if (!pendingSpeaker) {
      return;
    }

    const combined = pendingParts.join(" ").replace(/\s+/g, " ").trim();
    if (combined) {
      output.push(`${pendingSpeaker}: ${formatInlineSpeakerText(combined)}`);
    } else {
      output.push(`${pendingSpeaker}:`);
    }

    currentSpeaker = pendingSpeaker;
    pendingSpeaker = undefined;
    pendingParts = [];
  }

  for (const rawLine of lines) {
    const line = rawLine ?? "";
    const trimmed = line.trim();

    const header = isSpeakerHeader(trimmed);
    if (header) {
      flushPending();
      pendingSpeaker = header;
      continue;
    }

    const inline = parseInlineSpeakerLine(trimmed);
    if (inline) {
      flushPending();
      currentSpeaker = inline.speakerLabel;
      output.push(`${inline.speakerLabel}: ${formatInlineSpeakerText(inline.text)}`);
      continue;
    }

    if (!trimmed) {
      if (pendingSpeaker) {
        flushPending();
        output.push("");
        continue;
      }
      output.push(line);
      continue;
    }

    if (playerVariants.length) {
      const youMatch = trimmed.match(/^You\s+([a-zA-Z']{2,})\b/);
      if (youMatch && looksLikeVerbToken(youMatch[1] ?? "")) {
        continue;
      }
    }

    if (pendingSpeaker) {
      pendingParts.push(trimmed);
      continue;
    }

    if (currentSpeaker && !isPlayerLabel(currentSpeaker)) {
      const escapedSpeaker = escapeRegex(currentSpeaker);
      const withinSpeakerPattern = new RegExp(`^${escapedSpeaker}\\b\\s+([a-zA-Z']{2,})\\b`, "i");
      const withinMatch = trimmed.match(withinSpeakerPattern);
      if (withinMatch && looksLikeVerbToken(withinMatch[1] ?? "")) {
        const remainder = trimmed.slice(currentSpeaker.length).trimStart();
        output.push(`${currentSpeaker}: ${formatInlineSpeakerText(remainder)}`);
        continue;
      }
    }

    const thirdPersonMatch = trimmed.match(
      /^([A-Z][a-zA-Z']{1,30}(?:\s+[A-Z][a-zA-Z']{1,30}){0,2})\s+([a-zA-Z']{2,})\b(.+)?$/,
    );
    if (thirdPersonMatch) {
      const label = thirdPersonMatch[1]?.trim() ?? "";
      const token = thirdPersonMatch[2]?.trim() ?? "";
      const remainder = trimmed.slice(label.length).trimStart();

      if (
        label &&
        !stopNames.has(label) &&
        !isPlayerLabel(label) &&
        looksLikeVerbToken(token)
      ) {
        output.push(`${label}: ${formatInlineSpeakerText(remainder)}`);
        currentSpeaker = label;
        continue;
      }
    }

    output.push(line);
  }

  flushPending();

  return output.join("\n");
}

function stripNarratorPrefixFromLine(line: string) {
  const trimmed = line.trim();
  const match = trimmed.match(/^Narrator\s*(?::|\s[-—])\s*(.*)$/);
  if (!match) {
    return { changed: false, line };
  }

  const remainder = match[1]?.trim() ?? "";
  return { changed: true, line: remainder };
}

function stripNarratorHeaders(text: string) {
  let changed = false;

  const lines = normalizeNewlines(text).split("\n");
  const nextLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      nextLines.push("");
      continue;
    }

    if (trimmed === "Narrator:" || trimmed === "Narrator -" || trimmed === "Narrator —") {
      changed = true;
      continue;
    }

    const collapsed = trimmed.replace(/\s+/g, " ");
    const collapseDouble = collapsed.match(
      /^Narrator\s*(?::|\s[-—])\s*Narrator\s*(?::|\s[-—])\s*(.*)$/,
    );
    if (collapseDouble) {
      changed = true;
      const remainder = collapseDouble[1]?.trim() ?? "";
      nextLines.push(remainder);
      continue;
    }

    const stripped = stripNarratorPrefixFromLine(line);
    if (stripped.changed) {
      changed = true;
      nextLines.push(stripped.line);
      continue;
    }

    nextLines.push(line);
  }

  return { text: nextLines.join("\n"), changed };
}

function stripMarkdownArtifacts(text: string) {
  let changed = false;
  let next = text;

  const patterns: Array<{ regex: RegExp; replace: string }> = [
    { regex: /\*\*([^\n*]{1,240})\*\*/g, replace: "$1" },
    { regex: /__([^\n_]{1,240})__/g, replace: "$1" },
  ];

  for (const { regex, replace } of patterns) {
    const updated = next.replace(regex, replace);
    if (updated !== next) {
      changed = true;
      next = updated;
    }
  }

  const italicPattern = /(^|[\s([{"'`])_([^\n_]{1,120})_(?=$|[\s)\]}",.'`!?])/g;
  const italicUpdated = next.replace(italicPattern, "$1$2");
  if (italicUpdated !== next) {
    changed = true;
    next = italicUpdated;
  }

  return { text: next, changed };
}

function stripSingleWordAsteriskEmphasis(value: string) {
  return value.replace(
    /(^|[^*])\*([A-Za-z][A-Za-z'’\-]{1,24})\*([^*]|$)/g,
    "$1$2$3",
  );
}

function stripInlineAsteriskEmphasis(text: string) {
  const lines = normalizeNewlines(text).split("\n");

  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return line;
    }

    if (trimmed.startsWith("*") && trimmed.endsWith("*") && trimmed.length > 2) {
      return line;
    }

    const speakerMatch = line.match(/^(\s*[^:\n]{1,48}:\s*)(.*)$/);
    if (!speakerMatch) {
      return stripSingleWordAsteriskEmphasis(line);
    }

    const prefix = speakerMatch[1] ?? "";
    const remainder = speakerMatch[2] ?? "";
    const quoteIndex = remainder.indexOf('"');
    if (quoteIndex === -1) {
      return prefix + remainder;
    }

    const beforeQuote = remainder.slice(0, quoteIndex);
    const afterQuote = remainder.slice(quoteIndex);
    return prefix + beforeQuote + stripSingleWordAsteriskEmphasis(afterQuote);
  });

  return updated.join("\n");
}

function stripQuoteWrapper(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function removeEchoBlocks(text: string, latestUserMessage: string | null | undefined) {
  const userNorm = latestUserMessage ? normalizeWhitespace(stripQuoteWrapper(latestUserMessage)) : "";

  if (!userNorm || userNorm.length < 12) {
    return { text, removed: false };
  }

  const userRaw = normalizeNewlines(latestUserMessage ?? "").trim();
  let raw = normalizeNewlines(text);
  let removed = false;

  if (userRaw.length >= 12) {
    const trimmedStart = raw.trimStart();
    if (trimmedStart.startsWith(userRaw)) {
      removed = true;
      raw = trimmedStart.slice(userRaw.length).replace(/^\s+/, "");
    }
  }

  const blocks = raw.split(/\n{2,}/g);
  const kept: string[] = [];

  for (const block of blocks) {
    const blockNorm = normalizeWhitespace(stripQuoteWrapper(block));
    if (!blockNorm) {
      kept.push(block);
      continue;
    }

    const matches =
      blockNorm === userNorm ||
      (blockNorm.includes(userNorm) && Math.abs(blockNorm.length - userNorm.length) < 16);

    if (matches) {
      removed = true;
      continue;
    }

    kept.push(block);
  }

  return { text: kept.join("\n\n"), removed };
}

// Names that should never be treated as speaker headers
const NOT_A_NAME_BARE = new Set([
  "He", "She", "They", "It", "We", "You", "I", "His", "Her", "Their", "Its",
  "The", "A", "An", "And", "But", "Or", "So", "Then", "Now",
  "Later", "Meanwhile", "Outside", "Inside", "Suddenly", "Time",
  "Note", "Warning", "However", "Therefore", "Eventually", "Finally",
  "Scene", "Chapter", "Part", "First", "Next", "Narrator",
]);

// Add colon to bare name lines (e.g. "Jake\n*action*" → "Jake:\n*action*")
function fixBareNameHeaders(text: string): string {
  const lines = normalizeNewlines(text).split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // A bare name: 1-4 capitalised words, no colon, no punctuation
    const nameMatch = trimmed.match(/^([A-Z][a-zA-Z']{1,30}(?:\s+[A-Z][a-zA-Z']{1,30}){0,3})$/);
    if (nameMatch) {
      const firstName = trimmed.split(/\s+/)[0] ?? "";
      if (!NOT_A_NAME_BARE.has(firstName) && !NOT_A_NAME_BARE.has(trimmed)) {
        // Look ahead: is the next non-empty line action or dialogue?
        let nextIdx = i + 1;
        while (nextIdx < lines.length && !(lines[nextIdx] ?? "").trim()) nextIdx++;
        const nextLine = (lines[nextIdx] ?? "").trim();
        if (nextLine.startsWith("*") || nextLine.startsWith('"') || nextLine.startsWith("“")) {
          result.push(trimmed + ":");
          continue;
        }
      }
    }

    result.push(line);
  }

  return result.join("\n");
}

// Casual speech-transition colons → em dash, and colon-before-action → em dash
const FILLER_COLON_RE = /\b(like|i mean|you know|and like|but like|so like|i guess|anyway|honestly|seriously|genuinely|basically|literally):\s+/gi;

function fixDialogueColons(text: string): string {
  const lines = normalizeNewlines(text).split("\n");
  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Skip pure action lines — they can legitimately contain colons
    if (trimmed.startsWith("*") && trimmed.endsWith("*")) return line;

    let result = line;

    // Colon immediately before an action beat → em dash (": *action*" → " — *action*")
    result = result.replace(/:\s*(\*[^*\n]+\*)/g, " — $1");

    // Casual filler words using colon as a transition
    result = result.replace(FILLER_COLON_RE, (_, word: string) => `${word} — `);

    return result;
  }).join("\n");
}

function normalizeTranscriptWhitespace(text: string) {
  const normalized = normalizeNewlines(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized;
}

function stripReasoningPreamble(text: string): string {
  const lines = text.split("\n");
  const cleaned: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();

    // Detect lines that are clearly model reasoning/meta-commentary
    const isReasoningLine =
      /^(User wants|Context:|Setting:|NPC:|Atmosphere:|PC:|Player Character[\s(])/i.test(trimmed) ||
      /->\s*[Cc]hecked/.test(trimmed) ||
      trimmed.endsWith("-> Checked") ||
      trimmed.endsWith("-> checked") ||
      // Bullet lines that contain reasoning markers
      (/^[*\-]\s/.test(trimmed) && /(->|Checked|No narrator|No PC|No repeat|No playing|No inventing)/i.test(trimmed));

    if (isReasoningLine) {
      continue;
    }

    // Backtick spans containing checklist content — strip the whole line
    if (/`[^`]*(->\s*[Cc]hecked|No narrator|No PC control)[^`]*`/.test(trimmed)) {
      continue;
    }

    cleaned.push(line);
  }

  const result = cleaned.join("\n").trim();
  return result.length > 0 ? result : text;
}

export function sanitizeAssistantTranscript(args: {
  text: string;
  latestUserMessage?: string | null;
  playerName?: string | null;
}) {
  const preambleStripped = stripReasoningPreamble(args.text);
  const echoed = removeEchoBlocks(preambleStripped, args.latestUserMessage);
  const narratorStripped = stripNarratorHeaders(echoed.text);
  const markdownStripped = stripMarkdownArtifacts(narratorStripped.text);
  const bareNamesFixed = fixBareNameHeaders(markdownStripped.text);
  const dialogueColonsFixed = fixDialogueColons(bareNamesFixed);
  const normalizedActions = normalizeThirdPersonActions(dialogueColonsFixed, args.playerName);
  const emphasisStripped = stripInlineAsteriskEmphasis(normalizedActions);
  const standardized = standardizeAssistantStoryText({
    text: emphasisStripped,
    playerName: args.playerName,
  });
  const normalized = normalizeTranscriptWhitespace(standardized.text);

  return {
    text: normalized,
    removedEcho: echoed.removed,
    removedNarratorLabels: narratorStripped.changed,
    removedMarkdownArtifacts: markdownStripped.changed,
    formatValid: standardized.valid,
    formatIssues: standardized.issues,
  };
}

export function sanitizeMessageForDisplay(args: {
  message: StoryMessage;
  latestUserMessage?: string | null;
  playerName?: string | null;
}) {
  if (args.message.role !== "assistant") {
    return args.message.content;
  }

  // Respect manual transcript fixes. If the user edited the assistant message,
  // render the saved text as-is instead of re-sanitising it back into a different shape.
  if (args.message.editedAt) {
    return capitalizeFirstLetter(normalizeTranscriptWhitespace(args.message.content));
  }

  return capitalizeFirstLetter(sanitizeAssistantTranscript({
    text: args.message.content,
    latestUserMessage: args.latestUserMessage,
    playerName: args.playerName,
  }).text);
}

function capitalizeFirstLetter(text: string): string {
  return text.replace(/^([^a-zA-Z]*)([a-zA-Z])/, (_, prefix, letter) => prefix + letter.toUpperCase());
}

function stripForOverlap(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/^[^:\n]{1,48}:\s*/gm, "")
    .replace(/["*]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokensForOverlap(value: string) {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "to",
    "of",
    "in",
    "on",
    "at",
    "for",
    "with",
    "as",
    "is",
    "was",
    "were",
    "are",
    "be",
    "been",
    "it",
    "its",
    "this",
    "that",
    "he",
    "she",
    "they",
    "we",
    "you",
    "i",
  ]);

  return stripForOverlap(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !stop.has(token));
}

function bigrams(tokens: string[]) {
  const grams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    grams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return grams;
}

function overlapRatio(a: string[], b: string[]) {
  if (!a.length || !b.length) {
    return 0;
  }
  const setA = new Set(a);
  let intersect = 0;
  for (const item of b) {
    if (setA.has(item)) {
      intersect += 1;
    }
  }
  return intersect / Math.min(a.length, b.length);
}

function extractAssistantLeadWindow(text: string) {
  const lines = normalizeNewlines(text).split("\n");
  const kept: string[] = [];
  let chars = 0;
  let nonEmpty = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (kept.length) {
        break;
      }
      continue;
    }

    kept.push(trimmed);
    chars += trimmed.length;
    nonEmpty += 1;
    if (chars >= 450 || nonEmpty >= 3) {
      break;
    }
  }

  return kept.join(" ");
}

export function detectSceneStateRenarration(args: {
  latestUserMessage: string;
  assistantText: string;
}) {
  const lead = extractAssistantLeadWindow(args.assistantText);
  if (!lead) {
    return { triggered: false as const, reason: "", snippet: "" };
  }

  const userTokens = tokensForOverlap(args.latestUserMessage);
  const leadTokens = tokensForOverlap(lead);
  const tokenOverlap = overlapRatio(userTokens, leadTokens);
  const bigramOverlap = overlapRatio(bigrams(userTokens), bigrams(leadTokens));

  const cuePattern =
    /\b(a few minutes later|minutes later|moments later|later|suddenly|immediately|the situation|it is immediately apparent|bursts into|arrives|arrival|chaos|is clear|was clear)\b/i;
  const hasCue = cuePattern.test(lead);

  const triggered = (hasCue && (tokenOverlap >= 0.55 || bigramOverlap >= 0.35)) || tokenOverlap >= 0.7;
  const reason = triggered
    ? `tokenOverlap=${tokenOverlap.toFixed(2)} bigramOverlap=${bigramOverlap.toFixed(2)} cue=${hasCue}`
    : "";

  return { triggered, reason, snippet: lead };
}

export function getNarrationSpeakerLabel(message: StoryMessage) {
  if (message.role !== "assistant") {
    return null;
  }

  if (message.speakerType === "narrator") {
    return null;
  }

  return message.speakerName?.trim() || null;
}
