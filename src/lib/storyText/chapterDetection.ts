export type ChapterBoundaryKind = "start" | "end";

export type ChapterDetection = {
  detected: boolean;
  kind?: ChapterBoundaryKind;
  label?: string;
};

function normalizeChapterToken(token: string) {
  return token.trim().replace(/\.$/, "");
}

function normalizeChapterBoundaryText(text: string) {
  return text.trim().replace(/^\*+|\*+$/g, "").trim();
}

function buildChapterLabel(token: string) {
  const normalized = normalizeChapterToken(token);
  return normalized ? `Chapter ${normalized}` : "Chapter";
}

export function detectChapterBoundary(text: string): ChapterDetection {
  const trimmed = normalizeChapterBoundaryText(text);
  if (!trimmed) return { detected: false };

  const startOf = trimmed.match(/\bstart\s+of\s+chapter\s+(.+?)(?:[.!?]|$)/i);
  if (startOf?.[1]) {
    return {
      detected: true,
      kind: "start",
      label: buildChapterLabel(startOf[1]),
    };
  }

  const chapterStart = trimmed.match(/\bchapter\s+(.+?)\s+start\b/i);
  if (chapterStart?.[1]) {
    return {
      detected: true,
      kind: "start",
      label: buildChapterLabel(chapterStart[1]),
    };
  }

  const endOf = trimmed.match(/\bend\s+of\s+chapter\s+(.+?)(?:[.!?]|$)/i);
  if (endOf?.[1]) {
    return {
      detected: true,
      kind: "end",
      label: buildChapterLabel(endOf[1]),
    };
  }

  const chapterEnd = trimmed.match(/\bchapter\s+(.+?)\s+end\b/i);
  if (chapterEnd?.[1]) {
    return {
      detected: true,
      kind: "end",
      label: buildChapterLabel(chapterEnd[1]),
    };
  }

  const bareChapter = trimmed.match(/^chapter\s+(.+?)(?:[.!?]|$)/i);
  if (bareChapter?.[1]) {
    return {
      detected: true,
      kind: "start",
      label: buildChapterLabel(bareChapter[1]),
    };
  }

  return { detected: false };
}

export function detectChapterEnd(text: string): ChapterDetection {
  const detected = detectChapterBoundary(text);
  return detected.kind === "end" ? detected : { detected: false };
}
