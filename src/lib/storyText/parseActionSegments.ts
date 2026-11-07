export type StoryTextSegmentType = "text" | "action";

export interface StoryTextSegment {
  type: StoryTextSegmentType;
  text: string;
}

function isWordChar(value: string) {
  return /[A-Za-z0-9_]/.test(value);
}

export function parseActionSegments(input: string): StoryTextSegment[] {
  const segments: StoryTextSegment[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const start = input.indexOf("*", cursor);

    if (start === -1) {
      const tail = input.slice(cursor);
      if (tail) {
        segments.push({ type: "text", text: tail });
      }
      break;
    }

    if (
      start > 0 &&
      isWordChar(input[start - 1] ?? "") &&
      isWordChar(input[start + 1] ?? "")
    ) {
      segments.push({ type: "text", text: input.slice(cursor, start + 1) });
      cursor = start + 1;
      continue;
    }

    const before = input.slice(cursor, start);
    if (before) {
      segments.push({ type: "text", text: before });
    }

    const end = input.indexOf("*", start + 1);
    if (end === -1) {
      segments.push({ type: "text", text: input.slice(start) });
      break;
    }

    if (
      end + 1 < input.length &&
      isWordChar(input[end - 1] ?? "") &&
      isWordChar(input[end + 1] ?? "")
    ) {
      segments.push({ type: "text", text: input.slice(start, end + 1) });
      cursor = end + 1;
      continue;
    }

    const actionText = input.slice(start + 1, end);
    if (actionText) {
      segments.push({ type: "action", text: actionText });
    } else {
      segments.push({ type: "text", text: "**" });
    }

    cursor = end + 1;
  }

  return segments.length ? segments : [{ type: "text", text: input }];
}
