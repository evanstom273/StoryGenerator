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
 * Returns the first transcript message of the latest generated chapter.
 * Prefers the last chapter-start marker in the transcript; falls back to
 * chapter records when markers live only in stored chapter metadata.
 */
export function getLatestChapterStartMessage(
  messages: StoryMessage[],
  chapters: StoryChapter[],
): StoryMessage | null {
  const sortedMessages = sortMessages(messages);
  const lastStartIndex = findLastChapterStartIndex(sortedMessages);
  if (lastStartIndex !== null) {
    return sortedMessages[lastStartIndex] ?? null;
  }

  return getLatestChapterStartMessageFromDb(messages, chapters);
}

export function resolveChapterHeaderElement(messageId: string): HTMLElement | null {
  return (
    document.getElementById(`story-chapter-start-${messageId}`) ??
    document.getElementById(`story-chapter-marker-${messageId}`)
  );
}

export function resolveChapterScrollElement(messageId: string): HTMLElement | null {
  return (
    resolveChapterHeaderElement(messageId) ??
    document.getElementById(`story-message-${messageId}`)
  );
}

export const CHAPTER_HEADER_SCROLL_GAP_PX = 40;

export function scrollElementWithinContainer(
  element: HTMLElement,
  container: HTMLElement | null,
  behavior: ScrollBehavior = "smooth",
  topGapPx = CHAPTER_HEADER_SCROLL_GAP_PX,
): void {
  if (!container) {
    element.scrollIntoView({ block: "start", behavior });
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const offset = elementRect.top - containerRect.top + container.scrollTop - topGapPx;

  container.scrollTo({ top: Math.max(0, offset), behavior });
}

/** Scroll the chapter header banner (not the first message body) into view. */
export function scrollChapterHeaderIntoView(
  messageId: string,
  transcriptContainer: HTMLElement | null,
  behavior: ScrollBehavior = "smooth",
): boolean {
  const element = resolveChapterHeaderElement(messageId);
  if (!element) {
    return false;
  }

  if (transcriptContainer?.contains(element)) {
    scrollElementWithinContainer(
      element,
      transcriptContainer,
      behavior,
      CHAPTER_HEADER_SCROLL_GAP_PX,
    );
  }

  element.scrollIntoView({ block: "start", behavior });
  return true;
}

/** Scroll a chapter target into view inside the transcript and the page shell. */
export function scrollChapterTargetIntoView(
  messageId: string,
  transcriptContainer: HTMLElement | null,
  behavior: ScrollBehavior = "smooth",
): boolean {
  if (scrollChapterHeaderIntoView(messageId, transcriptContainer, behavior)) {
    return true;
  }

  const element = document.getElementById(`story-message-${messageId}`);
  if (!element) {
    return false;
  }

  if (transcriptContainer?.contains(element)) {
    scrollElementWithinContainer(element, transcriptContainer, behavior);
  }

  element.scrollIntoView({ block: "start", behavior });
  return true;
}
