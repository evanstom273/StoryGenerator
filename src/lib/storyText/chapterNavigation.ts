import type { StoryChapter, StoryMessage } from "../../types/models";

function sortMessages(messages: StoryMessage[]) {
  return [...messages].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
}

function findLastChapterStartIndex(messages: StoryMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.chapterBoundary?.kind === "start") {
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
    const boundary = messages[index]?.chapterBoundary;
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

export function hasActiveOpenChapter(
  messages: StoryMessage[],
  chapters: StoryChapter[],
): boolean {
  const sortedMessages = sortMessages(messages);
  const lastStartIndex = findLastChapterStartIndex(sortedMessages);
  if (lastStartIndex === null) {
    const lastBoundary = [...sortedMessages]
      .reverse()
      .find((message) => message.chapterBoundary?.label?.trim());
    if (!lastBoundary?.chapterBoundary || lastBoundary.chapterBoundary.kind !== "end") {
      return false;
    }
    const hasExplicitClose = chapters.some(
      (chapter) => chapter.label === lastBoundary.chapterBoundary?.label,
    );
    return !hasExplicitClose;
  }

  const startLabel = sortedMessages[lastStartIndex]?.chapterBoundary?.label ?? "";
  return isChapterStillOpenAfterStart(sortedMessages, lastStartIndex, startLabel);
}

export function countGeneratedChapters(
  messages: StoryMessage[],
  chapters: StoryChapter[],
): number {
  const sorted = [...chapters].sort((left, right) => left.endsAtIndex - right.endsAtIndex);
  return sorted.length + (hasActiveOpenChapter(messages, chapters) ? 1 : 0);
}

/**
 * Returns the first transcript message of the latest generated chapter.
 * Chapter records store endsAtIndex as the 1-based message number where a chapter
 * ended; the next chapter begins at messages[endsAtIndex].
 */
export function getLatestChapterStartMessage(
  messages: StoryMessage[],
  chapters: StoryChapter[],
): StoryMessage | null {
  const sorted = [...chapters].sort((left, right) => left.endsAtIndex - right.endsAtIndex);
  if (sorted.length === 0) {
    return null;
  }

  const hasOpen = hasActiveOpenChapter(messages, chapters);
  const startIndex = hasOpen
    ? sorted[sorted.length - 1].endsAtIndex
    : sorted.length < 2
      ? null
      : sorted[sorted.length - 2].endsAtIndex;

  if (startIndex === null) {
    return null;
  }

  return messages[startIndex] ?? null;
}

export function resolveChapterScrollElement(messageId: string): HTMLElement | null {
  return (
    document.getElementById(`story-chapter-start-${messageId}`) ??
    document.getElementById(`story-chapter-marker-${messageId}`) ??
    document.getElementById(`story-message-${messageId}`)
  );
}

export function scrollElementWithinContainer(
  element: HTMLElement,
  container: HTMLElement | null,
  behavior: ScrollBehavior = "smooth",
): void {
  if (!container) {
    element.scrollIntoView({ block: "start", behavior });
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const offset = elementRect.top - containerRect.top + container.scrollTop - 12;

  container.scrollTo({ top: Math.max(0, offset), behavior });
}
