import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  storyEngineRepository,
  type StoryEngineRepository,
} from "../../lib/repository";
import {
  sortByCreatedAtDesc,
  sortByTimestampAsc,
  sortByUpdatedAtDesc,
} from "../../lib/dates";
import { createEntityId } from "../../lib/ids";
import { createAIProvider } from "../../lib/ai/providerFactory";
import {
  buildStoryChatContext,
  buildStorySummaryContext,
} from "../../lib/ai/contextBuilder";
import { getValidModel } from "../../lib/ai/models";
import { getSceneWordTarget, inferSceneDepth } from "../../lib/ai/sceneSizing";
import { buildPlayerAssistContext } from "../../lib/ai/playerAssistContext";
import {
  buildCharacterGeneratorSystemPrompt,
  type PlayerCharacterField,
} from "../../lib/ai/characterGenerator";
import {
  buildUniverseBlueprintSystemPrompt,
} from "../../lib/ai/universeGenerator";
import { extractFirstJsonObject, safeParseJsonObject } from "../../lib/ai/json";
import { buildMatureFictionPolicyBlock } from "../../lib/ai/matureFictionPolicy";
import {
  analyzeStoryInputSafety,
  formatLikelyFictionalSafetyRefusalMessage,
} from "../../lib/ai/storyInputSafety";
import {
  classifyAIGenerationError,
  createAIGenerationError,
  createGenerationFailure,
  GenerationFailureError,
  isGenerationFailureError,
  withTransmitSafeDiagnostics,
} from "../../lib/ai/errors";
import { buildTransmitSafeSystemNote, makeTransmitSafe } from "../../lib/ai/transmitSafe";
import type {
  AIChatMessage,
  AIProvider,
  GenerateResponseResult,
} from "../../lib/ai/types";
import { getArchiveIndexStatus } from "../../lib/archiveIndexing";
import {
  normalizeStoryStateToV2,
  finalizeStoryStateForSave,
  reconcileStoryIndexes,
  safeParseStoryStateData,
  withIndexedMetadata,
} from "../../lib/storyStateV2";
import { rebuildStoryMemoryAndIndexes } from "../../lib/ai/rebuildMemory";
import {
  formatStoryLongTermMemoryForPrompt,
  formatStorySceneStateForPrompt,
} from "../../lib/ai/storyStateExtractor";
import { runAndroidAutoBackupIfNeeded } from "../../lib/androidAutoBackup";
import {
  sendJobCompletionNotification,
} from "../../lib/jobNotifications";
import {
  getPlayerCharacterAuthorshipViolation,
} from "../../lib/storyText/playerProtection";
import {
  detectSceneStateRenarration,
  sanitizeAssistantTranscript,
} from "../../lib/storyText/transcriptSanitizer";
import { extractSpeakerPrefix } from "../../lib/storyText/extractSpeakerPrefix";
import { detectDirectorIntent, resolveExactMinutes } from "../../lib/storyText/directorIntent";
import { parseSceneBlocks } from "../../lib/storyText/parseSceneBlocks";
import { detectChapterBoundary } from "../../lib/storyText/chapterDetection";
import { extractRpStatChanges, type NpcInnerLifeUpdate, type RelationshipArcUpdate, type RpRelationshipDelta, type RpStatDelta } from "../../lib/ai/rpStatsExtractor";
import { applyStatChange, buildRpEventSummary, clampStat, defaultRpStats, getStatValue } from "../../lib/rpStats";
import { advanceTime, checkRecurringEvents, formatTimeShort } from "../../lib/rpTime";
import {
  formatUniverseWikiSources,
  getPrimaryUniverseWikiUrl,
  normalizeUniverseWikiSources,
} from "../../lib/universeSources";
import type {
  AIProviderType,
  AISettings,
  BackgroundJob,
  DeveloperBug,
  DeveloperBugDraft,
  DeveloperFeatureRequest,
  DeveloperFeatureRequestDraft,
  DeveloperTestingNote,
  DeveloperTestingNoteDraft,
  DirectorIntent,
  GuardedDeleteResult,
  PlayerCharacterExportBundleV1,
  PlayerCharacter,
  PlayerCharacterDraft,
  RelationshipIndexEntry,
  RelationshipTier,
  RpChangelogEntry,
  RpEventLogEntry,
  RpStats,
  RpTimeState,
  StorageStatus,
  Story,
  StoryAIConfig,
  StoryEngineBackup,
  StoryDraft,
  StoryExportBundle,
  StoryChapter,
  StoryUiState,
  StoryMetaMessage,
  StoryMessage,
  StoryMessageDraft,
  StoryState,
  StorySummary,
  UniverseExportBundleV1,
  Universe,
  UniverseDraft,
  UniverseImport,
  UniversePackSnapshotV1,
} from "../../types/models";

interface StoryEngineContextValue {
  loading: boolean;
  errorMessage: string | null;
  storageStatus: StorageStatus;
  universes: Universe[];
  playerCharacters: PlayerCharacter[];
  stories: Story[];
  messages: StoryMessage[];
  metaMessages: StoryMetaMessage[];
  chapters: StoryChapter[];
  backgroundJobs: BackgroundJob[];
  aiSettings: AISettings | null;
  developerBugs: DeveloperBug[];
  developerFeatureRequests: DeveloperFeatureRequest[];
  developerTestingNotes: DeveloperTestingNote[];
  rebuildStatus?: {
    storyId: string;
    phase: "idle" | "loading" | "extracting" | "saving" | "done" | "error";
    processedMessages: number;
    totalMessages: number;
    message?: string;
    error?: string;
    warning?: string;
  };
  jobNotice?: {
    id: string;
    title: string;
    body: string;
    storyId?: string;
    openMetaChat?: boolean;
  } | null;
  getUniverseById: (id: string) => Universe | undefined;
  getPlayerCharacterById: (id: string) => PlayerCharacter | undefined;
  getStoryById: (id: string) => Story | undefined;
  getDeveloperBugById: (id: string) => DeveloperBug | undefined;
  getDeveloperFeatureRequestById: (id: string) => DeveloperFeatureRequest | undefined;
  getDeveloperTestingNoteById: (id: string) => DeveloperTestingNote | undefined;
  getMessagesForStory: (storyId: string) => StoryMessage[];
  getMetaMessagesForStory: (storyId: string) => StoryMetaMessage[];
  getChaptersForStory: (storyId: string) => StoryChapter[];
  getJobsForStory: (storyId: string) => BackgroundJob[];
  getMetaChatDraft: (storyId: string) => string;
  getPlayerCharactersForUniverse: (universeId: string) => PlayerCharacter[];
  getStoriesForUniverse: (universeId: string) => Story[];
  getStoriesForPlayerCharacter: (playerCharacterId: string) => Story[];
  createUniverse: (draft: UniverseDraft) => Promise<Universe>;
  updateUniverse: (id: string, draft: UniverseDraft) => Promise<Universe | null>;
  generateUniverseBlueprint: (input: {
    name: string;
    concept: string;
    genreTheme?: string;
    tone?: string;
    existingBlueprint?: string;
  }) => Promise<{
    universeBlueprint: string;
    description?: string;
    genreTheme?: string;
    tone?: string;
  }>;
  deleteUniverse: (id: string) => Promise<GuardedDeleteResult>;
  createPlayerCharacter: (draft: PlayerCharacterDraft) => Promise<PlayerCharacter>;
  promoteStoryPlayerCharacter: (storyId: string) => Promise<PlayerCharacter>;
  cleanupDuplicatePlayerCharacters: () => Promise<{
    mergedDuplicates: number;
    updatedStories: number;
  }>;
  updatePlayerCharacter: (
    id: string,
    draft: PlayerCharacterDraft,
  ) => Promise<PlayerCharacter | null>;
  deletePlayerCharacter: (id: string) => Promise<GuardedDeleteResult>;
  createStory: (draft: StoryDraft) => Promise<Story>;
  updateStory: (id: string, patch: Partial<StoryDraft>) => Promise<Story | null>;
  deleteStory: (id: string) => Promise<void>;
  deleteAllStories: () => Promise<void>;
  deleteAllPlayerCharacters: () => Promise<void>;
  deleteAllUniverses: () => Promise<void>;
  createMessage: (draft: StoryMessageDraft) => Promise<StoryMessage>;
  updateMessage: (
    id: string,
    draft: Omit<StoryMessageDraft, "storyId">,
  ) => Promise<StoryMessage | null>;
  deleteMessage: (id: string) => Promise<void>;
  setMessageDirectorIntent: (
    messageId: string,
    intent: StoryMessage["directorIntent"] | null,
  ) => Promise<StoryMessage | null>;
  sendMetaChatMessage: (storyId: string, content: string) => Promise<StoryMetaMessage>;
  queueMetaChatMessage: (
    storyId: string,
    content: string,
  ) => Promise<{ job: BackgroundJob; duplicate: boolean }>;
  setMetaChatDraft: (storyId: string, draft: string) => Promise<void>;
  clearMetaChatDraft: (storyId: string) => Promise<void>;
  createDeveloperBug: (draft: DeveloperBugDraft) => Promise<DeveloperBug>;
  updateDeveloperBug: (id: string, draft: DeveloperBugDraft) => Promise<DeveloperBug | null>;
  deleteDeveloperBug: (id: string) => Promise<void>;
  createDeveloperFeatureRequest: (
    draft: DeveloperFeatureRequestDraft,
  ) => Promise<DeveloperFeatureRequest>;
  updateDeveloperFeatureRequest: (
    id: string,
    draft: DeveloperFeatureRequestDraft,
  ) => Promise<DeveloperFeatureRequest | null>;
  deleteDeveloperFeatureRequest: (id: string) => Promise<void>;
  createDeveloperTestingNote: (
    draft: DeveloperTestingNoteDraft,
  ) => Promise<DeveloperTestingNote>;
  updateDeveloperTestingNote: (
    id: string,
    draft: DeveloperTestingNoteDraft,
  ) => Promise<DeveloperTestingNote | null>;
  deleteDeveloperTestingNote: (id: string) => Promise<void>;
  exportStory: (
    storyId: string,
    opts?: { refreshArchiveIfStale?: boolean },
  ) => Promise<StoryExportBundle | null>;
  exportUniverse: (universeId: string) => Promise<UniverseExportBundleV1 | null>;
  exportPlayerCharacter: (
    characterId: string,
  ) => Promise<PlayerCharacterExportBundleV1 | null>;
  fetchStoryState: (storyId: string) => Promise<StoryState | null>;
  updateRpStats: (storyId: string, rpStats: RpStats | null) => Promise<void>;
  updateRelationshipsIndex: (storyId: string, relationships: RelationshipIndexEntry[]) => Promise<void>;
  refreshStoryState: (storyId: string, opts?: { force?: boolean }) => Promise<void>;
  updateIndexesDeep: (storyId: string, opts?: { signal?: AbortSignal; incremental?: boolean }) => Promise<void>;
  queueStoryIndexJob: (
    storyId: string,
    opts?: { trigger?: "manual" | "auto"; incremental?: boolean; force?: boolean },
  ) => Promise<{ job: BackgroundJob; duplicate: boolean }>;
  cancelBackgroundJob: (jobId: string) => Promise<BackgroundJob | null>;
  dismissJobNotice: () => void;
  importUniverseExport: (
    bundle: UniverseExportBundleV1,
  ) => Promise<{ universeId: string }>;
  importPlayerCharacterExport: (
    bundle: PlayerCharacterExportBundleV1,
    options: { universeId: string },
  ) => Promise<{ characterId: string }>;
  importStoryExport: (
    bundle: StoryExportBundle,
  ) => Promise<{ storyId: string; universeId: string; playerCharacterId: string }>;
  exportWorkspaceBackup: () => Promise<StoryEngineBackup>;
  importWorkspaceBackup: (
    backup: StoryEngineBackup,
    options?: { mode?: "merge" | "replace"; conflict?: "skip" | "overwrite" },
  ) => Promise<void>;
  saveAISettings: (next: {
    activeProviderType: AIProviderType;
    apiKeys?: Partial<Record<AIProviderType, string>>;
    defaultModels?: Partial<Record<AIProviderType, string>>;
  }) => Promise<AISettings>;
  validateAIConnection: (providerType?: AIProviderType) => Promise<void>;
  getStoryAIConfig: (storyId: string) => Promise<StoryAIConfig | null>;
  saveStoryAIConfig: (next: {
    storyId: string;
    providerType: AIProviderType;
    model?: string;
  }) => Promise<StoryAIConfig>;
  listUniverseImports: (universeId: string) => Promise<UniverseImport[]>;
  saveUniverseImport: (next: Omit<UniverseImport, "id">) => Promise<UniverseImport>;
  listStorySummaries: (storyId: string) => Promise<StorySummary[]>;
  generatePlayerAssistMessage: (
    storyId: string,
    opts?: { existingText?: string },
  ) => Promise<string>;
  generatePlayerCharacterDraft: (
    universeId: string,
    fields?: Array<keyof PlayerCharacterDraft>,
    existing?: Partial<PlayerCharacterDraft>,
  ) => Promise<Partial<PlayerCharacterDraft>>;
  sendChatMessage: (storyId: string, content: string, opts?: { zeroHpConsequence?: string; directorIntentOverride?: DirectorIntent }) => Promise<{ message: StoryMessage | null; appliedRpChanges: RpChangelogEntry[] | null; pendingCoreStatChanges: RpStatDelta[] | null; rpEventSummary: string | null; appliedRelationshipDeltas: RpRelationshipDelta[] | null }>;
  editAssistantMessage: (messageId: string, content: string) => Promise<StoryMessage | null>;
  regenerateLastAssistantMessage: (storyId: string) => Promise<StoryMessage>;
}

const AI_MAX_ATTEMPTS = 3;
const TERMINAL_JOB_RETENTION_MS = 10 * 60_000;
const TERMINAL_JOB_PRUNE_INTERVAL_MS = 60_000;

const JOB_DEBUG_URL = "http://127.0.0.1:7777/event";
const JOB_DEBUG_SESSION = "job-cancel-timeout";

function reportJobDebug(args: {
  hypothesisId: string;
  location: string;
  msg: string;
  data?: Record<string, unknown>;
}) {
  // #region debug-point job-cancel-timeout:report
  void fetch(JOB_DEBUG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: JOB_DEBUG_SESSION,
      runId: "pre-fix",
      hypothesisId: args.hypothesisId,
      location: args.location,
      msg: `[DEBUG] ${args.msg}`,
      data: args.data,
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}
const GENERATION_AUDIT_URL = "http://127.0.0.1:7777/event";
const GENERATION_AUDIT_SESSION = "generation-pipeline-audit";

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitWithSignal(ms: number, signal?: AbortSignal) {
  if (!signal) {
    return wait(ms);
  }

  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let timeoutId = 0;
    const onAbort = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      resolve();
    };

    timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function makeGenerationAuditTraceId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clipGenerationAuditText(value: string | null | undefined, max = 400) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) {
    return "";
  }
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function summarizeGenerationAuditMessages(messages: AIChatMessage[]) {
  const systemMessages = messages.filter((message) => message.role === "system");
  const assistantMessages = messages.filter((message) => message.role === "assistant");
  const userMessages = messages.filter((message) => message.role === "user");
  return {
    count: messages.length,
    systemCount: systemMessages.length,
    assistantCount: assistantMessages.length,
    userCount: userMessages.length,
    firstSystemPreview: clipGenerationAuditText(systemMessages[0]?.content),
    lastUserPreview: clipGenerationAuditText(userMessages[userMessages.length - 1]?.content),
  };
}

function reportGenerationAudit(args: {
  hypothesisId: string;
  traceId?: string;
  location: string;
  msg: string;
  data?: Record<string, unknown>;
  runId?: "pre-fix" | "post-fix";
}) {
  // #region debug-point generation-audit:report
  void fetch(GENERATION_AUDIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: GENERATION_AUDIT_SESSION,
      runId: args.runId ?? "pre-fix",
      hypothesisId: args.hypothesisId,
      traceId: args.traceId,
      location: args.location,
      msg: `[DEBUG] ${args.msg}`,
      data: args.data,
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function shouldRetryKind(kind: ReturnType<typeof classifyAIGenerationError>["kind"]) {
  return kind === "timeout" || kind === "provider";
}

async function generateResponseWithRetry(params: {
  providerType: string;
  provider: AIProvider;
  apiKey: string;
  model: string;
  messages: AIChatMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
  maxAttempts?: number;
  debugTrace?: {
    traceId: string;
    mode: "story" | "additive" | "metachat" | "summary" | "other";
    storyId?: string;
    stage: string;
    lastUserText?: string;
  };
}) {
  const maxAttempts = params.maxAttempts ?? AI_MAX_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (params.signal?.aborted) {
      throw new Error("Request aborted.");
    }
    // #region debug-point A:provider-request
    reportGenerationAudit({
      hypothesisId: "A",
      traceId: params.debugTrace?.traceId,
      location: "StoryEngineProvider.tsx:generateResponseWithRetry:start",
      msg: "provider request attempt started",
      data: {
        mode: params.debugTrace?.mode ?? "other",
        stage: params.debugTrace?.stage ?? "unknown",
        storyId: params.debugTrace?.storyId,
        providerType: params.providerType,
        model: params.model,
        attempt,
        maxAttempts,
        lastUserPreview: clipGenerationAuditText(params.debugTrace?.lastUserText),
        messageSummary: summarizeGenerationAuditMessages(params.messages),
      },
    });
    // #endregion
    try {
      const result = await params.provider.generateResponse({
        apiKey: params.apiKey,
        model: params.model,
        messages: params.messages,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        jsonMode: params.jsonMode,
        signal: params.signal,
      });
      // #region debug-point A:provider-response
      reportGenerationAudit({
        hypothesisId: "A",
        traceId: params.debugTrace?.traceId,
        location: "StoryEngineProvider.tsx:generateResponseWithRetry:success",
        msg: "provider request attempt succeeded",
        data: {
          mode: params.debugTrace?.mode ?? "other",
          stage: params.debugTrace?.stage ?? "unknown",
          providerType: params.providerType,
          model: params.model,
          attempt,
          contentLength: result.content?.length ?? 0,
          rawOutput: result.content ?? "",
        },
      });
      // #endregion
      return result;
    } catch (error) {
      lastError = error;
      const classified = classifyAIGenerationError(error);
      // #region debug-point A:provider-failure
      reportGenerationAudit({
        hypothesisId: "A",
        traceId: params.debugTrace?.traceId,
        location: "StoryEngineProvider.tsx:generateResponseWithRetry:failure",
        msg: "provider request attempt failed",
        data: {
          mode: params.debugTrace?.mode ?? "other",
          stage: params.debugTrace?.stage ?? "unknown",
          providerType: params.providerType,
          model: params.model,
          attempt,
          maxAttempts,
          classifiedKind: classified.kind,
          retryable: classified.retryable,
          diagnostic: classified.diagnostic,
        },
      });
      // #endregion
      if (attempt >= maxAttempts || !shouldRetryKind(classified.kind)) {
        throw new GenerationFailureError(
          createGenerationFailure(error, {
            providerName: params.providerType,
            model: params.model,
            attempts: attempt,
            maxAttempts,
          }),
        );
      }

      const base = 300;
      const backoff = base * Math.pow(3, attempt - 1);
      const jitter = Math.floor(Math.random() * 120);
      await waitWithSignal(backoff + jitter, params.signal);
    }
  }

  throw new GenerationFailureError(
    createGenerationFailure(lastError, {
      providerName: params.providerType,
      model: params.model,
      attempts: maxAttempts,
      maxAttempts,
    }),
  );
}

async function generateSummaryWithRetry(params: {
  providerType: string;
  provider: AIProvider;
  apiKey: string;
  model: string;
  storyTitle: string;
  messages: AIChatMessage[];
  existingSummary?: string;
  signal?: AbortSignal;
  maxAttempts?: number;
  debugTrace?: {
    traceId: string;
    storyId?: string;
    stage: string;
  };
}) {
  const maxAttempts = params.maxAttempts ?? AI_MAX_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (params.signal?.aborted) {
      throw new Error("Request aborted.");
    }
    // #region debug-point A:summary-request
    reportGenerationAudit({
      hypothesisId: "A",
      traceId: params.debugTrace?.traceId,
      location: "StoryEngineProvider.tsx:generateSummaryWithRetry:start",
      msg: "summary request attempt started",
      data: {
        storyId: params.debugTrace?.storyId,
        providerType: params.providerType,
        model: params.model,
        stage: params.debugTrace?.stage ?? "summary",
        attempt,
        maxAttempts,
        storyTitle: params.storyTitle,
        messageSummary: summarizeGenerationAuditMessages(params.messages),
      },
    });
    // #endregion
    try {
      const result = await params.provider.generateSummary({
        apiKey: params.apiKey,
        model: params.model,
        storyTitle: params.storyTitle,
        messages: params.messages,
        existingSummary: params.existingSummary,
        signal: params.signal,
      });
      // #region debug-point A:summary-response
      reportGenerationAudit({
        hypothesisId: "A",
        traceId: params.debugTrace?.traceId,
        location: "StoryEngineProvider.tsx:generateSummaryWithRetry:success",
        msg: "summary request attempt succeeded",
        data: {
          storyId: params.debugTrace?.storyId,
          providerType: params.providerType,
          model: params.model,
          attempt,
          summaryLength: typeof result === "string" ? result.length : 0,
          rawOutput: typeof result === "string" ? result : "",
        },
      });
      // #endregion
      return result;
    } catch (error) {
      lastError = error;
      const classified = classifyAIGenerationError(error);
      // #region debug-point A:summary-failure
      reportGenerationAudit({
        hypothesisId: "A",
        traceId: params.debugTrace?.traceId,
        location: "StoryEngineProvider.tsx:generateSummaryWithRetry:failure",
        msg: "summary request attempt failed",
        data: {
          storyId: params.debugTrace?.storyId,
          providerType: params.providerType,
          model: params.model,
          attempt,
          maxAttempts,
          classifiedKind: classified.kind,
          retryable: classified.retryable,
          diagnostic: classified.diagnostic,
        },
      });
      // #endregion
      if (attempt >= maxAttempts || !shouldRetryKind(classified.kind)) {
        throw new GenerationFailureError(
          createGenerationFailure(error, {
            providerName: params.providerType,
            model: params.model,
            attempts: attempt,
            maxAttempts,
          }),
        );
      }

      const base = 300;
      const backoff = base * Math.pow(3, attempt - 1);
      const jitter = Math.floor(Math.random() * 120);
      await waitWithSignal(backoff + jitter, params.signal);
    }
  }

  throw new GenerationFailureError(
    createGenerationFailure(lastError, {
      providerName: params.providerType,
      model: params.model,
      attempts: maxAttempts,
      maxAttempts,
    }),
  );
}

