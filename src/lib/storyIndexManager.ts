import type {
  IndexingCadence,
  PlayerCharacter,
  Story,
  StoryChapter,
  StoryIndex,
  StoryMessage,
} from "../types/models";
import type { StoryEngineRepository } from "./repository";
import type { AIProvider } from "./ai/types";
import { processIndexingBatch } from "./ai/storyIndexingPipeline";
import { sortByTimestampAsc } from "./dates";

export function calculatePendingMessages(
  allMessages: StoryMessage[],
  index: StoryIndex | null,
): StoryMessage[] {
  const sorted = sortByTimestampAsc(allMessages);
  if (!index || !index.lastIndexedMessageId) {
    return sorted;
  }

  const lastIndexedIdx = sorted.findIndex((m) => m.id === index.lastIndexedMessageId);
  if (lastIndexedIdx < 0) {
    // If the recorded last message ID is missing (e.g. edited/removed),
    // find messages that are not recorded in any chapter summary provenance
    const indexedIds = new Set<string>();
    for (const cs of index.chapterSummaries) {
      for (const id of cs.sourceMessageIds) {
        indexedIds.add(id);
      }
    }
    return sorted.filter((m) => !indexedIds.has(m.id));
  }

  return sorted.slice(lastIndexedIdx + 1);
}

export function shouldTriggerAutomaticIndexing(
  cadence: IndexingCadence = "every_5_messages",
  pendingCount: number,
  completedChapter = false,
): boolean {
  if (pendingCount <= 0) return false;

  switch (cadence) {
    case "every_message":
      return pendingCount >= 1;
    case "every_5_messages":
      return pendingCount >= 5;
    case "every_10_messages":
      return pendingCount >= 10;
    case "every_15_messages":
      return pendingCount >= 15;
    case "every_20_messages":
      return pendingCount >= 20;
    case "every_chapter":
      return completedChapter && pendingCount > 0;
    default:
      return pendingCount >= 5;
  }
}

export interface ChapterMessageGroup {
  chapterLabel: string;
  chapterId?: string;
  messages: StoryMessage[];
}

/**
 * Groups messages by the chapter they belong to based on existing chapter boundaries and markers.
 */
