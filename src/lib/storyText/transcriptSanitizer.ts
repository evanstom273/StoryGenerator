import type { StoryMessage } from "../../types/models";

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

  const raw = normalizeNewlines(text);
  const blocks = raw.split(/\n{2,}/g);
  const kept: string[] = [];
  let removed = false;

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

function normalizeTranscriptWhitespace(text: string) {
  const normalized = normalizeNewlines(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized;
}

export function sanitizeAssistantTranscript(args: {
  text: string;
  latestUserMessage?: string | null;
  playerName?: string | null;
}) {
  const echoed = removeEchoBlocks(args.text, args.latestUserMessage);
  const narratorStripped = stripNarratorHeaders(echoed.text);
  const markdownStripped = stripMarkdownArtifacts(narratorStripped.text);
  const normalizedActions = normalizeThirdPersonActions(markdownStripped.text, args.playerName);
  const emphasisStripped = stripInlineAsteriskEmphasis(normalizedActions);
  const normalized = normalizeTranscriptWhitespace(emphasisStripped);

  return {
    text: normalized,
    removedEcho: echoed.removed,
    removedNarratorLabels: narratorStripped.changed,
    removedMarkdownArtifacts: markdownStripped.changed,
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

  return sanitizeAssistantTranscript({
    text: args.message.content,
    latestUserMessage: args.latestUserMessage,
    playerName: args.playerName,
  }).text;
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
