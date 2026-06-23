import type { StoryEngineRepository } from "../repository";
import type { AIProvider, AIChatMessage } from "./types";
import type { StoryMessage, StoryStateDataV2 } from "../../types/models";
import { sortByTimestampAsc } from "../dates";
import { buildStoryStateExtractionPrompt, parseStoryStateData } from "./storyStateExtractor";
import { normalizeStoryStateToV2, safeParseStoryStateData, withIndexedMetadata } from "../storyStateV2";
import { AIError } from "./errors";

const REBUILD_REQUEST_TIMEOUT_MS = 180_000;
const REBUILD_MAX_ATTEMPTS = 3;

async function generateWithRetry(
  provider: AIProvider,
  params: { apiKey: string; model: string; messages: AIChatMessage[]; maxTokens: number; temperature: number; jsonMode: boolean; timeoutMs: number; signal?: AbortSignal },
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= REBUILD_MAX_ATTEMPTS; attempt++) {
    if (params.signal?.aborted) throw new Error("Rebuild aborted.");
    try {
      const result = await provider.generateResponse(params);
      return result.content;
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof AIError
          ? error.code === "provider_unavailable" || error.code === "rate_limited" || error.code === "timeout"
          : false;
      if (!retryable || attempt >= REBUILD_MAX_ATTEMPTS) throw error;
      const delayMs = 500 * Math.pow(2, attempt - 1);
      await new Promise<void>((resolve, reject) => {
        const id = setTimeout(resolve, delayMs);
        params.signal?.addEventListener("abort", () => { clearTimeout(id); reject(new Error("Rebuild aborted.")); }, { once: true });
      });
    }
  }
  throw lastError;
}

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
  const totalChunks = chunks.length;

  let processed = 0;
  onProgress?.({
    processed,
    total,
    message: total === 0
      ? "No messages to index."
      : `Loading ${total} message${total === 1 ? "" : "s"}…`,
  });

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex]!;
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
        // Strip indexes from the prompt — the model rebuilds them from the transcript.
        // Keeping them just bloats the prompt and pushes the response over token limits.
        const { indexes: _indexes, ...stateForPrompt } = currentState as any;
        return JSON.stringify(stateForPrompt);
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

    const chunkStart = processed + 1;
    const chunkEnd = processed + chunk.length;
    const chunkLabel = totalChunks > 1
      ? ` (batch ${chunkIndex + 1}/${totalChunks})`
      : "";

    const extractionContext = buildStoryStateExtractionPrompt({
      playerName: playerCharacter.name,
      playerCharacter,
      summaryText,
      recentMessages: chunk,
      existingStateJson,
      messageNumberStart: processed + 1,
      messageNumberTotal: total,
    });

    onProgress?.({
      processed,
      total,
      message: `Sending messages ${chunkStart}–${chunkEnd} to AI${chunkLabel}…`,
    });

    const responseContent = await generateWithRetry(provider, {
      apiKey,
      model,
      messages: extractionContext,
      maxTokens: 32768,
      temperature: 0,
      jsonMode: true,
      timeoutMs: REBUILD_REQUEST_TIMEOUT_MS,
      signal,
    });

    if (signal?.aborted) {
      throw new Error("Rebuild aborted.");
    }

    onProgress?.({
      processed,
      total,
      message: `Parsing AI response${chunkLabel}…`,
    });

    const parsed = parseStoryStateData(responseContent);
    if (!parsed) {
      const head = responseContent.slice(0, 200).replace(/\n/g, " ");
      const tail = responseContent.slice(-200).replace(/\n/g, " ");
      const len = responseContent.length;
      throw new Error(
        `Story state extraction returned invalid JSON (${len} chars). Head: ${head || "(empty)"} … Tail: ${tail || "(empty)"}`,
      );
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
    onProgress?.({
      processed,
      total,
      message: totalChunks > 1
        ? `Batch ${chunkIndex + 1}/${totalChunks} done — ${processed}/${total} messages indexed`
        : `${processed}/${total} messages indexed`,
    });
  }

  onProgress?.({ processed, total, message: "Building final indexes…" });

  const finalState = withIndexedMetadata({ ...currentState, memoryArchitectureVersion: "2.0" });
  const finalJson = JSON.stringify(finalState);

  return {
    stateJson: finalJson,
    summaryText: finalState.summaries?.worldSummary?.trim() || undefined,
  };
}
