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

function isSpeakerHeaderOnly(line: string) {
  const match = line.match(/^([^\n:]{1,48})(:|\s[-—])\s*$/);
  if (!match) {
    return null;
  }
  const label = match[1]?.trim();
  if (!label || label === "Time") {
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
  if (!label || !remainder || label === "Time") {
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

function mergePhrases(parts: string[]) {
  const items = parts.map((value) => value.trim()).filter(Boolean);
  if (!items.length) {
    return "";
  }
  if (items.length === 1) {
    return items[0] ?? "";
  }
  if (items.length === 2) {
    const left = (items[0] ?? "").replace(/[.]\s*$/g, "");
    const right = items[1] ?? "";
    return `${left}, and ${right}`.trim();
  }
  const leading = items.slice(0, -1);
  const last = items[items.length - 1] ?? "";
  return `${leading.join(", ")}, and ${last}`.trim();
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
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const speakerMatch = line.match(/^([^:\n]{1,48}):\s*(.*)$/);
    if (speakerMatch) {
      const remainder = speakerMatch[2] ?? "";
      if (!remainder.trim()) {
        issues.push({ code: "empty-speaker-line", detail: "Speaker line has no content.", line });
        continue;
      }

      const removedActions = remainder.replace(/\*[^*]+\*/g, "");
      const removedDialogue = removedActions.replace(/"[^"]+"/g, "");
      const leftover = removedDialogue.trim();
      if (leftover) {
        issues.push({
          code: "unformatted-speaker-text",
          detail: "Speaker line contains text outside action/dialogue formatting.",
          line,
        });
      }

      const strayAsterisks = removedActions.includes("*") || remainder.includes("**");
      if (strayAsterisks) {
        issues.push({ code: "unbalanced-asterisks", detail: "Speaker line has stray '*'.", line });
      }

      const strayQuotes = removedDialogue.includes('"');
      if (strayQuotes) {
        issues.push({ code: "unbalanced-quotes", detail: "Speaker line has stray '\"'.", line });
      }

      continue;
    }

    if (!(line.startsWith("*") && line.endsWith("*") && line.length > 2)) {
      issues.push({
        code: "narration-not-italic",
        detail: "Narration line must be stored as a full-line action span.",
        line,
      });
      continue;
    }

    const inner = line.slice(1, -1);
    if (inner.includes("*")) {
      issues.push({
        code: "unbalanced-asterisks",
        detail: "Narration line contains stray '*'.",
        line,
      });
    }
    if (inner.includes('"')) {
      issues.push({
        code: "unbalanced-quotes",
        detail: "Narration line contains stray '\"'.",
        line,
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

  let currentSpeaker: string | null = null;
  let actionParts: string[] = [];
  let dialogueParts: string[] = [];
  let deferredNarration: string[] = [];

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

    const mergedAction = mergePhrases(actionParts);
    const mergedDialogue = mergePhrases(dialogueParts);

    const actionText = mergedAction ? wrapAction(mergedAction) : "";
    const dialogueText = mergedDialogue ? wrapDialogue(mergedDialogue) : "";

    const combined = [actionText, dialogueText].filter(Boolean).join(" ").trim();
    if (combined) {
      output.push(`${currentSpeaker}: ${combined}`.trim());
    }

    currentSpeaker = null;
    actionParts = [];
    dialogueParts = [];

    if (deferredNarration.length) {
      const combinedNarration = mergePhrases(deferredNarration);
      if (combinedNarration) {
        output.push(wrapAction(combinedNarration));
      }
      deferredNarration = [];
    }
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
    output.push(wrapAction(cleaned));
  }

  function pushSpeakerContent(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }

    const firstQuoteIndex = trimmed.indexOf('"');
    if (firstQuoteIndex !== -1) {
      const beforeQuote = trimmed.slice(0, firstQuoteIndex).trim();
      const afterQuote = trimmed.slice(firstQuoteIndex).trim();
      const action = beforeQuote ? sanitizeActionContent(beforeQuote) : "";
      const dialogue = afterQuote ? sanitizeDialogueContent(afterQuote) : "";
      if (action) {
        if (looksLikeMultiActorAction(action)) {
          deferredNarration.push(action);
        } else {
          actionParts.push(action);
        }
      }
      if (dialogue) {
        dialogueParts.push(dialogue);
      }
      return;
    }

    const leadingAction = trimmed.match(/^(\*[^*]{2,}\*)\s*(.*)$/);
    if (leadingAction) {
      const action = sanitizeActionContent(leadingAction[1] ?? "");
      const tail = (leadingAction[2] ?? "").trim();
      if (action) {
        if (looksLikeMultiActorAction(action)) {
          deferredNarration.push(action);
        } else {
          actionParts.push(action);
        }
      }
      if (tail) {
        if (looksLikeDialogue(tail)) {
          dialogueParts.push(sanitizeDialogueContent(tail));
        } else {
          const tailAction = sanitizeActionContent(tail);
          if (tailAction) {
            if (looksLikeMultiActorAction(tailAction)) {
              deferredNarration.push(tailAction);
            } else {
              actionParts.push(tailAction);
            }
          }
        }
      }
      return;
    }

    if (trimmed.includes("*")) {
      const cleaned = sanitizeActionContent(trimmed);
      if (cleaned) {
        if (looksLikeMultiActorAction(cleaned)) {
          deferredNarration.push(cleaned);
        } else {
          actionParts.push(cleaned);
        }
      }
      return;
    }

    if (looksLikeDialogue(trimmed)) {
      dialogueParts.push(sanitizeDialogueContent(trimmed));
      return;
    }

    const cleaned = sanitizeActionContent(trimmed);
    if (cleaned) {
      if (looksLikeMultiActorAction(cleaned)) {
        deferredNarration.push(cleaned);
      } else {
        actionParts.push(cleaned);
      }
    }
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushSpeaker();
      if (output.length && output[output.length - 1] !== "") {
        output.push("");
      }
      continue;
    }

    const headerOnly = isSpeakerHeaderOnly(trimmed);
    if (headerOnly) {
      flushSpeaker();
      currentSpeaker = headerOnly;
      continue;
    }

    const inlineSpeaker = parseInlineSpeakerLine(trimmed);
    if (inlineSpeaker) {
      flushSpeaker();
      currentSpeaker = inlineSpeaker.speakerLabel;
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
        pushSpeakerContent(trimmed.slice(label.length).trimStart());
        continue;
      }
    }

    const orphanedAction =
      trimmed.startsWith("*") &&
      trimmed.endsWith("*") &&
      /\b(He|She|They)\b/.test(stripWrappingAsterisks(trimmed));
    if (orphanedAction) {
      issues.push({
        code: "missing-speaker-label",
        detail: "Action appears without a speaker label.",
        line: trimmed,
      });
      pushNarration(stripWrappingAsterisks(trimmed));
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
