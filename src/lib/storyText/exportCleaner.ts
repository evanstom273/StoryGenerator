import { isClockTimeColonAt, looksLikeClockTimeFragment } from "./clockTimeInProse";

const PRONOUN_PSEUDO_SPEAKERS = new Set([
  "She", "Her", "He", "His", "Him", "They", "Their", "Them", "It", "Its",
]);

const VALID_INNER_LABEL_RE = /^[A-Z][a-zA-Z0-9 ''\-\.]{0,59}$/;

const RESERVED_CHARACTER_SPEAKER_LABELS = new Set([
	"narrator",
	"director",
	"time",
	"system",
	"assistant",
]);

function isCharacterSpeakerHeaderLine(line: string) {
	const trimmed = line.trim();
	const match = trimmed.match(/^([A-Z][a-zA-Z''\-\. ]{1,48}):\s*$/);
	if (!match?.[1]) {
		return false;
	}
	return !RESERVED_CHARACTER_SPEAKER_LABELS.has(match[1].trim().toLowerCase());
}

function nextNonEmptyLineIndex(lines: string[], start: number) {
	for (let index = start; index < lines.length; index += 1) {
		if (lines[index]?.trim()) {
			return index;
		}
	}
	return -1;
}

/** Merge `Rebecca:\nNarrator: *action*` and `Rosa:\n*action*` split blocks onto one speaker line. */
export function repairSplitSpeakerHeaderBlocks(text: string) {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const output: string[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index] ?? "";
		if (!isCharacterSpeakerHeaderLine(line)) {
			output.push(line);
			index += 1;
			continue;
		}

		const speaker = line.trim().match(/^([A-Z][a-zA-Z''\-\. ]{1,48}):/)?.[1]?.trim() ?? "";
		const collected: string[] = [];
		let cursor = index + 1;

		while (cursor < lines.length) {
			const current = lines[cursor] ?? "";
			const trimmed = current.trim();

			if (!trimmed) {
				const nextIndex = nextNonEmptyLineIndex(lines, cursor + 1);
				if (nextIndex === -1) {
					collected.push(current);
					cursor += 1;
					continue;
				}
				const nextLine = lines[nextIndex]?.trim() ?? "";
				if (
					isCharacterSpeakerHeaderLine(lines[nextIndex] ?? "") ||
					(/^Narrator\s*(?::|\s[-—])/i.test(nextLine) && collected.length > 0)
				) {
					break;
				}
				collected.push(current);
				cursor += 1;
				continue;
			}

			if (isCharacterSpeakerHeaderLine(current)) {
				break;
			}

			const narratorMatch = trimmed.match(/^Narrator:\s*(.+)$/i);
			collected.push(narratorMatch?.[1]?.trim() ?? trimmed);
			cursor += 1;
		}

		if (!collected.length) {
			output.push(line);
			index += 1;
			continue;
		}

		output.push(`${speaker}: ${collected.map((part) => part.trim()).filter(Boolean).join(" ")}`);
		index = cursor;
	}

	return output.join("\n");
}

function looksLikeNamedCharacterNarration(content: string) {
  const trimmed = content.trim();
  const match = trimmed.match(/^([A-Z][a-zA-Z''-]{1,24})\s+([a-z][a-zA-Z''-]*)/);
  if (!match?.[1] || !match[2]) {
    return false;
  }

  if (PRONOUN_PSEUDO_SPEAKERS.has(match[1])) {
    return false;
  }

  const verb = match[2].toLowerCase();
  return (
    verb.endsWith("s") ||
    verb.endsWith("ed") ||
    verb.endsWith("ing") ||
    verb.endsWith("es")
  );
}

function formatPronounLedNarratorContent(pronoun: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return `Narrator: *${pronoun}.*`;
  }

  if (looksLikeNamedCharacterNarration(trimmed)) {
    return `Narrator: *${ensureEndPunct(trimmed)}*`;
  }

  return `Narrator: *${ensureEndPunct(`${pronoun} ${trimmed}`)}*`;
}

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

  // Rebecca: Narrator: *action* → Rebecca: *action*
  const embeddedNarratorMatch = trimmed.match(/^([A-Z][a-zA-Z''\-\. ]{1,48}):\s*Narrator:\s*(.*)$/);
  if (embeddedNarratorMatch?.[1] && embeddedNarratorMatch[2]) {
    return `${embeddedNarratorMatch[1].trim()}: ${embeddedNarratorMatch[2].trim()}`;
  }

  // He narrator: prose → Narrator: *prose.*
  const pronounNarratorMatch = trimmed.match(/^(He|She|They)\s+narrator\s*:\s*(.*)$/i);
  if (pronounNarratorMatch) {
    const content = stripItalicDelimiters(pronounNarratorMatch[2].trim());
    return content ? `Narrator: *${ensureEndPunct(content)}*` : "Narrator:";
  }

  // Narrator: She: *action* → Narrator: *She action.*
  const narratorPronounMatch = trimmed.match(
    /^Narrator:\s*(She|Her|He|His|Him|They|Their|Them|It|Its):\s*(.*)$/,
  );
  if (narratorPronounMatch) {
    const pronoun = narratorPronounMatch[1];
    const content = stripItalicDelimiters(narratorPronounMatch[2].trim());
    return formatPronounLedNarratorContent(pronoun, content);
  }

  // She: *action* → Narrator: *She action.* (or Narrator: *Mac bolts...* when naming a character)
  const pronounMatch = trimmed.match(
    /^(She|Her|He|His|Him|They|Their|Them|It|Its):\s*(.*)$/,
  );
  if (pronounMatch) {
    const pronoun = pronounMatch[1];
    const content = stripItalicDelimiters(pronounMatch[2].trim());
    return formatPronounLedNarratorContent(pronoun, content);
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
    const narratorPrefixLength = trimmed.match(/^Narrator:\s*/i)?.[0].length ?? 0;
    const innerColonIndex = trimmed.indexOf(":", narratorPrefixLength);
    const remainder = wrappedMatch[2].trim();
    const innerColonIsClockTime =
      innerColonIndex >= 0 && isClockTimeColonAt(trimmed, innerColonIndex);
    if (
      !innerColonIsClockTime &&
      !looksLikeClockTimeFragment(remainder) &&
      !PRONOUN_PSEUDO_SPEAKERS.has(innerLabel) &&
      VALID_INNER_LABEL_RE.test(innerLabel)
    ) {
      return `${innerLabel}: ${remainder}`;
    }
  }

  return line;
}

function fixSpeakerLabels(text: string): string {
  let next = repairSplitSpeakerHeaderBlocks(text);
  next = next.split("\n").map(fixLine).join("\n");
  return next;
}

/** Repair malformed speaker/narrator labels without export-only encoding cleanup. */
export function repairSpeakerLabelArtifacts(text: string): string {
  return fixSpeakerLabels(text);
}

export function cleanTextForExport(text: string): string {
  if (!text) return text;
  let result = fixEncodingGlitches(text);
  result = fixMalformedQuoteEndings(result);
  result = repairSpeakerLabelArtifacts(result);
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