export function groupMessagesByChapter(
  messages: StoryMessage[],
  chapters: StoryChapter[],
): ChapterMessageGroup[] {
  if (!messages.length) return [];

  const sortedMessages = sortByTimestampAsc(messages);
  const sortedChapters = [...chapters].sort((a, b) => a.endsAtIndex - b.endsAtIndex);

  // Build a map of messageId -> chapter
  const groups: ChapterMessageGroup[] = [];
  let currentChapterIdx = 0;
  let currentGroup: ChapterMessageGroup = {
    chapterLabel: sortedChapters[0]?.label || "Chapter 1",
    chapterId: sortedChapters[0]?.id,
    messages: [],
  };

  for (const message of sortedMessages) {
    // Check if previous chapter ended
    if (
      currentChapterIdx < sortedChapters.length &&
      sortedChapters[currentChapterIdx]!.endsAtMessageId === message.id
    ) {
      currentGroup.messages.push(message);
      groups.push(currentGroup);
      currentChapterIdx += 1;
      currentGroup = {
        chapterLabel: sortedChapters[currentChapterIdx]?.label || `Chapter ${currentChapterIdx + 1}`,
        chapterId: sortedChapters[currentChapterIdx]?.id,
        messages: [],
      };
      continue;
    }

    // Check if message itself declared a start boundary
    if (message.chapterBoundary?.kind === "start" && currentGroup.messages.length > 0) {
      groups.push(currentGroup);
      currentGroup = {
        chapterLabel: message.chapterBoundary.label,
        messages: [message],
      };
      continue;
    }

    currentGroup.messages.push(message);
  }

  if (currentGroup.messages.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

export interface IndexManagerUpdateParams {
  storyId: string;
  repository: StoryEngineRepository;
  playerCharacter: PlayerCharacter;
  story: Story;
  provider: AIProvider;
  apiKey?: string;
  model: string;
  signal?: AbortSignal;
  onProgress?: (processedMessages: number, totalPending: number) => void;
}

/**
 * Updates the story index to the current position by indexing all pending messages.
 * Idempotent and atomic.
 */
export async function updateStoryIndexToCurrent(
  params: IndexManagerUpdateParams,
): Promise<StoryIndex> {
  const {
    storyId,
    repository,
    playerCharacter,
    story,
    provider,
    apiKey,
    model,
    signal,
    onProgress,
  } = params;

  const [allMessages, existingChapters, existingIndex] = await Promise.all([
    repository.listStoryMessages(storyId),
    repository.listStoryChapters(storyId),
    repository.getStoryIndex(storyId),
  ]);

  const pendingMessages = calculatePendingMessages(allMessages, existingIndex);
  if (!pendingMessages.length) {
    return (
      existingIndex ?? {
        id: `story-index:${storyId}`,
        storyId,
        chapterSummaries: [],
        characters: [],
        relationships: [],
        indexedMessageCount: 0,
        updatedAt: new Date().toISOString(),
      }
    );
  }

  const groups = groupMessagesByChapter(pendingMessages, existingChapters);
  let currentIndex: StoryIndex = existingIndex ?? {
    id: `story-index:${storyId}`,
    storyId,
    chapterSummaries: [],
    characters: [],
    relationships: [],
    indexedMessageCount: 0,
    updatedAt: new Date().toISOString(),
  };

  let processedCount = 0;
  for (const group of groups) {
    for (const message of group.messages) {
      if (signal?.aborted) {
        throw new Error("Indexing operation cancelled.");
      }

      currentIndex = await processIndexingBatch({
        story,
        playerCharacter,
        chapterLabel: group.chapterLabel,
        chapterId: group.chapterId,
        messages: [message],
        existingIndex: currentIndex,
        provider,
        apiKey,
        model,
        signal,
      });

      processedCount += 1;
      onProgress?.(processedCount, pendingMessages.length);
      await repository.saveStoryIndex(currentIndex);
    }
  }

  // Atomically save the completed index
  return repository.saveStoryIndex(currentIndex);
}

/**
 * Fully rebuilds the complete index from message 0 using a staging buffer.
 * Replaces the existing index only on complete success.
 */
export async function rebuildFullStoryIndex(
  params: IndexManagerUpdateParams,
): Promise<StoryIndex> {
  const {
    storyId,
    repository,
    playerCharacter,
    story,
    provider,
    apiKey,
    model,
    signal,
    onProgress,
  } = params;

  const [allMessages, existingChapters] = await Promise.all([
    repository.listStoryMessages(storyId),
    repository.listStoryChapters(storyId),
  ]);

  if (!allMessages.length) {
    const emptyIndex: StoryIndex = {
      id: `story-index:${storyId}`,
      storyId,
      chapterSummaries: [],
      characters: [],
      relationships: [],
      indexedMessageCount: 0,
      updatedAt: new Date().toISOString(),
    };
    return repository.saveStoryIndex(emptyIndex);
  }

  const groups = groupMessagesByChapter(allMessages, existingChapters);

  // Staging buffer starts completely clean
  let stagingIndex: StoryIndex = {
    id: `story-index:${storyId}`,
    storyId,
    chapterSummaries: [],
    characters: [],
    relationships: [],
    indexedMessageCount: 0,
    updatedAt: new Date().toISOString(),
  };

  let processedCount = 0;
  for (const group of groups) {
    for (const message of group.messages) {
      if (signal?.aborted) {
        throw new Error("Re-index operation cancelled.");
      }

      stagingIndex = await processIndexingBatch({
        story,
        playerCharacter,
        chapterLabel: group.chapterLabel,
        chapterId: group.chapterId,
        messages: [message],
        existingIndex: stagingIndex,
        provider,
        apiKey,
        model,
        signal,
      });

      processedCount += 1;
      onProgress?.(processedCount, allMessages.length);
    }
  }

  // Atomically replace previous index with clean rebuilt index
  return repository.saveStoryIndex(stagingIndex);
}

/**
 * Removes the story's derived indexing data and resets its indexing progress.
 * Does not modify transcript, chapters, or author data.
 */
export async function clearStoryIndex(params: {
  storyId: string;
  repository: StoryEngineRepository;
}): Promise<void> {
  await params.repository.deleteStoryIndex(params.storyId);
}
