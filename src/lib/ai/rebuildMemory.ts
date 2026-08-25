import type { StoryEngineRepository } from "../repository";
import type { AIProvider, AIChatMessage } from "./types";
import type { IndexingGap, StoryMessage, StoryStateDataV2 } from "../../types/models";
import { sortByTimestampAsc } from "../dates";
import { buildStoryStateExtractionPrompt, parseStoryStateData } from "./storyStateExtractor";
import {
	buildIndexingContinuitySnapshot,
	serializeIndexingContinuitySnapshot,
} from "./indexingContinuitySnapshot";
import {
	estimatePromptTokens,
	estimateTokensFromText,
	logIndexingCallDiagnostics,
} from "./indexingDiagnostics";
import { repairMalformedTranscriptFormat } from "../storyText/transcriptFormatRepair";
import { normalizeSpeakerNamesInTranscript } from "../storyText/speakerLabels";
import { normalizeStoryStateToV2, reconcileStoryIndexes, safeParseStoryStateData, withIndexedMetadata, mergeStoryIndexesIncremental, mergeStoryStateForIndexing, applyOpenThreadReconciliation } from "../storyStateV2";
import { applyTranscriptPresenceGate } from "../transcriptPresence";
import { normalizePlayerCharacterAliases } from "../playerCharacterPrompt";
import { loadStoryImportedCharacters, mergeImportedCharacterAllowlist } from "../storyImportedCharacters";
import { ensureIndexedCharacterStatus } from "../characterStatus";
import { AIError, formatProviderRefusalDiagnostic } from "./errors";
import { extractFirstJsonObject, safeParseJsonObject } from "./json";
import { getIndexingRequestConfig } from "./models";
import { isDeterministicIndexingNoop } from "./indexingMessageClassification";

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

function resolveRefusalStage(error: AIError): IndexingGap["stage"] {
	const diagnostic = error.diagnostic ?? "";
	if (/(?:^|;\s*)stage=response(?:;|$)/i.test(diagnostic)) return "response";
	if (/(?:^|;\s*)stage=(?:prompt|request)(?:;|$)/i.test(diagnostic)) return "prompt";
	return "unknown";
}

function buildProviderRefusalGap(params: {
	messageNumber: number;
	model: string;
	error: AIError;
}): IndexingGap {
	const safeDiagnostic = formatProviderRefusalDiagnostic(
		params.error.diagnostic ?? params.error.message,
	);
	const diagnosticFingerprint = safeDiagnostic?.match(/fingerprint=(fnv1a:[0-9a-f]{8})/i)?.[1];
	return {
		messageNumber: params.messageNumber,
		code: "provider_refusal",
		model: params.model,
		stage: resolveRefusalStage(params.error),
		reason: "Provider declined both indexing prompts under its safeguards.",
		...(diagnosticFingerprint ? { diagnosticFingerprint } : {}),
		occurredAt: new Date().toISOString(),
	};
}

function withoutGapAtMessage(gaps: IndexingGap[] | undefined, messageNumber: number) {
	return (gaps ?? []).filter((gap) => gap.messageNumber !== messageNumber);
}

