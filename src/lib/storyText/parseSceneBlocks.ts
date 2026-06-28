import { parseActionSegments, type StoryTextSegment } from "./parseActionSegments";

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
]);

function isValidSpeakerLabel(label: string): boolean {
  if (!label) return false;
  // Commas indicate a narrative phrase, not a speaker name
  if (label.includes(",")) return false;
  const words = label.trim().split(/\s+/);
  // More than 4 words is almost certainly a narrative aside, not a character name
  if (words.length > 4) return false;
  // Every word must start with uppercase or be a number ("Paramedic 1", "Guard 2")
  if (!words.every((w) => /^[A-Z]/.test(w) || /^\d/.test(w))) return false;
  // Single common words are narrative markers, not names
  if (words.length === 1 && NOT_A_NAME.has(words[0]!)) return false;
  return true;
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

  return blocks
    .filter((block) => block.text.trim() || block.speakerLabel)
    .map((block) => ({
      speakerLabel: block.speakerLabel,
      text: block.text.trimStart(),
      segments: parseActionSegments(block.text.trimStart()),
    }));
}
