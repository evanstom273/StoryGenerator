import { parseActionSegments, type StoryTextSegment } from "./parseActionSegments";

export interface SceneBlock {
  speakerLabel?: string;
  text: string;
  segments: StoryTextSegment[];
}

function isSpeakerHeader(line: string) {
  const match = line.match(/^([^\n:]{1,48})(:|\s[-—])\s*$/);
  if (!match) {
    return null;
  }

  const label = match[1]?.trim();
  return label ? label : null;
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
    const header = isSpeakerHeader(line.trim());

    if (header) {
      flush();
      currentSpeaker = header;
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
