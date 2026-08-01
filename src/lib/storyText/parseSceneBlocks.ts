import { parseActionSegments, type StoryTextSegment } from "./parseActionSegments";
import { isDeniedSpeakerLabel, isPossessiveSpeakerLabel } from "../relationshipIndex";

export interface SceneBlock {
  speakerLabel?: string;
  text: string;
  segments: StoryTextSegment[];
}

// Words that start sentences but are never character names.
const NOT_A_NAME = new Set([
  "He", "She", "They", "It", "We", "You", "I", "His", "Her", "Their", "Its",
  "The", "A", "An", "And", "But", "Or", "So", "Then", "Now",
  "Later", "Meanwhile", "Outside", "Inside", "Suddenly", "Time",
  "Note", "Warning", "However", "Therefore", "Eventually", "Finally",
  "Scene", "Chapter", "Part", "First", "Next",
  // Narrative transition/preposition words that can precede a name but are not names themselves
  "As", "With", "After", "Before", "While", "When", "Once", "Until",
  "From", "Into", "Through", "Against", "Between", "Without",
]);

function isValidSpeakerLabel(label: string): boolean {
  if (!label) return false;
  if (isDeniedSpeakerLabel(label)) return false;
  if (isPossessiveSpeakerLabel(label)) return false;
  if (/\([^)]*\)/.test(label)) return false;
  // Commas indicate a narrative phrase, not a speaker name
  if (label.includes(",")) return false;
  const words = label.trim().split(/\s+/);
  // More than 4 words is almost certainly a narrative aside, not a character name
  if (words.length > 4) return false;
  // Every word must start with uppercase or be a number ("Paramedic 1", "Guard 2")
  if (!words.every((w) => /^[A-Z]/.test(w) || /^\d/.test(w))) return false;
  // Common words are narrative markers, not names — reject whether alone or as the first word of a multi-word label
  if (NOT_A_NAME.has(words[0]!)) return false;
  return true;
}

const NAME_SPEAKER_LABEL_LINE =
	/^([A-Z][a-zA-Z''-]*(?:\s+[A-Z][a-zA-Z''-]*){0,3})\s*:\s*(.*)$/;

/** Join label-only lines (Amy:, Jamie's:) with the prose line that follows. */
export function repairNarratorLabelLines(text: string): string {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const out: string[] = [];

	for (let index = 0; index < lines.length; index++) {
		const trimmed = lines[index].trim();
		const possessiveOnly = trimmed.match(/^([A-Z][a-zA-Z''-]*['']s)\s*:\s*$/i);
		if (possessiveOnly) {
			const next = lines[index + 1]?.trim();
			if (next) {
				out.push(`${possessiveOnly[1]} ${next}`);
				index += 1;
				continue;
			}
		}

		const nameOnly = trimmed.match(/^([A-Z][a-zA-Z''-]*(?:\s+[A-Z][a-zA-Z''-]*){0,3})\s*:\s*$/);
		if (nameOnly?.[1] && isValidSpeakerLabel(nameOnly[1].trim())) {
			const next = lines[index + 1]?.trim();
			if (next) {
				out.push(`${nameOnly[1].trim()} ${next}`);
				index += 1;
				continue;
			}
		}

		out.push(lines[index]);
	}

	return out.join("\n");
}

/** Display-only: strip Narrator labels; remove colons from other name pseudo-labels. */
export function stripNarratorBlockDisplayPrefix(line: string): string {
	const trimmed = line.trim();
	if (!trimmed) return trimmed;

	const narrator = trimmed.match(/^Narrator\s*(?::|\s[-—])\s*(.*)$/i);
	if (narrator) {
		const remainder = narrator[1]?.trim() ?? "";
		if (!remainder) return "";
		return stripNarratorBlockDisplayPrefix(remainder);
	}

	const possessiveLabel = trimmed.match(/^([A-Z][a-zA-Z''-]*['']s)\s*:\s*(.*)$/i);
	if (possessiveLabel?.[1]) {
		const remainder = possessiveLabel[2]?.trim() ?? "";
		return remainder ? `${possessiveLabel[1]} ${remainder}` : possessiveLabel[1];
	}

	const nameLabel = trimmed.match(NAME_SPEAKER_LABEL_LINE);
	if (nameLabel?.[1] && isValidSpeakerLabel(nameLabel[1].trim())) {
		const label = nameLabel[1].trim();
		const remainder = nameLabel[2]?.trim() ?? "";
		return remainder ? `${label} ${remainder}` : label;
	}

	return trimmed;
}

