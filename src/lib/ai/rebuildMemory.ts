import type { StoryEngineRepository } from "../repository";
import type { AIProvider, AIChatMessage } from "./types";
import type { StoryMessage, StoryStateDataV2 } from "../../types/models";
import { sortByTimestampAsc } from "../dates";
import { buildStoryStateExtractionPrompt, parseStoryStateData } from "./storyStateExtractor";
import { normalizeStoryStateToV2, safeParseStoryStateData, withIndexedMetadata } from "../storyStateV2";
import { AIError } from "./errors";
import { extractFirstJsonObject, safeParseJsonObject } from "./json";

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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(id); reject(new Error("Rebuild aborted.")); }, { once: true });
  });
}

export async function rebuildStoryMemoryAndIndexes(params: {
  storyId: string;
  repository: StoryEngineRepository;
  provider: AIProvider;
  apiKey: string;
  model: string;
  onProgress?: (p: { processed: number; total: number; message?: string; warning?: string }) => void;
  signal?: AbortSignal;
  incremental?: boolean;
}): Promise<{ stateJson: string; summaryText?: string }> {
  const { storyId, repository, provider, apiKey, model, onProgress, signal, incremental = false } = params;

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

  // In incremental mode, only process messages added since the last index run.
  const lastIndexedCount = incremental ? (baseParsed?.indexes?.messageCount ?? 0) : 0;
  const newMessages = messages.slice(lastIndexedCount);

  if (incremental && newMessages.length === 0) {
    onProgress?.({ processed: total, total, message: "Index is already up to date." });
    return {
      stateJson: storyState?.stateJson ?? JSON.stringify(currentState),
      summaryText: currentState.summaries?.worldSummary?.trim() || undefined,
    };
  }

  const chunkSize = 40;
  const chunks = chunkMessages(newMessages, chunkSize);
  const totalChunks = chunks.length;

  // processed tracks absolute message position (1-indexed offset used for prompt numbering)
  let processed = lastIndexedCount;
  onProgress?.({
    processed,
    total,
    message: newMessages.length === 0
      ? "No messages to index."
      : incremental
      ? `Indexing ${newMessages.length} new message${newMessages.length === 1 ? "" : "s"}…`
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

    const generateParams = {
      apiKey,
      model,
      messages: extractionContext,
      maxTokens: 32768,
      temperature: 0,
      jsonMode: true,
      timeoutMs: REBUILD_REQUEST_TIMEOUT_MS,
      signal,
    };

    onProgress?.({
      processed,
      total,
      message: `Sending messages ${chunkStart}–${chunkEnd} to AI${chunkLabel}…`,
    });

    let responseContent = await generateWithRetry(provider, generateParams);

    if (signal?.aborted) {
      throw new Error("Rebuild aborted.");
    }

    onProgress?.({
      processed,
      total,
      message: `Parsing AI response${chunkLabel}…`,
    });

    let parsed = parseStoryStateData(responseContent);

    if (!parsed) {
      // Parse failed — retry the AI call once before giving up
      onProgress?.({
        processed,
        total,
        message: `Retrying batch ${chunkIndex + 1}${totalChunks > 1 ? `/${totalChunks}` : ""} (AI response unparseable)…`,
      });
      await sleep(1000, signal);
      if (signal?.aborted) throw new Error("Rebuild aborted.");
      responseContent = await generateWithRetry(provider, generateParams);
      parsed = parseStoryStateData(responseContent);
      if (!parsed) {
        const head = responseContent.slice(0, 200).replace(/\n/g, " ");
        const tail = responseContent.slice(-200).replace(/\n/g, " ");
        const len = responseContent.length;
        throw new Error(
          `Story state extraction returned invalid JSON (${len} chars). Head: ${head || "(empty)"} … Tail: ${tail || "(empty)"}`,
        );
      }
    }

    // Check if truncation repair was silently used (direct parse fails but parseStoryStateData succeeded via repair)
    const directParse = safeParseJsonObject(extractFirstJsonObject(responseContent) ?? responseContent.trim());
    const wasRepaired = !directParse;

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
      warning: wasRepaired
        ? `Batch ${chunkIndex + 1}: AI response was truncated — partial data recovered. Some fields in this batch may be missing.`
        : undefined,
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
