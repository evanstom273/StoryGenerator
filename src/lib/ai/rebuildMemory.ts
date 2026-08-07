import type { StoryEngineRepository } from "../repository";
import type { AIProvider, AIChatMessage } from "./types";
import type { StoryMessage, StoryStateDataV2 } from "../../types/models";
import { sortByTimestampAsc } from "../dates";
import { buildStoryStateExtractionPrompt, parseStoryStateData } from "./storyStateExtractor";
import { repairMalformedTranscriptFormat } from "../storyText/transcriptFormatRepair";
import { normalizeSpeakerNamesInTranscript } from "../storyText/speakerLabels";
import { normalizeStoryStateToV2, reconcileStoryIndexes, safeParseStoryStateData, withIndexedMetadata, mergeStoryIndexesIncremental, mergeStoryStateForIndexing, applyOpenThreadReconciliation } from "../storyStateV2";
import { applyTranscriptPresenceGate } from "../transcriptPresence";
import { normalizePlayerCharacterAliases } from "../playerCharacterPrompt";
import { ensureIndexedCharacterStatus } from "../characterStatus";
import { AIError } from "./errors";
import { extractFirstJsonObject, safeParseJsonObject } from "./json";
import { getIndexingRequestConfig } from "./models";

const INDEXING_CHUNK_SIZE = 1;

async function generateWithRetry(
  provider: AIProvider,
  params: {
    apiKey: string;
    model: string;
    messages: AIChatMessage[];
    maxTokens: number;
    temperature: number;
    jsonMode: boolean;
    timeoutMs: number;
    maxAttempts: number;
    signal?: AbortSignal;
  },
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= params.maxAttempts; attempt++) {
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
      if (!retryable || attempt >= params.maxAttempts) throw error;
      const delayMs =
        error instanceof AIError && error.code === "rate_limited"
          ? 2000 * Math.pow(2, attempt - 1)
          : 500 * Math.pow(2, attempt - 1);
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

function sanitizeIndexingMessageContent(content: string, playerName: string) {
	return repairMalformedTranscriptFormat(normalizeSpeakerNamesInTranscript(content), {
		playerName,
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
  const universeImportedCharacters = story.universePackSnapshot?.universe?.importedCharacters ?? [];

  const baseParsed = storyState?.stateJson ? safeParseStoryStateData(storyState.stateJson) : null;
  let currentState: StoryStateDataV2 = normalizeStoryStateToV2(baseParsed);
  currentState = { ...currentState, memoryArchitectureVersion: "2.0" };

  // In incremental mode, only process messages added since the last AI deep-index run.
  // indexes.messageCount is bumped by the lightweight counter sync after every AI turn
  // and must NOT be used here — it would make every incremental run see 0 new messages.
  // lastDeepIndexedMessageCount is the correct checkpoint: it is only set when an actual
  // AI-powered deep index finishes.
  const lastIndexedCount = incremental
    ? (baseParsed?.lastDeepIndexedMessageCount ?? baseParsed?.lastIndexedMessageCount ?? 0)
    : 0;
  const newMessages = messages.slice(lastIndexedCount);

  if (incremental && newMessages.length === 0) {
    onProgress?.({ processed: total, total, message: "Index is already up to date." });
    return {
      stateJson: storyState?.stateJson ?? JSON.stringify(currentState),
      summaryText: currentState.summaries?.worldSummary?.trim() || undefined,
    };
  }

  const indexingConfig = getIndexingRequestConfig(model);
  const chunks = chunkMessages(newMessages, INDEXING_CHUNK_SIZE);
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

    const chunkEnd = processed + chunk.length;
    const extractionContext = buildStoryStateExtractionPrompt({
      playerName: playerCharacter.name,
      playerCharacter,
      summaryText,
      recentMessages: chunk.map((message) =>
        message.role === "assistant"
          ? {
              ...message,
              content: sanitizeIndexingMessageContent(message.content, playerCharacter.name),
            }
          : message,
      ),
      existingStateJson,
      existingOpenThreads: currentState.indexes?.openThreads,
      messageNumberStart: processed + 1,
      messageNumberTotal: total,
      perMessageIndexing: chunk.length === 1,
    });

    const generateParams = {
      apiKey,
      model,
      messages: extractionContext,
      maxTokens: indexingConfig.maxTokens,
      temperature: 0,
      jsonMode: true,
      timeoutMs: indexingConfig.timeoutMs,
      maxAttempts: indexingConfig.maxAttempts,
      signal,
    };

    onProgress?.({
      processed,
      total,
      message: `Indexing message ${chunkEnd}/${total}…`,
    });

    let responseContent = await generateWithRetry(provider, generateParams);

    if (signal?.aborted) {
      throw new Error("Rebuild aborted.");
    }

    onProgress?.({
      processed,
      total,
      message: `Parsing index update for message ${chunkEnd}/${total}…`,
    });

    let parsed = parseStoryStateData(responseContent);

    if (!parsed) {
      // Parse failed — retry the AI call once before giving up
      onProgress?.({
        processed,
        total,
        message: `Retrying message ${chunkEnd}/${total} (AI response unparseable)…`,
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

    const mergedIndexes = mergeStoryIndexesIncremental(currentState.indexes, normalized.indexes, total);
    const previousRelationships = currentState.indexes?.relationships ?? [];
    const newRelationships = normalized.indexes?.relationships ?? [];
    const combinedIndexes = {
      ...(mergedIndexes ?? currentState.indexes ?? {}),
      messageCount: total,
      messageNumberingVersion: "1.0" as const,
      relationships: [...previousRelationships, ...newRelationships],
    };
    const reconciledIndexes = reconcileStoryIndexes(combinedIndexes, total, {
      playerName: playerCharacter.name,
      playerAliases: normalizePlayerCharacterAliases(playerCharacter.aliases),
      universeImportedCharacters,
    });

    currentState = mergeStoryStateForIndexing(
      currentState,
      normalized,
      reconciledIndexes ?? combinedIndexes,
    );

    processed += chunk.length;
    onProgress?.({
      processed,
      total,
      message: totalChunks > 1
        ? `Message ${chunkEnd}/${total} indexed`
        : `${processed}/${total} messages indexed`,
      warning: wasRepaired
        ? `Message ${chunkEnd}: AI response was truncated — partial data recovered. Some fields may be missing.`
        : undefined,
    });
  }

  onProgress?.({ processed, total, message: "Building final indexes…" });

  const finalIndexes = reconcileStoryIndexes(currentState.indexes, total, {
    playerName: playerCharacter.name,
    playerAliases: normalizePlayerCharacterAliases(playerCharacter.aliases),
    universeImportedCharacters,
  });
  const finalState = ensureIndexedCharacterStatus(
    applyOpenThreadReconciliation(
      withIndexedMetadata({
        ...currentState,
        memoryArchitectureVersion: "2.0",
        ...(finalIndexes ? { indexes: finalIndexes } : {}),
      }),
      { playerName: playerCharacter.name, totalMessages: total },
    ),
    { playerName: playerCharacter.name },
  );
  const gatedState = applyTranscriptPresenceGate(finalState, messages, playerCharacter, {
    messageCount: total,
  });
  const finalJson = JSON.stringify(gatedState);

  return {
    stateJson: finalJson,
    summaryText: gatedState.summaries?.worldSummary?.trim() || undefined,
  };
}
