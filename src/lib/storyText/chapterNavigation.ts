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

/**
 * endsAtIndex is stored inconsistently: end markers use 1-based message numbers,
 * while start markers that close the previous chapter use a 0-based message index.
 */
export function resolveChapterEndMessageIndex(
  messages: StoryMessage[],
  chapter: StoryChapter,
): number | null {
  const sorted = sortMessages(messages);
  const byId = sorted.findIndex((message) => message.id === chapter.endsAtMessageId);
  if (byId >= 0) {
    return byId;
  }

  const zeroBasedIndex = chapter.endsAtIndex;
  const oneBasedEndIndex = chapter.endsAtIndex - 1;

  if (zeroBasedIndex >= 0 && zeroBasedIndex < sorted.length) {
    const zeroBasedBoundary = resolveMessageChapterBoundary(sorted[zeroBasedIndex]!);
    if (zeroBasedBoundary?.kind === "end") {
      return zeroBasedIndex;
    }
  }

  if (oneBasedEndIndex >= 0 && oneBasedEndIndex < sorted.length) {
    const oneBasedBoundary = resolveMessageChapterBoundary(sorted[oneBasedEndIndex]!);
    if (oneBasedBoundary?.kind === "end") {
      return oneBasedEndIndex;
    }
    if (
      oneBasedBoundary?.kind === "start" &&
      zeroBasedIndex >= 0 &&
      zeroBasedIndex < sorted.length
    ) {
      return zeroBasedIndex;
    }
  }

  if (oneBasedEndIndex >= 0 && oneBasedEndIndex < sorted.length) {
    return oneBasedEndIndex;
  }

  if (zeroBasedIndex >= 0 && zeroBasedIndex < sorted.length) {
    return zeroBasedIndex;
  }

  return null;
}

export function resolveNextChapterStartIndex(
  messages: StoryMessage[],
  chapter: StoryChapter,
): number | null {
  const sorted = sortMessages(messages);
  const endIndex = resolveChapterEndMessageIndex(messages, chapter);
  if (endIndex === null) {
    return null;
  }

  const nextIndex = endIndex + 1;
  return nextIndex < sorted.length ? nextIndex : null;
}

/** First message of the chapter that begins after this chapter record ends. */
function getFirstMessageAfterChapterRecord(
  messages: StoryMessage[],
  chapter: StoryChapter,
): StoryMessage | null {
  const sorted = sortMessages(messages);
  const nextIndex = resolveNextChapterStartIndex(messages, chapter);
  return nextIndex === null ? null : sorted[nextIndex] ?? null;
}

function hasMessagesAfterChapterRecord(
  messages: StoryMessage[],
  chapter: StoryChapter,
): boolean {
  return resolveNextChapterStartIndex(messages, chapter) !== null;
}

/** Open chapter has at least one user or assistant turn (not just a chapter banner). */
export function hasSubstantiveContentInOpenChapter(
  messages: StoryMessage[],
  chapters: StoryChapter[],
): boolean {
  const sortedMessages = sortMessages(messages);
  const sortedChapters = [...chapters].sort((left, right) => left.endsAtIndex - right.endsAtIndex);

  let sliceStart = 0;
  if (sortedChapters.length > 0) {
    const lastChapter = sortedChapters[sortedChapters.length - 1]!;
    const nextIndex = resolveNextChapterStartIndex(messages, lastChapter);
    sliceStart = nextIndex ?? sortedMessages.length;
  } else {
    const lastStartIndex = findLastChapterStartIndex(sortedMessages);
    sliceStart = lastStartIndex === null ? 0 : lastStartIndex + 1;
  }

  return sortedMessages
    .slice(sliceStart)
    .some((message) => message.role === "user" || message.role === "assistant");
}