function rethrowUserFacingGenerationError(error: unknown, providerType: string): never {
  throw new GenerationFailureError(
    createGenerationFailure(error, {
      providerName: providerType,
      attempts: 1,
      maxAttempts: 1,
    }),
  );
}

function normalizeMetaChatWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatMetaChatCanonMessage(message: StoryMessage, playerCharacterName: string) {
  const content = normalizeMetaChatWhitespace(message.content ?? "");
  if (!content) {
    return "";
  }

  if (message.role === "user") {
    return `Player (${message.speakerName?.trim() || playerCharacterName}): ${content}`;
  }

  if (message.speakerType === "canon") {
    return `Canon (${message.speakerName?.trim() || "Unknown"}): ${content}`;
  }

  if (message.speakerType === "narrator") {
    return `Narrator: ${content}`;
  }

  if (message.role === "system" || message.speakerType === "system") {
    return `System: ${content}`;
  }

  return `Assistant: ${content}`;
}

function buildMetaChatCanonContext(params: {
  story: Story;
  universe: Universe;
  playerCharacter: PlayerCharacter;
  storyState: StoryState | null;
  messages: StoryMessage[];
  chapters: StoryChapter[];
}) {
  const normalizedState = (() => {
    const json = params.storyState?.stateJson?.trim() ?? "";
    if (!json) return null;
    const parsed = safeParseStoryStateData(json);
    return normalizeStoryStateToV2(parsed);
  })();

  const universeBlock = [
    `Universe name: ${params.universe.name}`,
    params.universe.description?.trim() ? `Universe description: ${params.universe.description.trim()}` : null,
    params.universe.concept?.trim() ? `Universe concept: ${params.universe.concept.trim()}` : null,
    params.universe.genreTheme?.trim() ? `Genre/theme: ${params.universe.genreTheme.trim()}` : null,
    params.universe.tone?.trim() ? `Tone: ${params.universe.tone.trim()}` : null,
    params.universe.universeBlueprint?.trim()
      ? `Universe blueprint:\n${params.universe.universeBlueprint.trim()}`
      : null,
    params.universe.notes?.trim() ? `Universe notes: ${params.universe.notes.trim()}` : null,
    formatUniverseWikiSources(params.universe).length
      ? `Reference sources:\n${formatUniverseWikiSources(params.universe).join("\n")}`
      : null,
  ]
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    .join("\n");

  const playerBlock = [
    `Name: ${params.playerCharacter.name}`,
    params.playerCharacter.age?.trim() ? `Age: ${params.playerCharacter.age.trim()}` : null,
    params.playerCharacter.gender?.trim() ? `Gender: ${params.playerCharacter.gender.trim()}` : null,
    params.playerCharacter.species?.trim() ? `Species: ${params.playerCharacter.species.trim()}` : null,
    params.playerCharacter.pronouns?.trim() ? `Pronouns: ${params.playerCharacter.pronouns.trim()}` : null,
    params.playerCharacter.characterConcept?.trim()
      ? `Concept/role: ${params.playerCharacter.characterConcept.trim()}`
      : null,
    params.playerCharacter.appearance?.trim()
      ? `Appearance: ${params.playerCharacter.appearance.trim()}`
      : null,
    params.playerCharacter.personality?.trim()
      ? `Personality: ${params.playerCharacter.personality.trim()}`
      : null,
    params.playerCharacter.background?.trim()
      ? `Background: ${params.playerCharacter.background.trim()}`
      : null,
    params.playerCharacter.goals?.trim() ? `Goals: ${params.playerCharacter.goals.trim()}` : null,
    params.playerCharacter.notes?.trim() ? `Notes: ${params.playerCharacter.notes.trim()}` : null,
  ]
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    .join("\n");

  const chaptersBlock = params.chapters.length
    ? params.chapters
        .map((chapter) =>
          [
            `${chapter.label} (ends at message #${chapter.endsAtIndex})`,
            chapter.summary?.trim() ? chapter.summary.trim() : null,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n")
    : "No chapters recorded yet.";

  const recentTranscript = sortByTimestampAsc(params.messages)
    .slice(-80)
    .map((message) => formatMetaChatCanonMessage(message, params.playerCharacter.name))
    .filter(Boolean)
    .join("\n\n");

  return normalizeMetaChatWhitespace(
    [
      `Story title: ${params.story.title}`,
      params.story.currentSummary?.trim() ? `Current summary: ${params.story.currentSummary.trim()}` : null,
      universeBlock ? `Universe Reference\n${universeBlock}` : null,
      playerBlock ? `Player Character Sheet\n${playerBlock}` : null,
      normalizedState
        ? `Full Indexed Memory\n${formatStoryLongTermMemoryForPrompt(normalizedState, {
            playerName: params.playerCharacter.name,
          })}`
        : "Full Indexed Memory\nNo indexed archive available yet.",
      normalizedState
        ? `Current Scene State\n${formatStorySceneStateForPrompt(normalizedState) || "No current scene state recorded yet."}`
        : null,
      `Chapters\n${chaptersBlock}`,
      recentTranscript ? `Recent Canon Transcript\n${recentTranscript}` : null,
    ]
      .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
      .join("\n\n"),
  );
}

const StoryEngineContext = createContext<StoryEngineContextValue | null>(null);

function normalizeDuplicateKeyPart(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isBlank(value: string | undefined) {
  return !value || !value.trim();
}

function getExistingActiveChapterLabel(
  storyId: string,
  storyMessages: StoryMessage[],
  storyChapters: StoryChapter[],
) {
  const sortedMessages = [...storyMessages]
    .filter((message) => message.storyId === storyId)
    .sort(
      (left, right) =>
        new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
    );
  const lastBoundary = [...sortedMessages]
    .reverse()
    .find((message) => message.chapterBoundary?.label?.trim());
  if (!lastBoundary?.chapterBoundary) {
    return null;
  }
  if (lastBoundary.chapterBoundary.kind === "start") {
    return lastBoundary.chapterBoundary.label;
  }
  const hasExplicitClose = storyChapters.some(
    (chapter) =>
      chapter.storyId === storyId && chapter.label === lastBoundary.chapterBoundary?.label,
  );
  return hasExplicitClose ? null : lastBoundary.chapterBoundary.label;
}

function mergePlayerCharacterFillEmpty(
  winner: PlayerCharacter,
  candidate: PlayerCharacter,
): PlayerCharacter {
  return {
    ...winner,
    age: isBlank(winner.age) ? candidate.age : winner.age,
    gender: isBlank(winner.gender) ? candidate.gender : winner.gender,
    species: isBlank(winner.species) ? candidate.species : winner.species,
    pronouns: isBlank(winner.pronouns) ? candidate.pronouns : winner.pronouns,
    characterConcept: isBlank(winner.characterConcept) ? candidate.characterConcept : winner.characterConcept,
    appearance: isBlank(winner.appearance) ? candidate.appearance : winner.appearance,
    personality: isBlank(winner.personality) ? candidate.personality : winner.personality,
    background: isBlank(winner.background) ? candidate.background : winner.background,
    goals: isBlank(winner.goals) ? candidate.goals : winner.goals,
    notes: isBlank(winner.notes) ? candidate.notes : winner.notes,
  };
}

function buildStorageStatus(
  ready: boolean,
  universes: Universe[],
  playerCharacters: PlayerCharacter[],
  stories: Story[],
  messages: StoryMessage[],
  errorMessage: string | null,
): StorageStatus {
  return {
    driver: "IndexedDB",
    ready,
    universesCount: universes.length,
    playerCharactersCount: playerCharacters.length,
    storiesCount: stories.length,
    messagesCount: messages.length,
    totalRecords:
      universes.length + playerCharacters.length + stories.length + messages.length,
    errorMessage: errorMessage ?? undefined,
  };
}

interface StoryEngineProviderProps {
  children: ReactNode;
  repository?: StoryEngineRepository;
}

function applyRelationshipDeltas(
  existing: RelationshipIndexEntry[],
  deltas: RpRelationshipDelta[],
  playerName: string,
  innerLifeUpdates?: NpcInnerLifeUpdate[],
  arcUpdates?: RelationshipArcUpdate[],
): RelationshipIndexEntry[] {
  const playerNorm = playerName.toLowerCase().trim();
  const working: RelationshipIndexEntry[] = existing.map((e) => ({ ...e }));

  const VALID_TIERS = new Set<string>(["devoted","lover","partner","best friend","confidant","close friend","friend","family","mentor","mentee","caregiver","patient","ally","colleague","professional","acquaintance","stranger","complicated","guarded","distant","estranged","rival","adversary","enemy","nemesis","threat"]);

  function findOrCreate(characterName: string, tier?: string): number | null {
    const nameNorm = characterName.toLowerCase().trim();
    if (nameNorm === playerNorm) return null;
    const idx = working.findIndex(
      (r) => r.a.toLowerCase().trim() === nameNorm || r.b.toLowerCase().trim() === nameNorm,
    );
    if (idx !== -1) return idx;
    const resolvedTier: RelationshipTier = (tier && VALID_TIERS.has(tier) ? tier : "stranger") as RelationshipTier;
    working.push({ a: playerName, b: characterName, tier: resolvedTier, trust: 50, affection: 50, fear: 50, dependency: 50 });
    return working.length - 1;
  }

  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

  for (const delta of deltas) {
    const idx = findOrCreate(delta.characterName, delta.tier);
    if (idx === null) continue;
    const entry = working[idx]!;
    if (delta.trust !== undefined) entry.trust = clamp((entry.trust ?? 50) + delta.trust);
    if (delta.affection !== undefined) entry.affection = clamp((entry.affection ?? 50) + delta.affection);
    if (delta.fear !== undefined) entry.fear = clamp((entry.fear ?? 50) + delta.fear);
    if (delta.dependency !== undefined) entry.dependency = clamp((entry.dependency ?? 50) + delta.dependency);
  }

  for (const u of innerLifeUpdates ?? []) {
    const idx = findOrCreate(u.characterName, u.tier);
    if (idx === null) continue;
    const entry = working[idx]!;
    const prev = entry.npcInnerLife ?? {};
    entry.npcInnerLife = {
      ...prev,
      ...(u.emotionalState ? { emotionalState: u.emotionalState } : {}),
      ...(u.howTheyDescribeYou ? { howTheyDescribeYou: u.howTheyDescribeYou } : {}),
      ...(u.whatTheyWant ? { whatTheyWant: u.whatTheyWant } : {}),
      ...(u.whatTheyreNotSaying ? { whatTheyreNotSaying: u.whatTheyreNotSaying } : {}),
    };
  }

  for (const u of arcUpdates ?? []) {
    const idx = findOrCreate(u.characterName, u.tier);
    if (idx === null) continue;
    const entry = working[idx]!;
    const prev = entry.arc ?? {};
    entry.arc = {
      ...prev,
      ...(u.statusPhrase ? { statusPhrase: u.statusPhrase } : {}),
      ...(u.tension ? { tension: u.tension } : {}),
      ...(u.newMilestone ? { milestones: [...(prev.milestones ?? []), u.newMilestone].slice(-10) } : {}),
    };
  }

  return working;
}

export function StoryEngineProvider({
  children,
  repository = storyEngineRepository,
}: StoryEngineProviderProps) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [playerCharacters, setPlayerCharacters] = useState<PlayerCharacter[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [messages, setMessages] = useState<StoryMessage[]>([]);
  const [metaMessages, setMetaMessages] = useState<StoryMetaMessage[]>([]);
  const [chapters, setChapters] = useState<StoryChapter[]>([]);
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>([]);
  const [storyUiStates, setStoryUiStates] = useState<StoryUiState[]>([]);
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
  const [developerBugs, setDeveloperBugs] = useState<DeveloperBug[]>([]);
  const [developerFeatureRequests, setDeveloperFeatureRequests] = useState<
    DeveloperFeatureRequest[]
  >([]);
  const [developerTestingNotes, setDeveloperTestingNotes] = useState<
    DeveloperTestingNote[]
  >([]);
  const [rebuildStatus, setRebuildStatus] = useState<StoryEngineContextValue["rebuildStatus"]>();
  const [jobNotice, setJobNotice] = useState<StoryEngineContextValue["jobNotice"]>(null);
  const rebuildAbortRef = useRef<AbortController | null>(null);
  const activeBackgroundJobRef = useRef<string | null>(null);
  const backgroundJobControllersRef = useRef<Record<string, AbortController>>({});

  function normalizeAISettings(value: unknown): AISettings | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const record = value as any;

    if (
      record.id === "ai-settings" &&
      typeof record.activeProviderType === "string" &&
      typeof record.apiKeys === "object" &&
      record.apiKeys !== null &&
      typeof record.defaultModels === "object" &&
      record.defaultModels !== null
    ) {
      return record as AISettings;
    }

    if (
      record.id === "ai-settings" &&
      typeof record.providerType === "string" &&
      typeof record.apiKey === "string" &&
      typeof record.model === "string"
    ) {
      const providerType = record.providerType as AIProviderType;
      const now = new Date().toISOString();

      return {
        id: "ai-settings",
        activeProviderType: providerType,
        apiKeys: { [providerType]: record.apiKey } as Partial<
          Record<AIProviderType, string>
        >,
        defaultModels: { [providerType]: record.model } as Partial<
          Record<AIProviderType, string>
        >,
        createdAt: record.createdAt ?? now,
        updatedAt: now,
      };
    }

    return null;
  }

  const getNormalizedAISettings = useCallback(async () => {
    const stored = await repository.getAISettings();
    const normalized = normalizeAISettings(stored);

    if (normalized && stored && (stored as any).apiKey !== undefined) {
      await repository.saveAISettings(normalized);
    }

    return normalized;
  }, [repository]);

  const hydrate = useCallback(
    async (showLoadingState: boolean) => {
      if (showLoadingState) {
        setLoading(true);
      }

      try {
        const [
          nextUniverses,
          nextPlayerCharacters,
          nextStories,
          nextMessages,
          nextMetaMessages,
          nextChapters,
          nextBackgroundJobs,
          nextStoryUiStates,
          nextAISettings,
          nextDeveloperBugs,
          nextDeveloperFeatureRequests,
          nextDeveloperTestingNotes,
        ] = await Promise.all([
          repository.listUniverses(),
          repository.listPlayerCharacters(),
          repository.listStories(),
          repository.listAllMessages(),
          repository.listAllStoryMetaMessages(),
          repository.listAllStoryChapters(),
          repository.listBackgroundJobs(),
          repository.listStoryUiStates(),
          getNormalizedAISettings().catch(() => null),
          repository.listDeveloperBugs(),
          repository.listDeveloperFeatureRequests(),
          repository.listDeveloperTestingNotes(),
        ]);

        const terminalCandidates = nextBackgroundJobs.filter(
          (job) => job.status === "complete" || job.status === "failed" || job.status === "cancelled",
        );
        const nowMs = Date.now();
        const terminalJobIdsToDelete = new Set(
          terminalCandidates
            .filter((job) => {
              const referenceTime = job.finishedAt ?? job.startedAt ?? job.createdAt;
              const ts = referenceTime ? new Date(referenceTime).getTime() : 0;
              return ts > 0 && nowMs - ts > TERMINAL_JOB_RETENTION_MS;
            })
            .map((job) => job.id),
        );

        const runningJobsToReset = nextBackgroundJobs.filter(
          (job) =>
            job.status === "running" &&
            activeBackgroundJobRef.current !== job.id &&
            !backgroundJobControllersRef.current[job.id],
        );
        const runningJobIdsToReset = new Set(runningJobsToReset.map((job) => job.id));

        if (runningJobsToReset.length) {
          await Promise.all(
            runningJobsToReset.map((job) =>
              repository.saveBackgroundJob({
                ...job,
                status: "queued",
              }),
            ),
          );
        }

        if (terminalJobIdsToDelete.size) {
          await Promise.all(
            [...terminalJobIdsToDelete].map((jobId) => repository.deleteBackgroundJob(jobId)),
          );
        }

        const cleanedBackgroundJobs = nextBackgroundJobs
          .filter((job) => !terminalJobIdsToDelete.has(job.id))
          .map((job) =>
            runningJobIdsToReset.has(job.id)
              ? {
                  ...job,
                  status: "queued" as const,
                }
              : job,
          );

        setUniverses(sortByCreatedAtDesc(nextUniverses));
        setPlayerCharacters(
          sortByCreatedAtDesc(
            nextPlayerCharacters.map((character) => ({
              ...character,
              gender: (character as any).gender ?? "",
              pronouns: (character as any).pronouns ?? "",
            })),
          ),
        );
        setStories(sortByUpdatedAtDesc(nextStories));
        setMessages(sortByTimestampAsc(nextMessages));
        setMetaMessages(sortByTimestampAsc(nextMetaMessages));
        setChapters([...nextChapters].sort((a, b) => a.endsAtIndex - b.endsAtIndex));
        setBackgroundJobs(
          [...cleanedBackgroundJobs].sort(
            (left, right) =>
              new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
          ),
        );
        setStoryUiStates(nextStoryUiStates);
        setAiSettings(nextAISettings);
        setDeveloperBugs(
          [...nextDeveloperBugs].sort(
            (left, right) =>
              new Date(right.reportedAt).getTime() - new Date(left.reportedAt).getTime(),
          ),
        );
        setDeveloperFeatureRequests(sortByCreatedAtDesc(nextDeveloperFeatureRequests));
        setDeveloperTestingNotes(sortByCreatedAtDesc(nextDeveloperTestingNotes));
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load local workspace.",
        );
      } finally {
        if (showLoadingState) {
          setLoading(false);
        }
      }
    },
    [getNormalizedAISettings, repository],
  );

  useEffect(() => {
    void hydrate(true);
  }, [hydrate]);

  useEffect(() => {
    if (loading || errorMessage) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          const jobs = await repository.listBackgroundJobs();
          const nowMs = Date.now();
          const toDelete = jobs.filter((job) => {
            if (job.status !== "complete" && job.status !== "failed" && job.status !== "cancelled") {
              return false;
            }
            const referenceTime = job.finishedAt ?? job.startedAt ?? job.createdAt;
            const ts = referenceTime ? new Date(referenceTime).getTime() : 0;
            return ts > 0 && nowMs - ts > TERMINAL_JOB_RETENTION_MS;
          });

          if (!toDelete.length) {
            return;
          }

          await Promise.all(toDelete.map((job) => repository.deleteBackgroundJob(job.id)));
          await hydrate(false);
        } catch {}
      })();
    }, TERMINAL_JOB_PRUNE_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [errorMessage, hydrate, loading, repository]);

  useEffect(() => {
    const ready = !loading && !errorMessage;
    if (!ready) {
      return;
    }

    let listener: { remove: () => Promise<void> } | { remove: () => void } | null = null;

    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
          return;
        }

        await runAndroidAutoBackupIfNeeded(repository);

        const { App } = await import("@capacitor/app");
        listener = await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            return;
          }
          void runAndroidAutoBackupIfNeeded(repository);
        });
      } catch {}
    })();

    return () => {
      void (async () => {
        try {
          await listener?.remove();
        } catch {}
      })();
    };
  }, [errorMessage, loading, repository]);

  const resolveAIProfile = useCallback(
    async (providerType: AIProviderType, storyModelOverride?: string) => {
      const settings = await getNormalizedAISettings();

      if (!settings) {
        throw new Error("Configure an AI provider in Settings before generating messages.");
      }

      const apiKey = settings.apiKeys?.[providerType]?.trim() ?? "";

      if (!apiKey) {
        switch (providerType) {
          case "gemini":
            throw new Error("Set a Gemini API key in Settings before generating scenes.");
          case "openrouter":
            throw new Error("Set an OpenRouter API key in Settings before generating scenes.");
          case "openai":
          default:
            throw new Error("Set an OpenAI API key in Settings before generating scenes.");
        }
      }

      const savedModel = storyModelOverride?.trim() || settings.defaultModels?.[providerType]?.trim();
      const resolvedModel = getValidModel(providerType, savedModel);

      if (!resolvedModel) {
        throw new Error("Set a model in Settings before generating scenes.");
      }

      return { settings, apiKey, model: resolvedModel };
    },
    [getNormalizedAISettings],
  );

  const touchStory = useCallback(
    async (storyId: string) => {
      const currentStory = await repository.getStory(storyId);

      if (!currentStory) {
        return;
      }

      await repository.saveStory({
        ...currentStory,
        updatedAt: new Date().toISOString(),
      });
    },
    [repository],
  );

  const saveStoryUiStateRecord = useCallback(
    async (storyId: string, patch: Partial<StoryUiState>) => {
      const current = await repository.getStoryUiState(storyId);
      const next: StoryUiState = {
        id: current?.id ?? `story-ui-state:${storyId}`,
        storyId,
        metaChatDraft: current?.metaChatDraft,
        updatedAt: new Date().toISOString(),
        ...patch,
      };

      if (!next.metaChatDraft?.trim()) {
        next.metaChatDraft = "";
      }

      await repository.saveStoryUiState(next);
      setStoryUiStates((currentStates) => {
        const otherStates = currentStates.filter((record) => record.storyId !== storyId);
        return [...otherStates, next];
      });
      return next;
    },
    [repository],
  );

  const queueStoryIndexJob = useCallback(
    async (storyId: string, opts?: { trigger?: "manual" | "auto"; incremental?: boolean; force?: boolean }) => {
      const existing = (await repository.listBackgroundJobs()).find(
        (job) =>
          job.type === "story_index" &&
          job.storyId === storyId &&
          (job.status === "queued" || job.status === "running"),
      );

      if (existing) {
        if (!opts?.force) return { job: existing, duplicate: true };
        // Force: cancel the existing job so the new one can queue immediately
        await repository.saveBackgroundJob({
          ...existing,
          status: "cancelled",
          finishedAt: new Date().toISOString(),
          error: undefined,
        });
        const existingController = backgroundJobControllersRef.current[existing.id];
        existingController?.abort();
        // Clear the active ref immediately so the new job can be picked up without
        // waiting for the old job's async cleanup to settle (which can take up to
        // REBUILD_REQUEST_TIMEOUT_MS if the abort signal lands mid-AI-call).
        // The finally block guards against clearing a different job's ref.
        if (activeBackgroundJobRef.current === existing.id) {
          activeBackgroundJobRef.current = null;
        }
      }

      const job: BackgroundJob = {
        id: createEntityId("background-job"),
        type: "story_index",
        storyId,
        createdAt: new Date().toISOString(),
        status: "queued",
        dedupeKey: `story_index:${storyId}`,
        payload: {
          trigger: opts?.trigger ?? "manual",
          incremental: opts?.incremental ?? false,
        },
      };

      await repository.saveBackgroundJob(job);
      await hydrate(false);
      return { job, duplicate: false };
    },
    [hydrate, repository],
  );

  const queueMetaChatMessage = useCallback(
    async (storyId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) {
        throw new Error("Message content is required.");
      }

      const jobId = createEntityId("background-job");
      const userMessage: StoryMetaMessage = {
        id: createEntityId("story-meta-message"),
        storyId,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
        jobId,
      };

      const job: BackgroundJob = {
        id: jobId,
        type: "metachat_generate",
        storyId,
        createdAt: new Date().toISOString(),
        status: "queued",
        payload: {
          content: trimmed,
          metaChatUserMessageId: userMessage.id,
          metaChatOpenOnComplete: true,
        },
      };

      await repository.saveStoryMetaMessage(userMessage);
      await repository.saveBackgroundJob(job);
      await saveStoryUiStateRecord(storyId, { metaChatDraft: "" });
      await hydrate(false);
      return { job, duplicate: false };
    },
    [hydrate, repository, saveStoryUiStateRecord],
  );

  const cancelBackgroundJob = useCallback(
    async (jobId: string) => {
      const current = await repository.getBackgroundJob(jobId);
      if (!current) {
        return null;
      }

      // #region debug-point job-cancel-timeout:cancel
      reportJobDebug({
        hypothesisId: "A",
        location: "StoryEngineProvider.tsx:cancelBackgroundJob",
        msg: "cancel requested",
        data: {
          jobId,
          jobType: current.type,
          jobStatus: current.status,
          storyId: current.storyId ?? null,
          controllerKnown: Boolean(backgroundJobControllersRef.current[jobId]),
        },
      });
      // #endregion

      backgroundJobControllersRef.current[jobId]?.abort();
      const next: BackgroundJob = {
        ...current,
        status: "cancelled",
        finishedAt: new Date().toISOString(),
        error: undefined,
      };
      await repository.saveBackgroundJob(next);
      await hydrate(false);
      return next;
    },
    [hydrate, repository],
  );

  const deliverJobNotice = useCallback(
    async (args: {
      jobId: string;
      storyId?: string;
      title: string;
      body: string;
      openMetaChat?: boolean;
    }) => {
      const delivered = await sendJobCompletionNotification({
        storyId: args.storyId,
        title: args.title,
        body: args.body,
        openMetaChat: args.openMetaChat,
      });

      if (!delivered) {
        setJobNotice({
          id: args.jobId,
          title: args.title,
          body: args.body,
          storyId: args.storyId,
          openMetaChat: args.openMetaChat,
        });
      }
    },
    [],
  );

  const runDeepIndexProcess = useCallback(
    async (storyId: string, opts?: { signal?: AbortSignal; trigger?: "manual" | "auto"; incremental?: boolean; jobId?: string }) => {
      rebuildAbortRef.current?.abort();
      const controller = new AbortController();
      rebuildAbortRef.current = controller;
      const signal = opts?.signal ?? controller.signal;

      // #region debug-point job-cancel-timeout:deep-index-start
      reportJobDebug({
        hypothesisId: "B",
        location: "StoryEngineProvider.tsx:runDeepIndexProcess:start",
        msg: "deep index started",
        data: {
          storyId,
          trigger: opts?.trigger ?? "manual",
          signalProvided: Boolean(opts?.signal),
          abortedAtStart: signal.aborted,
        },
      });
      // #endregion

      setRebuildStatus({
        storyId,
        phase: "loading",
        processedMessages: 0,
        totalMessages: 0,
        message: "Loading story...",
      });

      try {
        const story = await repository.getStory(storyId);
        if (!story) {
          throw new Error("Story not found.");
        }

        const storyConfig = await repository.getStoryAIConfig(storyId);
        const settings = await getNormalizedAISettings();

        if (!settings) {
          throw new Error("Configure an AI provider in Settings before re-indexing.");
        }

        const providerType = storyConfig?.providerType ?? settings.activeProviderType;
        const { apiKey, model } = await resolveAIProfile(providerType, storyConfig?.model);
        const provider = createAIProvider(providerType);

        const [allMessages, existingStoryState] = await Promise.all([
          repository.listStoryMessages(storyId),
          repository.getStoryState(storyId),
        ]);

        setRebuildStatus({
          storyId,
          phase: "extracting",
          processedMessages: 0,
          totalMessages: allMessages.length,
          message: `Re-indexing… 0/${allMessages.length} messages`,
        });

        const result = await rebuildStoryMemoryAndIndexes({
          storyId,
          repository,
          provider,
          apiKey,
          model,
          signal,
          incremental: opts?.incremental ?? false,
          onProgress: ({ processed, total, message, warning }) => {
            // #region debug-point job-cancel-timeout:deep-index-progress
            reportJobDebug({
              hypothesisId: "B",
              location: "StoryEngineProvider.tsx:runDeepIndexProcess:progress",
              msg: "deep index progress",
              data: {
                storyId,
                processed,
                total,
                message,
                aborted: signal.aborted,
              },
            });
            // #endregion
            setRebuildStatus((current) => {
              if (!current || current.storyId !== storyId) {
                return current;
              }

              return {
                ...current,
                phase: "extracting",
                processedMessages: processed,
                totalMessages: total,
                message,
                warning: warning ?? current.warning,
              };
            });
            // Mirror progress into the DB job record so the job card shows live status
            if (opts?.jobId) {
              void repository.getBackgroundJob(opts.jobId).then((liveJob) => {
                if (!liveJob || liveJob.status !== "running") return;
                void repository.saveBackgroundJob({
                  ...liveJob,
                  progress: {
                    current: processed,
                    total,
                    label: message ?? `${processed}/${total} messages`,
                  },
                }).catch(() => {});
              }).catch(() => {});
            }
          },
        });

        if (signal.aborted) {
          // #region debug-point job-cancel-timeout:deep-index-aborted
          reportJobDebug({
            hypothesisId: "B",
            location: "StoryEngineProvider.tsx:runDeepIndexProcess:post-rebuild",
            msg: "deep index observed aborted after rebuild returned",
            data: { storyId },
          });
          // #endregion
          throw new Error("Re-index aborted.");
        }

        setRebuildStatus((current) =>
          current && current.storyId === storyId
            ? {
                ...current,
                phase: "saving",
                message: "Saving indexed state...",
              }
            : current,
        );

        const now = new Date().toISOString();
        const nextStateJson = (() => {
          try {
            const parsed = safeParseStoryStateData(result.stateJson);
            if (!parsed) {
              // Preserve rpStats through fallback path (AI state failed V2 validation)
              try {
                const rawNew = JSON.parse(result.stateJson) as Record<string, unknown>;
                if (!rawNew.rpStats && existingStoryState?.stateJson) {
                  const rawPrev = JSON.parse(existingStoryState.stateJson) as Record<string, unknown>;
                  const prevRpStats = rawPrev?.rpStats ?? (safeParseStoryStateData(existingStoryState.stateJson))?.rpStats;
                  if (prevRpStats) return JSON.stringify({ ...rawNew, rpStats: prevRpStats });
                }
              } catch {}
              return result.stateJson;
            }
            return finalizeStoryStateForSave({
              parsedState: parsed,
              previousStateJson: existingStoryState?.stateJson,
              totalMessages: allMessages.length,
              now,
              mode: "deep",
              deepIndexTrigger: opts?.trigger ?? "manual",
            });
          } catch {
            return result.stateJson;
          }
        })();

        await repository.saveStoryState({
          id: `story-state:${storyId}`,
          storyId,
          stateJson: nextStateJson,
          updatedAt: now,
        });

        if (!story.currentSummary?.trim() && result.summaryText?.trim()) {
          await repository.saveStory({
            ...story,
            currentSummary: result.summaryText.trim(),
            updatedAt: new Date().toISOString(),
          });
        }

        await touchStory(storyId);
        await hydrate(false);

        const summaryLine = (() => {
          try {
            const parsed = JSON.parse(nextStateJson) as any;
            const indexes = parsed?.indexes;
            if (!indexes || typeof indexes !== "object") {
              return "Re-index complete.";
            }
            const characterCount =
              indexes.characters && typeof indexes.characters === "object"
                ? Object.keys(indexes.characters).length
                : 0;
            const locationCount =
              indexes.locations && typeof indexes.locations === "object"
                ? Object.keys(indexes.locations).length
                : 0;
            const threadCount = Array.isArray(indexes.openThreads)
              ? indexes.openThreads.length
              : 0;
            const relationshipCount = Array.isArray(indexes.relationships)
              ? indexes.relationships.length
              : 0;
            const parts = [
              characterCount ? `${characterCount} character${characterCount === 1 ? "" : "s"}` : null,
              locationCount ? `${locationCount} location${locationCount === 1 ? "" : "s"}` : null,
              relationshipCount ? `${relationshipCount} relationship${relationshipCount === 1 ? "" : "s"}` : null,
              threadCount ? `${threadCount} thread${threadCount === 1 ? "" : "s"}` : null,
            ].filter(Boolean);
            return parts.length
              ? `Re-index complete. Indexed: ${parts.join(", ")}.`
              : "Re-index complete.";
          } catch {
            return "Re-index complete.";
          }
        })();

        setRebuildStatus({
          storyId,
          phase: "done",
          processedMessages: allMessages.length,
          totalMessages: allMessages.length,
          message: summaryLine,
        });

        return summaryLine;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setRebuildStatus((current) =>
          current?.storyId === storyId
            ? { ...current, phase: "error", error: msg }
            : current,
        );
        throw error;
      } finally {
        if (rebuildAbortRef.current === controller) {
          rebuildAbortRef.current = null;
        }
      }
    },
    [getNormalizedAISettings, hydrate, repository, resolveAIProfile, touchStory],
  );

  const generateMetaChatAssistantReply = useCallback(
    async (storyId: string, content: string, signal?: AbortSignal) => {
      const trimmed = content.trim();
      if (!trimmed) {
        throw new Error("Message content is required.");
      }

      const story = await repository.getStory(storyId);
      if (!story) {
        throw new Error("Story not found.");
      }

      const [universe, playerCharacter, storyConfig, storyState, storyMessages, storyChapters] =
        await Promise.all([
          repository.getUniverse(story.universeId),
          repository.getPlayerCharacter(story.playerCharacterId),
          repository.getStoryAIConfig(storyId),
          repository.getStoryState(storyId),
          repository.listStoryMessages(storyId),
          repository.listStoryChapters(storyId),
        ]);

      if (!universe || !playerCharacter) {
        throw new Error("Story references missing universe or player character.");
      }

      const settings = await getNormalizedAISettings();
      if (!settings) {
        throw new Error("Configure an AI provider in Settings before generating messages.");
      }

      const providerType = storyConfig?.providerType ?? settings.activeProviderType;
      const { apiKey, model } = await resolveAIProfile(providerType, storyConfig?.model);
      const provider = createAIProvider(providerType);

      const effectiveUniverse = story.universePackSnapshot?.universe ?? universe;
      const contextBlock = buildMetaChatCanonContext({
        story,
        universe: effectiveUniverse,
        playerCharacter,
        storyState,
        messages: storyMessages,
        chapters: storyChapters,
      });

      const priorMetaHistory = sortByTimestampAsc(await repository.listStoryMetaMessages(storyId))
        .slice(-20)
        .map(
          (message) =>
            ({
              role: message.role === "assistant" ? "assistant" : "user",
              content: message.content,
            }) satisfies AIChatMessage,
        );

      const systemPrompt = [
        "You are MetaChat, an out-of-canon writer's room assistant for Story Engine.",
        "Hard rule: MetaChat is NOT canon and must never be treated as story reality.",
        "You have access to the full canon reference block below: use it freely for analysis, planning, questions, continuity checks, and archive discussion.",
        buildMatureFictionPolicyBlock({
          includeParity: true,
          includeAnalysisFocus: true,
        }),
        "Do not write the next story scene or in-character narration unless the user explicitly asks you to draft an out-of-canon example.",
        "Prefer analysis, planning, options, and questions. Be concise and practical.",
      ].join("\n");

      const assistantText = (
        await generateResponseWithRetry({
          providerType,
          provider,
          apiKey,
          model,
          signal,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "system", content: `Context (canon reference only):\n${contextBlock}` },
            ...priorMetaHistory,
          ],
        })
      ).content;

      return assistantText.trim();
    },
    [getNormalizedAISettings, repository, resolveAIProfile],
  );

  const processBackgroundJob = useCallback(
    async (job: BackgroundJob, signal: AbortSignal) => {
      // #region debug-point job-cancel-timeout:job-start
      reportJobDebug({
        hypothesisId: "C",
        location: "StoryEngineProvider.tsx:processBackgroundJob:start",
        msg: "job started",
        data: {
          jobId: job.id,
          jobType: job.type,
          storyId: job.storyId ?? null,
          jobStatus: job.status,
          abortedAtStart: signal.aborted,
        },
      });
      // #endregion

      const runningJob: BackgroundJob = {
        ...job,
        status: "running",
        startedAt: job.startedAt ?? new Date().toISOString(),
        error: undefined,
      };
      await repository.saveBackgroundJob(runningJob);
      await hydrate(false);

      try {
        if (job.type === "story_index") {
          const summaryLine = await runDeepIndexProcess(job.storyId ?? "", {
            signal,
            trigger: job.payload?.trigger ?? "manual",
            incremental: job.payload?.incremental ?? false,
            jobId: job.id,
          });
          const refreshed = await repository.getBackgroundJob(job.id);
          if (signal.aborted || refreshed?.status === "cancelled") {
            await repository.saveBackgroundJob({
              ...runningJob,
              status: "cancelled",
              finishedAt: new Date().toISOString(),
              error: undefined,
            });
            await hydrate(false);
            return;
          }
          const story = job.storyId ? await repository.getStory(job.storyId) : null;
          const completedJob: BackgroundJob = {
            ...runningJob,
            status: "complete",
            finishedAt: new Date().toISOString(),
            result: {
              notificationTitle: story ? `Indexing complete for ${story.title}` : "Indexing complete",
              notificationBody: summaryLine,
            },
          };
          await repository.saveBackgroundJob(completedJob);
          // #region debug-point job-cancel-timeout:job-complete
          reportJobDebug({
            hypothesisId: "C",
            location: "StoryEngineProvider.tsx:processBackgroundJob:complete",
            msg: "job completed",
            data: {
              jobId: completedJob.id,
              jobType: completedJob.type,
              storyId: completedJob.storyId ?? null,
              status: completedJob.status,
              aborted: signal.aborted,
            },
          });
          // #endregion
          await deliverJobNotice({
            jobId: completedJob.id,
            storyId: job.storyId,
            title:
              completedJob.result?.notificationTitle ?? "Indexing complete",
            body: completedJob.result?.notificationBody ?? summaryLine,
          });
        } else if (job.type === "metachat_generate") {
          const currentJob = await repository.getBackgroundJob(job.id);
          if (currentJob?.status === "cancelled") {
            return;
          }
          const userText = job.payload?.content ?? "";
          const assistantText = await generateMetaChatAssistantReply(
            job.storyId ?? "",
            userText,
            signal,
          );
          const refreshed = await repository.getBackgroundJob(job.id);
          if (signal.aborted || refreshed?.status === "cancelled") {
            return;
          }
          const assistantMessage: StoryMetaMessage = {
            id: createEntityId("story-meta-message"),
            storyId: job.storyId ?? "",
            role: "assistant",
            content: assistantText,
            timestamp: new Date().toISOString(),
            jobId: job.id,
          };
          await repository.saveStoryMetaMessage(assistantMessage);
          const story = job.storyId ? await repository.getStory(job.storyId) : null;
          const completedJob: BackgroundJob = {
            ...runningJob,
            status: "complete",
            finishedAt: new Date().toISOString(),
            result: {
              messageId: assistantMessage.id,
              notificationTitle: story
                ? `MetaChat reply ready for ${story.title}`
                : "MetaChat reply ready",
              notificationBody: "Your out-of-canon assistant reply is ready.",
              openMetaChat: Boolean(job.payload?.metaChatOpenOnComplete),
            },
          };
          await repository.saveBackgroundJob(completedJob);
          await hydrate(false);
          // #region debug-point job-cancel-timeout:job-complete
          reportJobDebug({
            hypothesisId: "C",
            location: "StoryEngineProvider.tsx:processBackgroundJob:complete",
            msg: "job completed",
            data: {
              jobId: completedJob.id,
              jobType: completedJob.type,
              storyId: completedJob.storyId ?? null,
              status: completedJob.status,
              aborted: signal.aborted,
            },
          });
          // #endregion
          await deliverJobNotice({
            jobId: completedJob.id,
            storyId: job.storyId,
            title:
              completedJob.result?.notificationTitle ?? "MetaChat reply ready",
            body:
              completedJob.result?.notificationBody ??
              "Your out-of-canon assistant reply is ready.",
            openMetaChat: completedJob.result?.openMetaChat,
          });
        }
      } catch (error) {
        const latest = await repository.getBackgroundJob(job.id);
        // #region debug-point job-cancel-timeout:job-error
        reportJobDebug({
          hypothesisId: "C",
          location: "StoryEngineProvider.tsx:processBackgroundJob:catch",
          msg: "job threw",
          data: {
            jobId: job.id,
            jobType: job.type,
            storyId: job.storyId ?? null,
            aborted: signal.aborted,
            latestStatus: latest?.status ?? null,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        // #endregion
        if (signal.aborted || latest?.status === "cancelled") {
          try {
            await repository.saveBackgroundJob({
              ...runningJob,
              status: "cancelled",
              finishedAt: new Date().toISOString(),
              error: undefined,
            });
          } catch {}
          await hydrate(false).catch(() => {});
          return;
        }
        try {
          await repository.saveBackgroundJob({
            ...runningJob,
            status: "failed",
            finishedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : "Background job failed.",
          });
        } catch {}
        await hydrate(false).catch(() => {});
        throw error;
      }
    },
    [deliverJobNotice, generateMetaChatAssistantReply, hydrate, repository, runDeepIndexProcess],
  );

  useEffect(() => {
    if (loading || errorMessage) {
      return;
    }

    // If the tracked active job is no longer queued/running in state, the
    // processBackgroundJob promise must have settled and updated the DB, but
    // its .finally() cleanup hasn't fired yet (hydrate inside processBackgroundJob
    // triggers this effect before the outer .finally() runs). Proactively clear the
    // stale ref so the next queued job can be picked up immediately. The .finally()
    // guard (`ref === nextJob.id`) prevents it from re-clearing a different job's ref.
    if (activeBackgroundJobRef.current) {
      const isStillActive = backgroundJobs.some(
        (j) =>
          j.id === activeBackgroundJobRef.current &&
          (j.status === "queued" || j.status === "running"),
      );
      if (isStillActive) {
        return;
      }
      activeBackgroundJobRef.current = null;
    }

    const nextJob = backgroundJobs.find(
      (job) => job.status === "queued" || job.status === "running",
    );

    if (!nextJob) {
      return;
    }

    // #region debug-point job-cancel-timeout:runner-pick
    reportJobDebug({
      hypothesisId: "D",
      location: "StoryEngineProvider.tsx:jobRunner:pick",
      msg: "job runner picked job",
      data: {
        jobId: nextJob.id,
        jobType: nextJob.type,
        storyId: nextJob.storyId ?? null,
        status: nextJob.status,
        queuedCount: backgroundJobs.filter((job) => job.status === "queued").length,
        runningCount: backgroundJobs.filter((job) => job.status === "running").length,
      },
    });
    // #endregion

    const controller = new AbortController();
    activeBackgroundJobRef.current = nextJob.id;
    backgroundJobControllersRef.current[nextJob.id] = controller;

    void processBackgroundJob(nextJob, controller.signal).finally(() => {
      delete backgroundJobControllersRef.current[nextJob.id];
      // Only clear the ref if it still points to this job.
      // A force-cancel path may have already cleared it and set a new job's ref.
      if (activeBackgroundJobRef.current === nextJob.id) {
        activeBackgroundJobRef.current = null;
      }
      void hydrate(false);
    });
  }, [backgroundJobs, errorMessage, hydrate, loading, processBackgroundJob]);

  // Watchdog: periodic hydrate to unblock any queued jobs that the runner
  // missed due to timing gaps (stale ref not cleared before effect fired).
  useEffect(() => {
    const id = setInterval(() => void hydrate(false), 15_000);
    return () => clearInterval(id);
  }, [hydrate]);

  const value = useMemo<StoryEngineContextValue>(() => {
    const storageStatus = buildStorageStatus(
      !loading && !errorMessage,
      universes,
      playerCharacters,
      stories,
      messages,
      errorMessage,
    );

    const refreshStoryStateInternal = async (storyId: string, opts?: { force?: boolean }) => {
      const story = await repository.getStory(storyId);
      if (!story) {
        return;
      }

      const [playerCharacter, refreshedMessages, storyConfig, storyState] = await Promise.all([
        repository.getPlayerCharacter(story.playerCharacterId),
        repository.listStoryMessages(storyId),
        repository.getStoryAIConfig(storyId),
        repository.getStoryState(storyId),
      ]);

      if (!playerCharacter) {
        return;
      }

      const lastMessage = refreshedMessages[refreshedMessages.length - 1];
      if (
        !opts?.force &&
        storyState?.updatedAt &&
        lastMessage?.timestamp &&
        storyState.updatedAt >= lastMessage.timestamp
      ) {
        return;
      }

      const settings = await getNormalizedAISettings();
      if (!settings) {
        return;
      }

      const providerType = storyConfig?.providerType ?? settings.activeProviderType;
      const { apiKey, model } = await resolveAIProfile(providerType, storyConfig?.model);
      const provider = createAIProvider(providerType);

      const rebuilt = await rebuildStoryMemoryAndIndexes({
        storyId,
        repository,
        provider,
        apiKey,
        model,
        onProgress: () => {},
      });

      const now = new Date().toISOString();
      const nextStateJson = (() => {
        try {
          const parsed = safeParseStoryStateData(rebuilt.stateJson);
          if (!parsed) {
            // Preserve rpStats through fallback path (AI state failed V2 validation)
            try {
              const rawNew = JSON.parse(rebuilt.stateJson) as Record<string, unknown>;
              if (!rawNew.rpStats && storyState?.stateJson) {
                const rawPrev = JSON.parse(storyState.stateJson) as Record<string, unknown>;
                const prevRpStats = rawPrev?.rpStats ?? (safeParseStoryStateData(storyState.stateJson))?.rpStats;
                if (prevRpStats) return JSON.stringify({ ...rawNew, rpStats: prevRpStats });
              }
            } catch {}
            return rebuilt.stateJson;
          }

          return finalizeStoryStateForSave({
            parsedState: parsed,
            previousStateJson: storyState?.stateJson,
            totalMessages: refreshedMessages.length,
            now,
            mode: "deep",
          });
        } catch {
          return rebuilt.stateJson;
        }
      })();

      await repository.saveStoryState({
        id: `story-state:${storyId}`,
        storyId,
        stateJson: nextStateJson,
        updatedAt: now,
      });

      if (!story.currentSummary?.trim() && rebuilt.summaryText?.trim()) {
        await repository.saveStory({
          ...story,
          currentSummary: rebuilt.summaryText.trim(),
          updatedAt: new Date().toISOString(),
        });
      }
    };

    return {
      loading,
      errorMessage,
      storageStatus,
      universes,
      playerCharacters,
      stories,
      messages,
      metaMessages,
      chapters,
      backgroundJobs,
      aiSettings,
      developerBugs,
      developerFeatureRequests,
      developerTestingNotes,
      rebuildStatus,
      jobNotice,
      getUniverseById: (id) => universes.find((universe) => universe.id === id),
      getPlayerCharacterById: (id) =>
        playerCharacters.find((character) => character.id === id),
      getStoryById: (id) => stories.find((story) => story.id === id),
      getDeveloperBugById: (id) => developerBugs.find((bug) => bug.id === id),
      getDeveloperFeatureRequestById: (id) =>
        developerFeatureRequests.find((feature) => feature.id === id),
      getDeveloperTestingNoteById: (id) =>
        developerTestingNotes.find((note) => note.id === id),
      getMessagesForStory: (storyId) =>
        sortByTimestampAsc(messages.filter((message) => message.storyId === storyId)),
      getMetaMessagesForStory: (storyId) =>
        sortByTimestampAsc(metaMessages.filter((message) => message.storyId === storyId)),
      getChaptersForStory: (storyId) =>
        [...chapters]
          .filter((chapter) => chapter.storyId === storyId)
          .sort((a, b) => a.endsAtIndex - b.endsAtIndex),
      getJobsForStory: (storyId) =>
        backgroundJobs.filter((job) => job.storyId === storyId),
      getMetaChatDraft: (storyId) =>
        storyUiStates.find((record) => record.storyId === storyId)?.metaChatDraft ?? "",
      getPlayerCharactersForUniverse: (universeId) =>
        sortByCreatedAtDesc(
          playerCharacters.filter(
            (character) =>
              character.universeId === universeId &&
              (character.scope ?? "library") === "library",
          ),
        ),
      getStoriesForUniverse: (universeId) =>
        sortByUpdatedAtDesc(stories.filter((story) => story.universeId === universeId)),
      getStoriesForPlayerCharacter: (playerCharacterId) =>
        sortByUpdatedAtDesc(
          stories.filter((story) => story.playerCharacterId === playerCharacterId),
        ),
      async createUniverse(draft) {
        const mode = draft.mode ?? "referenced";
        const concept = (draft.concept ?? "").trim();
        const description = (draft.description ?? "").trim() || (mode === "custom" ? concept : "");
        const wikiUrls = normalizeUniverseWikiSources(draft);
        const nextUniverse: Universe = {
          id: createEntityId("universe"),
          name: draft.name.trim(),
          description,
          wikiUrl: getPrimaryUniverseWikiUrl({ wikiUrl: draft.wikiUrl, wikiUrls }),
          wikiUrls,
          mode,
          concept: mode === "custom" && concept ? concept : undefined,
          genreTheme: draft.genreTheme?.trim() || undefined,
          tone: draft.tone?.trim() || undefined,
          universeBlueprint: draft.universeBlueprint?.trim() || undefined,
          notes: draft.notes?.trim() || undefined,
          importedLore: [],
          importedCharacters: [],
          importedLocations: [],
          importedRelationships: [],
          createdAt: new Date().toISOString(),
        };

        await repository.saveUniverse(nextUniverse);
        await hydrate(false);

        return nextUniverse;
      },
      async updateUniverse(id, draft) {
        const currentUniverse = await repository.getUniverse(id);

        if (!currentUniverse) {
          return null;
        }

        const mode = draft.mode ?? (currentUniverse.mode ?? "referenced");
        const concept =
          typeof draft.concept === "string"
            ? draft.concept.trim()
            : (currentUniverse.concept ?? "").trim();
        const draftDescription =
          typeof draft.description === "string" ? draft.description.trim() : "";
        const description =
          draftDescription || (mode === "custom" ? concept : currentUniverse.description.trim());
        const wikiUrls = normalizeUniverseWikiSources({
          wikiUrl:
            typeof draft.wikiUrl === "string" ? draft.wikiUrl : currentUniverse.wikiUrl,
          wikiUrls: draft.wikiUrls ?? currentUniverse.wikiUrls,
        });
        const nextUniverse: Universe = {
          ...currentUniverse,
          name: draft.name.trim(),
          description,
          wikiUrl: getPrimaryUniverseWikiUrl({
            wikiUrl:
              typeof draft.wikiUrl === "string" ? draft.wikiUrl : currentUniverse.wikiUrl,
            wikiUrls,
          }),
          wikiUrls,
          mode,
          concept: mode === "custom" && concept ? concept : undefined,
          genreTheme: draft.genreTheme?.trim() || undefined,
          tone: draft.tone?.trim() || undefined,
          universeBlueprint: draft.universeBlueprint?.trim() || undefined,
          notes: draft.notes?.trim() || undefined,
        };

        await repository.saveUniverse(nextUniverse);
        await hydrate(false);

        return nextUniverse;
      },
      async generateUniverseBlueprint(input) {
        const settings = await getNormalizedAISettings();
        if (!settings) {
          throw new Error("Configure an AI provider in Settings before generating universes.");
        }

        const providerType = settings.activeProviderType;
        const { apiKey, model } = await resolveAIProfile(providerType);
        const provider = createAIProvider(providerType);

        const name = input.name.trim();
        const concept = input.concept.trim();
        if (!concept) {
          throw new Error("Universe concept is required.");
        }

        const systemPrompt = buildUniverseBlueprintSystemPrompt({
          universeName: name,
          concept,
          genreTheme: input.genreTheme?.trim() || undefined,
          tone: input.tone?.trim() || undefined,
          existingBlueprint: input.existingBlueprint?.trim() || undefined,
        });

        let response: GenerateResponseResult;
        try {
          response = await generateResponseWithRetry({
            providerType,
            provider,
            apiKey,
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: "Generate the JSON now." },
            ],
            maxTokens: 1200,
            temperature: 0,
            jsonMode: true,
          });
        } catch (error) {
          rethrowUserFacingGenerationError(error, providerType);
        }

        const jsonText = extractFirstJsonObject(response.content) ?? response.content.trim();
        const parsed = safeParseJsonObject<Record<string, unknown>>(jsonText);

        if (!parsed) {
          rethrowUserFacingGenerationError(
            createAIGenerationError(
              "parse",
              "Universe generator returned invalid JSON.",
              { diagnostic: jsonText.slice(0, 400) },
            ),
            providerType,
          );
        }

        const blueprint = parsed.universeBlueprint;
        if (typeof blueprint !== "string" || !blueprint.trim()) {
          rethrowUserFacingGenerationError(
            createAIGenerationError(
              "validation",
              "Universe generator did not return a universeBlueprint.",
            ),
            providerType,
          );
        }

        const description = parsed.description;
        const genreTheme = parsed.genreTheme;
        const tone = parsed.tone;

        return {
          universeBlueprint: blueprint.trim(),
          description: typeof description === "string" && description.trim() ? description.trim() : undefined,
          genreTheme: typeof genreTheme === "string" && genreTheme.trim() ? genreTheme.trim() : undefined,
          tone: typeof tone === "string" && tone.trim() ? tone.trim() : undefined,
        };
      },
      async deleteUniverse(id) {
        const linkedCharacters = playerCharacters.some(
          (character) => character.universeId === id,
        );
        const linkedStories = stories.some((story) => story.universeId === id);

        if (linkedCharacters || linkedStories) {
          return {
            ok: false,
            reason:
              "Remove or reassign linked player characters and stories before deleting this universe.",
          };
        }

        await repository.deleteUniverse(id);
        await hydrate(false);

        return { ok: true };
      },
      async createPlayerCharacter(draft) {
        const nextCharacter: PlayerCharacter = {
          id: createEntityId("player-character"),
          name: draft.name.trim(),
          age: draft.age.trim(),
          gender: draft.gender.trim(),
          species: draft.species?.trim() ?? "",
          pronouns: draft.pronouns.trim(),
          characterConcept: draft.characterConcept?.trim() || undefined,
          appearance: draft.appearance.trim(),
          personality: draft.personality.trim(),
          background: draft.background.trim(),
          goals: draft.goals.trim(),
          notes: draft.notes.trim(),
          universeId: draft.universeId,
          scope: draft.scope ?? "library",
          storyId: draft.storyId,
          createdAt: new Date().toISOString(),
        };

        await repository.savePlayerCharacter(nextCharacter);
        await hydrate(false);

        return nextCharacter;
      },
      async promoteStoryPlayerCharacter(storyId) {
        const story = await repository.getStory(storyId);

        if (!story) {
          throw new Error("Story not found.");
        }

        const playerCharacter = await repository.getPlayerCharacter(story.playerCharacterId);

        if (!playerCharacter) {
          throw new Error("Player character not found.");
        }

        if ((playerCharacter.scope ?? "library") !== "story") {
          throw new Error("This story is already using a library character.");
        }

        const promoted: PlayerCharacter = {
          ...playerCharacter,
          universeId: story.universeId,
          scope: "library",
          storyId: undefined,
          createdAt: new Date().toISOString(),
        };

        await repository.savePlayerCharacter(promoted);
        await hydrate(false);

        return promoted;
      },
      async cleanupDuplicatePlayerCharacters() {
        const [allCharacters, allStories] = await Promise.all([
          repository.listPlayerCharacters(),
          repository.listStories(),
        ]);

        const groups = new Map<string, PlayerCharacter[]>();
        for (const character of allCharacters) {
          const key = `${character.universeId}::${normalizeDuplicateKeyPart(character.name)}`;
          const existing = groups.get(key);
          if (existing) {
            existing.push(character);
          } else {
            groups.set(key, [character]);
          }
        }

        let mergedDuplicates = 0;
        let updatedStories = 0;

        for (const group of groups.values()) {
          if (group.length < 2) {
            continue;
          }

          const library = group.filter((character) => (character.scope ?? "library") === "library");
          const storyScoped = group.filter(
            (character) =>
              (character.scope ?? "library") === "story" || Boolean(character.storyId),
          );

          if (!library.length || !storyScoped.length) {
            continue;
          }

          const pool = [...library].sort((left, right) => {
            const timeDelta =
              new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
            return timeDelta || left.id.localeCompare(right.id);
          });

          const winnerBase = pool[0];
          const losers = group.filter((candidate) => candidate.id !== winnerBase.id);

          const mergedWinner = losers.reduce(
            (winner, candidate) => mergePlayerCharacterFillEmpty(winner, candidate),
            {
              ...winnerBase,
              scope: "library",
              storyId: undefined,
            } satisfies PlayerCharacter,
          );

          await repository.savePlayerCharacter(mergedWinner);

          const losingIds = new Set(losers.map((character) => character.id));
          for (const story of allStories) {
            if (!losingIds.has(story.playerCharacterId)) {
              continue;
            }

            updatedStories += 1;
            await repository.saveStory({
              ...story,
              playerCharacterId: mergedWinner.id,
              updatedAt: new Date().toISOString(),
            });
          }

          for (const loser of losers) {
            mergedDuplicates += 1;
            await repository.deletePlayerCharacter(loser.id);
          }
        }

        await hydrate(false);

        return { mergedDuplicates, updatedStories };
      },
      async updatePlayerCharacter(id, draft) {
        const currentCharacter = await repository.getPlayerCharacter(id);

        if (!currentCharacter) {
          return null;
        }

        const nextCharacter: PlayerCharacter = {
          ...currentCharacter,
          name: draft.name.trim(),
          age: draft.age.trim(),
          gender: draft.gender.trim(),
          species: draft.species?.trim() ?? "",
          pronouns: draft.pronouns.trim(),
          characterConcept: draft.characterConcept?.trim() || undefined,
          appearance: draft.appearance.trim(),
          personality: draft.personality.trim(),
          background: draft.background.trim(),
          goals: draft.goals.trim(),
          notes: draft.notes.trim(),
          universeId: draft.universeId,
          scope: draft.scope ?? currentCharacter.scope ?? "library",
          storyId: draft.storyId ?? currentCharacter.storyId,
        };

        const identityChanged =
          currentCharacter.name.trim() !== nextCharacter.name.trim() ||
          currentCharacter.pronouns.trim() !== nextCharacter.pronouns.trim() ||
          (currentCharacter.species ?? "").trim() !== (nextCharacter.species ?? "").trim() ||
          currentCharacter.gender.trim() !== nextCharacter.gender.trim() ||
          currentCharacter.universeId !== nextCharacter.universeId;

        await repository.savePlayerCharacter(nextCharacter);
        await hydrate(false);

        if (identityChanged) {
          const linkedStoryIds = Array.from(
            new Set([
              ...stories.filter((story) => story.playerCharacterId === id).map((story) => story.id),
              ...((nextCharacter.scope ?? "library") === "story" && nextCharacter.storyId ? [nextCharacter.storyId] : []),
            ]),
          );

          for (const storyId of linkedStoryIds) {
            void (async () => {
              try {
                await refreshStoryStateInternal(storyId, { force: true });
                setRebuildStatus({
                  storyId,
                  phase: "done",
                  processedMessages: 0,
                  totalMessages: 0,
                  message: "Story state updated due to character changes.",
                });
              } catch {}
            })();
          }
        }

        return nextCharacter;
      },
      async deletePlayerCharacter(id) {
        const linkedStories = stories.some((story) => story.playerCharacterId === id);

        if (linkedStories) {
          return {
            ok: false,
            reason:
              "Delete or move linked stories before deleting this player character.",
          };
        }

        await repository.deletePlayerCharacter(id);
        await hydrate(false);

        return { ok: true };
      },
      async createStory(draft) {
        const now = new Date().toISOString();
        const universePack = await repository.getUniverseExportBundle(draft.universeId);
        const universePackSnapshot: UniversePackSnapshotV1 | undefined = universePack
          ? {
              snapshotVersion: 1,
              exportedAt: universePack.exportedAt,
              packVersion: universePack.packVersion ?? 1,
              universe: universePack.universe,
              universeImports: universePack.universeImports,
            }
          : undefined;

        const nextStory: Story = {
          id: createEntityId("story"),
          title: draft.title.trim(),
          universeId: draft.universeId,
          playerCharacterId: draft.playerCharacterId,
          universePackSnapshot,
          matureFictionMode: draft.matureFictionMode,
          autoIndexInterval: draft.autoIndexInterval ?? 20,
          currentSummary: draft.currentSummary.trim(),
          createdAt: now,
          updatedAt: now,
        };

        await repository.saveStory(nextStory);
        await hydrate(false);

        return nextStory;
      },
      async updateStory(id, patch) {
        const currentStory = await repository.getStory(id);

        if (!currentStory) {
          return null;
        }

        const nextStory: Story = {
          ...currentStory,
          title: patch.title?.trim() ?? currentStory.title,
          currentSummary: patch.currentSummary?.trim() ?? currentStory.currentSummary,
          universeId: patch.universeId ?? currentStory.universeId,
          playerCharacterId:
            patch.playerCharacterId ?? currentStory.playerCharacterId,
          isArchived: patch.isArchived ?? currentStory.isArchived,
          matureFictionMode: patch.matureFictionMode ?? currentStory.matureFictionMode,
          rpMode: patch.rpMode ?? currentStory.rpMode,
          rpConfig: patch.rpConfig ?? currentStory.rpConfig,
          autoIndexMode: patch.autoIndexMode ?? currentStory.autoIndexMode,
          autoIndexInterval: patch.autoIndexInterval ?? currentStory.autoIndexInterval,
          updatedAt: new Date().toISOString(),
        };

        await repository.saveStory(nextStory);
        await hydrate(false);

        return nextStory;
      },
      async deleteStory(id) {
        await repository.deleteStory(id);
        await hydrate(false);
      },
      async deleteAllStories() {
        await repository.deleteAllStories();
        await hydrate(false);
      },
      async deleteAllPlayerCharacters() {
        await repository.deleteAllPlayerCharacters();
        await hydrate(false);
      },
      async deleteAllUniverses() {
        await repository.deleteAllUniverses();
        await hydrate(false);
      },
      async createMessage(draft) {
        const prefix = draft.role === "user" ? extractSpeakerPrefix(draft.content) : null;
        const nextMessage: StoryMessage = {
          id: createEntityId("story-message"),
          storyId: draft.storyId,
          role: draft.role,
          content: (prefix?.strippedContent ?? draft.content).trim(),
          timestamp: new Date().toISOString(),
          speakerName: draft.speakerName?.trim() || prefix?.speakerLabel || undefined,
          speakerType: draft.speakerType,
          directorIntent: draft.directorIntent,
          editedAt: draft.editedAt,
          regeneratedAt: draft.regeneratedAt,
          revision: draft.revision,
        };

        await repository.saveStoryMessage(nextMessage);
        await touchStory(draft.storyId);
        await hydrate(false);

        return nextMessage;
      },
      async updateMessage(id, draft) {
        const currentMessage = await repository.getStoryMessage(id);

        if (!currentMessage) {
          return null;
        }

        const prefix = draft.role === "user" ? extractSpeakerPrefix(draft.content) : null;
        const nextMessage: StoryMessage = {
          ...currentMessage,
          role: draft.role,
          content: (prefix?.strippedContent ?? draft.content).trim(),
          speakerName: draft.speakerName?.trim() || prefix?.speakerLabel || undefined,
          speakerType: draft.speakerType,
          directorIntent: draft.directorIntent ?? currentMessage.directorIntent,
          editedAt: draft.editedAt ?? currentMessage.editedAt,
          regeneratedAt: draft.regeneratedAt ?? currentMessage.regeneratedAt,
          revision: draft.revision ?? currentMessage.revision,
        };

        await repository.saveStoryMessage(nextMessage);
        await touchStory(currentMessage.storyId);
        await hydrate(false);

        return nextMessage;
      },
      async editAssistantMessage(messageId, content) {
        const currentMessage = await repository.getStoryMessage(messageId);

        if (!currentMessage) {
          return null;
        }

        if (currentMessage.role !== "assistant") {
          throw new Error("Only assistant messages can be edited.");
        }

        const nextMessage: StoryMessage = {
          ...currentMessage,
          content: content.trim(),
          editedAt: new Date().toISOString(),
          revision: (currentMessage.revision ?? 0) + 1,
        };

        await repository.saveStoryMessage(nextMessage);
        await touchStory(currentMessage.storyId);
        await hydrate(false);

        return nextMessage;
      },
      async regenerateLastAssistantMessage(storyId) {
        const story = await repository.getStory(storyId);

        if (!story) {
          throw new Error("Story not found.");
        }

        const existingMessages = await repository.listStoryMessages(storyId);
        const lastMessage = existingMessages[existingMessages.length - 1];
        const previousMessage = existingMessages[existingMessages.length - 2];

        if (!lastMessage || lastMessage.role !== "assistant") {
          throw new Error("The latest message is not an assistant reply.");
        }

        if (!previousMessage || previousMessage.role !== "user") {
          throw new Error("Cannot regenerate without a preceding user message.");
        }

        const [universe, playerCharacter] = await Promise.all([
          repository.getUniverse(story.universeId),
          repository.getPlayerCharacter(story.playerCharacterId),
        ]);

        if (!universe || !playerCharacter) {
          throw new Error("Story references missing universe or player character.");
        }

        const [imports, summaries, storyConfig, storyState] = await Promise.all([
          repository.listUniverseImports(universe.id),
          repository.listStorySummaries(storyId),
          repository.getStoryAIConfig(storyId),
          repository.getStoryState(storyId),
        ]);

        const settings = await getNormalizedAISettings();

        if (!settings) {
          throw new Error("Configure an AI provider in Settings before generating scenes.");
        }

        const providerType = storyConfig?.providerType ?? settings.activeProviderType;
        const { apiKey, model } = await resolveAIProfile(providerType, storyConfig?.model);
        const provider = createAIProvider(providerType);

        const playerNameForValidation = (() => {
          const base = playerCharacter.name.trim();
          const json = storyState?.stateJson?.trim() ?? "";
          if (!base || !json) {
            return base;
          }

          const parsed = safeParseStoryStateData(json);
          if (!parsed) {
            return base;
          }

          const candidates = Object.entries(parsed.characters ?? {});
          const match = candidates.find(([key, entry]) => {
            if (key === base) return true;
            if (!entry) return false;
            if (entry.canonicalName === base) return true;
            if (entry.displayName === base) return true;
            if (entry.aliases?.includes(base)) return true;
            return false;
          });

          if (!match) {
            return base;
          }

          const [key, entry] = match;
          const aliases = new Set<string>();
          if (key && key !== base) aliases.add(key);
          if (entry?.displayName && entry.displayName !== base) aliases.add(entry.displayName);
          for (const alias of entry?.aliases ?? []) {
            if (alias && alias !== base) aliases.add(alias);
          }

          const aliasText = Array.from(aliases).slice(0, 4).join(", ");
          return aliasText ? `${base} (${aliasText})` : base;
        })();

        const recentMessages = sortByTimestampAsc(existingMessages.slice(0, -1)).slice(-31);
        const historyMessages = recentMessages.slice(0, -1);

        const sanitizedHistoryMessages = historyMessages.map((message) => {
          if (message.role !== "assistant") {
            return message;
          }

          return {
            ...message,
            content: sanitizeAssistantTranscript({
              text: message.content,
              playerName: playerNameForValidation,
            }).text,
          };
        });

        const effectiveUniverse = story.universePackSnapshot?.universe ?? universe;
        const effectiveImports = story.universePackSnapshot?.universeImports ?? imports;

        const context = buildStoryChatContext({
          universe: effectiveUniverse,
          story,
          playerCharacter,
          imports: effectiveImports,
          summaries,
          storyState,
          recentMessages: sanitizedHistoryMessages,
          latestUserMessage: previousMessage.content,
          directorIntent: previousMessage.directorIntent ?? null,
        });

        const assistantContent = await generateResponseWithRetry({
          providerType,
          provider,
          apiKey,
          model,
          messages: context,
        });

        const sceneDepth = inferSceneDepth(previousMessage.content);
        const target = getSceneWordTarget(sceneDepth);
        const wordCount = assistantContent.content.split(/\s+/).filter(Boolean).length;
        const shouldRewriteForSize = sceneDepth === "light" && wordCount > target.maxWords * 2;
        const finalAssistantText = shouldRewriteForSize
          ? (
              await generateResponseWithRetry({
                providerType,
                provider,
                apiKey,
                model,
                messages: [
                  {
                    role: "system",
                    content: [
                      "Rewrite the following story scene to match a light interaction.",
                      `Target length: ${target.minWords}-${target.maxWords} words.`,
                      "Keep character voice and only the essential beats.",
                      "Do not reintroduce unchanged environments or participants.",
                      "Character authenticity is the highest priority. Keep relationships and speech patterns consistent.",
                      "Not every character needs to speak; keep participation natural.",
                      "Never speak for the player character. Do not generate suggested player lines or options.",
                      "Preserve explicit player-declared outcomes as canon. Add fallout, cost, or reaction instead of contradicting them.",
                      "Only determine success or failure when the player leaves the outcome unresolved as an attempt.",
                      "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
                      "Formatting rules:",
                      "- Every character line must start with 'Name:'.",
                      "- Actions must be wrapped as *...* (asterisks only for actions).",
                      '- Dialogue must be wrapped in double quotes like \"...\"',
                      "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
                      "- Narration is plain prose with no speaker label. Do not wrap narration in *...*.",
                      "Mystery rule:",
                      "- If the player introduces an unknown situation, unidentified person, undisclosed discovery, unexplained emergency, mystery, secret, or unusual event, do not invent or reveal the underlying explanation unless the player explicitly provides it.",
                    ].join("\n"),
                  },
                  {
                    role: "user",
                    content: assistantContent.content,
                  },
                ],
              })
            ).content
          : assistantContent.content;

        const formatRewritePrompt = [
          "Rewrite the following story scene into the required Story Engine transcript grammar.",
          "Do not add new story beats. Rewrite only for format, clarity, and compliance.",
          "Do not re-narrate the latest player message. Treat it as established scene state and continue from the next beat.",
          "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
          "Only resolve success or failure when the player's message leaves the outcome open as an attempt.",
          "Formatting rules (strict):",
          "- Every character line must start with 'Name:'.",
          "- Actions must be wrapped as *...* (asterisks only for actions).",
          '- Dialogue must be wrapped in double quotes like \"...\"',
          "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
          "- Narration is italic prose with no speaker label. Do not wrap narration in *...*.",
          "- Never use narrator labels like 'Narrator:' anywhere.",
          "Mystery rule (strict):",
          "- If the player introduces an unknown situation, unidentified person, undisclosed discovery, unexplained emergency, mystery, secret, or unusual event, do not invent or reveal the underlying explanation unless the player explicitly provides it.",
          "Information ownership rule (strict):",
          "- Do not invent facts that could only have been communicated by the player character off-screen.",
          "- If NPCs lack details, they must ask clarifying questions instead of asserting specifics as if the player already said them.",
          "- Never write lines like 'You're saying X' or 'You said X' unless X is explicitly present in the player's message or already established in prior story events/state.",
          "Ownership rules (strict):",
          `- The player character is: ${playerCharacter.name}`,
          `- Player character sheet is authoritative canon. Pronouns: ${playerCharacter.pronouns.trim() || "unspecified"}. Gender: ${playerCharacter.gender.trim() || "unspecified"}. Species: ${(playerCharacter.species ?? "").trim() || "unspecified"}. Age: ${playerCharacter.age.trim() || "unspecified"}.`,
          "- Never write dialogue/actions/thoughts/decisions for the player character.",
          "- Never continue the player's action chain beyond consequences and NPC/world reactions.",
          "Sanitization rules:",
          "- Never repeat the latest player message.",
          "- Never use asterisks for emphasis.",
        ].join("\n");

        const ownershipRewritePrompt = [
          "Rewrite the following story scene to remove any player-character dialogue, actions, thoughts, feelings, decisions, or internal monologue.",
          `The player character is: ${playerCharacter.name}.`,
          `Player character sheet is authoritative canon. Pronouns: ${playerCharacter.pronouns.trim() || "unspecified"}. Gender: ${playerCharacter.gender.trim() || "unspecified"}. Species: ${(playerCharacter.species ?? "").trim() || "unspecified"}. Age: ${playerCharacter.age.trim() || "unspecified"}.`,
          "Never include a speaker header for the player character.",
          "Never narrate actions/thoughts for the player character.",
          "Remove any repetition of the latest player message.",
          "Never use narrator labels like 'Narrator:' anywhere in the output.",
          "Keep continuity, character voice, and natural pacing.",
          "Do not re-narrate the latest player message. Treat it as established scene state and continue from the next beat.",
          "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
          "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
          "Formatting rules:",
          "- Every character line must start with 'Name:'.",
          "- Actions must be wrapped as *...* (asterisks only for actions).",
          '- Dialogue must be wrapped in double quotes like \"...\"',
          "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
          "- Narration is italic prose with no speaker label. Do not wrap narration in *...*.",
          "Mystery rule:",
          "- If the player introduces an unknown situation, unidentified person, undisclosed discovery, unexplained emergency, mystery, secret, or unusual event, do not invent or reveal the underlying explanation unless the player explicitly provides it.",
          "Information ownership rule:",
          "- Do not invent facts that could only have been communicated by the player character off-screen.",
          "- If NPCs lack details, they must ask clarifying questions instead of asserting specifics as if the player already said them.",
          "- Never write lines like 'You're saying X' or 'You said X' unless X is explicitly present in the player's message or already established in prior story events/state.",
        ].join("\n");

        const hiddenDialogueInferencePattern =
          /\b(you're saying|you said|as you said|like you said|from what you said)\b/i;
        const hiddenDialogueRewritePrompt = [
          "Rewrite the following scene to remove any hidden inference of player dialogue or player-only information.",
          `The latest player message is:\n${previousMessage.content}`,
          `The player character is: ${playerCharacter.name}.`,
          `Player character sheet is authoritative canon. Pronouns: ${playerCharacter.pronouns.trim() || "unspecified"}. Gender: ${playerCharacter.gender.trim() || "unspecified"}. Species: ${(playerCharacter.species ?? "").trim() || "unspecified"}. Age: ${playerCharacter.age.trim() || "unspecified"}.`,
          "Do not re-narrate the latest player message. Treat it as established scene state and continue from the next beat.",
          "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
          "Do not attribute extra details to what the player said.",
          "If NPCs need details, have them ask clarifying questions.",
          "Do not invent diagnoses, causes, or specifics unless already established in prior story events/state or explicitly present in the latest player message.",
          "Formatting rules:",
          "- Every character line must start with 'Name:'.",
          "- Actions must be wrapped as *...* (asterisks only for actions).",
          '- Dialogue must be wrapped in double quotes like \"...\"',
          "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
          "- Narration is italic prose with no speaker label. Do not wrap narration in *...*.",
          "Never use narrator labels like 'Narrator:' anywhere in the output.",
          "Never use asterisks for emphasis.",
        ].join("\n");

        const sceneStateRewritePrompt = [
          "Rewrite the following scene to remove any re-narration of the latest player-established scene state.",
          `The latest player message is canon scene state:\n${previousMessage.content}`,
          "Do not restate those facts in new words. Continue from the current moment and show consequences and NPC/world reactions.",
          "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
          "If a character enters/arrives or a reveal is already stated by the player, start after that moment (reactions, responses, new beats).",
          "Formatting rules:",
          "- Every character line must start with 'Name:'.",
          "- Actions must be wrapped as *...* (asterisks only for actions).",
          '- Dialogue must be wrapped in double quotes like \"...\"',
          "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
          "- Narration is italic prose with no speaker label. Do not wrap narration in *...*.",
          "Never use narrator labels like 'Narrator:' anywhere in the output.",
          "Never use asterisks for emphasis.",
          "Ownership rules:",
          `- The player character is: ${playerCharacter.name}`,
          `- Player character sheet is authoritative canon. Pronouns: ${playerCharacter.pronouns.trim() || "unspecified"}. Gender: ${playerCharacter.gender.trim() || "unspecified"}. Species: ${(playerCharacter.species ?? "").trim() || "unspecified"}. Age: ${playerCharacter.age.trim() || "unspecified"}.`,
          "- Never write dialogue/actions/thoughts/decisions for the player character.",
        ].join("\n");

        let candidateAssistantText = finalAssistantText;
        let finalSanitizedText: string | null = null;
        let lastValidationDiagnostic = "";

        for (let attempt = 0; attempt < 6; attempt += 1) {
          const candidateSanitized = sanitizeAssistantTranscript({
            text: candidateAssistantText,
            latestUserMessage: previousMessage.content,
            playerName: playerNameForValidation,
          });

          if (!candidateSanitized.formatValid) {
            lastValidationDiagnostic = [
              "rewrite_stage=format",
              `attempt=${attempt + 1}`,
              `issues=${candidateSanitized.formatIssues.map((issue) => issue.code).join(",") || "unknown"}`,
              `raw=${clipGenerationAuditText(candidateAssistantText, 1200)}`,
              `sanitized=${clipGenerationAuditText(candidateSanitized.text, 1200)}`,
            ].join("; ");
            candidateAssistantText = (
              await generateResponseWithRetry({
                providerType,
                provider,
                apiKey,
                model,
                messages: [
                  { role: "system", content: formatRewritePrompt },
                  { role: "user", content: candidateAssistantText },
                ],
              })
            ).content;
            continue;
          }

          const violation = getPlayerCharacterAuthorshipViolation({
            playerName: playerNameForValidation,
            text: candidateSanitized.text,
          });

          if (violation) {
            lastValidationDiagnostic = [
              "rewrite_stage=ownership",
              `attempt=${attempt + 1}`,
              `rule=${violation.rule}`,
              `match=${violation.match}`,
              `line=${clipGenerationAuditText(violation.line ?? "", 300)}`,
              `sanitized=${clipGenerationAuditText(candidateSanitized.text, 1200)}`,
            ].join("; ");
            candidateAssistantText = (
              await generateResponseWithRetry({
                providerType,
                provider,
                apiKey,
                model,
                messages: [
                  { role: "system", content: ownershipRewritePrompt },
                  { role: "user", content: candidateSanitized.text },
                ],
              })
            ).content;
            continue;
          }

          if (hiddenDialogueInferencePattern.test(candidateSanitized.text)) {
            lastValidationDiagnostic = [
              "rewrite_stage=hidden_dialogue",
              `attempt=${attempt + 1}`,
              `sanitized=${clipGenerationAuditText(candidateSanitized.text, 1200)}`,
            ].join("; ");
            candidateAssistantText = (
              await generateResponseWithRetry({
                providerType,
                provider,
                apiKey,
                model,
                messages: [
                  { role: "system", content: hiddenDialogueRewritePrompt },
                  { role: "user", content: candidateSanitized.text },
                ],
              })
            ).content;
            continue;
          }

          const sceneDup = detectSceneStateRenarration({
            latestUserMessage: previousMessage.content,
            assistantText: candidateSanitized.text,
          });
          if (sceneDup.triggered) {
            lastValidationDiagnostic = [
              "rewrite_stage=scene_state",
              `attempt=${attempt + 1}`,
              `reason=${sceneDup.reason}`,
              `snippet=${clipGenerationAuditText(sceneDup.snippet, 300)}`,
              `sanitized=${clipGenerationAuditText(candidateSanitized.text, 1200)}`,
            ].join("; ");
            candidateAssistantText = (
              await generateResponseWithRetry({
                providerType,
                provider,
                apiKey,
                model,
                messages: [
                  { role: "system", content: sceneStateRewritePrompt },
                  { role: "user", content: candidateSanitized.text },
                ],
              })
            ).content;
            continue;
          }

          finalSanitizedText = candidateSanitized.text;
          break;
        }

        if (!finalSanitizedText) {
          throw new GenerationFailureError(
            createGenerationFailure(
              createAIGenerationError(
                "validation",
                "The model output could not be rewritten into a valid response format.",
                {
                  retryable: false,
                  diagnostic:
                    lastValidationDiagnostic ||
                    `rewrite_stage=unknown; raw=${clipGenerationAuditText(candidateAssistantText, 1200)}`,
                },
              ),
              {
                providerName: providerType,
                model,
                attempts: 1,
                maxAttempts: 1,
                stage: "validation",
              },
            ),
          );
        }

        const nextAssistantMessage: StoryMessage = {
          ...lastMessage,
          content: finalSanitizedText,
          regeneratedAt: new Date().toISOString(),
          revision: (lastMessage.revision ?? 0) + 1,
        };

        await repository.saveStoryMessage(nextAssistantMessage);
        await touchStory(storyId);
        await hydrate(false);

        return nextAssistantMessage;
      },
      async deleteMessage(id) {
        const currentMessage = await repository.getStoryMessage(id);

        if (!currentMessage) {
          return;
        }

        await repository.deleteStoryMessage(id);
        await touchStory(currentMessage.storyId);
        await hydrate(false);
      },
      async setMessageDirectorIntent(messageId, intent) {
        const currentMessage = await repository.getStoryMessage(messageId);

        if (!currentMessage) {
          return null;
        }

        const nextMessage: StoryMessage = {
          ...currentMessage,
          directorIntent: intent ?? undefined,
        };

        await repository.saveStoryMessage(nextMessage);
        await touchStory(currentMessage.storyId);
        await hydrate(false);

        return nextMessage;
      },
      async sendMetaChatMessage(storyId, content) {
        const trimmed = content.trim();
        if (!trimmed) {
          throw new Error("Message content is required.");
        }
        const userMessage: StoryMetaMessage = {
          id: createEntityId("story-meta-message"),
          storyId,
          role: "user",
          content: trimmed,
          timestamp: new Date().toISOString(),
        };

        await repository.saveStoryMetaMessage(userMessage);
        const assistantText = await generateMetaChatAssistantReply(storyId, trimmed);

        const assistantMessage: StoryMetaMessage = {
          id: createEntityId("story-meta-message"),
          storyId,
          role: "assistant",
          content: assistantText.trim(),
          timestamp: new Date().toISOString(),
        };

        await repository.saveStoryMetaMessage(assistantMessage);
        // #region debug-point D:metachat-save
        reportGenerationAudit({
          hypothesisId: "D",
          location: "StoryEngineProvider.tsx:sendMetaChatMessage:save",
          msg: "MetaChat response saved",
          data: {
            storyId,
            savedOutput: assistantMessage.content,
            savedLength: assistantMessage.content?.length ?? 0,
          },
        });
        // #endregion
        await hydrate(false);
        return assistantMessage ?? userMessage;
      },
      queueMetaChatMessage,
      async setMetaChatDraft(storyId, draft) {
        await saveStoryUiStateRecord(storyId, { metaChatDraft: draft });
      },
      async clearMetaChatDraft(storyId) {
        await saveStoryUiStateRecord(storyId, { metaChatDraft: "" });
      },
      async createDeveloperBug(draft) {
        const now = new Date().toISOString();
        const trimmedId = draft.id.trim();
        const record: DeveloperBug = {
          id: trimmedId || createEntityId("developer-bug"),
          title: draft.title.trim(),
          status: draft.status,
          reportedAt: now,
          description: draft.description.trim(),
          reproductionSteps: draft.reproductionSteps.trim(),
          expectedBehaviour: draft.expectedBehaviour.trim(),
          actualBehaviour: draft.actualBehaviour.trim(),
          notes: draft.notes.trim(),
          updatedAt: now,
        };

        await repository.saveDeveloperBug(record);
        await hydrate(false);

        return record;
      },
      async updateDeveloperBug(id, draft) {
        const current = await repository.getDeveloperBug(id);

        if (!current) {
          return null;
        }

        const now = new Date().toISOString();
        const nextId = draft.id.trim() || current.id;

        const record: DeveloperBug = {
          ...current,
          id: nextId,
          title: draft.title.trim(),
          status: draft.status,
          description: draft.description.trim(),
          reproductionSteps: draft.reproductionSteps.trim(),
          expectedBehaviour: draft.expectedBehaviour.trim(),
          actualBehaviour: draft.actualBehaviour.trim(),
          notes: draft.notes.trim(),
          updatedAt: now,
        };

        if (nextId !== current.id) {
          await repository.deleteDeveloperBug(current.id);
        }

        await repository.saveDeveloperBug(record);
        await hydrate(false);

        return record;
      },
      async deleteDeveloperBug(id) {
        await repository.deleteDeveloperBug(id);
        await hydrate(false);
      },
      async createDeveloperFeatureRequest(draft) {
        const now = new Date().toISOString();
        const trimmedId = draft.id.trim();
        const record: DeveloperFeatureRequest = {
          id: trimmedId || createEntityId("developer-feature"),
          title: draft.title.trim(),
          priority: draft.priority,
          description: draft.description.trim(),
          notes: draft.notes.trim(),
          createdAt: now,
          updatedAt: now,
        };

        await repository.saveDeveloperFeatureRequest(record);
        await hydrate(false);

        return record;
      },
      async updateDeveloperFeatureRequest(id, draft) {
        const current = await repository.getDeveloperFeatureRequest(id);

        if (!current) {
          return null;
        }

        const now = new Date().toISOString();
        const nextId = draft.id.trim() || current.id;

        const record: DeveloperFeatureRequest = {
          ...current,
          id: nextId,
          title: draft.title.trim(),
          priority: draft.priority,
          description: draft.description.trim(),
          notes: draft.notes.trim(),
          updatedAt: now,
        };

        if (nextId !== current.id) {
          await repository.deleteDeveloperFeatureRequest(current.id);
        }

        await repository.saveDeveloperFeatureRequest(record);
        await hydrate(false);

        return record;
      },
      async deleteDeveloperFeatureRequest(id) {
        await repository.deleteDeveloperFeatureRequest(id);
        await hydrate(false);
      },
      async createDeveloperTestingNote(draft) {
        const now = new Date().toISOString();
        const trimmedId = draft.id.trim();
        const record: DeveloperTestingNote = {
          id: trimmedId || createEntityId("developer-testing-note"),
          title: draft.title.trim(),
          content: draft.content.trim(),
          createdAt: now,
          updatedAt: now,
        };

        await repository.saveDeveloperTestingNote(record);
        await hydrate(false);

        return record;
      },
      async updateDeveloperTestingNote(id, draft) {
        const current = await repository.getDeveloperTestingNote(id);

        if (!current) {
          return null;
        }

        const now = new Date().toISOString();
        const nextId = draft.id.trim() || current.id;

        const record: DeveloperTestingNote = {
          ...current,
          id: nextId,
          title: draft.title.trim(),
          content: draft.content.trim(),
          updatedAt: now,
        };

        if (nextId !== current.id) {
          await repository.deleteDeveloperTestingNote(current.id);
        }

        await repository.saveDeveloperTestingNote(record);
        await hydrate(false);

        return record;
      },
      async deleteDeveloperTestingNote(id) {
        await repository.deleteDeveloperTestingNote(id);
        await hydrate(false);
      },
      async exportStory(storyId, opts) {
        if (opts?.refreshArchiveIfStale) {
          const storyState = await repository.getStoryState(storyId);
          const indexStatus = getArchiveIndexStatus(storyState);

          if (indexStatus.needsRefresh) {
            await runDeepIndexProcess(storyId, {
              trigger: "manual",
            });
          }
        }

        return repository.getStoryExportBundle(storyId);
      },
      fetchStoryState(storyId) {
        return repository.getStoryState(storyId);
      },
      async updateRelationshipsIndex(storyId, relationships) {
        const existing = await repository.getStoryState(storyId);
        const parsed = existing?.stateJson
          ? (() => { try { return JSON.parse(existing.stateJson); } catch { return {}; } })()
          : {};
        const next = {
          ...parsed,
          indexes: { ...(parsed.indexes ?? {}), relationships },
        };
        await repository.saveStoryState({
          id: `story-state:${storyId}`,
          storyId,
          stateJson: JSON.stringify(next),
          updatedAt: new Date().toISOString(),
        });
      },
      async updateRpStats(storyId, rpStats) {
        const existing = await repository.getStoryState(storyId);
        const parsed = existing?.stateJson
          ? (() => { try { return JSON.parse(existing.stateJson); } catch { return {}; } })()
          : {};
        const next = rpStats === null
          ? { ...parsed, rpStats: undefined }
          : { ...parsed, rpStats };
        await repository.saveStoryState({
          id: `story-state:${storyId}`,
          storyId,
          stateJson: JSON.stringify(next),
          updatedAt: new Date().toISOString(),
        });
      },
      refreshStoryState: refreshStoryStateInternal,
      async updateIndexesDeep(storyId, opts) {
        await runDeepIndexProcess(storyId, {
          signal: opts?.signal,
          trigger: "manual",
          incremental: opts?.incremental ?? false,
        });
      },
      queueStoryIndexJob,
      cancelBackgroundJob,
      dismissJobNotice() {
        setJobNotice(null);
      },
      exportUniverse(universeId) {
        return repository.getUniverseExportBundle(universeId);
      },
      exportPlayerCharacter(characterId) {
        return repository.getPlayerCharacterExportBundle(characterId);
      },
      async importUniverseExport(bundle) {
        const result = await repository.importUniverseExportBundle(bundle);
        await hydrate(false);
        return result;
      },
      async importPlayerCharacterExport(bundle, options) {
        const result = await repository.importPlayerCharacterExportBundle(bundle, options);
        await hydrate(false);
        return result;
      },
      async importStoryExport(bundle) {
        const result = await repository.importStoryExportBundle(bundle);
        await hydrate(false);
        return result;
      },
      exportWorkspaceBackup() {
        return repository.exportWorkspaceBackup();
      },
      async importWorkspaceBackup(backup, options) {
        await repository.importWorkspaceBackup(backup, options);
        await hydrate(false);
      },
      async saveAISettings(next) {
        const now = new Date().toISOString();
        const current = await getNormalizedAISettings();
        const createdAt = current?.createdAt ?? now;
        const nextApiKeys = next.apiKeys ?? {};
        const nextDefaultModels = next.defaultModels ?? {};
        const apiKeys = {
          ...(current?.apiKeys ?? {}),
          ...Object.fromEntries(
            Object.entries(nextApiKeys).filter((entry) => entry[1]?.trim()),
          ),
        } as Partial<Record<AIProviderType, string>>;
        const defaultModels = {
          ...(current?.defaultModels ?? {}),
          ...Object.fromEntries(
            Object.entries(nextDefaultModels).filter((entry) => entry[1]?.trim()),
          ),
        } as Partial<Record<AIProviderType, string>>;

        const settings: AISettings = {
          id: "ai-settings",
          activeProviderType: next.activeProviderType,
          apiKeys,
          defaultModels,
          createdAt,
          updatedAt: now,
        };

        await repository.saveAISettings(settings);
        setAiSettings(settings);

        return settings;
      },
      async validateAIConnection(providerType) {
        const settings = await getNormalizedAISettings();

        if (!settings) {
          throw new Error("Configure an AI provider in Settings first.");
        }

        const resolvedProviderType = providerType ?? settings.activeProviderType;
        const { apiKey, model } = await resolveAIProfile(resolvedProviderType);
        const provider = createAIProvider(resolvedProviderType);
        await provider.validateConnection(apiKey, model);
      },
      getStoryAIConfig(storyId) {
        return repository.getStoryAIConfig(storyId);
      },
      async saveStoryAIConfig(next) {
        const now = new Date().toISOString();
        const record: StoryAIConfig = {
          id: createEntityId("story-ai-config"),
          storyId: next.storyId,
          providerType: next.providerType,
          model: next.model?.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        };

        await repository.saveStoryAIConfig(record);

        return record;
      },
      listUniverseImports(universeId) {
        return repository.listUniverseImports(universeId);
      },
      async saveUniverseImport(next) {
        const record: UniverseImport = {
          ...next,
          id: createEntityId("universe-import"),
        };

        await repository.saveUniverseImport(record);

        return record;
      },
      listStorySummaries(storyId) {
        return repository.listStorySummaries(storyId);
      },
      async generatePlayerAssistMessage(
        storyId,
        opts?: {
          existingText?: string;
        },
      ) {
        const story = await repository.getStory(storyId);

        if (!story) {
          throw new Error("Story not found.");
        }

        const [universe, playerCharacter, storyConfig] = await Promise.all([
          repository.getUniverse(story.universeId),
          repository.getPlayerCharacter(story.playerCharacterId),
          repository.getStoryAIConfig(storyId),
        ]);

        if (!universe || !playerCharacter) {
          throw new Error("Story references missing universe or player character.");
        }

        const settings = await getNormalizedAISettings();
        if (!settings) {
          throw new Error("Configure an AI provider in Settings before using Player Assist.");
        }

        const providerType = storyConfig?.providerType ?? settings.activeProviderType;
        const { apiKey, model } = await resolveAIProfile(providerType, storyConfig?.model);
        const provider = createAIProvider(providerType);

        const [imports, summaries, refreshedMessages] = await Promise.all([
          repository.listUniverseImports(universe.id),
          repository.listStorySummaries(storyId),
          repository.listStoryMessages(storyId),
        ]);

        const recentMessages = sortByTimestampAsc(refreshedMessages).slice(-30);
        const effectiveUniverse = story.universePackSnapshot?.universe ?? universe;
        const effectiveImports = story.universePackSnapshot?.universeImports ?? imports;
        const context = buildPlayerAssistContext({
          universe: effectiveUniverse,
          story,
          playerCharacter,
          imports: effectiveImports,
          summaries,
          recentMessages,
          existingText: opts?.existingText,
        });

        const suggestion = await generateResponseWithRetry({
          providerType,
          provider,
          apiKey,
          model,
          messages: context,
        });

        const raw = suggestion.content.trim();
        const existing = opts?.existingText;
        if (!existing?.trim()) {
          return raw;
        }

        const trimmedExisting = existing.trimEnd();
        const normalizedRaw = raw.replace(/\r\n/g, "\n");
        const normalizedExisting = trimmedExisting.replace(/\r\n/g, "\n");

        if (normalizedRaw.startsWith(normalizedExisting)) {
          return normalizedRaw.slice(normalizedExisting.length).trimStart();
        }

        return raw;
      },
      async generatePlayerCharacterDraft(universeId, fields, existing) {
        const universe = await repository.getUniverse(universeId);

        if (!universe) {
          throw new Error("Universe not found.");
        }

        const settings = await getNormalizedAISettings();
        if (!settings) {
          throw new Error("Configure an AI provider in Settings before generating characters.");
        }

        const providerType = settings.activeProviderType;
        const { apiKey, model } = await resolveAIProfile(providerType);
        const provider = createAIProvider(providerType);

        const imports = await repository.listUniverseImports(universeId);
        const mostRecentImport = imports[0];
        const importedLoreText = mostRecentImport?.importedText?.slice(0, 12000) ?? "";

        const allowedFields: Array<keyof PlayerCharacterDraft> = [
          "name",
          "age",
          "gender",
          "species",
          "pronouns",
          "appearance",
          "personality",
          "background",
          "goals",
          "notes",
        ];
        const requestedFields = fields?.length ? fields : allowedFields;
        const generatorFields = requestedFields.filter((field) =>
          allowedFields.includes(field),
        ) as PlayerCharacterField[];

        const systemPrompt = buildCharacterGeneratorSystemPrompt({
          universe,
          importedLoreText,
          fields: generatorFields.length ? generatorFields : undefined,
          characterConcept:
            typeof (existing as any)?.characterConcept === "string"
              ? (existing as any).characterConcept
              : undefined,
          existing: existing
            ? allowedFields.reduce(
                (acc, key) => {
                  const value = existing[key];
                  if (typeof value === "string" && value.trim()) {
                    acc[key as PlayerCharacterField] = value.trim();
                  }
                  return acc;
                },
                {} as Partial<Record<PlayerCharacterField, string>>,
              )
            : undefined,
        });

        let response: GenerateResponseResult;
        try {
          response = await generateResponseWithRetry({
            providerType,
            provider,
            apiKey,
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: "Generate the JSON now." },
            ],
            maxTokens: 1200,
            temperature: 0,
            jsonMode: true,
          });
        } catch (error) {
          rethrowUserFacingGenerationError(error, providerType);
        }

        const jsonText = extractFirstJsonObject(response.content) ?? response.content.trim();
        const parsed = safeParseJsonObject<Record<string, unknown>>(jsonText);

        if (!parsed) {
          rethrowUserFacingGenerationError(
            createAIGenerationError(
              "parse",
              "Character generator returned invalid JSON.",
              { diagnostic: jsonText.slice(0, 400) },
            ),
            providerType,
          );
        }

        const draft: Partial<PlayerCharacterDraft> = {};

        for (const key of requestedFields) {
          if (key === "universeId") {
            continue;
          }
          const value = parsed[key as string];
          if (typeof value === "string") {
            (draft as any)[key] = value.trim();
          }
        }

        return draft;
      },
      async sendChatMessage(storyId, content, opts) {
        const trimmed = content.trim();

        if (!trimmed) {
          throw new Error("Message content is required.");
        }
        const traceId = makeGenerationAuditTraceId("story");
        // #region debug-point A:story-start
        reportGenerationAudit({
          hypothesisId: "A",
          traceId,
          location: "StoryEngineProvider.tsx:sendChatMessage:start",
          msg: "story generation started",
          data: {
            storyId,
            originalUserText: trimmed,
          },
        });
        // #endregion

        const story = await repository.getStory(storyId);

        if (!story) {
          throw new Error("Story not found.");
        }

        const [universe, playerCharacter] = await Promise.all([
          repository.getUniverse(story.universeId),
          repository.getPlayerCharacter(story.playerCharacterId),
        ]);

        if (!universe || !playerCharacter) {
          throw new Error("Story references missing universe or player character.");
        }

        const existingMessages = await repository.listStoryMessages(storyId);
        const lastMessage = existingMessages[existingMessages.length - 1];

        const shouldReuseLastUserMessage =
          lastMessage?.role === "user" &&
          lastMessage.content.trim() === trimmed &&
          lastMessage.storyId === storyId;

        const prefix = extractSpeakerPrefix(trimmed);
        const strippedUserContent = (prefix?.strippedContent ?? trimmed).trim();
        const detectedDirectorIntent = opts?.directorIntentOverride ?? detectDirectorIntent(strippedUserContent);
        const detectedChapterBoundary = detectChapterBoundary(strippedUserContent);
        const chapterBoundary =
          detectedChapterBoundary.detected && detectedChapterBoundary.kind && detectedChapterBoundary.label
            ? {
                kind: detectedChapterBoundary.kind,
                label: detectedChapterBoundary.label,
              }
            : undefined;
        const userMessage: StoryMessage = shouldReuseLastUserMessage
          ? lastMessage
          : {
              id: createEntityId("story-message"),
              storyId,
              role: "user",
              content: strippedUserContent,
              timestamp: new Date().toISOString(),
              speakerName: prefix?.speakerLabel,
              speakerType: "player",
              ...(detectedDirectorIntent ? { directorIntent: detectedDirectorIntent } : {}),
              ...(chapterBoundary ? { chapterBoundary } : {}),
            };

        if (!shouldReuseLastUserMessage) {
          await repository.saveStoryMessage(userMessage);
        } else if (
          JSON.stringify(lastMessage.directorIntent ?? null) !== JSON.stringify(detectedDirectorIntent ?? null) ||
          JSON.stringify(lastMessage.chapterBoundary ?? null) !== JSON.stringify(chapterBoundary ?? null)
        ) {
          await repository.saveStoryMessage({
            ...lastMessage,
            ...(detectedDirectorIntent ? { directorIntent: detectedDirectorIntent } : {}),
            ...(chapterBoundary ? { chapterBoundary } : {}),
          });
        }

        {
          const afterSaveMessages = await repository.listStoryMessages(storyId);
          const last = afterSaveMessages[afterSaveMessages.length - 1];
          const prev = afterSaveMessages[afterSaveMessages.length - 2];

          if (
            prev &&
            last &&
            prev.role === "user" &&
            last.role === "user" &&
            prev.content.trim() === last.content.trim()
          ) {
            await repository.deleteStoryMessage(prev.id);
          }
        }

        const [imports, summaries, refreshedMessages, storyConfig, storyState, storedChapters] = await Promise.all([
          repository.listUniverseImports(universe.id),
          repository.listStorySummaries(storyId),
          repository.listStoryMessages(storyId),
          repository.getStoryAIConfig(storyId),
          repository.getStoryState(storyId),
          repository.listStoryChapters(storyId),
        ]);

        const sortedForNumbering = sortByTimestampAsc(refreshedMessages);
        const userMessageIndex = Math.max(
          0,
          sortedForNumbering.findIndex((message) => message.id === userMessage.id),
        );
        const userMessageNumber = userMessageIndex + 1;

        const previousActiveChapterLabel =
          chapterBoundary?.kind === "start"
            ? getExistingActiveChapterLabel(storyId, existingMessages, storedChapters)
            : null;
        const previousStoryMessage =
          userMessageIndex > 0 ? sortedForNumbering[userMessageIndex - 1] : null;
        const createdChapter = (() => {
          if (chapterBoundary?.kind === "end") {
            if (storedChapters.some((chapter) => chapter.endsAtMessageId === userMessage.id)) {
              return null;
            }
            return {
              id: createEntityId("story-chapter"),
              storyId,
              label: chapterBoundary.label,
              endsAtMessageId: userMessage.id,
              endsAtIndex: userMessageNumber,
              createdAt: new Date().toISOString(),
            } satisfies StoryChapter;
          }

          if (
            chapterBoundary?.kind === "start" &&
            previousActiveChapterLabel &&
            previousStoryMessage &&
            !storedChapters.some(
              (chapter) =>
                chapter.label === previousActiveChapterLabel &&
                chapter.endsAtMessageId === previousStoryMessage.id,
            )
          ) {
            return {
              id: createEntityId("story-chapter"),
              storyId,
              label: previousActiveChapterLabel,
              endsAtMessageId: previousStoryMessage.id,
              endsAtIndex: userMessageNumber - 1,
              createdAt: new Date().toISOString(),
            } satisfies StoryChapter;
          }

          return null;
        })();

        if (createdChapter) {
          await repository.saveStoryChapter(createdChapter);
        }

        const settings = await getNormalizedAISettings();

        if (!settings) {
          throw new Error("Configure an AI provider in Settings before generating scenes.");
        }

        const providerType = storyConfig?.providerType ?? settings.activeProviderType;
        const { apiKey, model } = await resolveAIProfile(providerType, storyConfig?.model);
        const provider = createAIProvider(providerType);

        const playerNameForValidation = (() => {
          const base = playerCharacter.name.trim();
          const json = storyState?.stateJson?.trim() ?? "";
          if (!base || !json) {
            return base;
          }

          const parsed = safeParseStoryStateData(json);
          if (!parsed) {
            return base;
          }

          const candidates = Object.entries(parsed.characters ?? {});
          const match = candidates.find(([key, entry]) => {
            if (key === base) return true;
            if (!entry) return false;
            if (entry.canonicalName === base) return true;
            if (entry.displayName === base) return true;
            if (entry.aliases?.includes(base)) return true;
            return false;
          });

          if (!match) {
            return base;
          }

          const [key, entry] = match;
          const aliases = new Set<string>();
          if (key && key !== base) aliases.add(key);
          if (entry?.displayName && entry.displayName !== base) aliases.add(entry.displayName);
          for (const alias of entry?.aliases ?? []) {
            if (alias && alias !== base) aliases.add(alias);
          }

          const aliasText = Array.from(aliases).slice(0, 4).join(", ");
          return aliasText ? `${base} (${aliasText})` : base;
        })();

        const recentMessages = sortByTimestampAsc(refreshedMessages).slice(-31);
        const historyMessages =
          recentMessages.length && recentMessages[recentMessages.length - 1]?.id === userMessage.id
            ? recentMessages.slice(0, -1)
            : recentMessages;

        const sanitizedHistoryMessages = historyMessages.map((message) => {
          if (message.role !== "assistant") {
            return message;
          }

          return {
            ...message,
            content: sanitizeAssistantTranscript({
              text: message.content,
              playerName: playerNameForValidation,
            }).text,
          };
        });
        const inputSafetyAnalysis = analyzeStoryInputSafety({
          playerCharacterName: playerCharacter.name,
          latestUserMessage: trimmed,
          recentMessages: sanitizedHistoryMessages,
          storyState,
        });
        // #region debug-point A:story-context
        reportGenerationAudit({
          hypothesisId: "A",
          traceId,
          location: "StoryEngineProvider.tsx:sendChatMessage:context",
          msg: "story context prepared",
          data: {
            storyId,
            providerType,
            model,
            chapterBoundary,
            directorIntent: userMessage.directorIntent ?? null,
            likelyFictionalContext: inputSafetyAnalysis.likelyFictionalContext,
            likelyMedicalContext:
              inputSafetyAnalysis.matchedTerms.length > 0 ||
              inputSafetyAnalysis.contextSignals.length > 0,
            recentMessageCount: sanitizedHistoryMessages.length,
          },
        });
        // #endregion

        const effectiveUniverse = story.universePackSnapshot?.universe ?? universe;
        const effectiveImports = story.universePackSnapshot?.universeImports ?? imports;
        const shouldSkipAssistantReply = Boolean(chapterBoundary);
        let assistantMessage: StoryMessage | null = null;
        let appliedRpChanges: RpChangelogEntry[] | null = null;
        let pendingCoreStatChanges: RpStatDelta[] | null = null;
        let rpEventSummary: string | null = null;
        let appliedRelationshipDeltas: RpRelationshipDelta[] | null = null;
        let updatedMessages: StoryMessage[] = [];

        if (!shouldSkipAssistantReply) {
          const currentRpStats = (() => {
            if (!storyState?.stateJson) return story.rpMode && story.rpConfig ? defaultRpStats(story.rpConfig) : null;
            const v2 = safeParseStoryStateData(storyState.stateJson);
            if (v2?.rpStats) return v2.rpStats;
            try {
              const raw = JSON.parse(storyState.stateJson) as unknown;
              if (raw && typeof raw === "object" && "rpStats" in raw && (raw as Record<string, unknown>).rpStats && typeof (raw as Record<string, unknown>).rpStats === "object") {
                return (raw as Record<string, unknown>).rpStats as RpStats;
              }
            } catch {}
            return story.rpMode && story.rpConfig ? defaultRpStats(story.rpConfig) : null;
          })();

          const context = buildStoryChatContext({
            universe: effectiveUniverse,
            story,
            playerCharacter,
            imports: effectiveImports,
            summaries,
            storyState,
            recentMessages: sanitizedHistoryMessages,
            latestUserMessage: userMessage.content,
            directorIntent: userMessage.directorIntent ?? null,
            rpStats: currentRpStats,
            rpConfig: story.rpConfig ?? null,
            playerStateHintOverride: opts?.zeroHpConsequence ?? null,
          });
          // #region debug-point A:story-request-shape
          reportGenerationAudit({
            hypothesisId: "A",
            traceId,
            location: "StoryEngineProvider.tsx:sendChatMessage:request-shape",
            msg: "story request messages built",
            data: {
              storyId,
              providerType,
              model,
              messageSummary: summarizeGenerationAuditMessages(context),
              promptSummary: clipGenerationAuditText(
                context
                  .filter((message) => message.role === "system")
                  .map((message) => message.content)
                  .join("\n\n"),
                900,
              ),
            },
          });
          // #endregion

          let assistantContent: GenerateResponseResult;
          try {
            assistantContent = await generateResponseWithRetry({
              providerType,
              provider,
              apiKey,
              model,
              messages: context,
              debugTrace: {
                traceId,
                mode: "story",
                storyId,
                stage: "initial",
                lastUserText: userMessage.content,
              },
            });
          } catch (error) {
            const baseFailure = isGenerationFailureError(error) ? error.failure : null;
            const isProviderRefusal = baseFailure?.kind === "provider_refusal";
            // #region debug-point A:story-provider-error
            reportGenerationAudit({
              hypothesisId: "A",
              traceId,
              location: "StoryEngineProvider.tsx:sendChatMessage:provider-error",
              msg: "story provider request failed",
              data: {
                storyId,
                providerType,
                model,
                failureKind: baseFailure?.kind ?? null,
                failureStage: baseFailure?.stage ?? null,
                summaryMessage: baseFailure?.summaryMessage ?? (error instanceof Error ? error.message : "unknown"),
                diagnostic: baseFailure?.diagnostic ?? null,
              },
            });
            // #endregion

            if (providerType === "gemini" && isProviderRefusal) {
              const transmitSafe = makeTransmitSafe(userMessage.content, {
                allowPainSoftening: Boolean(story.matureFictionMode),
              });

              if (transmitSafe.wasModified) {
                const safeContext = buildStoryChatContext({
                  universe: effectiveUniverse,
                  story,
                  playerCharacter,
                  imports: effectiveImports,
                  summaries,
                  storyState,
                  recentMessages: sanitizedHistoryMessages,
                  latestUserMessage: transmitSafe.transmitText,
                  directorIntent: userMessage.directorIntent ?? null,
                });
                const note = buildTransmitSafeSystemNote(transmitSafe);
                const lastUserIndex = (() => {
                  for (let index = safeContext.length - 1; index >= 0; index -= 1) {
                    if (safeContext[index]?.role === "user") return index;
                  }
                  return -1;
                })();
                if (note && lastUserIndex >= 0) {
                  safeContext.splice(lastUserIndex, 0, { role: "system", content: note });
                }

                try {
                  assistantContent = await generateResponseWithRetry({
                    providerType,
                    provider,
                    apiKey,
                    model,
                    messages: safeContext,
                    maxAttempts: 1,
                    debugTrace: {
                      traceId,
                      mode: "story",
                      storyId,
                      stage: "transmit-safe-retry",
                      lastUserText: transmitSafe.transmitText,
                    },
                  });
                } catch (secondError) {
                  if (isGenerationFailureError(secondError)) {
                    const patched = withTransmitSafeDiagnostics(secondError.failure, {
                      originalText: userMessage.content,
                      transmittedText: transmitSafe.transmitText,
                      notes: transmitSafe.notes,
                    });
                    throw new GenerationFailureError(patched);
                  }
                  throw secondError;
                }
              } else {
                throw error;
              }
            } else if (isProviderRefusal && inputSafetyAnalysis.likelyFictionalContext) {
              const message = formatLikelyFictionalSafetyRefusalMessage(
                baseFailure?.summaryMessage ||
                  (error instanceof Error ? error.message : "The provider refused the request."),
                inputSafetyAnalysis,
              );
              if (baseFailure) {
                throw new GenerationFailureError({
                  ...baseFailure,
                  summaryMessage: message,
                });
              }
              throw new Error(message);
            } else {
              throw error;
            }
          }

          const sceneDepth = inferSceneDepth(userMessage.content);
          const target = getSceneWordTarget(sceneDepth);
          const wordCount = assistantContent.content.split(/\s+/).filter(Boolean).length;
          const shouldRewriteForSize = sceneDepth === "light" && wordCount > target.maxWords * 2;
          const finalAssistantText = shouldRewriteForSize
            ? (
                await generateResponseWithRetry({
                  providerType,
                  provider,
                  apiKey,
                  model,
                  messages: [
                    {
                      role: "system",
                      content: [
                        "Rewrite the following story scene to match a light interaction.",
                        `Target length: ${target.minWords}-${target.maxWords} words.`,
                        "Keep character voice and only the essential beats.",
                        "Do not reintroduce unchanged environments or participants.",
                        "Character authenticity is the highest priority. Keep relationships and speech patterns consistent.",
                        "Not every character needs to speak; keep participation natural.",
                        "Never speak for the player character. Do not generate suggested player lines or options.",
                        "Preserve explicit player-declared outcomes as canon. Add fallout, cost, or reaction instead of contradicting them.",
                        "Only determine success or failure when the player leaves the outcome unresolved as an attempt.",
                        "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
                        "Formatting rules:",
                        "- Every character line must start with 'Name:'.",
                        "- Actions must be wrapped as *...* (asterisks only for actions).",
                        '- Dialogue must be wrapped in double quotes like "..."',
                        "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
                        "- Narration is plain prose with no speaker label. Do not wrap narration in *...*.",
                        "Mystery rule:",
                        "- If the player introduces an unknown situation, unidentified person, undisclosed discovery, unexplained emergency, mystery, secret, or unusual event, do not invent or reveal the underlying explanation unless the player explicitly provides it.",
                      ].join("\n"),
                    },
                    {
                      role: "user",
                      content: assistantContent.content,
                    },
                  ],
                  debugTrace: {
                    traceId,
                    mode: "story",
                    storyId,
                    stage: "size-rewrite",
                    lastUserText: assistantContent.content,
                  },
                })
              ).content
            : assistantContent.content;

          const formatRewritePrompt = [
            "Rewrite the following story scene into the required Story Engine transcript grammar.",
            "Do not add new story beats. Rewrite only for format, clarity, and compliance.",
            "Do not re-narrate the latest player message. Treat it as established scene state and continue from the next beat.",
            "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
            "Only resolve success or failure when the player's message leaves the outcome open as an attempt.",
            "Formatting rules (strict):",
            "- Every character line must start with 'Name:'.",
            "- Actions must be wrapped as *...* (asterisks only for actions).",
            '- Dialogue must be wrapped in double quotes like "..."',
            "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
            "- Narration is italic prose with no speaker label. Do not wrap narration in *...*.",
            "- Never use narrator labels like 'Narrator:' anywhere.",
            "Mystery rule (strict):",
            "- If the player introduces an unknown situation, unidentified person, undisclosed discovery, unexplained emergency, mystery, secret, or unusual event, do not invent or reveal the underlying explanation unless the player explicitly provides it.",
            "Information ownership rule (strict):",
            "- Do not invent facts that could only have been communicated by the player character off-screen.",
            "- If NPCs lack details, they must ask clarifying questions instead of asserting specifics as if the player already said them.",
            "- Never write lines like 'You're saying X' or 'You said X' unless X is explicitly present in the player's message or already established in prior story events/state.",
            "Ownership rules (strict):",
            `- The player character is: ${playerCharacter.name}`,
            "- Never write dialogue/actions/thoughts/decisions for the player character.",
            "- Never continue the player's action chain beyond consequences and NPC/world reactions.",
            "Sanitization rules:",
            "- Never repeat the latest player message.",
            "- Never use asterisks for emphasis.",
          ].join("\n");

          const ownershipRewritePrompt = [
            "Rewrite the following story scene to remove any player-character dialogue, actions, thoughts, feelings, decisions, or internal monologue.",
            `The player character is: ${playerCharacter.name}.`,
            "Never include a speaker header for the player character.",
            "Never narrate actions/thoughts for the player character.",
            "Remove any repetition of the latest player message.",
            "Never use narrator labels like 'Narrator:' anywhere in the output.",
            "Keep continuity, character voice, and natural pacing.",
            "Do not re-narrate the latest player message. Treat it as established scene state and continue from the next beat.",
            "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
            "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
            "Formatting rules:",
            "- Every character line must start with 'Name:'.",
            "- Actions must be wrapped as *...* (asterisks only for actions).",
            '- Dialogue must be wrapped in double quotes like "..."',
            "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
            "- Narration is italic prose with no speaker label. Do not wrap narration in *...*.",
            "Mystery rule:",
            "- If the player introduces an unknown situation, unidentified person, undisclosed discovery, unexplained emergency, mystery, secret, or unusual event, do not invent or reveal the underlying explanation unless the player explicitly provides it.",
            "Information ownership rule:",
            "- Do not invent facts that could only have been communicated by the player character off-screen.",
            "- If NPCs lack details, they must ask clarifying questions instead of asserting specifics as if the player already said them.",
            "- Never write lines like 'You're saying X' or 'You said X' unless X is explicitly present in the player's message or already established in prior story events/state.",
          ].join("\n");

          const hiddenDialogueInferencePattern =
            /\b(you're saying|you said|as you said|like you said|from what you said)\b/i;
          const hiddenDialogueRewritePrompt = [
            "Rewrite the following scene to remove any hidden inference of player dialogue or player-only information.",
            `The latest player message is:\n${userMessage.content}`,
            `The player character is: ${playerCharacter.name}.`,
            "Do not re-narrate the latest player message. Treat it as established scene state and continue from the next beat.",
            "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
            "Do not attribute extra details to what the player said.",
            "If NPCs need details, have them ask clarifying questions.",
            "Do not invent diagnoses, causes, or specifics unless already established in prior story events/state or explicitly present in the latest player message.",
            "Formatting rules:",
            "- Every character line must start with 'Name:'.",
            "- Actions must be wrapped as *...* (asterisks only for actions).",
            '- Dialogue must be wrapped in double quotes like \"...\"',
            "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
            "- Narration is italic prose with no speaker label. Do not wrap narration in *...*.",
            "Never use narrator labels like 'Narrator:' anywhere in the output.",
            "Never use asterisks for emphasis.",
          ].join("\n");

          const sceneStateRewritePrompt = [
            "Rewrite the following scene to remove any re-narration of the latest player-established scene state.",
            `The latest player message is canon scene state:\n${userMessage.content}`,
            "Do not restate those facts in new words. Continue from the current moment and show consequences and NPC/world reactions.",
            "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
            "If a character enters/arrives or a reveal is already stated by the player, start after that moment (reactions, responses, new beats).",
            "Formatting rules:",
            "- Every character line must start with 'Name:'.",
            "- Actions must be wrapped as *...* (asterisks only for actions).",
            '- Dialogue must be wrapped in double quotes like \"...\"',
            "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
            "- Narration is italic prose with no speaker label. Do not wrap narration in *...*.",
            "Never use narrator labels like 'Narrator:' anywhere in the output.",
            "Never use asterisks for emphasis.",
            "Ownership rules:",
            `- The player character is: ${playerCharacter.name}`,
            "- Never write dialogue/actions/thoughts/decisions for the player character.",
          ].join("\n");

          let candidateAssistantText = finalAssistantText;
          let finalSanitizedText: string | null = null;
          let lastValidationDiagnostic = "";

          for (let attempt = 0; attempt < 6; attempt += 1) {
            const candidateSanitized = sanitizeAssistantTranscript({
              text: candidateAssistantText,
              latestUserMessage: userMessage.content,
              playerName: playerNameForValidation,
            });

            if (!candidateSanitized.formatValid) {
              lastValidationDiagnostic = [
                "rewrite_stage=format",
                `attempt=${attempt + 1}`,
                `issues=${candidateSanitized.formatIssues.map((issue) => issue.code).join(",") || "unknown"}`,
                `raw=${clipGenerationAuditText(candidateAssistantText, 1200)}`,
                `sanitized=${clipGenerationAuditText(candidateSanitized.text, 1200)}`,
              ].join("; ");
              // #region debug-point B:format-rewrite
              reportGenerationAudit({
                hypothesisId: "B",
                traceId,
                location: "StoryEngineProvider.tsx:sendChatMessage:format-rewrite",
                msg: "format rewrite triggered",
                data: {
                  storyId,
                  attempt,
                  formatIssues: candidateSanitized.formatIssues,
                  rawOutput: candidateAssistantText,
                  rewrittenOutput: candidateSanitized.text,
                },
              });
              // #endregion

              candidateAssistantText = (
                await generateResponseWithRetry({
                  providerType,
                  provider,
                  apiKey,
                  model,
                  messages: [
                    { role: "system", content: formatRewritePrompt },
                    { role: "user", content: candidateAssistantText },
                  ],
                  debugTrace: {
                    traceId,
                    mode: "story",
                    storyId,
                    stage: "format-rewrite",
                    lastUserText: candidateAssistantText,
                  },
                })
              ).content;
              continue;
            }

            const violation = getPlayerCharacterAuthorshipViolation({
              playerName: playerNameForValidation,
              text: candidateSanitized.text,
            });

            if (violation) {
              lastValidationDiagnostic = [
                "rewrite_stage=ownership",
                `attempt=${attempt + 1}`,
                `rule=${violation.rule}`,
                `match=${violation.match}`,
                `line=${clipGenerationAuditText(violation.line ?? "", 300)}`,
                `sanitized=${clipGenerationAuditText(candidateSanitized.text, 1200)}`,
              ].join("; ");
              // #region debug-point C:ownership-rewrite
              reportGenerationAudit({
                hypothesisId: "C",
                traceId,
                location: "StoryEngineProvider.tsx:sendChatMessage:ownership-rewrite",
                msg: "ownership rewrite triggered",
                data: {
                  storyId,
                  attempt,
                  rule: violation.rule,
                  match: violation.match,
                  line: violation.line ?? null,
                  rawOutput: candidateAssistantText,
                  rewrittenOutput: candidateSanitized.text,
                },
              });
              // #endregion

              candidateAssistantText = (
                await generateResponseWithRetry({
                  providerType,
                  provider,
                  apiKey,
                  model,
                  messages: [
                    { role: "system", content: ownershipRewritePrompt },
                    { role: "user", content: candidateSanitized.text },
                  ],
                  debugTrace: {
                    traceId,
                    mode: "story",
                    storyId,
                    stage: "ownership-rewrite",
                    lastUserText: candidateSanitized.text,
                  },
                })
              ).content;
              continue;
            }

            if (hiddenDialogueInferencePattern.test(candidateSanitized.text)) {
              lastValidationDiagnostic = [
                "rewrite_stage=hidden_dialogue",
                `attempt=${attempt + 1}`,
                `sanitized=${clipGenerationAuditText(candidateSanitized.text, 1200)}`,
              ].join("; ");
              // #region debug-point B:hidden-dialogue
              reportGenerationAudit({
                hypothesisId: "B",
                traceId,
                location: "StoryEngineProvider.tsx:sendChatMessage:hidden-dialogue-rewrite",
                msg: "hidden dialogue rewrite triggered",
                data: {
                  storyId,
                  attempt,
                  rewrittenOutput: candidateSanitized.text,
                },
              });
              // #endregion
              candidateAssistantText = (
                await generateResponseWithRetry({
                  providerType,
                  provider,
                  apiKey,
                  model,
                  messages: [
                    { role: "system", content: hiddenDialogueRewritePrompt },
                    { role: "user", content: candidateSanitized.text },
                  ],
                  debugTrace: {
                    traceId,
                    mode: "story",
                    storyId,
                    stage: "hidden-dialogue-rewrite",
                    lastUserText: candidateSanitized.text,
                  },
                })
              ).content;
              continue;
            }

            const sceneDup = detectSceneStateRenarration({
              latestUserMessage: userMessage.content,
              assistantText: candidateSanitized.text,
            });
            if (sceneDup.triggered) {
              lastValidationDiagnostic = [
                "rewrite_stage=scene_state",
                `attempt=${attempt + 1}`,
                `reason=${sceneDup.reason}`,
                `snippet=${clipGenerationAuditText(sceneDup.snippet, 300)}`,
                `sanitized=${clipGenerationAuditText(candidateSanitized.text, 1200)}`,
              ].join("; ");
              // #region debug-point B:scene-renarration
              reportGenerationAudit({
                hypothesisId: "B",
                traceId,
                location: "StoryEngineProvider.tsx:sendChatMessage:scene-renarration",
                msg: "scene-state renarration rewrite triggered",
                data: {
                  storyId,
                  attempt,
                  reason: sceneDup.reason,
                  snippet: sceneDup.snippet,
                  rewrittenOutput: candidateSanitized.text,
                },
              });
              // #endregion

              candidateAssistantText = (
                await generateResponseWithRetry({
                  providerType,
                  provider,
                  apiKey,
                  model,
                  messages: [
                    { role: "system", content: sceneStateRewritePrompt },
                    { role: "user", content: candidateSanitized.text },
                  ],
                  debugTrace: {
                    traceId,
                    mode: "story",
                    storyId,
                    stage: "scene-state-rewrite",
                    lastUserText: candidateSanitized.text,
                  },
                })
              ).content;
              continue;
            }

            finalSanitizedText = candidateSanitized.text;
            break;
          }

          if (!finalSanitizedText) {
            // #region debug-point C:validation-terminal
            reportGenerationAudit({
              hypothesisId: "C",
              traceId,
              location: "StoryEngineProvider.tsx:sendChatMessage:validation-terminal",
              msg: "story validation exhausted rewrite budget",
              data: {
                storyId,
                providerType,
                model,
                finalCandidate: candidateAssistantText,
              },
            });
            // #endregion
            throw new GenerationFailureError(
              createGenerationFailure(
                createAIGenerationError(
                  "validation",
                  "The model output could not be rewritten into a valid response format.",
                  {
                    retryable: false,
                    diagnostic:
                      lastValidationDiagnostic ||
                      `rewrite_stage=unknown; raw=${clipGenerationAuditText(candidateAssistantText, 1200)}`,
                  },
                ),
                {
                  providerName: providerType,
                  model,
                  attempts: 1,
                  maxAttempts: 1,
                  stage: "validation",
                },
              ),
            );
          }

          assistantMessage = {
            id: createEntityId("story-message"),
            storyId,
            role: "assistant",
            content: finalSanitizedText,
            timestamp: new Date().toISOString(),
            speakerType: "narrator",
            ...(currentRpStats?.timeState ? { storyTime: currentRpStats.timeState } : {}),
          };

          await repository.saveStoryMessage(assistantMessage);
          // #region debug-point C:story-save
          reportGenerationAudit({
            hypothesisId: "C",
            traceId,
            location: "StoryEngineProvider.tsx:sendChatMessage:save",
            msg: "story assistant response saved",
            data: {
              storyId,
              savedOutput: assistantMessage.content,
              savedLength: assistantMessage.content?.length ?? 0,
            },
          });
          // #endregion

          if (story.rpMode && story.rpConfig && currentRpStats) {
            try {
              // Load existing relationships before extraction so we can pass tiers to the extractor
              const preExtractState = await repository.getStoryState(storyId);
              const preExtractParsed = preExtractState?.stateJson
                ? (() => { try { return JSON.parse(preExtractState.stateJson) as Record<string, unknown>; } catch { return {} as Record<string, unknown>; } })()
                : {} as Record<string, unknown>;
              const preExtractRelationships: RelationshipIndexEntry[] = (() => {
                try {
                  const idx = (preExtractParsed as any)?.indexes?.relationships;
                  return Array.isArray(idx) ? idx : [];
                } catch { return []; }
              })();

              // Parse which named characters spoke in this scene (exclude player and Narrator)
              const playerNameNorm = playerCharacter.name.toLowerCase().trim();
              const speakerNamesInScene = [
                ...new Set(
                  parseSceneBlocks(finalSanitizedText)
                    .map((b) => b.speakerLabel?.trim())
                    .filter((l): l is string => !!l && l !== "Narrator" && l.toLowerCase() !== playerNameNorm),
                ),
              ];
              const charactersInScene = speakerNamesInScene.map((name) => {
                const nameNorm = name.toLowerCase();
                const existing = preExtractRelationships.find(
                  (r) => r.a.toLowerCase() === nameNorm || r.b.toLowerCase() === nameNorm,
                );
                return existing ? { name, tier: existing.tier as string } : { name };
              });

              const extracted = await extractRpStatChanges(
                finalSanitizedText,
                currentRpStats,
                story.rpConfig,
                provider,
                apiKey,
                model,
                {
                  characterBackground: playerCharacter.background ?? undefined,
                  universeLore: effectiveUniverse.description ?? undefined,
                  playerMessage: trimmed,
                  pendingTransaction: currentRpStats.pendingTransaction,
                  charactersInScene: charactersInScene.length ? charactersInScene : undefined,
                },
              );
              if (extracted) {
                const { deltas: autoDeltas, narrative, npcHpChanges, pendingTransaction: extractedPendingTx, relationshipDeltas, npcInnerLifeUpdates, arcUpdates, suggestedCondition, characterStateSummary } = extracted;

                let nextStats = currentRpStats;
                const applied: RpChangelogEntry[] = [];
                for (const d of autoDeltas) {
                  const from = getStatValue(nextStats, story.rpConfig, d.field);
                  const to = clampStat(d.field, from + d.delta, story.rpConfig);
                  if (to === from) continue;
                  nextStats = applyStatChange(nextStats, {
                    field: d.field, from, to, reason: d.reason,
                    storyTime: nextStats.timeState,
                    transactionType: d.field === "gold" ? (to > from ? "income" : "expense") : undefined,
                  });
                  applied.push({ ts: Date.now(), field: d.field, from, to, reason: d.reason });
                }

                // Apply NPC HP changes
                const npcSummaryParts: string[] = [];
                if (npcHpChanges?.length) {
                  let updatedNpcHp = { ...nextStats.npcHp };
                  for (const change of npcHpChanges) {
                    const existing = updatedNpcHp[change.npcKey];
                    const maxHp = existing?.max ?? change.maxHp ?? 100;
                    const currentHp = existing?.current ?? maxHp;
                    const newHp = Math.max(0, Math.min(maxHp, currentHp + change.delta));
                    if (newHp === currentHp) continue;
                    updatedNpcHp = {
                      ...updatedNpcHp,
                      [change.npcKey]: { name: change.name, current: newHp, max: maxHp },
                    };
                    const sign = newHp - currentHp > 0 ? "+" : "";
                    npcSummaryParts.push(`${change.name} HP ${sign}${newHp - currentHp} (${change.reason})`);
                  }
                  nextStats = { ...nextStats, npcHp: updatedNpcHp };
                }

                // Apply time advance — player-declared only, exact minutes
                let timeSummaryPart: string | null = null;
                const playerMinutes = userMessage.directorIntent ? resolveExactMinutes(userMessage.directorIntent) : null;
                if (playerMinutes && playerMinutes > 0 && nextStats.timeState) {
                  const prevTime = nextStats.timeState;
                  const newTime = advanceTime(prevTime, playerMinutes);
                  // Check and apply recurring events
                  const { triggered, updated } = checkRecurringEvents(prevTime, newTime, story.rpConfig.recurringEvents ?? []);
                  if (triggered.length) {
                    const recurringGoldBefore = getStatValue(nextStats, story.rpConfig, "gold");
                    const recurringLabels: string[] = [];
                    for (const event of triggered) {
                      const resolvedAmount = (event.amountMin != null && event.amountMax != null)
                        ? Math.round(event.amountMin + Math.random() * (event.amountMax - event.amountMin))
                        : event.amount;
                      const from = getStatValue(nextStats, story.rpConfig, "gold");
                      const to = clampStat("gold", from + resolvedAmount, story.rpConfig);
                      if (to !== from) {
                        nextStats = applyStatChange(nextStats, {
                          field: "gold", from, to, reason: event.label,
                          storyTime: event.nextDue,
                          transactionType: "recurring",
                        });
                        recurringLabels.push(event.label);
                      }
                    }
                    // Push one summary entry to applied for toolbar gold tracking
                    const recurringGoldAfter = getStatValue(nextStats, story.rpConfig, "gold");
                    const uniqueLabels = [...new Set(recurringLabels)];
                    const recurringReason = recurringLabels.length === 1
                      ? recurringLabels[0]!
                      : uniqueLabels.length === 1
                        ? `${uniqueLabels[0]} ×${recurringLabels.length}`
                        : `${recurringLabels.length} recurring events`;
                    applied.push({ ts: Date.now(), field: "gold", from: recurringGoldBefore, to: recurringGoldAfter, reason: recurringReason });
                    // Save updated recurringEvents nextDue values to config
                    await repository.saveStory({ ...story, rpConfig: { ...story.rpConfig, recurringEvents: updated } });
                  }
                  nextStats = { ...nextStats, timeState: newTime };
                  const timeLabel = formatTimeShort(newTime, story.rpConfig);
                  timeSummaryPart = (timeSummaryPart ? `${timeSummaryPart} · ` : "") + `Time → ${timeLabel}`;
                }

                // Apply absolute time set — e.g. "It's 12pm" in player message
                const absoluteTime = userMessage.directorIntent?.absoluteTime;
                if (absoluteTime && !playerMinutes) {
                  if (nextStats.timeState) {
                    const newTime = { ...nextStats.timeState, hour: absoluteTime.hour, minute: absoluteTime.minute };
                    nextStats = { ...nextStats, timeState: newTime };
                    const timeLabel = formatTimeShort(newTime, story.rpConfig);
                    timeSummaryPart = `Time → ${timeLabel}`;
                  } else {
                    const now = new Date();
                    const newTime: RpTimeState = {
                      year: now.getFullYear(),
                      month: now.getMonth() + 1,
                      day: now.getDate(),
                      hour: absoluteTime.hour,
                      minute: absoluteTime.minute,
                      storyDay: 1,
                    };
                    nextStats = { ...nextStats, timeState: newTime };
                    const timeLabel = formatTimeShort(newTime, story.rpConfig);
                    timeSummaryPart = `Time → ${timeLabel}`;
                  }
                }

                // Apply pending transaction state change
                if (extractedPendingTx !== undefined) {
                  nextStats = { ...nextStats, pendingTransaction: extractedPendingTx ?? undefined };
                }

                // Apply character state summary
                if (characterStateSummary) {
                  nextStats = { ...nextStats, characterState: characterStateSummary };
                }

                // Apply condition suggestion
                if (suggestedCondition && !nextStats.pendingConditionSuggestion) {
                  nextStats = { ...nextStats, pendingConditionSuggestion: suggestedCondition };
                }

                const playerSummary = applied.length ? buildRpEventSummary(applied, story.rpConfig) : null;
                const npcSummary = npcSummaryParts.length ? npcSummaryParts.join(" · ") : null;
                const summary = [playerSummary, npcSummary, timeSummaryPart].filter(Boolean).join(" · ") || narrative || null;

                // Compute updated relationships if any relationship data was returned
                let updatedRelationships: RelationshipIndexEntry[] | null = null;
                if (relationshipDeltas?.length || npcInnerLifeUpdates?.length || arcUpdates?.length) {
                  updatedRelationships = applyRelationshipDeltas(preExtractRelationships, relationshipDeltas ?? [], playerCharacter.name, npcInnerLifeUpdates, arcUpdates);
                  if (relationshipDeltas?.length) appliedRelationshipDeltas = relationshipDeltas;
                }

                if (summary) {
                  const eventEntry: RpEventLogEntry = { ts: Date.now(), summary };
                  const prevLog: RpEventLogEntry[] = Array.isArray(nextStats.eventLog) ? nextStats.eventLog : [];
                  nextStats = { ...nextStats, eventLog: [eventEntry, ...prevLog].slice(0, 100) };

                  const latestState = await repository.getStoryState(storyId);
                  const latestParsed = latestState?.stateJson
                    ? (() => { try { return JSON.parse(latestState.stateJson) as Record<string, unknown>; } catch { return {} as Record<string, unknown>; } })()
                    : {} as Record<string, unknown>;
                  const mergedState = updatedRelationships
                    ? { ...latestParsed, rpStats: nextStats, indexes: { ...(latestParsed.indexes as object | undefined ?? {}), relationships: updatedRelationships } }
                    : { ...latestParsed, rpStats: nextStats };
                  await repository.saveStoryState({
                    id: `story-state:${storyId}`,
                    storyId,
                    stateJson: JSON.stringify(mergedState),
                    updatedAt: new Date().toISOString(),
                  });
                  appliedRpChanges = applied;
                  rpEventSummary = summary;
                } else if (npcSummaryParts.length || nextStats.timeState !== currentRpStats.timeState || extractedPendingTx !== undefined || characterStateSummary || suggestedCondition || updatedRelationships) {
                  // NPC-only, time-only, pending-transaction, character-state, condition, or relationship-only changes still need to be saved
                  const latestState = await repository.getStoryState(storyId);
                  const latestParsed = latestState?.stateJson
                    ? (() => { try { return JSON.parse(latestState.stateJson) as Record<string, unknown>; } catch { return {} as Record<string, unknown>; } })()
                    : {} as Record<string, unknown>;
                  const mergedState = updatedRelationships
                    ? { ...latestParsed, rpStats: nextStats, indexes: { ...(latestParsed.indexes as object | undefined ?? {}), relationships: updatedRelationships } }
                    : { ...latestParsed, rpStats: nextStats };
                  await repository.saveStoryState({
                    id: `story-state:${storyId}`,
                    storyId,
                    stateJson: JSON.stringify(mergedState),
                    updatedAt: new Date().toISOString(),
                  });
                }
              }
            } catch {}
          }
        } else {
          // #region debug-point D:story-skip
          reportGenerationAudit({
            hypothesisId: "D",
            traceId,
            location: "StoryEngineProvider.tsx:sendChatMessage:skip-assistant",
            msg: "assistant reply skipped because user message declared a chapter boundary",
            data: {
              storyId,
              chapterBoundary,
            },
          });
          // #endregion
        }

        updatedMessages = await repository.listStoryMessages(storyId);

        if (updatedMessages.length > 0 && updatedMessages.length % 20 === 0) {
          const summaryContext = buildStorySummaryContext({
            storyTitle: story.title,
            playerCharacterName: playerCharacter.name,
            messages: updatedMessages,
          });

          const summaryText = await generateSummaryWithRetry({
            providerType,
            provider,
            apiKey,
            model,
            storyTitle: story.title,
            messages: summaryContext,
            existingSummary: story.currentSummary,
            debugTrace: {
              traceId,
              storyId,
              stage: "summary-refresh",
            },
          });

          await repository.saveStorySummary({
            id: createEntityId("story-summary"),
            storyId,
            summary: summaryText,
            generatedAt: new Date().toISOString(),
          });

          await repository.saveStory({
            ...story,
            currentSummary: summaryText,
            updatedAt: new Date().toISOString(),
          });
        }

        await touchStory(storyId);
        await hydrate(false);

        if (createdChapter) {
          void (async () => {
            try {
              const [latestChapters, latestStoryState] = await Promise.all([
                repository.listStoryChapters(storyId),
                repository.getStoryState(storyId),
              ]);

              const sortedChapters = [...latestChapters].sort((a, b) => a.endsAtIndex - b.endsAtIndex);
              const chapterIndex = sortedChapters.findIndex((chapter) => chapter.id === createdChapter.id);
              const previousChapter = chapterIndex > 0 ? sortedChapters[chapterIndex - 1] : null;
              const startIndex = (previousChapter?.endsAtIndex ?? 0) + 1;
              const endIndex = createdChapter.endsAtIndex;

              const slice = updatedMessages.slice(Math.max(0, startIndex - 1), Math.max(0, endIndex));
              const transcript = slice
                .map((message, idx) => {
                  const number = startIndex + idx;
                  const label =
                    message.role === "user"
                      ? `USER (${message.speakerName?.trim() || playerCharacter.name})`
                      : message.speakerType === "narrator"
                        ? "NARRATOR"
                        : message.speakerName?.trim()
                          ? `CANON (${message.speakerName.trim()})`
                          : "ASSISTANT";
                  const content = (message.content ?? "").trim().replace(/\s+/g, " ");
                  return `[${number}] ${label}: ${content}`;
                })
                .join("\n");

              const normalizedState = (() => {
                const json = latestStoryState?.stateJson?.trim() ?? "";
                if (!json) return null;
                const parsed = safeParseStoryStateData(json);
                return normalizeStoryStateToV2(parsed);
              })();

              const chapterPrompt = [
                "Write a chapter summary for the following canon chapter transcript.",
                "This summary is for the archive, not for narration. Do not write prose scenes.",
                "Keep it compact and spoiler-aware: focus on what actually happened, key reveals, and state changes.",
                "Output format:",
                "- 1 short paragraph summary",
                "- Then 3-6 bullet points of major beats",
              ].join("\n");

              const contextBlock = [
                `Story title: ${story.title}`,
                `Chapter: ${createdChapter.label}`,
                normalizedState?.summaries?.premise?.trim()
                  ? `Premise: ${normalizedState.summaries.premise.trim()}`
                  : null,
                story.currentSummary?.trim() ? `Current summary: ${story.currentSummary.trim()}` : null,
              ]
                .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
                .join("\n");

              const chapterSummaryText = (
                await generateResponseWithRetry({
                  providerType,
                  provider,
                  apiKey,
                  model,
                  messages: [
                    { role: "system", content: chapterPrompt },
                    { role: "system", content: `Context:\n${contextBlock}` },
                    { role: "user", content: transcript.slice(0, 12000) },
                  ],
                })
              ).content;

              await repository.saveStoryChapter({
                ...createdChapter,
                summary: chapterSummaryText.trim(),
              });
              await hydrate(false);
            } catch {}
          })();
        }

        const totalMessages = updatedMessages.length;

        void (async () => {
          try {
            const latestStoryState = await repository.getStoryState(storyId);
            const baseParsed = latestStoryState?.stateJson
              ? safeParseStoryStateData(latestStoryState.stateJson)
              : null;

            const baseState = normalizeStoryStateToV2(baseParsed);
            const lastDeepMessageCount =
              baseState.lastDeepIndexedMessageCount ??
              baseState.lastIndexedMessageCount ??
              baseState.indexes?.messageCount ??
              0;
            const nextDeepCounter = Math.max(0, totalMessages - lastDeepMessageCount);
            const autoDeepBootstrapAnchor =
              baseState.lastAutoDeepIndexedMessageCount ?? lastDeepMessageCount;
            const shouldBootstrapAutoDeepAnchor =
              baseState.lastAutoDeepIndexedMessageCount === undefined &&
              autoDeepBootstrapAnchor > 0;

            if (
              baseState.messagesSinceDeepIndexUpdate !== nextDeepCounter ||
              shouldBootstrapAutoDeepAnchor
            ) {
              const now = new Date().toISOString();
              const reconciledIndexes = reconcileStoryIndexes(baseState.indexes, totalMessages);
              // Preserve rpStats from raw state when safeParseStoryStateData returns null
              const rawRpStatsForCounter = (() => {
                if (baseParsed) return undefined; // handled via baseState spread
                try {
                  const raw = JSON.parse(latestStoryState?.stateJson ?? "{}") as Record<string, unknown>;
                  return raw?.rpStats as RpStats | undefined;
                } catch { return undefined; }
              })();

              const patched = withIndexedMetadata(
                baseParsed
                  ? {
                      ...baseState,
                      memoryArchitectureVersion: "2.0",
                      messagesSinceDeepIndexUpdate: nextDeepCounter,
                      ...(shouldBootstrapAutoDeepAnchor
                        ? { lastAutoDeepIndexedMessageCount: autoDeepBootstrapAnchor }
                        : {}),
                      indexes: reconciledIndexes ?? {
                        messageCount: totalMessages,
                        messageNumberingVersion: "1.0",
                      },
                    }
                  : {
                      ...(rawRpStatsForCounter ? { rpStats: rawRpStatsForCounter } : {}),
                      updatedAt: now,
                      characters: {},
                      worldFacts: [],
                      unresolvedThreads: [],
                      memoryArchitectureVersion: "2.0",
                      messagesSinceDeepIndexUpdate: nextDeepCounter,
                      ...(shouldBootstrapAutoDeepAnchor
                        ? { lastAutoDeepIndexedMessageCount: autoDeepBootstrapAnchor }
                        : {}),
                      indexes: reconciledIndexes ?? {
                        messageCount: totalMessages,
                        messageNumberingVersion: "1.0",
                      },
                    },
                { indexedAt: now, memoryArchitectureVersion: "2.0" },
              );

              await repository.saveStoryState({
                id: `story-state:${storyId}`,
                storyId,
                stateJson: JSON.stringify(patched),
                updatedAt: now,
              });

              await touchStory(storyId);
              await hydrate(false);
            }

            const autoIndexMode =
              story.autoIndexMode ??
              (story.autoIndexInterval === "disabled" ? "disabled" : "messages");

            if (autoIndexMode === "disabled") {
              return;
            }

            const lastAutoMessageCount =
              baseState.lastAutoDeepIndexedMessageCount ?? autoDeepBootstrapAnchor;

            if (autoIndexMode === "messages") {
              const autoIndexInterval = story.autoIndexInterval ?? 20;
              if (autoIndexInterval === "disabled") {
                return;
              }

              const messagesSinceAutoDeepIndex = Math.max(
                0,
                totalMessages - lastAutoMessageCount,
              );
              if (messagesSinceAutoDeepIndex < autoIndexInterval) {
                return;
              }
            } else if (autoIndexMode === "chapter") {
              const chapterBoundaries = await repository.listStoryChapters(storyId);
              const hasNewChapter =
                Boolean(createdChapter) ||
                chapterBoundaries.some(
                (chapter) => chapter.endsAtIndex > lastAutoMessageCount,
                );
              if (!hasNewChapter) {
                return;
              }
            }

            await queueStoryIndexJob(storyId, { trigger: "auto", incremental: true });
          } catch {}
        })();
        return { message: assistantMessage, appliedRpChanges, pendingCoreStatChanges, rpEventSummary, appliedRelationshipDeltas };
      },
    };
  }, [
    aiSettings,
    errorMessage,
    hydrate,
    loading,
    messages,
    playerCharacters,
    repository,
    stories,
    touchStory,
    universes,
    getNormalizedAISettings,
    resolveAIProfile,
    developerBugs,
    developerFeatureRequests,
    developerTestingNotes,
    rebuildStatus,
  ]);

  return (
    <StoryEngineContext.Provider value={value}>
      {children}
    </StoryEngineContext.Provider>
  );
}

export function useStoryEngine() {
  const context = useContext(StoryEngineContext);

  if (!context) {
    throw new Error("useStoryEngine must be used inside StoryEngineProvider.");
  }

  return context;
}
