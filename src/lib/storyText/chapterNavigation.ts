import type { StoryChapter, StoryMessage } from "../../types/models";
import { detectChapterBoundary } from "./chapterDetection";

function sortMessages(messages: StoryMessage[]) {
  return [...messages].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
}

/** Matches StoryEngineProvider.resolveStoredOrDetectedChapterBoundary */
export function resolveMessageChapterBoundary(message: StoryMessage) {
  if (message.chapterBoundary?.kind && message.chapterBoundary.label?.trim()) {
    return message.chapterBoundary;
  }
  const detected = detectChapterBoundary(message.content ?? "");
  if (detected.detected && detected.kind && detected.label) {
    return {
      kind: detected.kind,
      label: detected.label,
    } satisfies StoryMessage["chapterBoundary"];
  }
  return null;
}

function findLastChapterStartIndex(messages: StoryMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const boundary = resolveMessageChapterBoundary(messages[index]!);
    if (boundary?.kind === "start") {
      return index;
    }
  }
  return null;
}

function isChapterStillOpenAfterStart(
  messages: StoryMessage[],
  startIndex: number,
  startLabel: string,
) {
  for (let index = startIndex + 1; index < messages.length; index += 1) {
    const boundary = resolveMessageChapterBoundary(messages[index]!);
    if (!boundary) {
      continue;
    }
    if (boundary.kind === "start") {
      return false;
    }
    if (
      boundary.kind === "end" &&
      (boundary.label === startLabel || boundary.label === "The End")
    ) {
      return false;
    }
  }
  return true;
}

function countChapterBoundariesFromTranscript(messages: StoryMessage[]) {
  const sortedMessages = sortMessages(messages);
  let startCount = 0;
  let endCount = 0;
  for (const message of sortedMessages) {
    const boundary = resolveMessageChapterBoundary(message);
    if (boundary?.kind === "start") {
      startCount += 1;
    } else if (boundary?.kind === "end") {
      endCount += 1;
    }
  }

  if (startCount >= 1) {
    return startCount + 1;
  }
  if (endCount >= 1) {
    return endCount;
  }
  return 0;
}

export function hasActiveOpenChapter(
  messages: StoryMessage[],
  chapters: StoryChapter[],
): boolean {
  const sortedMessages = sortMessages(messages);
  const lastStartIndex = findLastChapterStartIndex(sortedMessages);
  if (lastStartIndex === null) {
    const lastBoundary = [...sortedMessages]
      .reverse()
      .map((message) => resolveMessageChapterBoundary(message))
      .find((boundary) => boundary?.label?.trim());
    if (!lastBoundary || lastBoundary.kind !== "end") {
      return false;
    }
    const hasExplicitClose = chapters.some((chapter) => chapter.label === lastBoundary.label);
    return !hasExplicitClose;
  }

  const startLabel = resolveMessageChapterBoundary(sortedMessages[lastStartIndex]!)?.label ?? "";
  return isChapterStillOpenAfterStart(sortedMessages, lastStartIndex, startLabel);
}

export function countGeneratedChapters(
  messages: StoryMessage[],
  chapters: StoryChapter[],
): number {
  const sorted = [...chapters].sort((left, right) => left.endsAtIndex - right.endsAtIndex);
  const fromTranscript = countChapterBoundariesFromTranscript(messages);
  const fromDb = sorted.length + (hasActiveOpenChapter(messages, chapters) ? 1 : 0);
  return Math.max(fromTranscript, fromDb);
}

function getFirstMessageAfterChapterRecord(
  messages: StoryMessage[],
  chapter: StoryChapter,
): StoryMessage | null {
  const sorted = sortMessages(messages);
  const endIndex = sorted.findIndex((message) => message.id === chapter.endsAtMessageId);
  if (endIndex >= 0 && endIndex + 1 < sorted.length) {
    return sorted[endIndex + 1];
  }

  const indexFromEndsAt = chapter.endsAtIndex;
  if (indexFromEndsAt >= 0 && indexFromEndsAt < sorted.length) {
    return sorted[indexFromEndsAt];
  }

  const previousIndex = indexFromEndsAt - 1;
  if (previousIndex >= 0 && previousIndex < sorted.length) {
    return sorted[previousIndex];
  }

  return null;
}