export function hasActiveOpenChapter(
  messages: StoryMessage[],
  chapters: StoryChapter[],
): boolean {
  const sortedChapters = [...chapters].sort((left, right) => left.endsAtIndex - right.endsAtIndex);
  if (sortedChapters.length > 0) {
    return hasMessagesAfterChapterRecord(messages, sortedChapters[sortedChapters.length - 1]);
  }

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

/**
 * Message that owns the latest chapter header banner in the transcript.
 * Chapter records are authoritative when present — inferred "Chapter N" banners
 * come from these records, not from older explicit start markers.
 */
export function getLatestChapterStartMessage(
  messages: StoryMessage[],
  chapters: StoryChapter[],
): StoryMessage | null {
  const sorted = [...chapters].sort((left, right) => left.endsAtIndex - right.endsAtIndex);

  if (sorted.length > 0) {
    const afterLastClosed = getFirstMessageAfterChapterRecord(
      messages,
      sorted[sorted.length - 1],
    );
    if (afterLastClosed) {
      return afterLastClosed;
    }

    if (sorted.length >= 2) {
      const latestClosedChapterStart = getFirstMessageAfterChapterRecord(
        messages,
        sorted[sorted.length - 2],
      );
      if (latestClosedChapterStart) {
        return latestClosedChapterStart;
      }
    }

    const sortedMessages = sortMessages(messages);
    if (sorted.length === 1 && sortedMessages.length > 0) {
      return sortedMessages[0];
    }
  }

  const sortedMessages = sortMessages(messages);
  const lastStartIndex = findLastChapterStartIndex(sortedMessages);
  if (lastStartIndex === null) {
    return null;
  }

	return sortedMessages[lastStartIndex] ?? null;
}

/** Open chapter has only its banner — prior transcript already has playable turns. */
export function isFreshPlayableChapterHandoff(
	messages: StoryMessage[],
	chapters: StoryChapter[],
): boolean {
	if (!hasActiveOpenChapter(messages, chapters)) {
		return false;
	}
	if (hasSubstantiveContentInOpenChapter(messages, chapters)) {
		return false;
	}
	if (chapters.length > 0) {
		return true;
	}

	const sortedMessages = sortMessages(messages);
	const lastStartIndex = findLastChapterStartIndex(sortedMessages);
	if (lastStartIndex === null || lastStartIndex === 0) {
		return false;
	}

	return sortedMessages
		.slice(0, lastStartIndex)
		.some((message) => message.role === "user" || message.role === "assistant");
}

export function resolveChapterHeaderElement(messageId: string): HTMLElement | null {
  return (
    document.getElementById(`story-chapter-start-${messageId}`) ??
    document.getElementById(`story-chapter-marker-${messageId}`)
  );
}

export const CHAPTER_HEADER_SCROLL_GAP_PX = 40;

/** Sticky mobile app header sits above the transcript; desktop has no top chrome. */
export function getChapterHeaderScrollInset(): number {
  let inset = CHAPTER_HEADER_SCROLL_GAP_PX;

  if (typeof window.matchMedia !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
    const mobileHeader = document.querySelector("header.sticky.top-0");
    if (mobileHeader instanceof HTMLElement) {
      inset = Math.max(inset, mobileHeader.offsetHeight + CHAPTER_HEADER_SCROLL_GAP_PX);
    }
  }

  return inset;
}

function isMeaningfullyScrollable(element: HTMLElement | null): boolean {
  if (!element) {
    return false;
  }
  return element.scrollHeight - element.clientHeight > 8;
}

function scrollWithinContainer(
  element: HTMLElement,
  container: HTMLElement,
  inset: number,
  behavior: ScrollBehavior,
): void {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const offset = elementRect.top - containerRect.top + container.scrollTop - inset;
  container.scrollTo({ top: Math.max(0, offset), behavior });
}

function scrollWithinWindow(element: HTMLElement, inset: number, behavior: ScrollBehavior): void {
  const elementRect = element.getBoundingClientRect();
  const offset = elementRect.top + window.scrollY - inset;
  window.scrollTo({ top: Math.max(0, offset), behavior });
}

function scrollChapterHeaderIntoView(
  header: HTMLElement,
  transcriptContainer: HTMLElement | null,
  behavior: ScrollBehavior,
): void {
  const inset = getChapterHeaderScrollInset();

  if (isMeaningfullyScrollable(transcriptContainer)) {
    scrollWithinContainer(header, transcriptContainer!, inset, behavior);
    return;
  }

  scrollWithinWindow(header, inset, behavior);
}

/**
 * Scroll so the chapter header banner sits below sticky top chrome with a small gap.
 * Uses the transcript panel when it is the scroll container; otherwise scrolls the page (mobile).
 */
export function scrollToChapterHeader(
  messageId: string,
  transcriptContainer: HTMLElement | null,
  behavior: ScrollBehavior = "smooth",
  options?: { allowMessageFallback?: boolean },
): boolean {
  const allowMessageFallback = options?.allowMessageFallback ?? false;
  let attempts = 0;
  const maxAttempts = 20;

  function tryScroll() {
    const header = resolveChapterHeaderElement(messageId);
    if (header) {
      scrollChapterHeaderIntoView(header, transcriptContainer, behavior);
      return;
    }

    attempts += 1;
    if (attempts < maxAttempts) {
      window.setTimeout(tryScroll, 50);
      return;
    }

    if (!allowMessageFallback) {
      return;
    }

    const message = document.getElementById(`story-message-${messageId}`);
    if (message) {
      const inset = getChapterHeaderScrollInset();
      if (isMeaningfullyScrollable(transcriptContainer)) {
        scrollWithinContainer(message, transcriptContainer!, inset, behavior);
      } else {
        scrollWithinWindow(message, inset, behavior);
      }
    }
  }

  requestAnimationFrame(() => {
    tryScroll();
  });
  return true;
}

export function getMessagesForChapterStartingAt(messages: StoryMessage[], startMessageId: string) {
	const sorted = sortMessages(messages);
	const startIndex = sorted.findIndex((message) => message.id === startMessageId);
	if (startIndex < 0) {
		return [];
	}

	let fromIndex = startIndex;
	const startBoundary = resolveMessageChapterBoundary(sorted[startIndex]!);
	if (startBoundary?.kind === "start") {
		fromIndex = startIndex + 1;
	}

	for (let index = fromIndex + 1; index < sorted.length; index += 1) {
		const boundary = resolveMessageChapterBoundary(sorted[index]!);
		if (boundary?.kind === "start") {
			return sorted.slice(fromIndex, index);
		}
	}

	return sorted.slice(fromIndex);
}
