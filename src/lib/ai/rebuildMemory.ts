import type { StoryEngineRepository } from "../repository";
import type { AIProvider } from "./types";
import type { StoryMessage, StoryStateDataV2 } from "../../types/models";
import { sortByTimestampAsc } from "../dates";
import { buildStoryStateExtractionPrompt, parseStoryStateData } from "./storyStateExtractor";
import { normalizeStoryStateToV2, safeParseStoryStateData, withIndexedMetadata } from "../storyStateV2";

function chunkMessages(messages: StoryMessage[], chunkSize: number) {
  const chunks: StoryMessage[][] = [];
  for (let i = 0; i < messages.length; i += chunkSize) {
    chunks.push(messages.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function rebuildStoryMemoryAndIndexes(params: {
  storyId: string;
  repository: StoryEngineRepository;
  provider: AIProvider;
  apiKey: string;
  model: string;
  onProgress?: (p: { processed: number; total: number; message?: string }) => void;
  signal?: AbortSignal;
}): Promise<{ stateJson: string; summaryText?: string }> {
  const { storyId, repository, provider, apiKey, model, onProgress, signal } = params;

  const story = await repository.getStory(storyId);
  if (!story) {
    throw new Error("Story not found.");
  }

  const [storyState, rawMessages, playerCharacter] = await Promise.all([
    repository.getStoryState(storyId),
    repository.listStoryMessages(storyId),
    repository.getPlayerCharacter(story.playerCharacterId),
  ]);

  if (!playerCharacter) {
    throw new Error("Story not found.");
  }

  const messages = sortByTimestampAsc(rawMessages);
  const total = messages.length;

  const baseParsed = storyState?.stateJson ? safeParseStoryStateData(storyState.stateJson) : null;
  let currentState: StoryStateDataV2 = normalizeStoryStateToV2(baseParsed);
  currentState = { ...currentState, memoryArchitectureVersion: "2.0" };

  const chunkSize = 40;
  const chunks = chunkMessages(messages, chunkSize);

  let processed = 0;
  onProgress?.({ processed, total, message: "Loading transcript..." });

  for (const chunk of chunks) {
    if (signal?.aborted) {
      throw new Error("Rebuild aborted.");
    }

    currentState = {
      ...currentState,
      indexes: {
        ...(currentState.indexes ?? {}),
        messageCount: total,
        messageNumberingVersion: "1.0",
      },
    };

    const existingStateJson = (() => {
      try {
        return JSON.stringify(currentState);
      } catch {
        return "";
      }
    })();

    const summaryText = (() => {
      const direct = story.currentSummary?.trim();
      if (direct) return direct;
      const fromState = currentState.summaries?.worldSummary?.trim();
      return fromState ?? "";
    })();

    const extractionContext = buildStoryStateExtractionPrompt({
      playerName: playerCharacter.name,
      summaryText,
      recentMessages: chunk,
      existingStateJson,
      messageNumberStart: processed + 1,
      messageNumberTotal: total,
    });

    const stateResponse = await provider.generateResponse({
      apiKey,
      model,
      messages: extractionContext,
    });

    if (signal?.aborted) {
      throw new Error("Rebuild aborted.");
    }

    const parsed = parseStoryStateData(stateResponse.content);
    if (!parsed) {
      throw new Error("Story state extraction returned invalid JSON.");
    }

    const normalized = normalizeStoryStateToV2(parsed);
    currentState = {
      ...normalized,
      memoryArchitectureVersion: "2.0",
      indexes: {
        ...(normalized.indexes ?? {}),
        messageCount: total,
        messageNumberingVersion: "1.0",
      },
    };

    processed += chunk.length;
    onProgress?.({ processed, total, message: `Extracted ${processed}/${total} messages` });
  }

  const finalState = withIndexedMetadata({ ...currentState, memoryArchitectureVersion: "2.0" });
  const finalJson = JSON.stringify(finalState);

  return {
    stateJson: finalJson,
    summaryText: finalState.summaries?.worldSummary?.trim() || undefined,
  };
}