function getLatestChapterStartMessageFromDb(
  messages: StoryMessage[],
  chapters: StoryChapter[],
): StoryMessage | null {
  const sorted = [...chapters].sort((left, right) => left.endsAtIndex - right.endsAtIndex);
  if (sorted.length === 0) {
    return null;
  }

  const hasOpen = hasActiveOpenChapter(messages, chapters);
  if (hasOpen) {
    return getFirstMessageAfterChapterRecord(messages, sorted[sorted.length - 1]);
  }

  if (sorted.length < 2) {
    return null;
  }

  return getFirstMessageAfterChapterRecord(messages, sorted[sorted.length - 2]);
}

/**
 * Returns the anchor message for the latest chapter header.
 * Prefers chapter-record boundaries (inferred "Chapter N" banners) when they
 * are later than the last explicit start marker in the transcript.
 */
export function getLatestChapterStartMessage(
  messages: StoryMessage[],
  chapters: StoryChapter[],
): StoryMessage | null {
  const sortedMessages = sortMessages(messages);
  const fromDb = getLatestChapterStartMessageFromDb(messages, chapters);
  const lastStartIndex = findLastChapterStartIndex(sortedMessages);

  if (lastStartIndex === null) {
    return fromDb;
  }

  const explicitStartMessage = sortedMessages[lastStartIndex] ?? null;
  if (!fromDb || !explicitStartMessage) {
    return fromDb ?? explicitStartMessage;
  }

  const fromDbIndex = sortedMessages.findIndex((message) => message.id === fromDb.id);
  if (fromDbIndex >= 0 && fromDbIndex >= lastStartIndex) {
    return fromDb;
  }

  return explicitStartMessage;
}

export function resolveChapterHeaderElement(messageId: string): HTMLElement | null {
  return (
    document.getElementById(`story-chapter-start-${messageId}`) ??
    document.getElementById(`story-chapter-marker-${messageId}`)
  );
}

export const CHAPTER_HEADER_SCROLL_GAP_PX = 40;

/**
 * Scroll the chapter header banner to the top of the transcript with a gap.
 * Does not use scrollIntoView on the header (that pins it to the bottom on mobile).
 */
export function scrollToChapterHeader(
  messageId: string,
  transcriptContainer: HTMLElement | null,
  behavior: ScrollBehavior = "smooth",
): boolean {
  const header = resolveChapterHeaderElement(messageId);
  if (!header) {
    return false;
  }

  if (transcriptContainer?.contains(header)) {
    const containerRect = transcriptContainer.getBoundingClientRect();
    const elementRect = header.getBoundingClientRect();
    const offset =
      elementRect.top - containerRect.top + transcriptContainer.scrollTop - CHAPTER_HEADER_SCROLL_GAP_PX;
    transcriptContainer.scrollTo({ top: Math.max(0, offset), behavior });
    transcriptContainer.scrollIntoView({ block: "nearest", behavior });
    return true;
  }

  header.scrollIntoView({ block: "start", behavior });
  return true;
}

/**
 * Scroll to the chapter header, or the message row if no header exists (bubble view).
 */
export function scrollToLatestChapterAnchor(
  messageId: string,
  transcriptContainer: HTMLElement | null,
  behavior: ScrollBehavior = "smooth",
): boolean {
  if (scrollToChapterHeader(messageId, transcriptContainer, behavior)) {
    return true;
  }

  const message = document.getElementById(`story-message-${messageId}`);
  if (!message) {
    return false;
  }

  if (transcriptContainer?.contains(message)) {
    const containerRect = transcriptContainer.getBoundingClientRect();
    const elementRect = message.getBoundingClientRect();
    const offset =
      elementRect.top - containerRect.top + transcriptContainer.scrollTop - CHAPTER_HEADER_SCROLL_GAP_PX;
    transcriptContainer.scrollTo({ top: Math.max(0, offset), behavior });
    transcriptContainer.scrollIntoView({ block: "nearest", behavior });
    return true;
  }

  message.scrollIntoView({ block: "start", behavior });
  return true;
}
