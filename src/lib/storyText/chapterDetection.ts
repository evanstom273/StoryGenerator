export type ChapterDetection = {
  detected: boolean;
  label?: string;
};

function normalizeChapterToken(token: string) {
  return token.trim().replace(/\.$/, "");
}

export function detectChapterEnd(text: string): ChapterDetection {
  const trimmed = text.trim();
  if (!trimmed) return { detected: false };

  const endOf = trimmed.match(/\bend\s+of\s+chapter\s+(.+?)(?:[.!?]|$)/i);
  if (endOf?.[1]) {
    const token = normalizeChapterToken(endOf[1]);
    const label = token ? `Chapter ${token}` : "Chapter End";
    return { detected: true, label };
  }

  const chapterEnd = trimmed.match(/\bchapter\s+(.+?)\s+end\b/i);
  if (chapterEnd?.[1]) {
    const token = normalizeChapterToken(chapterEnd[1]);
    const label = token ? `Chapter ${token}` : "Chapter End";
    return { detected: true, label };
  }

  return { detected: false };
}

