const PRONOUN_PSEUDO_SPEAKERS = new Set([
  "She", "Her", "He", "His", "Him", "They", "Their", "Them", "It", "Its",
]);

const VALID_INNER_LABEL_RE = /^[A-Z][a-zA-Z0-9 ''\-\.]{0,59}$/;

function fixEncodingGlitches(text: string): string {
  // Rosa?s → Rosa's (encoding corruption where ' became ?)
  return text.replace(/([a-zA-Z])\?([a-zA-Z])/g, "$1'$2");
}

function fixMalformedQuoteEndings(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      // If line ends with punctuation + * and has an unclosed double-quote,
      // the * is a formatting artefact that should have been a closing ".
      // e.g. Rosa: *smirks.* "Nice try?*  →  Rosa: *smirks.* "Nice try?"
      if (/[?!.]\*$/.test(trimmed)) {
        const quoteCount = (trimmed.match(/"/g) ?? []).length;
        if (quoteCount % 2 !== 0) {
          return line.trimEnd().slice(0, -1) + '"';
        }
      }
      return line;
    })
    .join("\n");
}

function stripItalicDelimiters(s: string): string {
  return s.replace(/^\*+|\*+$/g, "").replace(/^_+|_+$/g, "").trim();
}

function ensureEndPunct(s: string): string {
  return s && /[.!?,]$/.test(s) ? s : `${s}.`;
}

function fixLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return line;

  // Narrator: She: *action* → Narrator: *She action.*
  const narratorPronounMatch = trimmed.match(
    /^Narrator:\s*(She|Her|He|His|Him|They|Their|Them|It|Its):\s*(.*)$/,
  );
  if (narratorPronounMatch) {
    const pronoun = narratorPronounMatch[1];
    const content = stripItalicDelimiters(narratorPronounMatch[2].trim());
    return `Narrator: *${ensureEndPunct(`${pronoun} ${content}`)}*`;
  }

  // She: *action* → Narrator: *She action.*
  const pronounMatch = trimmed.match(
    /^(She|Her|He|His|Him|They|Their|Them|It|Its):\s*(.*)$/,
  );
  if (pronounMatch) {
    const pronoun = pronounMatch[1];
    const content = stripItalicDelimiters(pronounMatch[2].trim());
    return `Narrator: *${ensureEndPunct(`${pronoun} ${content}`)}*`;
  }

  // Narrator: Narrator: text → Narrator: text
  const doubleNarratorMatch = trimmed.match(/^Narrator:\s*Narrator:\s*(.*)$/);
  if (doubleNarratorMatch) {
    return `Narrator: ${doubleNarratorMatch[1].trim()}`;
  }

  // Narrator: Jason: text → Jason: text  (wrapped character label)
  const wrappedMatch = trimmed.match(/^Narrator:\s*([A-Z][^:\n]{0,59}):\s*(.*)$/);
  if (wrappedMatch) {
    const innerLabel = wrappedMatch[1].trim();
    if (
      !PRONOUN_PSEUDO_SPEAKERS.has(innerLabel) &&
      VALID_INNER_LABEL_RE.test(innerLabel)
    ) {
      return `${innerLabel}: ${wrappedMatch[2].trim()}`;
    }
  }

  return line;
}

function fixSpeakerLabels(text: string): string {
  return text.split("\n").map(fixLine).join("\n");
}

export function cleanTextForExport(text: string): string {
  if (!text) return text;
  let result = fixEncodingGlitches(text);
  result = fixMalformedQuoteEndings(result);
  result = fixSpeakerLabels(result);
  return result;
}

export function cleanMessagesForExport<
  T extends { role: string; content: string },
>(messages: T[]): T[] {
  return messages.map((msg) => {
    if (msg.role !== "assistant") return msg;
    const cleaned = cleanTextForExport(msg.content);
    if (cleaned === msg.content) return msg;
    return { ...msg, content: cleaned };
  });
}
