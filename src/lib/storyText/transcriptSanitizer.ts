import type { StoryMessage } from "../../types/models";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n");
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
}) {
  const echoed = removeEchoBlocks(args.text, args.latestUserMessage);
  const narratorStripped = stripNarratorHeaders(echoed.text);
  const markdownStripped = stripMarkdownArtifacts(narratorStripped.text);
  const normalized = normalizeTranscriptWhitespace(markdownStripped.text);

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
}) {
  if (args.message.role !== "assistant") {
    return args.message.content;
  }

  return sanitizeAssistantTranscript({
    text: args.message.content,
    latestUserMessage: args.latestUserMessage,
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