function resolveContiguousIndexedMessageCount(attempted: number, gaps: IndexingGap[] | undefined) {
	const firstGap = (gaps ?? [])
		.map((gap) => gap.messageNumber)
		.filter((messageNumber) => messageNumber >= 1 && messageNumber <= attempted)
		.sort((left, right) => left - right)[0];
	return firstGap ? firstGap - 1 : attempted;
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
  const storyImportedCharacters = await loadStoryImportedCharacters(story, (id) =>
    repository.getPlayerCharacter(id),
  );
  const universeImportedCharacters = mergeImportedCharacterAllowlist(
    story.universePackSnapshot?.universe?.importedCharacters ?? [],
    storyImportedCharacters,
  );

  const baseParsed = storyState?.stateJson ? safeParseStoryStateData(storyState.stateJson) : null;
  let currentState: StoryStateDataV2 = normalizeStoryStateToV2(baseParsed);
  currentState = {
    ...currentState,
    updatedAt: currentState.updatedAt ?? new Date().toISOString(),
    characters: currentState.characters ?? {},
    worldFacts: currentState.worldFacts ?? [],
    unresolvedThreads: currentState.unresolvedThreads ?? [],
    memoryArchitectureVersion: "2.0",
    ...(!incremental
      ? {
          lastDeepIndexedMessageCount: 0,
          lastDeepIndexAttemptedMessageCount: 0,
          indexingGaps: [],
        }
      : {}),
  };

  const persistCheckpoint = async () => {
    const now = new Date().toISOString();
    currentState = {
      ...currentState,
      updatedAt: now,
      characters: currentState.characters ?? {},
      worldFacts: currentState.worldFacts ?? [],
      unresolvedThreads: currentState.unresolvedThreads ?? [],
    };
    await repository.saveStoryState({
      id: storyState?.id ?? `story-state:${storyId}`,
      storyId,
      stateJson: JSON.stringify(currentState),
      updatedAt: now,
    });
  };

  // In incremental mode, only process messages added since the last AI deep-index run.
  // indexes.messageCount is bumped by the lightweight counter sync after every AI turn
  // and must NOT be used here — it would make every incremental run see 0 new messages.
  // The attempted cursor is the resume point even when a provider refusal left a typed gap.
  // The contiguous deep-index cursor remains behind the first gap for freshness reporting.
  const lastIndexedCount = incremental
    ? (baseParsed?.lastDeepIndexAttemptedMessageCount ??
      baseParsed?.lastDeepIndexedMessageCount ??
      baseParsed?.lastIndexedMessageCount ??
      0)
    : 0;
  const newMessages = messages.slice(lastIndexedCount);

  if (incremental && newMessages.length === 0) {
    const gapCount = baseParsed?.indexingGaps?.length ?? 0;
    onProgress?.({
      processed: total,
      total,
      message: gapCount
        ? `All messages have been attempted; ${gapCount} indexing gap${gapCount === 1 ? " remains" : "s remain"}.`
        : "Index is already up to date.",
      warning: gapCount
        ? `${gapCount} message${gapCount === 1 ? " was" : "s were"} declined by provider safeguards. Run a Full reindex to retry.`
        : undefined,
    });
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

    const chunkEnd = processed + chunk.length;
    const sanitizedChunk = chunk.map((message) =>
      message.role === "assistant"
        ? {
            ...message,
            content: sanitizeIndexingMessageContent(message.content, playerCharacter.name),
          }
        : message,
    );

    // Classify persisted structural messages before assistant transcript repair can
    // add formatting that makes a pure chapter marker look like story prose.
    if (chunk.every(isDeterministicIndexingNoop)) {
      const indexedAt = new Date().toISOString();
      const nextGaps = withoutGapAtMessage(currentState.indexingGaps, chunkEnd);
      currentState = {
        ...currentState,
        indexedAt,
        lastIndexedAt: indexedAt,
        lastDeepIndexedAt: indexedAt,
        lastIndexedMessageCount: chunkEnd,
        lastDeepIndexedMessageCount: resolveContiguousIndexedMessageCount(chunkEnd, nextGaps),
        lastDeepIndexAttemptedMessageCount: chunkEnd,
        indexingGaps: nextGaps,
      };
      processed += chunk.length;
      await persistCheckpoint();
      onProgress?.({
        processed,
        total,
        message: `Message ${chunkEnd}/${total} contained no indexable story event`,
      });
      continue;
    }

    const fullStateForPrompt = (() => {
      try {
        const { indexes: _indexes, ...stateForPrompt } = currentState as StoryStateDataV2 & {
          indexes?: StoryStateDataV2["indexes"];
        };
        return JSON.stringify(stateForPrompt);
      } catch {
        return "";
      }
    })();

    const continuitySnapshot = buildIndexingContinuitySnapshot({
      state: currentState,
      currentMessageNumber: chunkEnd,
      playerName: playerCharacter.name,
      playerAliases: normalizePlayerCharacterAliases(playerCharacter.aliases),
      currentChunkMessages: sanitizedChunk,
    });
    const continuitySnapshotJson = serializeIndexingContinuitySnapshot(continuitySnapshot);

    const extractionContext = buildStoryStateExtractionPrompt({
      playerName: playerCharacter.name,
      playerCharacter,
      recentMessages: sanitizedChunk,
      continuitySnapshotJson,
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

    const indexingStartedAtMs = Date.now();
    let responseContent: string;
    let activeGenerateParams = generateParams;
    let activeExtractionContext = extractionContext;
    let usedSafetyFallback = false;
    try {
      responseContent = await generateWithRetry(provider, generateParams);
    } catch (error) {
      if (!(error instanceof AIError) || error.code !== "safety_refusal") {
        throw error;
      }

      onProgress?.({
        processed,
        total,
        message: `Retrying message ${chunkEnd}/${total} with minimum context…`,
        warning: `Message ${chunkEnd}: the provider declined the full indexing context; retrying without the character sheet or continuity snapshot.`,
      });
      const minimizedExtractionContext = buildStoryStateExtractionPrompt({
        playerName: playerCharacter.name,
        playerCharacter: null,
        recentMessages: sanitizedChunk,
        messageNumberStart: processed + 1,
        messageNumberTotal: total,
        perMessageIndexing: chunk.length === 1,
      });
      const minimizedGenerateParams = {
        ...generateParams,
        messages: minimizedExtractionContext,
        maxAttempts: 1,
      };
      usedSafetyFallback = true;
      activeGenerateParams = minimizedGenerateParams;
      activeExtractionContext = minimizedExtractionContext;

      try {
        responseContent = await generateWithRetry(provider, minimizedGenerateParams);
      } catch (fallbackError) {
        if (!(fallbackError instanceof AIError) || fallbackError.code !== "safety_refusal") {
          throw fallbackError;
        }

        const gap = buildProviderRefusalGap({
          messageNumber: chunkEnd,
          model,
          error: fallbackError,
        });
        const nextGaps = [
          ...withoutGapAtMessage(currentState.indexingGaps, chunkEnd),
          gap,
        ].sort((left, right) => left.messageNumber - right.messageNumber);
        currentState = {
          ...currentState,
          lastDeepIndexedMessageCount: resolveContiguousIndexedMessageCount(chunkEnd, nextGaps),
          lastDeepIndexAttemptedMessageCount: chunkEnd,
          indexingGaps: nextGaps,
        };
        processed += chunk.length;
        await persistCheckpoint();
        onProgress?.({
          processed,
          total,
          message: `Message ${chunkEnd}/${total} could not be indexed; continuing`,
          warning: `Message ${chunkEnd}: provider safeguards declined both indexing prompts. The message was recorded as an indexing gap.`,
        });
        continue;
      }
    }
    logIndexingCallDiagnostics({
      storyId,
      messageNumber: chunkEnd,
      totalMessages: total,
      model,
      promptCharacters: activeExtractionContext.reduce((sum, message) => sum + (message.content?.length ?? 0), 0),
      estimatedInputTokens: estimatePromptTokens(activeExtractionContext),
      estimatedOutputTokens: estimateTokensFromText(responseContent),
      durationMs: Date.now() - indexingStartedAtMs,
      continuitySnapshotCharacters: usedSafetyFallback ? 0 : continuitySnapshotJson.length,
      fullStateCharacters: fullStateForPrompt.length,
    });

    if (signal?.aborted) {
      throw new Error("Rebuild aborted.");
    }

    onProgress?.({
      processed,
      total,
      message: `Parsing index update for message ${chunkEnd}/${total}…`,
    });

    let parsed = parseStoryStateData(responseContent);

    if (!parsed && !usedSafetyFallback) {
      // Parse failed — retry the AI call once before giving up
      onProgress?.({
        processed,
        total,
        message: `Retrying message ${chunkEnd}/${total} (AI response unparseable)…`,
      });
      await sleep(1000, signal);
      if (signal?.aborted) throw new Error("Rebuild aborted.");
      responseContent = await generateWithRetry(provider, activeGenerateParams);
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

    if (!parsed) {
      const head = responseContent.slice(0, 200).replace(/\n/g, " ");
      const tail = responseContent.slice(-200).replace(/\n/g, " ");
      const len = responseContent.length;
      throw new Error(
        `Story state extraction returned invalid JSON (${len} chars). Head: ${head || "(empty)"} … Tail: ${tail || "(empty)"}`,
      );
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
    const indexedAt = new Date().toISOString();
    const nextGaps = withoutGapAtMessage(currentState.indexingGaps, chunkEnd);
    currentState = {
      ...currentState,
      indexedAt,
      lastIndexedAt: indexedAt,
      lastDeepIndexedAt: indexedAt,
      lastIndexedMessageCount: chunkEnd,
      lastDeepIndexedMessageCount: resolveContiguousIndexedMessageCount(chunkEnd, nextGaps),
      lastDeepIndexAttemptedMessageCount: chunkEnd,
      indexingGaps: nextGaps,
    };
    await persistCheckpoint();
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
