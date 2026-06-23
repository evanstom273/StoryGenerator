import { parseActionSegments, type StoryTextSegment } from "./parseActionSegments";

export interface SceneBlock {
  speakerLabel?: string;
  text: string;
  segments: StoryTextSegment[];
}

function isValidSpeakerLabel(label: string): boolean {
  if (!label) return false;
  // Commas indicate a narrative phrase, not a speaker name
  if (label.includes(",")) return false;
  // More than 5 words is almost certainly a narrative aside, not a name
  if (label.trim().split(/\s+/).length > 5) return false;
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