export function formatNarratorBlockForDisplay(text: string): string {
	return repairNarratorLabelLines(text)
		.split("\n")
		.map((line) => stripNarratorBlockDisplayPrefix(line))
		.join("\n");
}

function isSpeakerHeader(line: string) {
  const match = line.match(/^([^\n:]{1,48})(:|\s[-—])\s*$/);
  if (!match) {
    return null;
  }

  const label = match[1]?.trim();
  if (!label || !isValidSpeakerLabel(label)) return null;
  return label;
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

  if (!isValidSpeakerLabel(label)) {
    return null;
  }

  if (label === "Time") {
    return null;
  }

  return { speakerLabel: label, text: remainder };
}

export function parseSceneBlocks(content: string): SceneBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<{ speakerLabel?: string; text: string }> = [];
  let currentSpeaker: string | undefined;
  let buffer: string[] = [];

  function flush() {
    if (!buffer.length) {
      return;
    }

    blocks.push({
      speakerLabel: currentSpeaker,
      text: buffer.join("\n").trimEnd(),
    });
    buffer = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "---" || trimmed === "***") {
      flush();
      currentSpeaker = undefined;
      buffer.push("");
      continue;
    }

    const header = isSpeakerHeader(trimmed);

    if (header) {
      if (currentSpeaker === header) {
        continue;
      }
      flush();
      currentSpeaker = header;
      continue;
    }

    const inlineSpeaker = parseInlineSpeakerLine(trimmed);
    if (inlineSpeaker) {
      if (currentSpeaker && currentSpeaker === inlineSpeaker.speakerLabel) {
        buffer.push(inlineSpeaker.text);
        continue;
      }
      flush();
      currentSpeaker = inlineSpeaker.speakerLabel;
      buffer.push(inlineSpeaker.text);
      continue;
    }

    // Blank line handling:
    // - Named character blocks (Jake, Amy, etc.) are flushed so narrator prose that follows
    //   a blank line is not attributed to the character.
    // - Narrator and unattributed blocks treat blank lines as paragraph breaks, keeping
    //   related paragraphs together rather than splitting each sentence into its own block.
    if (trimmed === "") {
      const hasContent = buffer.some((l) => l.trim());
      if (currentSpeaker && currentSpeaker !== "Narrator" && hasContent) {
        flush();
        currentSpeaker = undefined;
      } else if (hasContent) {
        buffer.push(""); // paragraph break within narrator / unattributed block
      }
      continue;
    }

    buffer.push(line);
  }

  flush();

  if (!blocks.length) {
    return [{ text: content, segments: parseActionSegments(content) }];
  }

  const hasAnySpeaker = blocks.some((block) => block.speakerLabel);
  if (!hasAnySpeaker) {
    return [{ text: content, segments: parseActionSegments(content) }];
  }

  const filteredBlocks = blocks.filter((block) => block.text.trim() || block.speakerLabel);

  // Merge consecutive blocks with the same named speaker so duplicate blocks from
  // the model (two Jake: blocks separated by a blank line) render as one bubble.
  const merged: Array<{ speakerLabel?: string; text: string }> = [];
  for (const block of filteredBlocks) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      block.speakerLabel !== undefined &&
      prev.speakerLabel === block.speakerLabel
    ) {
      prev.text += "\n\n" + block.text;
    } else {
      merged.push({ ...block });
    }
  }

  return merged.map((block) => ({
    speakerLabel: block.speakerLabel,
    text: block.text.trimStart(),
    segments: parseActionSegments(block.text.trimStart()),
  }));
}
