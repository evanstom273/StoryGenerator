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
import { resolveStoryUniverseContext } from "../../lib/storyUniverseContext";
import {
  characterMatchesUniverses,
  getUniverseIds,
  normalizeUniverseIds,
} from "../../lib/universeIds";
import {
  sortByCreatedAtDesc,
  sortByTimestampAsc,
  sortByUpdatedAtDesc,
} from "../../lib/dates";
import { createEntityId } from "../../lib/ids";
import { createAIProvider } from "../../lib/ai/providerFactory";
import { resolveGeminiMinimalThinkingSettings } from "../../lib/ai/geminiThinking";
import {
  buildStoryChatContext,
  buildStorySummaryContext,
} from "../../lib/ai/contextBuilder";
import { getValidModel, getAIModelForRole, getCharacterConceptRequestConfig, getIndexingRequestConfig, getModelStreamConfig, getStoryStreamIdleTimeoutMs } from "../../lib/ai/models";
import { getSceneWordTarget, inferSceneDepth } from "../../lib/ai/sceneSizing";
import { buildDirectorAssistContext, buildPlayerAssistContext, storyHasGeneratedScenes } from "../../lib/ai/playerAssistContext";
import { formatDirectorAssistContinuation, formatDirectorAssistOutput } from "../../lib/ai/playerAssist";
import {
  buildCharacterGeneratorSystemPrompt,
  buildCharacterConceptGeneratorSystemPrompt,
  buildCharacterConceptUserPrompt,
  CHARACTER_CONCEPT_MAX_ATTEMPTS,
  isCompleteCharacterConcept,
  normalizeGeneratedCharacterConcept,
  type PlayerCharacterField,
} from "../../lib/ai/characterGenerator";
import {
  buildUniverseBlueprintSystemPrompt,
} from "../../lib/ai/universeGenerator";
import {
	buildAiDocumentMessages,
} from "../../lib/aiDocumentGenerator/buildPrompt";
import {
	buildAiDocumentFilename,
	getAiDocumentPreset,
	type AiDocumentPresetId,
} from "../../lib/aiDocumentGenerator/presets";
import { generateChapterStructuredDocument, resolveSourceMaterialForStructure } from "../../lib/aiDocumentGenerator/chapterGeneration";
import { generateGeminiPodcastAudioFromMarkdown, planGeminiPodcastTtsChunks } from "../../lib/aiDocumentGenerator/geminiAudio";
import { resolveGeminiPodcastTtsSettings, resolveGeminiNarrationTtsSettings } from "../../lib/ai/geminiTtsVoices";
import {
	buildAudioFilenameFromMarkdownUpload,
	segmentStoryBundleByChapter,
	segmentUploadedSourceByChapter,
} from "../../lib/aiDocumentGenerator/sourceMaterial";
import type {
	AiDocumentOutputFormat,
	AiDocumentStructure,
	AiDocumentGenerationResult,
} from "../../lib/aiDocumentGenerator/types";
import { extractFirstJsonObject, safeParseJsonObject, tryRepairTruncatedJson } from "../../lib/ai/json";
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
  createSequelStoryStateData,
  normalizeStoryStateToV2,
  finalizeStoryStateForSave,
  parseStoryStateJson,
  reconcileStoryIndexes,
  safeParseStoryStateData,
  withIndexedMetadata,
} from "../../lib/storyStateV2";
import { rebuildStoryMemoryAndIndexes } from "../../lib/ai/rebuildMemory";
import { createClearedStoryStateV2 } from "../../lib/transcriptPresence";
import { runGuidedChapterGeneration } from "../../lib/guidedChapterGeneration/runGuidedChapters";
import {
	buildChapterPlanPrompt,
	generateChapterPlanWithAi,
} from "../../lib/guidedChapterGeneration/planGeneration";
import { resolveUpcomingChapterLabels } from "../../lib/guidedChapterGeneration/chapterLabels";
import { buildGuidedChapterUiStatus } from "../../lib/guidedChapterGeneration/guidedGenerationProgress";
import { buildPriorChapterContinuationContext } from "../../lib/guidedChapterGeneration/priorChapterContext";
import type {
	GuidedChapterGenerationEntry,
	GuidedChapterPlan,
} from "../../lib/guidedChapterGeneration/types";
import {
	buildInitialChapterReviewProgress,
	selectChaptersForArchiveRebuild,
} from "../../lib/ai/storyIndexingProgress";
import {
  formatStoryLongTermMemoryForPrompt,
  formatStorySceneStateForPrompt,
} from "../../lib/ai/storyStateExtractor";
import { runAutoBackupIfNeeded } from "../../lib/autoBackup";
import {
  sendJobCompletionNotification,
} from "../../lib/jobNotifications";
import {
  mergeMetaChatReferences,
  resolveMetaChatReferences,
} from "../../lib/metaChatReferences";
import { isGlobalMetaChatScope } from "../../lib/metaChatScope";
import {
  normalizeTranscriptForDisplay,
  validateAssistantTranscriptForSave,
  shouldAcceptStreamDespiteSpeakerAttributionFlags,
  type AssistantTranscriptValidationStage,
} from "../../lib/storyText/transcriptSanitizer";
import { STREAM_VALIDATION_MAX_ATTEMPTS } from "../../lib/storyText/streamValidationPolicy";
import { extractSpeakerPrefix } from "../../lib/storyText/extractSpeakerPrefix";
import { detectDirectorIntent, resolveExactMinutes } from "../../lib/storyText/directorIntent";
import {
  applyAuthorDirectivesToStoryState,
  isAuthorDirectiveMessage,
  resolveAuthorDirective,
  resolveUserSpeakerNameForAuthorDirective,
  resolveUserSpeakerTypeForAuthorDirective,
} from "../../lib/storyText/authorDirectives";
import {
  isDirectorMessage,
  resolveUserSpeakerName,
  resolveUserSpeakerType,
} from "../../lib/storyText/directorMode";
import { formatDirectorNoteInterpretationGuidance } from "../../lib/storyText/directorSyntax";
import {
  isContinueInstructionText,
  isContinueMessage,
  isContinueSpeakerLabel,
  resolveUserSpeakerNameForContinue,
  resolveUserSpeakerTypeForContinue,
} from "../../lib/storyText/continueMode";
import { clampAudiobookParallelChapters } from "../../lib/ai/storyAudiobookParallel";
import { normalizeAudiobookPerformanceMode } from "../../lib/ai/audiobookPerformance";
import {
	computeStoryAudiobookPreparedDigest,
	listStoryAudiobookChapterSegments,
	synthesizeStoryAudiobookWav,
} from "../../lib/ai/storyAudiobook";
import type { StoryAudiobookProgress } from "../../lib/ai/storyAudiobookProgress";
import { buildCharacterGenderHintsFromStoryState } from "../../lib/ai/characterTtsVoices";
import { buildCharacterTtsRegistryForStory } from "../../lib/storyText/messageSpeechText";
import { ingestAiDocumentAudioFromJob } from "../../lib/mediaLibrary/ingestAiDocumentAudio";
import { ingestStoryAudio } from "../../lib/mediaLibrary/ingestStoryAudio";
import { markMediaAssetsOrphanedForStory } from "../../lib/mediaLibrary/store";
import {
	isBackgroundTaskJob,
	isAudiobookExportBackgroundJob,
	isAudiobookListenBackgroundJob,
	resolveMaxConcurrentBackgroundTasks,
	countRunningBackgroundTasks,
	getNextBackgroundTaskQueueOrder,
	moveQueuedBackgroundTaskInOrder,
	sortQueuedBackgroundTasks,
	audiobookProgressToBackgroundJobProgress,
	backgroundJobProgressFromSteps,
	buildSingleDocumentSteps,
	setBackgroundJobStepStatus,
} from "../../lib/backgroundTasks";
import { detectChapterBoundary } from "../../lib/storyText/chapterDetection";
import { extractRpStatChanges, type RpStatDelta } from "../../lib/ai/rpStatsExtractor";
import {
  reconcileRelationshipsFromStateJson,
} from "../../lib/storyRelationshipLoad";
import { applyStatChange, buildRpEventSummary, clampStat, DEFAULT_RP_CONFIG, defaultRpStats, getStatValue } from "../../lib/rpStats";
import { advanceTime, checkRecurringEvents, formatTimeShort } from "../../lib/rpTime";
import {
  formatUniverseWikiSources,
  getPrimaryUniverseWikiUrl,
  normalizeUniverseWikiSources,
} from "../../lib/universeSources";
import {
  formatPlayerCharacterAliasesForPrompt,
  normalizePlayerCharacterAliases,
  buildCharacterConceptConstraintsFromDraft,
  formatCharacterConceptAliasesConstraint,
  formatCharacterKnownTiesConstraint,
  formatAntiCanonSprawlGuidance,
  formatPlayerCharacterKnownTiesForPrompt,
  normalizePlayerCharacterKnownTies,
  buildPlayerNameForValidation,
  formatPlayerCharacterOwnershipRulesForRewrite,
  formatPlayerCharacterPronounAndNamingRules,
  resolvePlayerCharacterPreferredSceneName,
  resolvePlayerCharacterSceneName,
} from "../../lib/playerCharacterPrompt";
import type {
  AIModelRole,
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
  GeminiPodcastTtsSettings,
  GeminiNarrationTtsSettings,
  GuardedDeleteResult,
  MetaChatReference,
  PlayerCharacterExportBundleV1,
  PlayerCharacter,
  PlayerCharacterDraft,
  RelationshipIndexEntry,
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
  StoryIndexesV2,
  StoryUiState,
  StoryMetaMessage,
  StoryMessage,
  StoryMessageDraft,
  StoryState,
  StoryStateData,
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
    startedAtMs?: number;
    stage?: "loading" | "messages" | "chapter-boundaries" | "chapter-reviews" | "saving-state";
    chapterReviews?: Array<{
      label: string;
      displayLabel: string;
      status: "pending" | "active" | "done";
      startedAtMs?: number;
      completedAtMs?: number;
    }>;
    jobId?: string;
  };
  guidedGenerationStatus?: {
    storyId: string;
    phase: "generating" | "indexing" | "done" | "error";
    currentChapter: number;
    totalChapters: number;
    chapterLabel?: string;
    message?: string;
    chapters: Array<{ label: string; status: "pending" | "active" | "done" }>;
    jobId?: string;
    startedAtMs?: number;
    error?: string;
    streamingDraft?: string | null;
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
  getMetaMessagesForScope: (scopeId: string) => StoryMetaMessage[];
  getMetaMessagesForStory: (storyId: string) => StoryMetaMessage[];
  getChaptersForStory: (storyId: string) => StoryChapter[];
  getJobsForStory: (storyId: string) => BackgroundJob[];
  getMetaChatJobs: (scopeId: string) => BackgroundJob[];
  getMetaChatDraft: (storyId: string) => string;
  getMetaChatReferences: (scopeId: string) => MetaChatReference[];
  getStoryCharacterTtsRegistry: (storyId: string) => {
    voices: Record<string, string>;
    labels: Record<string, string>;
  } | undefined;
  saveStoryCharacterTtsRegistry: (
    storyId: string,
    registry: { voices: Record<string, string>; labels: Record<string, string> },
  ) => Promise<void>;
  getPlayerCharactersForUniverse: (universeIdOrIds: string | string[]) => PlayerCharacter[];
  getStoriesForUniverse: (universeId: string) => Story[];
  getStoriesForPlayerCharacter: (playerCharacterId: string) => Story[];
  getParentStory: (storyId: string) => Story | undefined;
  getChildStories: (storyId: string) => Story[];
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
  generateAiDocument: (input: {
    source:
      | { type: "story"; storyId: string; label: string }
      | { type: "upload"; text: string; label: string };
    presetId: AiDocumentPresetId;
    customPrompt?: string;
    structure?: AiDocumentStructure;
    outputFormat?: AiDocumentOutputFormat;
    signal?: AbortSignal;
    onChunk?: (chunk: string) => void;
    onChunkReset?: () => void;
    onProgress?: (message: string) => void;
    onAudioChunkComplete?: (state: {
      index: number;
      total: number;
      pcmParts: Uint8Array[];
    }) => void;
    audioResume?: { pcmParts: Uint8Array[] };
  }) => Promise<AiDocumentGenerationResult>;
  generateAiDocumentAudioFromMarkdown: (input: {
    markdown: string;
    label: string;
    signal?: AbortSignal;
    onProgress?: (message: string) => void;
    onChunkComplete?: (state: {
      index: number;
      total: number;
      pcmParts: Uint8Array[];
    }) => void;
    resume?: { pcmParts: Uint8Array[] };
  }) => Promise<AiDocumentGenerationResult>;
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
  createSequel: (input: {
    sourceStoryId: string;
    title: string;
    playerCharacterId: string;
    openingNote?: string;
  }) => Promise<Story>;
  createBranch: (input: {
    sourceStoryId: string;
    title: string;
  }) => Promise<Story>;
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
  setMetaChatReferences: (
    scopeId: string,
    references: MetaChatReference[],
  ) => Promise<void>;
  resetMetaChatConversation: (scopeId: string) => Promise<void>;
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
  loadStoryRelationships: (storyId: string) => Promise<RelationshipIndexEntry[]>;
  refreshStoryState: (storyId: string, opts?: { force?: boolean }) => Promise<void>;
  updateIndexesDeep: (storyId: string, opts?: { signal?: AbortSignal; incremental?: boolean }) => Promise<void>;
  queueStoryIndexJob: (
    storyId: string,
    opts?: { trigger?: "manual" | "auto"; incremental?: boolean; force?: boolean },
  ) => Promise<{ job: BackgroundJob; duplicate: boolean }>;
  cancelBackgroundJob: (jobId: string) => Promise<BackgroundJob | null>;
  reorderBackgroundTaskJob: (
    jobId: string,
    direction: "up" | "down",
  ) => Promise<BackgroundJob[] | null>;
  cancelStoryIndexing: (storyId: string) => Promise<void>;
  clearStoryIndex: (storyId: string) => Promise<void>;
  queueAudiobookJob: (
    storyId: string,
    opts?: { force?: boolean },
  ) => Promise<{ job: BackgroundJob; duplicate: boolean }>;
  beginAudiobookPlaybackBackgroundTask: (input: {
    storyId: string;
    playId: string;
    chapterCount?: number;
    purpose?: "playback" | "chapter_listen";
    progressLabel?: string;
  }) => Promise<{ job: BackgroundJob; shouldStartNow: boolean }>;
  promoteQueuedAudiobookListenTasks: () => Promise<BackgroundJob[]>;
  updateAudiobookPlaybackBackgroundTask: (
    jobId: string,
    progress: { current: number; total: number; label?: string },
  ) => Promise<void>;
  finishAudiobookPlaybackBackgroundTask: (
    jobId: string,
    outcome: "complete" | "failed" | "cancelled",
    error?: string,
  ) => Promise<void>;
  queueAiDocumentJob: (input: {
    source:
      | { type: "story"; storyId: string; label: string }
      | { type: "upload"; text: string; label: string };
    presetId: AiDocumentPresetId;
    customPrompt?: string;
    structure?: AiDocumentStructure;
    outputFormat?: AiDocumentOutputFormat;
    force?: boolean;
  }) => Promise<{ job: BackgroundJob; duplicate: boolean }>;
  queuePodcastAudioJob: (input: {
    markdown: string;
    label: string;
    force?: boolean;
  }) => Promise<{ job: BackgroundJob; duplicate: boolean }>;
  audiobookExportStatus?: {
    storyId: string;
    jobId?: string;
    phase: "running" | "done" | "error";
    progress?: StoryAudiobookProgress;
    message?: string;
    error?: string;
    startedAtMs?: number;
  };
  queueGuidedChapterJob: (
    storyId: string,
    opts: { entry: GuidedChapterGenerationEntry; plan: GuidedChapterPlan },
  ) => Promise<{ job: BackgroundJob; duplicate: boolean }>;
  cancelGuidedChapterGeneration: (storyId: string) => Promise<void>;
  generateGuidedChapterPlan: (input: {
    storyId?: string;
    overallDirection: string;
    chapterLabels: string[];
    chapters?: Array<{
      label: string;
      overview: string;
      scenesPerChapter: number;
    }>;
    universeName: string;
    playerName: string;
    currentSituation?: string;
  }) => Promise<GuidedChapterPlan | null>;
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
    metachatModels?: Partial<Record<AIProviderType, string>>;
    indexingModels?: Partial<Record<AIProviderType, string>>;
    creationModels?: Partial<Record<AIProviderType, string>>;
    geminiPodcastTts?: Partial<GeminiPodcastTtsSettings>;
    geminiNarrationTts?: Partial<GeminiNarrationTtsSettings>;
    maxConcurrentBackgroundTasks?: 1 | 2 | 3 | 4 | 5;
  }) => Promise<AISettings>;
  validateAIConnection: (providerType?: AIProviderType) => Promise<void>;
  getStoryAIConfig: (storyId: string) => Promise<StoryAIConfig | null>;
  saveStoryAIConfig: (next: {
    storyId: string;
    providerType: AIProviderType;
    model?: string;
    audiobookParallelChapters?: number;
    audiobookPerformanceMode?: "radio_drama" | "single_narrator";
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
  generatePlayerCharacterConcept: (
    universeId?: string,
    existing?: Partial<PlayerCharacterDraft>,
  ) => Promise<string>;
  sendChatMessage: (storyId: string, content: string, opts?: { zeroHpConsequence?: string; directorIntentOverride?: DirectorIntent; skipAssistantResponse?: boolean; signal?: AbortSignal; guidedGenerationInternal?: boolean; directorStagingNote?: string; guidedDirectedScene?: boolean; guidedChapterContext?: { overallDirection?: string; chapterOverview?: string; chapterLabel?: string; sceneOverview?: string; continuityNotes?: string; previousChapterContext?: string }; onChunk?: (chunk: string) => void; onChunkReset?: () => void; onGenerationAttempt?: (attempt: number, maxAttempts: number) => void }) => Promise<{ message: StoryMessage | null; appliedRpChanges: RpChangelogEntry[] | null; pendingCoreStatChanges: RpStatDelta[] | null; rpEventSummary: string | null }>;
  editAssistantMessage: (messageId: string, content: string) => Promise<StoryMessage | null>;
  regenerateLastAssistantMessage: (storyId: string, opts?: { onChunk?: (chunk: string) => void; onChunkReset?: () => void; onGenerationAttempt?: (attempt: number, maxAttempts: number) => void; signal?: AbortSignal }) => Promise<StoryMessage>;
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

function isStoryReadOnly(story: Pick<Story, "readOnlyReason"> | null | undefined) {
  return story?.readOnlyReason === "sequel_prequel";
}

function trimSequelLines(values: Array<string | undefined>, maxItems: number) {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .filter((value, index, array) => array.findIndex((candidate) => candidate === value) === index)
    .slice(0, maxItems);
}

function buildSequelSummaryText(args: {
  sourceStory: Story;
  sourceSummary: string;
  sourceState: StoryStateData | null;
  openingNote?: string;
}) {
  const parsed = args.sourceState;
  const relationshipLines = trimSequelLines(
    [
      ...(parsed?.relationshipState ?? []),
      ...((parsed?.indexes?.relationships ?? [])
        .map((entry: RelationshipIndexEntry) => entry.summary)
        .filter((value: string | undefined): value is string => typeof value === "string")),
      parsed?.summaries?.relationshipSummary,
    ],
    5,
  );
  const worldLines = trimSequelLines(
    [
      parsed?.summaries?.currentSituation,
      parsed?.summaries?.worldSummary,
      ...(parsed?.worldFacts ?? []),
      ...((parsed?.indexes?.worldFacts ?? []).map((entry: NonNullable<StoryIndexesV2["worldFacts"]>[number]) => entry.fact)),
      ...(parsed?.unresolvedThreads ?? []),
      ...((parsed?.threads?.openThreads ?? [])),
    ],
    7,
  );

  return [
    "Story Context",
    "",
    `This story is a direct sequel to ${args.sourceStory.title}.`,
    "Previous events are canon.",
    "",
    "Current state:",
    args.sourceSummary || "Canon continues from the predecessor story.",
    ...(relationshipLines.length
      ? ["", "Relationships:", ...relationshipLines]
      : []),
    ...(worldLines.length
      ? ["", "Active world state:", ...worldLines]
      : []),
    ...(args.openingNote?.trim()
      ? ["", "Sequel setup note:", args.openingNote.trim()]
      : []),
  ].join("\n");
}

function buildUniversePackSnapshot(
  universePack: UniverseExportBundleV1 | null | undefined,
): UniversePackSnapshotV1 | undefined {
  return universePack
    ? {
        snapshotVersion: 1,
        exportedAt: universePack.exportedAt,
        packVersion: universePack.packVersion ?? 1,
        universe: universePack.universe,
        universeImports: universePack.universeImports,
      }
    : undefined;
}

function applyUniverseIdsFromDraft<T extends { universeId: string; universeIds?: string[] }>(
  draft: { universeId: string; universeIds?: string[] },
  entity: T,
): T {
  const universeIds = normalizeUniverseIds(
    draft.universeIds?.length ? draft.universeIds : [draft.universeId],
  );
  return {
    ...entity,
    universeId: universeIds[0] ?? draft.universeId,
    universeIds,
  };
}

async function buildUniversePackSnapshotsForIds(
  repository: StoryEngineRepository,
  universeIds: string[],
): Promise<UniversePackSnapshotV1[]> {
  const snapshots = await Promise.all(
    normalizeUniverseIds(universeIds).map(async (universeId) => {
      const pack = await repository.getUniverseExportBundle(universeId);
      return buildUniversePackSnapshot(pack);
    }),
  );
  return snapshots.filter((snapshot): snapshot is UniversePackSnapshotV1 => Boolean(snapshot));
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
  thinking?: import("../../lib/ai/geminiThinking").GeminiThinkingSettings;
  signal?: AbortSignal;
  maxAttempts?: number;
  timeoutMs?: number;
  onChunk?: (chunk: string) => void;
  onChunkReset?: () => void;
  idleTimeoutMs?: number;
  debugTrace?: {
    traceId: string;
    mode: "story" | "additive" | "metachat" | "summary" | "other";
    storyId?: string;
    stage: string;
    lastUserText?: string;
  };
}) {
  const isStreaming = !!params.onChunk;
  const streamConfig = isStreaming ? getModelStreamConfig(params.model) : null;
  const indexingConfig = !isStreaming ? getIndexingRequestConfig(params.model) : null;
  const maxAttempts =
    streamConfig?.maxAttempts ?? params.maxAttempts ?? indexingConfig?.maxAttempts ?? AI_MAX_ATTEMPTS;
  const requestTimeoutMs =
    params.timeoutMs ?? streamConfig?.totalTimeoutMs ?? indexingConfig?.timeoutMs;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (params.signal?.aborted) {
      throw new Error("Request aborted.");
    }
    if (attempt > 1) {
      params.onChunkReset?.();
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
        streaming: isStreaming,
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
        thinking: params.thinking,
        signal: params.signal,
        timeoutMs: requestTimeoutMs,
        idleTimeoutMs: params.idleTimeoutMs ?? streamConfig?.idleTimeoutMs,
        onChunk: params.onChunk,
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

type StreamedTranscriptRewritePrompts = {
	format: string;
	ownership: string;
	hiddenDialogue: string;
	sceneState: string;
};

const STREAM_VALIDATION_MAX_REWRITES = STREAM_VALIDATION_MAX_ATTEMPTS;

function reportStreamGenerationAttempt(
	onGenerationAttempt: ((attempt: number, maxAttempts: number) => void) | undefined,
	streamAttempt: { current: number },
) {
	streamAttempt.current = Math.min(streamAttempt.current + 1, STREAM_VALIDATION_MAX_ATTEMPTS);
	onGenerationAttempt?.(streamAttempt.current, STREAM_VALIDATION_MAX_ATTEMPTS);
}

async function resolveStreamedAssistantTranscript(args: {
	initialText: string;
	latestUserMessage: string;
	playerName: string;
	allowDirectedPlayerControl: boolean;
	skipSceneStateCheck?: boolean;
	hiddenDialoguePattern: RegExp;
	rewritePrompts: StreamedTranscriptRewritePrompts;
	providerType: string;
	provider: AIProvider;
	apiKey: string;
	model: string;
	signal?: AbortSignal;
	onChunk?: (chunk: string) => void;
	onChunkReset?: () => void;
	reportStreamAttempt?: () => void;
	streamIdleTimeoutMs: number;
	traceId: string;
	storyId: string;
}): Promise<{ text: string; diagnostic: string }> {
	let candidateAssistantText = args.initialText;
	let lastValidationDiagnostic = "";

	const rewriteStageToPrompt: Record<
		Exclude<AssistantTranscriptValidationStage, "insubstantial">,
		string
	> = {
		speaker_attribution: args.rewritePrompts.format,
		format: args.rewritePrompts.format,
		ownership: args.rewritePrompts.ownership,
		hidden_dialogue: args.rewritePrompts.hiddenDialogue,
		scene_state: args.rewritePrompts.sceneState,
	};

	for (let attempt = 0; attempt <= STREAM_VALIDATION_MAX_REWRITES; attempt += 1) {
		const validation = validateAssistantTranscriptForSave({
			text: candidateAssistantText,
			latestUserMessage: args.latestUserMessage,
			playerName: args.playerName,
			allowDirectedPlayerControl: args.allowDirectedPlayerControl,
			skipSceneStateCheck: args.skipSceneStateCheck,
			hiddenDialoguePattern: args.hiddenDialoguePattern,
		});

		if (validation.valid) {
			return {
				text: normalizeTranscriptForDisplay(candidateAssistantText),
				diagnostic: lastValidationDiagnostic,
			};
		}

		if (
			attempt === 0 &&
			candidateAssistantText === args.initialText &&
			validation.stage === "speaker_attribution" &&
			shouldAcceptStreamDespiteSpeakerAttributionFlags({
				text: candidateAssistantText,
				playerName: args.playerName,
			})
		) {
			return {
				text: normalizeTranscriptForDisplay(candidateAssistantText),
				diagnostic: [
					lastValidationDiagnostic,
					"accepted_stream_with_speaker_attribution_flags",
				]
					.filter(Boolean)
					.join("; "),
			};
		}

		lastValidationDiagnostic = [
			lastValidationDiagnostic,
			`attempt=${attempt + 1}`,
			validation.diagnostic,
		]
			.filter(Boolean)
			.join("; ");

		const stage = validation.stage;

		if (!stage || stage === "insubstantial" || attempt >= STREAM_VALIDATION_MAX_REWRITES) {
			break;
		}

		const rewritePrompt = rewriteStageToPrompt[stage];
		args.reportStreamAttempt?.();
		args.onChunkReset?.();
		candidateAssistantText = (
			await generateResponseWithRetry({
				providerType: args.providerType,
				provider: args.provider,
				apiKey: args.apiKey,
				model: args.model,
				messages: [
					{ role: "system", content: rewritePrompt },
					{ role: "user", content: candidateAssistantText },
				],
				signal: args.signal,
				onChunk: args.onChunk,
				onChunkReset: args.onChunkReset,
				idleTimeoutMs: args.streamIdleTimeoutMs,
				debugTrace: {
					traceId: args.traceId,
					mode: "story",
					storyId: args.storyId,
					stage: `${validation.stage}-rewrite`,
					lastUserText: candidateAssistantText,
				},
			})
		).content;
	}

	throw new GenerationFailureError(
		createGenerationFailure(
			createAIGenerationError(
				"validation",
				"The streamed response could not be validated. Rewrite attempts were exhausted.",
				{
					retryable: false,
					diagnostic:
						lastValidationDiagnostic ||
						`rewrite_stage=unknown; raw=${clipGenerationAuditText(candidateAssistantText, 1200)}`,
				},
			),
			{
				providerName: args.providerType,
				model: args.model,
				attempts: STREAM_VALIDATION_MAX_REWRITES,
				maxAttempts: STREAM_VALIDATION_MAX_REWRITES,
				stage: "validation",
			},
		),
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
    if (isAuthorDirectiveMessage(message)) {
      return `${message.speakerName?.trim() || "Author"}: ${content}`;
    }

    if (isContinueMessage(message)) {
      return `Continue: ${content}`;
    }

    if (isDirectorMessage(message)) {
      return `Director: ${content}`;
    }

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

function formatTranscriptSpeakerForIndexing(
  message: StoryMessage,
  playerCharacterName: string,
) {
  if (message.role === "user") {
    if (isAuthorDirectiveMessage(message)) {
      return message.speakerName?.trim()?.toUpperCase() || "AUTHOR";
    }

    if (isContinueMessage(message)) {
      return "CONTINUE";
    }

    return isDirectorMessage(message)
      ? "DIRECTOR"
      : `USER (${message.speakerName?.trim() || playerCharacterName})`;
  }

  if (message.speakerType === "narrator") {
    return "NARRATOR";
  }

  if (message.speakerName?.trim()) {
    return `CANON (${message.speakerName.trim()})`;
  }

  return "ASSISTANT";
}

function getLatestPriorUserMessage(
  messages: StoryMessage[],
  currentUserMessageId?: string,
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") {
      continue;
    }
    if (currentUserMessageId && message.id === currentUserMessageId) {
      continue;
    }
    return message;
  }
  return null;
}

function shouldAllowDirectedPlayerControlForUserTurn(
  message: StoryMessage | null | undefined,
  latestPriorUserMessage?: StoryMessage | null,
) {
  if (!message || message.role !== "user") {
    return false;
  }

  if (isDirectorMessage(message)) {
    return true;
  }

  return Boolean(
    isContinueMessage(message) &&
      latestPriorUserMessage &&
      isDirectorMessage(latestPriorUserMessage),
  );
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
    formatPlayerCharacterAliasesForPrompt(params.playerCharacter),
    formatPlayerCharacterKnownTiesForPrompt(params.playerCharacter),
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

function buildMetaChatLibraryOverview(args: {
  stories: Story[];
  universes: Universe[];
  playerCharacters: PlayerCharacter[];
}) {
  const universeMap = new Map(args.universes.map((universe) => [universe.id, universe]));
  const characterMap = new Map(
    args.playerCharacters.map((character) => [character.id, character]),
  );

  const recentStories = sortByUpdatedAtDesc(args.stories)
    .slice(0, 16)
    .map((story) =>
      [
        story.title,
        universeMap.get(story.universeId)?.name
          ? `Universe: ${universeMap.get(story.universeId)!.name}`
          : null,
        characterMap.get(story.playerCharacterId)?.name
          ? `Player character: ${characterMap.get(story.playerCharacterId)!.name}`
          : null,
        story.currentSummary?.trim() ? `Summary: ${story.currentSummary.trim()}` : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join(" | "),
    );

  const recentCharacters = sortByCreatedAtDesc(args.playerCharacters)
    .filter((character) => (character.scope ?? "library") === "library")
    .slice(0, 16)
    .map((character) =>
      [
        character.name,
        universeMap.get(character.universeId)?.name
          ? `Universe: ${universeMap.get(character.universeId)!.name}`
          : null,
        character.characterConcept?.trim()
          ? `Concept: ${character.characterConcept.trim()}`
          : null,
        normalizePlayerCharacterAliases(character.aliases).length
          ? `Aliases: ${normalizePlayerCharacterAliases(character.aliases).join(", ")}`
          : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join(" | "),
    );

  const recentUniverses = sortByCreatedAtDesc(args.universes)
    .slice(0, 12)
    .map((universe) =>
      [
        universe.name,
        universe.description?.trim() ? `Description: ${universe.description.trim()}` : null,
        universe.genreTheme?.trim() ? `Genre/theme: ${universe.genreTheme.trim()}` : null,
        universe.tone?.trim() ? `Tone: ${universe.tone.trim()}` : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join(" | "),
    );

  return normalizeMetaChatWhitespace(
    [
      "Library Overview",
      `Stories in library: ${args.stories.length}`,
      `Universes in library: ${args.universes.length}`,
      `Library characters: ${args.playerCharacters.filter((character) => (character.scope ?? "library") === "library").length}`,
      recentStories.length
        ? `Recent / active stories\n${recentStories.map((line) => `- ${line}`).join("\n")}`
        : null,
      recentCharacters.length
        ? `Player characters\n${recentCharacters.map((line) => `- ${line}`).join("\n")}`
        : null,
      recentUniverses.length
        ? `Universes\n${recentUniverses.map((line) => `- ${line}`).join("\n")}`
        : null,
    ]
      .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
      .join("\n\n"),
  );
}

async function rebuildChapterArchiveSummaries(params: {
  story: Story;
  playerCharacter: PlayerCharacter;
  repository: StoryEngineRepository;
  messages: StoryMessage[];
  chapters: StoryChapter[];
  storyStateJson?: string;
  providerType: string;
  provider: AIProvider;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
  incremental?: boolean;
  previousDeepIndexedMessageCount?: number;
  onProgress?: (args: { processed: number; total: number; label: string }) => void;
}) {
  const sortedChapters = [...params.chapters].sort((left, right) => left.endsAtIndex - right.endsAtIndex);
  const chaptersToRebuild = sortedChapters.filter((chapter) => {
    if (!params.incremental) {
      return true;
    }
    if (!chapter.summary?.trim()) {
      return true;
    }
    return chapter.endsAtIndex > (params.previousDeepIndexedMessageCount ?? 0);
  });

  if (!chaptersToRebuild.length) {
    return 0;
  }

  const normalizedState = (() => {
    const json = params.storyStateJson?.trim() ?? "";
    if (!json) return null;
    const parsed = safeParseStoryStateData(json);
    return normalizeStoryStateToV2(parsed);
  })();

  for (let chapterIndex = 0; chapterIndex < chaptersToRebuild.length; chapterIndex += 1) {
    if (params.signal?.aborted) {
      throw new Error("Re-index aborted.");
    }

    const chapter = chaptersToRebuild[chapterIndex]!;
    const chapterPosition = sortedChapters.findIndex((entry) => entry.id === chapter.id);
    const previousChapter = chapterPosition > 0 ? sortedChapters[chapterPosition - 1] : null;
    const startIndex = (previousChapter?.endsAtIndex ?? 0) + 1;
    const endIndex = chapter.endsAtIndex;
    const slice = params.messages.slice(Math.max(0, startIndex - 1), Math.max(0, endIndex));

    if (!slice.length) {
      continue;
    }

    params.onProgress?.({
      processed: chapterIndex + 1,
      total: chaptersToRebuild.length,
      label: chapter.label,
    });

    const transcript = slice
      .map((message, idx) => {
        const number = startIndex + idx;
        const label = formatTranscriptSpeakerForIndexing(
          message,
          params.playerCharacter.name,
        );
        const content = (message.content ?? "").trim().replace(/\s+/g, " ");
        return `[${number}] ${label}: ${content}`;
      })
      .join("\n");

    const chapterPrompt = [
      "Rebuild the archive chapter review for the following canon chapter transcript.",
      "Continue lines are continuation notes preserved in the transcript. They are not on-screen beats; use them only to understand that the scene was intentionally allowed to keep unfolding.",
      "Director lines are staging notes preserved in the transcript. Use them as context, but summarize what actually happens in the scene, not the note itself.",
      "Canon/Secret/Reveal/Retcon lines are author declarations preserved in the transcript. Treat them as authoritative continuity constraints, secrecy rules, or retcons, but do not summarize the declaration itself as if it were an on-screen beat.",
      "This output is for the story archive, not for narration. Do not write prose scenes.",
      "Keep it compact and spoiler-aware: focus on what actually happened, key reveals, and state changes.",
      "Output format:",
      "- 1 short paragraph summary",
      "- Then 3-6 bullet points of major beats",
    ].join("\n");

    const contextBlock = [
      `Story title: ${params.story.title}`,
      `Chapter: ${chapter.label}`,
      normalizedState?.summaries?.premise?.trim()
        ? `Premise: ${normalizedState.summaries.premise.trim()}`
        : null,
      params.story.currentSummary?.trim()
        ? `Current summary: ${params.story.currentSummary.trim()}`
        : null,
    ]
      .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
      .join("\n");

    const chapterIndexingConfig = getIndexingRequestConfig(params.model);
    const chapterSummaryText = (
      await generateResponseWithRetry({
        providerType: params.providerType,
        provider: params.provider,
        apiKey: params.apiKey,
        model: params.model,
        signal: params.signal,
        timeoutMs: chapterIndexingConfig.timeoutMs,
        maxAttempts: chapterIndexingConfig.maxAttempts,
        messages: [
          { role: "system", content: chapterPrompt },
          { role: "system", content: `Context:\n${contextBlock}` },
          { role: "user", content: transcript.slice(0, 12000) },
        ],
      })
    ).content;

    await params.repository.saveStoryChapter({
      ...chapter,
      summary: chapterSummaryText.trim(),
    });
  }

  return chaptersToRebuild.length;
}

function normalizeChapterLabelKey(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveStoredOrDetectedChapterBoundary(message: StoryMessage) {
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

function deriveStoryChaptersFromTranscript(params: {
  storyId: string;
  messages: StoryMessage[];
  existingChapters: StoryChapter[];
}) {
  const sortedMessages = sortByTimestampAsc(
    params.messages.filter((message) => message.storyId === params.storyId),
  );
  const existingBySignature = new Map(
    params.existingChapters.map((chapter) => [
      `${normalizeChapterLabelKey(chapter.label)}::${chapter.endsAtMessageId}`,
      chapter,
    ]),
  );
  const chapters: StoryChapter[] = [];
  const seenSignatures = new Set<string>();
  let activeLabel: string | null = null;

  function pushChapter(label: string, message: StoryMessage, endsAtIndex: number) {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      return;
    }
    const signature = `${normalizeChapterLabelKey(normalizedLabel)}::${message.id}`;
    if (seenSignatures.has(signature)) {
      return;
    }
    seenSignatures.add(signature);
    const existing = existingBySignature.get(signature);
    chapters.push({
      id: existing?.id ?? createEntityId("story-chapter"),
      storyId: params.storyId,
      label: normalizedLabel,
      endsAtMessageId: message.id,
      endsAtIndex,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      summary: existing?.summary,
    });
  }

  for (let index = 0; index < sortedMessages.length; index += 1) {
    const message = sortedMessages[index]!;
    const boundary = resolveStoredOrDetectedChapterBoundary(message);
    if (!boundary) {
      continue;
    }

    if (boundary.kind === "start") {
      const previousMessage = index > 0 ? sortedMessages[index - 1] : null;
      if (activeLabel && previousMessage) {
        pushChapter(activeLabel, previousMessage, index);
      }
      activeLabel = boundary.label;
      continue;
    }

    const resolvedLabel =
      boundary.label === "The End" ? activeLabel : boundary.label;
    if (!resolvedLabel) {
      continue;
    }

    pushChapter(resolvedLabel, message, index + 1);
    activeLabel = null;
  }

  return chapters.sort((left, right) => left.endsAtIndex - right.endsAtIndex);
}

async function syncStoryChaptersFromTranscript(params: {
  storyId: string;
  repository: StoryEngineRepository;
  messages: StoryMessage[];
  existingChapters: StoryChapter[];
}) {
  const rebuiltChapters = deriveStoryChaptersFromTranscript(params);
  const nextIds = new Set(rebuiltChapters.map((chapter) => chapter.id));
  const chaptersToDelete = params.existingChapters.filter((chapter) => !nextIds.has(chapter.id));

  await Promise.all(chaptersToDelete.map((chapter) => params.repository.deleteStoryChapter(chapter.id)));
  await Promise.all(rebuiltChapters.map((chapter) => params.repository.saveStoryChapter(chapter)));

  return rebuiltChapters;
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
    aliases: (() => {
      const winnerAliases = normalizePlayerCharacterAliases(winner.aliases);
      if (winnerAliases.length) {
        return winnerAliases;
      }
      return normalizePlayerCharacterAliases(candidate.aliases);
    })(),
    knownTies: (() => {
      const winnerKnownTies = normalizePlayerCharacterKnownTies(winner.knownTies);
      if (winnerKnownTies.length) {
        return winnerKnownTies;
      }
      return normalizePlayerCharacterKnownTies(candidate.knownTies);
    })(),
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
  const [audiobookExportStatus, setAudiobookExportStatus] =
    useState<StoryEngineContextValue["audiobookExportStatus"]>();
  const [guidedGenerationStatus, setGuidedGenerationStatus] =
    useState<StoryEngineContextValue["guidedGenerationStatus"]>();
  const [jobNotice, setJobNotice] = useState<StoryEngineContextValue["jobNotice"]>(null);
  const sendChatMessageRef = useRef<StoryEngineContextValue["sendChatMessage"] | null>(null);
  const rebuildAbortRef = useRef<AbortController | null>(null);
  const activeBackgroundJobIdsRef = useRef(new Set<string>());
  const activeNonBackgroundJobRef = useRef<string | null>(null);
  const backgroundJobControllersRef = useRef<Record<string, AbortController>>({});
  const inFlightBackgroundJobsRef = useRef(new Set<string>());

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
      const storyModels =
        typeof record.defaultModels === "object" && record.defaultModels !== null
          ? (record.defaultModels as Partial<Record<AIProviderType, string>>)
          : {};
      const metachatModels =
        typeof record.metachatModels === "object" && record.metachatModels !== null
          ? (record.metachatModels as Partial<Record<AIProviderType, string>>)
          : { ...storyModels };
      const indexingModels =
        typeof record.indexingModels === "object" && record.indexingModels !== null
          ? (record.indexingModels as Partial<Record<AIProviderType, string>>)
          : { ...storyModels };
      const creationModels =
        typeof record.creationModels === "object" && record.creationModels !== null
          ? (record.creationModels as Partial<Record<AIProviderType, string>>)
          : { ...storyModels };

      const normalized: AISettings = {
        ...(record as AISettings),
        defaultModels: storyModels,
        metachatModels,
        indexingModels,
        creationModels,
        geminiPodcastTts: resolveGeminiPodcastTtsSettings(record.geminiPodcastTts),
        geminiNarrationTts: resolveGeminiNarrationTtsSettings(record.geminiNarrationTts),
        maxConcurrentBackgroundTasks: resolveMaxConcurrentBackgroundTasks(
          record.maxConcurrentBackgroundTasks,
        ),
      };
      return normalized;
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
            job.type !== "guided_chapter_generate" &&
            !isAudiobookListenBackgroundJob(job) &&
            job.status === "running" &&
            !activeBackgroundJobIdsRef.current.has(job.id) &&
            activeNonBackgroundJobRef.current !== job.id &&
            !backgroundJobControllersRef.current[job.id] &&
            !inFlightBackgroundJobsRef.current.has(job.id),
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

    let appListener: { remove: () => Promise<void> } | { remove: () => void } | null = null;
    let onVisibilityChange: (() => void) | null = null;

    void (async () => {
      try {
        await runAutoBackupIfNeeded(repository);

        const { Capacitor } = await import("@capacitor/core");
        const isAndroidNative =
          Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

        if (isAndroidNative) {
          const { App } = await import("@capacitor/app");
          appListener = await App.addListener("appStateChange", ({ isActive }) => {
            if (!isActive) {
              return;
            }
            void runAutoBackupIfNeeded(repository);
          });
          return;
        }

        onVisibilityChange = () => {
          if (document.visibilityState !== "visible") {
            return;
          }
          void runAutoBackupIfNeeded(repository);
        };
        document.addEventListener("visibilitychange", onVisibilityChange);
      } catch {}
    })();

    return () => {
      if (onVisibilityChange) {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      void (async () => {
        try {
          await appListener?.remove();
        } catch {}
      })();
    };
  }, [errorMessage, loading, repository]);

  const resolveAIProfile = useCallback(
    async (
      providerType: AIProviderType,
      storyModelOverride?: string,
      role: AIModelRole = "story",
    ) => {
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

      const savedModel =
        role === "story" && storyModelOverride?.trim()
          ? storyModelOverride.trim()
          : getAIModelForRole(settings, providerType, role)?.trim();
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

  const assertStoryWritable = useCallback(
    async (storyId: string) => {
      const currentStory = await repository.getStory(storyId);

      if (!currentStory) {
        throw new Error("Story not found.");
      }

      if (isStoryReadOnly(currentStory)) {
        throw new Error(
          "This story is locked as a prequel. Create or open a sequel to continue canon.",
        );
      }

      return currentStory;
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
        metaChatReferences: current?.metaChatReferences ?? [],
        characterTtsVoices: current?.characterTtsVoices,
        characterTtsLabels: current?.characterTtsLabels,
        updatedAt: new Date().toISOString(),
        ...patch,
      };

      if (!next.metaChatDraft?.trim()) {
        next.metaChatDraft = "";
      }

      next.metaChatReferences = mergeMetaChatReferences(next.metaChatReferences ?? []);

      await repository.saveStoryUiState(next);
      setStoryUiStates((currentStates) => {
        const otherStates = currentStates.filter((record) => record.storyId !== storyId);
        return [...otherStates, next];
      });
      return next;
    },
    [repository],
  );

  const resolveInlineMetaChatReferences = useCallback(
    (content: string) =>
      resolveMetaChatReferences({
        text: content,
        stories,
        characters: playerCharacters.filter(
          (character) => (character.scope ?? "library") === "library",
        ),
        universes,
      }),
    [playerCharacters, stories, universes],
  );

  const buildMetaChatContextBlock = useCallback(
    async (scopeId: string, references: MetaChatReference[]) => {
      async function buildStoryContext(storyId: string, heading: string) {
        const story = await repository.getStory(storyId);
        if (!story) {
          return null;
        }

        const [universeContext, playerCharacter, storyState, storyMessages, storyChapters] =
          await Promise.all([
            resolveStoryUniverseContext({
              story,
              getUniverse: repository.getUniverse,
              listUniverseImports: repository.listUniverseImports,
            }),
            repository.getPlayerCharacter(story.playerCharacterId),
            repository.getStoryState(storyId),
            repository.listStoryMessages(storyId),
            repository.listStoryChapters(storyId),
          ]);

        if (!playerCharacter) {
          return null;
        }

        return `${heading}\n${buildMetaChatCanonContext({
          story,
          universe: universeContext.universe,
          playerCharacter,
          storyState,
          messages: storyMessages,
          chapters: storyChapters,
        })}`;
      }

      const blocks: string[] = [];

      if (isGlobalMetaChatScope(scopeId)) {
        blocks.push(
          buildMetaChatLibraryOverview({
            stories,
            universes,
            playerCharacters,
          }),
        );
      } else {
        const currentStoryBlock = await buildStoryContext(scopeId, "Current Story Canon");
        if (currentStoryBlock) {
          blocks.push(currentStoryBlock);
        }
      }

      for (const reference of references) {
        if (reference.kind === "story") {
          if (!isGlobalMetaChatScope(scopeId) && reference.id === scopeId) {
            continue;
          }
          const storyBlock = await buildStoryContext(
            reference.id,
            `Referenced Story: ${reference.label}`,
          );
          if (storyBlock) {
            blocks.push(storyBlock);
          }
          continue;
        }

        if (reference.kind === "character") {
          const character = playerCharacters.find((entry) => entry.id === reference.id);
          if (!character) {
            continue;
          }
          const universe = universes.find((entry) => entry.id === character.universeId);
          const relatedStories = stories
            .filter(
              (story) =>
                story.playerCharacterId === character.id ||
                story.currentSummary?.toLowerCase().includes(character.name.toLowerCase()),
            )
            .slice(0, 8)
            .map((story) => story.title);

          blocks.push(
            normalizeMetaChatWhitespace(
              [
                `Referenced Character: ${reference.label}`,
                `Name: ${character.name}`,
                formatPlayerCharacterAliasesForPrompt(character),
                formatPlayerCharacterKnownTiesForPrompt(character),
                universe ? `Universe: ${universe.name}` : null,
                character.characterConcept?.trim()
                  ? `Concept/role: ${character.characterConcept.trim()}`
                  : null,
                character.appearance?.trim()
                  ? `Appearance: ${character.appearance.trim()}`
                  : null,
                character.personality?.trim()
                  ? `Personality: ${character.personality.trim()}`
                  : null,
                character.background?.trim()
                  ? `Background: ${character.background.trim()}`
                  : null,
                character.notes?.trim() ? `Notes: ${character.notes.trim()}` : null,
                relatedStories.length
                  ? `Stories in library involving this character: ${relatedStories.join(", ")}`
                  : null,
              ]
                .filter((line): line is string => Boolean(line))
                .join("\n"),
            ),
          );
          continue;
        }

        const universe = universes.find((entry) => entry.id === reference.id);
        if (!universe) {
          continue;
        }
        const relatedStories = stories
          .filter((story) => getUniverseIds(story).includes(universe.id))
          .slice(0, 8)
          .map((story) => story.title);
        const relatedCharacters = playerCharacters
          .filter(
            (character) =>
              characterMatchesUniverses(character, [universe.id]) &&
              (character.scope ?? "library") === "library",
          )
          .slice(0, 8)
          .map((character) => character.name);

        blocks.push(
          normalizeMetaChatWhitespace(
            [
              `Referenced Universe: ${reference.label}`,
              `Name: ${universe.name}`,
              universe.description?.trim()
                ? `Description: ${universe.description.trim()}`
                : null,
              universe.concept?.trim() ? `Concept: ${universe.concept.trim()}` : null,
              universe.genreTheme?.trim()
                ? `Genre/theme: ${universe.genreTheme.trim()}`
                : null,
              universe.tone?.trim() ? `Tone: ${universe.tone.trim()}` : null,
              universe.notes?.trim() ? `Notes: ${universe.notes.trim()}` : null,
              relatedStories.length
                ? `Stories in this universe: ${relatedStories.join(", ")}`
                : null,
              relatedCharacters.length
                ? `Player characters in this universe: ${relatedCharacters.join(", ")}`
                : null,
            ]
              .filter((line): line is string => Boolean(line))
              .join("\n"),
          ),
        );
      }

      return normalizeMetaChatWhitespace(blocks.join("\n\n"));
    },
    [playerCharacters, repository, stories, universes],
  );

  const queueStoryIndexJob = useCallback(
    async (storyId: string, opts?: { trigger?: "manual" | "auto"; incremental?: boolean; force?: boolean }) => {
      const existingJobs = await repository.listBackgroundJobs();
      const existing = existingJobs.find(
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
        if (activeBackgroundJobIdsRef.current.has(existing.id)) {
          activeBackgroundJobIdsRef.current.delete(existing.id);
        }
      }

      const job: BackgroundJob = {
        id: createEntityId("background-job"),
        type: "story_index",
        storyId,
        createdAt: new Date().toISOString(),
        status: "queued",
        queueOrder: getNextBackgroundTaskQueueOrder(existingJobs),
        dedupeKey: `story_index:${storyId}`,
        payload: {
          trigger: opts?.trigger ?? "manual",
          incremental: opts?.incremental ?? false,
          rebuild: !(opts?.incremental ?? false),
        },
      };

      await repository.saveBackgroundJob(job);
      await hydrate(false);
      return { job, duplicate: false };
    },
    [hydrate, repository],
  );

  const reorderBackgroundTaskJob = useCallback(
    async (jobId: string, direction: "up" | "down") => {
      const jobs = await repository.listBackgroundJobs();
      const queued = jobs.filter(
        (job) => isBackgroundTaskJob(job) && job.status === "queued",
      );
      const reordered = moveQueuedBackgroundTaskInOrder(queued, jobId, direction);
      if (!reordered) {
        return null;
      }

      await Promise.all(reordered.map((job) => repository.saveBackgroundJob(job)));
      await hydrate(false);
      return reordered;
    },
    [hydrate, repository],
  );

  const queueGuidedChapterJob = useCallback(
    async (
      storyId: string,
      opts: { entry: GuidedChapterGenerationEntry; plan: GuidedChapterPlan },
    ) => {
      const existing = (await repository.listBackgroundJobs()).find(
        (job) =>
          job.type === "guided_chapter_generate" &&
          job.storyId === storyId &&
          (job.status === "queued" || job.status === "running"),
      );

      if (existing) {
        return { job: existing, duplicate: true };
      }

      const job: BackgroundJob = {
        id: createEntityId("background-job"),
        type: "guided_chapter_generate",
        storyId,
        createdAt: new Date().toISOString(),
        status: "queued",
        dedupeKey: `guided_chapter_generate:${storyId}`,
        payload: {
          guidedEntry: opts.entry,
          guidedPlan: opts.plan,
        },
      };

      await repository.saveBackgroundJob(job);
      await hydrate(false);
      return { job, duplicate: false };
    },
    [hydrate, repository],
  );

  const generateGuidedChapterPlan = useCallback(
    async (input: {
      storyId?: string;
      overallDirection: string;
      chapterLabels: string[];
      chapters?: Array<{
        label: string;
        overview: string;
        scenesPerChapter: number;
      }>;
      universeName: string;
      playerName: string;
      currentSituation?: string;
    }) => {
      const settings = await getNormalizedAISettings();
      if (!settings) {
        throw new Error("Configure an AI provider in Settings before generating a chapter plan.");
      }

      let providerType = settings.activeProviderType;
      let model = getAIModelForRole(settings, providerType, "story");
      if (input.storyId) {
        const storyConfig = await repository.getStoryAIConfig(input.storyId);
        if (storyConfig) {
          providerType = storyConfig.providerType;
          model = storyConfig.model ?? model;
        }
      }

      const { apiKey, model: resolvedModel } = await resolveAIProfile(providerType, model, "story");
      const provider = createAIProvider(providerType);

      let priorChapterContext: string | undefined;
      if (input.storyId) {
        const [messages, chapters] = await Promise.all([
          repository.listStoryMessages(input.storyId),
          repository.listStoryChapters(input.storyId),
        ]);
        priorChapterContext = buildPriorChapterContinuationContext({
          messages,
          chapters,
          storySummary: input.currentSituation,
          playerName: input.playerName,
          overallDirection: input.overallDirection,
        });
      }

      const messages = buildChapterPlanPrompt({
        overallDirection: input.overallDirection,
        chapterLabels: input.chapterLabels,
        chapters: input.chapters,
        universeName: input.universeName,
        playerName: input.playerName,
        currentSituation: input.currentSituation,
        priorChapterContext,
      });

      return generateChapterPlanWithAi({
        provider,
        apiKey,
        model: resolvedModel,
        messages,
        fallbackLabels: input.chapterLabels,
      });
    },
    [getNormalizedAISettings, repository, resolveAIProfile],
  );

  const queueMetaChatMessage = useCallback(
    async (scopeId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) {
        throw new Error("Message content is required.");
      }

      const existingReferences =
        storyUiStates.find((record) => record.storyId === scopeId)?.metaChatReferences ?? [];
      const resolvedReferences = mergeMetaChatReferences(
        existingReferences,
        resolveInlineMetaChatReferences(trimmed),
      );

      const jobId = createEntityId("background-job");
      const userMessage: StoryMetaMessage = {
        id: createEntityId("story-meta-message"),
        storyId: scopeId,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
        jobId,
        referenceSnapshot: resolvedReferences,
      };

      const job: BackgroundJob = {
        id: jobId,
        type: "metachat_generate",
        storyId: scopeId,
        createdAt: new Date().toISOString(),
        status: "queued",
        payload: {
          content: trimmed,
          metaChatUserMessageId: userMessage.id,
          metaChatOpenOnComplete: true,
          metaChatReferences: resolvedReferences,
        },
      };

      await repository.saveStoryMetaMessage(userMessage);
      await repository.saveBackgroundJob(job);
      await saveStoryUiStateRecord(scopeId, {
        metaChatDraft: "",
        metaChatReferences: resolvedReferences,
      });
      await hydrate(false);
      return { job, duplicate: false };
    },
    [
      hydrate,
      repository,
      resolveInlineMetaChatReferences,
      saveStoryUiStateRecord,
      storyUiStates,
    ],
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

  const queueAudiobookJob = useCallback(
    async (storyId: string, opts?: { force?: boolean }) => {
      const existingJobs = await repository.listBackgroundJobs();
      const existing = existingJobs.find(
        (job) =>
          isAudiobookExportBackgroundJob(job) &&
          job.storyId === storyId &&
          (job.status === "queued" || job.status === "running"),
      );

      if (existing) {
        if (!opts?.force) {
          return { job: existing, duplicate: true };
        }

        await cancelBackgroundJob(existing.id);
      }

      const [story, storyConfig] = await Promise.all([
        repository.getStory(storyId),
        repository.getStoryAIConfig(storyId),
      ]);

      if (!story) {
        throw new Error("Story not found.");
      }

      const job: BackgroundJob = {
        id: createEntityId("background-job"),
        type: "story_audiobook",
        storyId,
        createdAt: new Date().toISOString(),
        status: "queued",
        queueOrder: getNextBackgroundTaskQueueOrder(existingJobs),
        dedupeKey: `story_audiobook:export:${storyId}`,
        payload: {
          audiobookPurpose: "export",
          audiobookParallelChapters: clampAudiobookParallelChapters(
            storyConfig?.audiobookParallelChapters,
          ),
          audiobookPerformanceMode: normalizeAudiobookPerformanceMode(
            storyConfig?.audiobookPerformanceMode,
          ),
        },
      };

      await repository.saveBackgroundJob(job);
      await hydrate(false);
      return { job, duplicate: false };
    },
    [cancelBackgroundJob, hydrate, repository],
  );

  const queueAiDocumentJob = useCallback(
    async (input: {
      source:
        | { type: "story"; storyId: string; label: string }
        | { type: "upload"; text: string; label: string };
      presetId: AiDocumentPresetId;
      customPrompt?: string;
      structure?: AiDocumentStructure;
      outputFormat?: AiDocumentOutputFormat;
      force?: boolean;
    }) => {
      const outputFormat = input.outputFormat ?? "markdown";
      const dedupeKey =
        input.source.type === "story"
          ? `ai_document:${input.source.storyId}:${input.presetId}:${outputFormat}`
          : `ai_document:upload:${input.presetId}:${outputFormat}:${input.source.label}`;
      const jobType = outputFormat === "gemini-audio-wav" ? "podcast_audio" : "ai_document";

      const existingJobs = await repository.listBackgroundJobs();
      const existing = existingJobs.find(
        (job) =>
          job.type === jobType &&
          job.dedupeKey === dedupeKey &&
          (job.status === "queued" || job.status === "running"),
      );

      if (existing) {
        if (!input.force) {
          return { job: existing, duplicate: true };
        }
        await cancelBackgroundJob(existing.id);
      }

      const job: BackgroundJob = {
        id: createEntityId("background-job"),
        type: jobType,
        storyId: input.source.type === "story" ? input.source.storyId : undefined,
        createdAt: new Date().toISOString(),
        status: "queued",
        queueOrder: getNextBackgroundTaskQueueOrder(existingJobs),
        dedupeKey,
        payload: {
          aiDocumentPresetId: input.presetId,
          aiDocumentCustomPrompt: input.customPrompt,
          aiDocumentStructure: input.structure,
          aiDocumentOutputFormat: outputFormat,
          aiDocumentSourceType: input.source.type,
          aiDocumentSourceStoryId:
            input.source.type === "story" ? input.source.storyId : undefined,
          aiDocumentSourceLabel: input.source.label,
          aiDocumentSourceText:
            input.source.type === "upload" ? input.source.text : undefined,
        },
      };

      await repository.saveBackgroundJob(job);
      await hydrate(false);
      return { job, duplicate: false };
    },
    [cancelBackgroundJob, hydrate, repository],
  );

  const queuePodcastAudioJob = useCallback(
    async (input: { markdown: string; label: string; force?: boolean }) => {
      const dedupeKey = `podcast_audio:upload:${input.label}:${input.markdown.length}`;
      const existingJobs = await repository.listBackgroundJobs();
      const existing = existingJobs.find(
        (job) =>
          job.type === "podcast_audio" &&
          job.dedupeKey === dedupeKey &&
          (job.status === "queued" || job.status === "running"),
      );

      if (existing) {
        if (!input.force) {
          return { job: existing, duplicate: true };
        }
        await cancelBackgroundJob(existing.id);
      }

      const job: BackgroundJob = {
        id: createEntityId("background-job"),
        type: "podcast_audio",
        createdAt: new Date().toISOString(),
        status: "queued",
        queueOrder: getNextBackgroundTaskQueueOrder(existingJobs),
        dedupeKey,
        payload: {
          aiDocumentSourceType: "upload",
          aiDocumentSourceLabel: input.label,
          aiDocumentSourceText: input.markdown,
          aiDocumentOutputFormat: "gemini-audio-wav",
        },
      };

      await repository.saveBackgroundJob(job);
      await hydrate(false);
      return { job, duplicate: false };
    },
    [cancelBackgroundJob, hydrate, repository],
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

  const cancelStoryIndexing = useCallback(
    async (storyId: string) => {
      rebuildAbortRef.current?.abort();

      const jobs = await repository.listBackgroundJobs();
      const activeJob = jobs.find(
        (job) =>
          job.type === "story_index" &&
          job.storyId === storyId &&
          (job.status === "queued" || job.status === "running"),
      );

      if (activeJob) {
        await cancelBackgroundJob(activeJob.id);
      }
    },
    [cancelBackgroundJob, repository],
  );

  const clearStoryIndex = useCallback(
    async (storyId: string) => {
      await cancelStoryIndexing(storyId);

      const existing = await repository.getStoryState(storyId);
      const parsed = existing?.stateJson?.trim() ? safeParseStoryStateData(existing.stateJson) : null;
      const cleared = createClearedStoryStateV2({
        rpStats: parsed?.rpStats,
        authorDirectives: parsed?.authorDirectives,
      });
      const now = new Date().toISOString();

      await repository.saveStoryState({
        id: existing?.id ?? `story-state:${storyId}`,
        storyId,
        stateJson: JSON.stringify(cleared),
        updatedAt: now,
      });

      setRebuildStatus((current) => (current?.storyId === storyId ? undefined : current));
      await hydrate(false);
    },
    [cancelStoryIndexing, hydrate, repository],
  );

  const cancelGuidedChapterGeneration = useCallback(
    async (storyId: string) => {
      const jobs = await repository.listBackgroundJobs();
      const activeJob = jobs.find(
        (job) =>
          job.type === "guided_chapter_generate" &&
          job.storyId === storyId &&
          (job.status === "queued" || job.status === "running"),
      );

      if (activeJob) {
        await cancelBackgroundJob(activeJob.id);
      }

      setGuidedGenerationStatus((current) =>
        current?.storyId === storyId ? undefined : current,
      );
    },
    [cancelBackgroundJob, repository],
  );

  const runDeepIndexProcess = useCallback(
    async (storyId: string, opts?: { signal?: AbortSignal; trigger?: "manual" | "auto"; incremental?: boolean; jobId?: string }) => {
      rebuildAbortRef.current?.abort();
      const controller = new AbortController();
      rebuildAbortRef.current = controller;
      const signal = opts?.signal ?? controller.signal;
      const indexingStartedAtMs = Date.now();

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
        startedAtMs: indexingStartedAtMs,
        stage: "loading",
        jobId: opts?.jobId,
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
        const { apiKey, model } = await resolveAIProfile(providerType, storyConfig?.model, "indexing");
        const provider = createAIProvider(providerType);

        const [allMessages, existingStoryState, storedChapters, playerCharacter] = await Promise.all([
          repository.listStoryMessages(storyId),
          repository.getStoryState(storyId),
          repository.listStoryChapters(storyId),
          repository.getPlayerCharacter(story.playerCharacterId),
        ]);

        if (!playerCharacter) {
          throw new Error("Story references missing player character.");
        }

        setRebuildStatus({
          storyId,
          phase: "extracting",
          processedMessages: 0,
          totalMessages: allMessages.length,
          message: `Indexing message 0/${allMessages.length}…`,
          startedAtMs: indexingStartedAtMs,
          stage: "messages",
          jobId: opts?.jobId,
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
                stage: "messages",
                processedMessages: processed,
                totalMessages: total,
                message,
                warning: warning ?? current.warning,
                startedAtMs: current.startedAtMs ?? indexingStartedAtMs,
                jobId: opts?.jobId ?? current.jobId,
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
                stage: "saving-state",
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
                  const prevRpStats =
                    (rawPrev?.rpStats as StoryStateData["rpStats"] | undefined) ??
                    (safeParseStoryStateData(existingStoryState.stateJson))?.rpStats;
                  if (prevRpStats) {
                    return JSON.stringify(
                      applyAuthorDirectivesToStoryState(
                        { ...rawNew, rpStats: prevRpStats },
                        allMessages,
                      ),
                    );
                  }
                }
              } catch {}
              return JSON.stringify(
                applyAuthorDirectivesToStoryState(
                  safeParseStoryStateData(result.stateJson),
                  allMessages,
                ),
              );
            }
            const withAuthorDirectives = applyAuthorDirectivesToStoryState(parsed, allMessages);
            return finalizeStoryStateForSave({
              parsedState: withAuthorDirectives as StoryStateData,
              previousStateJson: existingStoryState?.stateJson,
              totalMessages: allMessages.length,
              now,
              mode: "deep",
              deepIndexTrigger: opts?.trigger ?? "manual",
              playerName: playerCharacter.name,
              playerAliases: normalizePlayerCharacterAliases(playerCharacter.aliases),
              playerCharacter: {
                name: playerCharacter.name,
                aliases: playerCharacter.aliases,
              },
              messages: allMessages,
              universeImportedCharacters: story.universePackSnapshot?.universe?.importedCharacters ?? [],
            });
          } catch {
            return JSON.stringify(
              applyAuthorDirectivesToStoryState(
                safeParseStoryStateData(result.stateJson),
                allMessages,
              ),
            );
          }
        })();

        await repository.saveStoryState({
          id: `story-state:${storyId}`,
          storyId,
          stateJson: nextStateJson,
          updatedAt: now,
        });

        const previousDeepIndexedMessageCount =
          safeParseStoryStateData(existingStoryState?.stateJson ?? "")?.lastDeepIndexedMessageCount ??
          0;

        setRebuildStatus((current) =>
          current && current.storyId === storyId
            ? {
                ...current,
                phase: "saving",
                stage: "chapter-boundaries",
                message: "Rebuilding chapter boundaries...",
              }
            : current,
        );

        const rebuiltChapters = await syncStoryChaptersFromTranscript({
          storyId,
          repository,
          messages: allMessages,
          existingChapters: storedChapters,
        });

        const chaptersToRebuild = selectChaptersForArchiveRebuild(
          rebuiltChapters,
          opts?.incremental ?? false,
          previousDeepIndexedMessageCount,
        );

        if (chaptersToRebuild.length) {
          setRebuildStatus((current) =>
            current && current.storyId === storyId
              ? {
                  ...current,
                  phase: "saving",
                  stage: "chapter-reviews",
                  processedMessages: 0,
                  totalMessages: chaptersToRebuild.length,
                  message: `Rebuilding chapter reviews… 0/${chaptersToRebuild.length}`,
                  chapterReviews: buildInitialChapterReviewProgress(chaptersToRebuild),
                }
              : current,
          );

          await rebuildChapterArchiveSummaries({
            story,
            playerCharacter,
            repository,
            messages: allMessages,
            chapters: rebuiltChapters,
            storyStateJson: nextStateJson,
            providerType,
            provider,
            apiKey,
            model,
            signal,
            incremental: opts?.incremental ?? false,
            previousDeepIndexedMessageCount,
            onProgress: ({ processed, total, label }) => {
              const nowMs = Date.now();
              setRebuildStatus((current) => {
                if (!current || current.storyId !== storyId) {
                  return current;
                }

                const chapterReviews = (current.chapterReviews ?? []).map((chapter, index) => {
                  if (index < processed - 1) {
                    return {
                      ...chapter,
                      status: "done" as const,
                      completedAtMs: chapter.completedAtMs ?? nowMs,
                    };
                  }

                  if (index === processed - 1) {
                    return {
                      ...chapter,
                      status: "active" as const,
                      startedAtMs: chapter.startedAtMs ?? nowMs,
                    };
                  }

                  return chapter;
                });

                return {
                  ...current,
                  phase: "saving",
                  stage: "chapter-reviews",
                  processedMessages: processed,
                  totalMessages: total,
                  message: `Rebuilding chapter reviews… ${processed}/${total} (${label})`,
                  chapterReviews,
                };
              });
            },
          });

          setRebuildStatus((current) => {
            if (!current || current.storyId !== storyId || !current.chapterReviews?.length) {
              return current;
            }

            const nowMs = Date.now();
            return {
              ...current,
              chapterReviews: current.chapterReviews.map((chapter) => ({
                ...chapter,
                status: "done",
                completedAtMs: chapter.completedAtMs ?? nowMs,
              })),
            };
          });
        }

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
          startedAtMs: indexingStartedAtMs,
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
    async (
      scopeId: string,
      content: string,
      references: MetaChatReference[] = [],
      signal?: AbortSignal,
    ) => {
      const trimmed = content.trim();
      if (!trimmed) {
        throw new Error("Message content is required.");
      }

      const settings = await getNormalizedAISettings();
      if (!settings) {
        throw new Error("Configure an AI provider in Settings before generating messages.");
      }

      const scopeStory = isGlobalMetaChatScope(scopeId)
        ? null
        : await repository.getStory(scopeId);
      if (!isGlobalMetaChatScope(scopeId) && !scopeStory) {
        throw new Error("Story not found.");
      }

      const storyConfig = scopeStory ? await repository.getStoryAIConfig(scopeId) : null;
      const providerType = storyConfig?.providerType ?? settings.activeProviderType;
      const { apiKey, model } = await resolveAIProfile(providerType, storyConfig?.model, "metachat");
      const provider = createAIProvider(providerType);
      const contextBlock = await buildMetaChatContextBlock(scopeId, references);

      const priorMetaHistory = sortByTimestampAsc(await repository.listStoryMetaMessages(scopeId))
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
        "Behave like an experienced writers' room: critique, analyse, compare, brainstorm, review, and explain recurring strengths, weaknesses, and patterns.",
        "Remember the existing MetaChat discussion in this conversation unless the user resets the chat.",
        isGlobalMetaChatScope(scopeId)
          ? "This is library-level MetaChat. You may compare stories, universes, characters, voice, pacing, structure, and recurring themes across the user's writing library."
          : "This is story-level MetaChat. The current story remains the default reference. Any @Story, @Character, or @Universe mentions add context rather than replacing the active story.",
        references.length
          ? `Resolved references: ${references.map((reference) => `${reference.kind}:${reference.label}`).join(", ")}`
          : "Resolved references: none beyond the default active scope.",
        "You have access to the canon reference block below: use it freely for analysis, planning, continuity checks, comparisons, and archive discussion.",
        buildMatureFictionPolicyBlock({
          includeParity: true,
          includeAnalysisFocus: true,
        }),
        "Do not write the next story scene or in-character narration unless the user explicitly asks you to draft an out-of-canon example.",
        "Prefer analysis, planning, options, comparisons, and questions. Be concise and practical.",
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
    [buildMetaChatContextBlock, getNormalizedAISettings, repository, resolveAIProfile],
  );

  const updateBackgroundJobProgress = useCallback(
    async (
      jobId: string,
      progress: NonNullable<BackgroundJob["progress"]>,
    ) => {
      const liveJob = await repository.getBackgroundJob(jobId);
      if (!liveJob) {
        return;
      }

      const processorActive = inFlightBackgroundJobsRef.current.has(jobId);
      if (
        liveJob.status !== "running" &&
        !(liveJob.status === "queued" && processorActive)
      ) {
        return;
      }

      const nextJob: BackgroundJob = {
        ...liveJob,
        status: "running",
        startedAt: liveJob.startedAt ?? new Date().toISOString(),
        progress,
      };
      await repository.saveBackgroundJob(nextJob);
      setBackgroundJobs((current) =>
        current.map((entry) => (entry.id === jobId ? nextJob : entry)),
      );
    },
    [repository],
  );

  const beginAudiobookPlaybackBackgroundTask = useCallback(
    async (input: {
      storyId: string;
      playId: string;
      chapterCount?: number;
      purpose?: "playback" | "chapter_listen";
      progressLabel?: string;
    }) => {
      const purpose = input.purpose ?? "playback";
      const dedupeKey = `story_audiobook:${purpose}:${input.playId}`;
      const existingJobs = await repository.listBackgroundJobs();
      const existing = existingJobs.find(
        (job) =>
          job.type === "story_audiobook" &&
          job.dedupeKey === dedupeKey &&
          (job.status === "queued" || job.status === "running"),
      );

      if (existing) {
        return {
          job: existing,
          shouldStartNow: existing.status === "running",
        };
      }

      const now = new Date().toISOString();
      const chapterCount = Math.max(1, input.chapterCount ?? 1);
      const maxConcurrent = resolveMaxConcurrentBackgroundTasks(
        aiSettings?.maxConcurrentBackgroundTasks,
      );
      const shouldStartNow = countRunningBackgroundTasks(existingJobs) < maxConcurrent;
      const job: BackgroundJob = {
        id: createEntityId("background-job"),
        type: "story_audiobook",
        storyId: input.storyId,
        createdAt: now,
        startedAt: shouldStartNow ? now : undefined,
        status: shouldStartNow ? "running" : "queued",
        queueOrder: shouldStartNow
          ? undefined
          : getNextBackgroundTaskQueueOrder(existingJobs),
        dedupeKey,
        payload: {
          audiobookPurpose: purpose,
          audiobookPlayId: input.playId,
        },
        progress: {
          current: 0,
          total: chapterCount,
          label:
            input.progressLabel ??
            (purpose === "chapter_listen"
              ? "Preparing chapter audio…"
              : chapterCount > 1
                ? `Preparing ${chapterCount} chapters…`
                : "Preparing audiobook…"),
        },
      };

      await repository.saveBackgroundJob(job);
      setBackgroundJobs((current) => [job, ...current.filter((entry) => entry.id !== job.id)]);
      return { job, shouldStartNow };
    },
    [aiSettings?.maxConcurrentBackgroundTasks, repository],
  );

  const promoteQueuedAudiobookListenTasks = useCallback(async () => {
    const jobs = await repository.listBackgroundJobs();
    const maxConcurrent = resolveMaxConcurrentBackgroundTasks(
      aiSettings?.maxConcurrentBackgroundTasks,
    );
    let slots = maxConcurrent - countRunningBackgroundTasks(jobs);
    if (slots <= 0) {
      return [];
    }

    const queuedListen = sortQueuedBackgroundTasks(
      jobs.filter(
        (job) => isAudiobookListenBackgroundJob(job) && job.status === "queued",
      ),
    );
    if (!queuedListen.length) {
      return [];
    }

    const now = new Date().toISOString();
    const promoted: BackgroundJob[] = [];
    for (const job of queuedListen.slice(0, slots)) {
      const next: BackgroundJob = {
        ...job,
        status: "running",
        startedAt: job.startedAt ?? now,
      };
      await repository.saveBackgroundJob(next);
      promoted.push(next);
    }

    if (promoted.length) {
      setBackgroundJobs((current) => {
        const byId = new Map(current.map((entry) => [entry.id, entry]));
        for (const job of promoted) {
          byId.set(job.id, job);
        }
        return [...byId.values()].sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        );
      });
    }

    return promoted;
  }, [aiSettings?.maxConcurrentBackgroundTasks, repository]);

  const updateAudiobookPlaybackBackgroundTask = useCallback(
    async (
      jobId: string,
      progress: NonNullable<BackgroundJob["progress"]>,
    ) => {
      await updateBackgroundJobProgress(jobId, progress);
    },
    [updateBackgroundJobProgress],
  );

  const finishAudiobookPlaybackBackgroundTask = useCallback(
    async (
      jobId: string,
      outcome: "complete" | "failed" | "cancelled",
      error?: string,
    ) => {
      const liveJob = await repository.getBackgroundJob(jobId);
      if (!liveJob || !isAudiobookListenBackgroundJob(liveJob)) {
        return;
      }

      if (
        liveJob.status === "complete" ||
        liveJob.status === "failed" ||
        liveJob.status === "cancelled"
      ) {
        return;
      }

      const now = new Date().toISOString();
      const next: BackgroundJob = {
        ...liveJob,
        status: outcome,
        finishedAt: now,
        error: outcome === "failed" ? error : undefined,
      };

      await repository.saveBackgroundJob(next);
      setBackgroundJobs((current) =>
        current.map((entry) => (entry.id === jobId ? next : entry)),
      );
      if (outcome === "complete" || outcome === "failed" || outcome === "cancelled") {
        await promoteQueuedAudiobookListenTasks();
      }
    },
    [promoteQueuedAudiobookListenTasks, repository],
  );

  const runAudiobookExportProcess = useCallback(
    async (
      storyId: string,
      opts: {
        signal: AbortSignal;
        jobId: string;
        parallelChapters?: number;
        performanceMode?: "radio_drama" | "single_narrator";
      },
    ) => {
      const startedAtMs = Date.now();
      const settings = await getNormalizedAISettings();
      const apiKey = settings?.apiKeys?.gemini?.trim() ?? "";
      if (!apiKey) {
        throw new Error("Add a Gemini API key in Settings → AI to export audiobook audio.");
      }

      const [story, playerCharacter, messages, chapters, storyState, storyConfig] =
        await Promise.all([
          repository.getStory(storyId),
          repository.getStory(storyId).then(async (entry) =>
            entry ? repository.getPlayerCharacter(entry.playerCharacterId) : null,
          ),
          repository.listStoryMessages(storyId),
          repository.listStoryChapters(storyId),
          repository.getStoryState(storyId),
          repository.getStoryAIConfig(storyId),
        ]);

      if (!story || !playerCharacter) {
        throw new Error("Story or player character not found.");
      }

      const narrationTts = resolveGeminiNarrationTtsSettings(settings?.geminiNarrationTts);
      const storyStateData = safeParseStoryStateData(storyState?.stateJson ?? "");
      const uiState = storyUiStates.find((entry) => entry.storyId === storyId);
      const existingRegistry = uiState?.characterTtsVoices || uiState?.characterTtsLabels
        ? {
            voices: uiState.characterTtsVoices ?? {},
            labels: uiState.characterTtsLabels ?? {},
          }
        : undefined;
      const characterGenders = buildCharacterGenderHintsFromStoryState(storyStateData, {
        playerName: playerCharacter.name,
        playerGender: playerCharacter.gender,
        playerPronouns: playerCharacter.pronouns,
      });
      const playerSceneName = resolvePlayerCharacterSceneName(playerCharacter, {
        storyState: storyStateData,
        recentMessages: messages,
      });
      const characterRegistry = buildCharacterTtsRegistryForStory(messages, {
        playerName: playerCharacter.name,
        narrationTts,
        existingRegistry,
        characterGenders,
      });
      const performanceMode = normalizeAudiobookPerformanceMode(
        opts.performanceMode ?? storyConfig?.audiobookPerformanceMode,
      );
      const segments = listStoryAudiobookChapterSegments(messages, {
        playerName: playerCharacter.name,
        playerSceneName,
        playerPronouns: playerCharacter.pronouns,
        narrationTts,
        characterRegistry,
        chapters,
        audiobookPerformanceMode: performanceMode,
      });

      if (!segments.length) {
        throw new Error("No speakable story content for audiobook export.");
      }

      setAudiobookExportStatus({
        storyId,
        jobId: opts.jobId,
        phase: "running",
        startedAtMs,
        message: "Preparing story audiobook…",
      });

      await updateBackgroundJobProgress(opts.jobId, {
        current: 0,
        total: segments.length,
        label: "Generating Audiobook",
      });

      const wavBuffer = await synthesizeStoryAudiobookWav({
        apiKey,
        segments,
        model: narrationTts.model,
        parallelChapters: clampAudiobookParallelChapters(
          opts.parallelChapters ?? storyConfig?.audiobookParallelChapters,
        ),
        signal: opts.signal,
        onProgress: (progress) => {
          void updateBackgroundJobProgress(
            opts.jobId,
            audiobookProgressToBackgroundJobProgress(progress, "Generating Audiobook"),
          );
          setAudiobookExportStatus((current) =>
            current?.storyId === storyId
              ? {
                  ...current,
                  phase: "running",
                  progress,
                  message: progress.summary,
                }
              : current,
          );
        },
      });

      const playId = `story-audiobook-${storyId}`;
      const contentDigest = await computeStoryAudiobookPreparedDigest(
        playId,
        segments,
        narrationTts.model,
      );

      const ingestResult = await ingestStoryAudio({
        category: "audiobook",
        storyId,
        storyTitle: story.title,
        wavBytes: new Uint8Array(wavBuffer),
        contentDigest,
        replaceExisting: true,
      });

      setAudiobookExportStatus({
        storyId,
        jobId: opts.jobId,
        phase: "done",
        message: ingestResult.unchanged
          ? "Story audiobook is already in the Media Library."
          : ingestResult.replaced
            ? "Updated story audiobook in the Media Library."
            : "Saved story audiobook to the Media Library.",
        startedAtMs,
      });

      return ingestResult.unchanged
        ? "Story audiobook is already in the Media Library."
        : ingestResult.replaced
          ? "Updated story audiobook in the Media Library."
          : "Saved story audiobook to the Media Library.";
    },
    [getNormalizedAISettings, repository, storyUiStates, updateBackgroundJobProgress],
  );

  const runAiDocumentBackgroundProcess = useCallback(
    async (job: BackgroundJob, signal: AbortSignal) => {
      const settings = await getNormalizedAISettings();
      if (!settings) {
        throw new Error("Configure an AI provider in Settings before generating documents.");
      }

      const presetId = (job.payload?.aiDocumentPresetId ?? "custom") as AiDocumentPresetId;
      const preset = getAiDocumentPreset(presetId);
      const structure = job.payload?.aiDocumentStructure ?? preset.defaultStructure ?? "single";
      const outputFormat = job.payload?.aiDocumentOutputFormat ?? "markdown";
      const providerType = settings.activeProviderType;
      const { apiKey, model } = await resolveAIProfile(providerType, undefined, "creation");
      const provider = createAIProvider(providerType);

      let sourceMaterial = "";
      let sourceLabel = job.payload?.aiDocumentSourceLabel?.trim() || "Uploaded export";
      let storyTitle: string | undefined;
      let chapterSegments: import("../../lib/aiDocumentGenerator/types").ChapterSourceSegment[] =
        [];

      if (job.type === "podcast_audio" && job.payload?.aiDocumentSourceText) {
        sourceMaterial = job.payload.aiDocumentSourceText;
        chapterSegments = segmentUploadedSourceByChapter(sourceMaterial);
      } else if (job.payload?.aiDocumentSourceType === "story" && job.payload.aiDocumentSourceStoryId) {
        const bundle = await repository.getStoryExportBundle(job.payload.aiDocumentSourceStoryId);
        if (!bundle) {
          throw new Error("Story not found.");
        }
        sourceMaterial = resolveSourceMaterialForStructure(bundle, structure);
        sourceLabel = sourceLabel || bundle.story.title;
        storyTitle = bundle.story.title;
        chapterSegments = segmentStoryBundleByChapter(bundle);
      } else if (job.payload?.aiDocumentSourceText) {
        sourceMaterial = job.payload.aiDocumentSourceText;
        chapterSegments = segmentUploadedSourceByChapter(sourceMaterial);
      } else {
        throw new Error("AI document job is missing source material.");
      }

      if (!sourceMaterial.trim()) {
        throw new Error("Source material is empty.");
      }

      const parentLabel = `Generating ${preset.displayName}`;
      let activeDocumentSteps: NonNullable<BackgroundJob["progress"]>["steps"];
      const updateDocumentProgress = (steps?: NonNullable<BackgroundJob["progress"]>["steps"]) => {
        if (steps?.length) {
          activeDocumentSteps = steps;
          void updateBackgroundJobProgress(
            job.id,
            backgroundJobProgressFromSteps(parentLabel, steps),
          );
          return;
        }

        void updateBackgroundJobProgress(job.id, {
          current: 0,
          total: 1,
          label: parentLabel,
        });
      };

      let streamedDraft = "";
      let lastStreamingProgressAt = 0;
      const onChunk = (chunk: string) => {
        streamedDraft += chunk;
        const now = Date.now();
        if (!activeDocumentSteps?.length || now - lastStreamingProgressAt < 2000) {
          return;
        }

        lastStreamingProgressAt = now;
        void updateDocumentProgress(activeDocumentSteps);
      };
      const onChunkReset = () => {
        streamedDraft = "";
      };
      const documentMaxTokens = preset.supportsGeminiTts ? 16000 : 12000;

      const generateChunk = async (messages: AIChatMessage[]) => {
        let response: GenerateResponseResult;
        try {
          response = await generateResponseWithRetry({
            providerType,
            provider,
            apiKey,
            model,
            messages,
            maxTokens: documentMaxTokens,
            temperature: 0.35,
            signal,
            onChunk,
            onChunkReset,
            debugTrace: {
              traceId: makeGenerationAuditTraceId("other"),
              mode: "other",
              stage: "ai-document",
            },
          });
        } catch (error) {
          rethrowUserFacingGenerationError(error, providerType);
        }

        const content = response.content.trim() || streamedDraft.trim();
        if (!content) {
          rethrowUserFacingGenerationError(
            createAIGenerationError("validation", "Document generator returned empty output."),
            providerType,
          );
        }
        return content;
      };

      let markdown = "";
      if (job.type === "ai_document") {
        if (structure === "chapter-by-chapter") {
          updateDocumentProgress();
          markdown = await generateChapterStructuredDocument({
            preset,
            customPrompt: job.payload?.aiDocumentCustomPrompt,
            sourceLabel,
            chapterSegments,
            fullSourceMaterial: sourceMaterial,
            generateChunk,
            onProgress: ({ steps }) => updateDocumentProgress(steps),
            signal,
          });
        } else {
          let singleDocumentSteps = buildSingleDocumentSteps(`Writing ${preset.displayName}`);
          singleDocumentSteps = setBackgroundJobStepStatus(singleDocumentSteps, "generation", "start");
          updateDocumentProgress(singleDocumentSteps);
          const messages = buildAiDocumentMessages({
            preset,
            customPrompt: job.payload?.aiDocumentCustomPrompt,
            sourceLabel,
            sourceMaterial,
            structure,
          });
          markdown = await generateChunk(messages);
          singleDocumentSteps = setBackgroundJobStepStatus(singleDocumentSteps, "generation", "complete");
          updateDocumentProgress(singleDocumentSteps);
        }
      } else {
        markdown = sourceMaterial;
      }

      if (outputFormat === "gemini-audio-wav" || job.type === "podcast_audio") {
        const geminiApiKey = settings.apiKeys?.gemini?.trim() ?? "";
        if (!geminiApiKey) {
          throw new Error("Add a Gemini API key in Settings → AI to generate podcast audio.");
        }

        const podcastParentLabel = "Generating Podcast";
        const ttsChunks = planGeminiPodcastTtsChunks(markdown);
        const audioSteps: NonNullable<BackgroundJob["progress"]>["steps"] = ttsChunks.map(
          (_, chunkIndex) => ({
            id: `audio-${chunkIndex}`,
            label: `Audio part ${chunkIndex + 1}`,
            status: "pending" as const,
          }),
        );
        const completedDocumentSteps =
          activeDocumentSteps?.map((step) => ({ ...step, status: "done" as const })) ?? [];
        let podcastAudioSteps = [...completedDocumentSteps, ...audioSteps];
        if (podcastAudioSteps.length) {
          void updateBackgroundJobProgress(
            job.id,
            backgroundJobProgressFromSteps(podcastParentLabel, podcastAudioSteps),
          );
        }

        const wavBuffer = await generateGeminiPodcastAudioFromMarkdown({
          apiKey: geminiApiKey,
          markdown,
          signal,
          onChunkComplete: ({ index, total }) => {
            const audioOffset = completedDocumentSteps.length;
            podcastAudioSteps = podcastAudioSteps.map((step, stepIndex) => {
              if (stepIndex < audioOffset) {
                return { ...step, status: "done" as const };
              }

              const audioIndex = stepIndex - audioOffset;
              if (audioIndex < index) {
                return { ...step, status: "done" as const };
              }
              if (audioIndex === index) {
                return { ...step, status: "running" as const };
              }
              return step;
            });

            if (index + 1 >= total) {
              podcastAudioSteps = podcastAudioSteps.map((step) => ({
                ...step,
                status: "done" as const,
              }));
            }

            void updateBackgroundJobProgress(
              job.id,
              backgroundJobProgressFromSteps(podcastParentLabel, podcastAudioSteps),
            );
          },
          tts: settings.geminiPodcastTts,
        });

        const filename =
          job.type === "podcast_audio"
            ? buildAudioFilenameFromMarkdownUpload(sourceLabel)
            : buildAiDocumentFilename(preset.filenameStem, storyTitle, "wav");
        return {
          filename,
          summary: `Added ${filename.replace(/\.wav$/i, "")} to Media Library`,
          wavBytes: new Uint8Array(wavBuffer),
        };
      }

      const filename = buildAiDocumentFilename(preset.filenameStem, storyTitle, "md");
      return {
        filename,
        markdown,
        summary: `${filename} is ready to download`,
      };
    },
    [getNormalizedAISettings, repository, resolveAIProfile, updateBackgroundJobProgress],
  );

  const processBackgroundJob = useCallback(
    async (job: BackgroundJob, signal: AbortSignal) => {
      if (isAudiobookListenBackgroundJob(job)) {
        return;
      }

      if (inFlightBackgroundJobsRef.current.has(job.id)) {
        return;
      }
      inFlightBackgroundJobsRef.current.add(job.id);

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
        if ((job.type as string) === "encyclopedia_index") {
          await repository.saveBackgroundJob({
            ...runningJob,
            status: "cancelled",
            finishedAt: new Date().toISOString(),
            error: undefined,
          });
          await hydrate(false);
          return;
        }

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
          const resolvedReferences = mergeMetaChatReferences(
            job.payload?.metaChatReferences ?? [],
          );
          const assistantText = await generateMetaChatAssistantReply(
            job.storyId ?? "",
            userText,
            resolvedReferences,
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
            referenceSnapshot: resolvedReferences,
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
                : isGlobalMetaChatScope(job.storyId ?? "")
                  ? "Library MetaChat reply ready"
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
        } else if (job.type === "guided_chapter_generate") {
          const plan = job.payload?.guidedPlan;
          const entry = job.payload?.guidedEntry ?? "workspace";
          if (!plan?.chapters?.length) {
            throw new Error("Guided chapter job is missing a chapter plan.");
          }

          const storyId = job.storyId ?? "";
          const story = await repository.getStory(storyId);
          if (!story) {
            throw new Error("Story not found.");
          }

          const [playerCharacter, storyConfig, settings] = await Promise.all([
            repository.getPlayerCharacter(story.playerCharacterId),
            repository.getStoryAIConfig(storyId),
            getNormalizedAISettings(),
          ]);

          if (!playerCharacter) {
            throw new Error("Story references missing player character.");
          }

          if (!settings) {
            throw new Error("Configure an AI provider in Settings before generating chapters.");
          }

          const providerType = storyConfig?.providerType ?? settings.activeProviderType;
          const { apiKey, model } = await resolveAIProfile(providerType, storyConfig?.model, "story");
          const provider = createAIProvider(providerType);
          const guidedStartedAtMs = Date.now();

          setGuidedGenerationStatus(
            buildGuidedChapterUiStatus(
              storyId,
              {
                phase: "generating",
                currentChapter: 1,
                totalChapters: plan.chapters.length,
                message: "Starting guided chapter generation…",
                chapters: plan.chapters.map((chapter) => ({
                  label: chapter.label,
                  status: "pending",
                })),
              },
              { jobId: job.id, startedAtMs: guidedStartedAtMs },
            ),
          );

          const sendChatMessageForGuided = sendChatMessageRef.current;
          if (!sendChatMessageForGuided) {
            throw new Error("Story chat engine is not ready.");
          }

          let priorChapterContext: string | undefined;
          if (entry === "workspace") {
            const [messages, chapters] = await Promise.all([
              repository.listStoryMessages(storyId),
              repository.listStoryChapters(storyId),
            ]);
            priorChapterContext = buildPriorChapterContinuationContext({
              messages,
              chapters,
              storySummary: story.currentSummary,
              playerName: playerCharacter.name,
              overallDirection: plan.overallDirection,
            });
          }

          const result = await runGuidedChapterGeneration({
            storyId,
            plan,
            entry,
            playerName: playerCharacter.name,
            repository,
            provider,
            apiKey,
            model,
            signal,
            jobId: job.id,
            priorChapterContext,
            sendChatMessage: async (targetStoryId, content, opts) => {
              const result = await sendChatMessageForGuided(targetStoryId, content, opts);
              setGuidedGenerationStatus((current) =>
                current?.storyId === storyId ? { ...current, streamingDraft: null } : current,
              );
              return result;
            },
            runDeepIndex: (targetStoryId, deepOpts) =>
              runDeepIndexProcess(targetStoryId, deepOpts),
            onTranscriptChange: () => hydrate(false),
            onStreamingChunk: (chunk) => {
              setGuidedGenerationStatus((current) =>
                current?.storyId === storyId
                  ? {
                      ...current,
                      streamingDraft: `${current.streamingDraft ?? ""}${chunk}`,
                    }
                  : current,
              );
            },
            onStreamingReset: () => {
              setGuidedGenerationStatus((current) =>
                current?.storyId === storyId ? { ...current, streamingDraft: "" } : current,
              );
            },
            onProgress: (update) => {
              setGuidedGenerationStatus((current) =>
                buildGuidedChapterUiStatus(storyId, update, {
                  jobId: job.id,
                  startedAtMs: guidedStartedAtMs,
                  streamingDraft: current?.streamingDraft ?? null,
                }),
              );
              void repository.getBackgroundJob(job.id).then((liveJob) => {
                if (!liveJob || liveJob.status !== "running") {
                  return;
                }
                void repository.saveBackgroundJob({
                  ...liveJob,
                  progress: {
                    current: update.currentChapter,
                    total: update.totalChapters,
                    label: update.message ?? update.chapterLabel,
                  },
                });
              });
            },
          });

          if (signal.aborted) {
            await repository.saveBackgroundJob({
              ...runningJob,
              status: "cancelled",
              finishedAt: new Date().toISOString(),
              error: undefined,
            });
            setGuidedGenerationStatus((current) =>
              current?.storyId === storyId ? undefined : current,
            );
            await hydrate(false);
            return;
          }

          const now = new Date().toISOString();
          await repository.saveStory({
            ...story,
            guidedGenerationMeta: {
              historyChapterCount:
                entry === "story_history"
                  ? plan.chapters.length
                  : story.guidedGenerationMeta?.historyChapterCount,
              historyDividerMessageId:
                result.dividerMessageId ?? story.guidedGenerationMeta?.historyDividerMessageId,
              lastGuidedBatchAt: now,
            },
            updatedAt: now,
          });

          const completedJob: BackgroundJob = {
            ...runningJob,
            status: "complete",
            finishedAt: now,
            result: {
              notificationTitle: `Guided chapters complete for ${story.title}`,
              notificationBody: `Generated ${plan.chapters.length} chapter(s).`,
            },
          };
          await repository.saveBackgroundJob(completedJob);
          setGuidedGenerationStatus(
            buildGuidedChapterUiStatus(
              storyId,
              {
                phase: "done",
                currentChapter: plan.chapters.length,
                totalChapters: plan.chapters.length,
                message: "Guided chapter generation complete.",
                chapters: plan.chapters.map((chapter) => ({
                  label: chapter.label,
                  status: "done",
                })),
              },
              { jobId: job.id, startedAtMs: guidedStartedAtMs },
            ),
          );
          await hydrate(false);
          await deliverJobNotice({
            jobId: completedJob.id,
            storyId,
            title: completedJob.result?.notificationTitle ?? "Guided chapters complete",
            body: completedJob.result?.notificationBody ?? "Generated chapters are ready.",
          });
          window.setTimeout(() => {
            setGuidedGenerationStatus((current) =>
              current?.storyId === storyId && current.phase === "done" ? undefined : current,
            );
          }, 8_000);
        } else if (job.type === "story_audiobook") {
          if (isAudiobookListenBackgroundJob(job)) {
            return;
          }
          const storyId = job.storyId ?? "";
          const summaryLine = await runAudiobookExportProcess(storyId, {
            signal,
            jobId: job.id,
            parallelChapters: job.payload?.audiobookParallelChapters,
            performanceMode: job.payload?.audiobookPerformanceMode,
          });
          const refreshed = await repository.getBackgroundJob(job.id);
          if (signal.aborted || refreshed?.status === "cancelled") {
            await repository.saveBackgroundJob({
              ...runningJob,
              status: "cancelled",
              finishedAt: new Date().toISOString(),
              error: undefined,
            });
            setAudiobookExportStatus((current) =>
              current?.storyId === storyId ? undefined : current,
            );
            await hydrate(false);
            return;
          }
          const story = await repository.getStory(storyId);
          const completedJob: BackgroundJob = {
            ...runningJob,
            status: "complete",
            finishedAt: new Date().toISOString(),
            result: {
              notificationTitle: story
                ? `Audiobook ready for ${story.title}`
                : "Audiobook export complete",
              notificationBody: summaryLine,
            },
          };
          await repository.saveBackgroundJob(completedJob);
          await deliverJobNotice({
            jobId: completedJob.id,
            storyId,
            title: completedJob.result?.notificationTitle ?? "Audiobook export complete",
            body: completedJob.result?.notificationBody ?? summaryLine,
          });
          window.setTimeout(() => {
            setAudiobookExportStatus((current) =>
              current?.storyId === storyId && current.phase === "done" ? undefined : current,
            );
          }, 8_000);
        } else if (job.type === "ai_document" || job.type === "podcast_audio") {
          const result = await runAiDocumentBackgroundProcess(job, signal);
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
          const storyId =
            job.payload?.aiDocumentSourceStoryId ?? job.storyId ?? undefined;
          const story = storyId ? await repository.getStory(storyId) : null;
          let notificationBody = result.summary;
          if (result.wavBytes) {
            const ingestResult = await ingestAiDocumentAudioFromJob({
              job,
              wavBytes: result.wavBytes,
              storyTitle: story?.title,
            });
            notificationBody = ingestResult.created
              ? "Saved to Media Library"
              : "Already in Media Library";
          } else if (result.markdown) {
            notificationBody = `${result.filename} is ready — tap Download in Documents or Background Tasks.`;
          }
          const completedJob: BackgroundJob = {
            ...runningJob,
            status: "complete",
            finishedAt: new Date().toISOString(),
            result: {
              notificationTitle: story
                ? `Document ready for ${story.title}`
                : job.type === "podcast_audio"
                  ? "Podcast audio ready"
                  : "AI document ready",
              notificationBody,
              aiDocumentFilename: result.markdown ? result.filename : undefined,
              aiDocumentMarkdown: result.markdown,
            },
          };
          await repository.saveBackgroundJob(completedJob);
          await deliverJobNotice({
            jobId: completedJob.id,
            storyId,
            title: completedJob.result?.notificationTitle ?? "AI document ready",
            body: completedJob.result?.notificationBody ?? result.summary,
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
        if (signal.aborted || (latest?.status === "cancelled" && job.type !== "guided_chapter_generate")) {
          try {
            await repository.saveBackgroundJob({
              ...runningJob,
              status: "cancelled",
              finishedAt: new Date().toISOString(),
              error: undefined,
            });
          } catch {}
          if (job.type === "guided_chapter_generate" && job.storyId) {
            setGuidedGenerationStatus((current) =>
              current?.storyId === job.storyId ? undefined : current,
            );
          }
          if (job.type === "story_audiobook" && job.storyId) {
            setAudiobookExportStatus((current) =>
              current?.storyId === job.storyId ? undefined : current,
            );
          }
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
        if (job.type === "guided_chapter_generate" && job.storyId) {
          setGuidedGenerationStatus({
            storyId: job.storyId,
            phase: "error",
            currentChapter: 0,
            totalChapters: job.payload?.guidedPlan?.chapters.length ?? 0,
            chapters:
              job.payload?.guidedPlan?.chapters.map((chapter) => ({
                label: chapter.label,
                status: "pending",
              })) ?? [],
            jobId: job.id,
            error: error instanceof Error ? error.message : "Guided chapter generation failed.",
          });
        }
        if (job.type === "story_audiobook" && job.storyId) {
          setAudiobookExportStatus({
            storyId: job.storyId,
            jobId: job.id,
            phase: "error",
            error: error instanceof Error ? error.message : "Audiobook export failed.",
          });
        }
        await hydrate(false).catch(() => {});
        if (job.type === "guided_chapter_generate" && job.storyId) {
          void deliverJobNotice({
            jobId: job.id,
            storyId: job.storyId,
            title: "Guided chapter generation failed",
            body: error instanceof Error ? error.message : "Guided chapter generation failed.",
          });
        }
        return;
      } finally {
        inFlightBackgroundJobsRef.current.delete(job.id);
      }
    },
    [deliverJobNotice, generateMetaChatAssistantReply, getNormalizedAISettings, hydrate, repository, resolveAIProfile, runAiDocumentBackgroundProcess, runAudiobookExportProcess, runDeepIndexProcess],
  );

  const startBackgroundTaskJob = useCallback(
    (job: BackgroundJob) => {
      if (
        inFlightBackgroundJobsRef.current.has(job.id) ||
        activeBackgroundJobIdsRef.current.has(job.id)
      ) {
        return;
      }

      const controller = new AbortController();
      activeBackgroundJobIdsRef.current.add(job.id);
      backgroundJobControllersRef.current[job.id] = controller;

      void processBackgroundJob(job, controller.signal).finally(() => {
        delete backgroundJobControllersRef.current[job.id];
        activeBackgroundJobIdsRef.current.delete(job.id);
        void promoteQueuedAudiobookListenTasks().finally(() => hydrate(false));
      });
    },
    [hydrate, processBackgroundJob, promoteQueuedAudiobookListenTasks],
  );

  useEffect(() => {
    if (loading || errorMessage) {
      return;
    }

    for (const jobId of [...activeBackgroundJobIdsRef.current]) {
      if (!backgroundJobControllersRef.current[jobId]) {
        activeBackgroundJobIdsRef.current.delete(jobId);
      }
    }

    for (const jobId of [...activeBackgroundJobIdsRef.current]) {
      const isStillActive = backgroundJobs.some(
        (job) =>
          job.id === jobId && (job.status === "queued" || job.status === "running"),
      );
      if (!isStillActive) {
        activeBackgroundJobIdsRef.current.delete(jobId);
      }
    }

    const orphanedRunningJobs = backgroundJobs.filter(
      (job) =>
        isBackgroundTaskJob(job) &&
        !isAudiobookListenBackgroundJob(job) &&
        job.status === "running" &&
        !inFlightBackgroundJobsRef.current.has(job.id) &&
        !backgroundJobControllersRef.current[job.id],
    );
    if (orphanedRunningJobs.length) {
      void Promise.all(
        orphanedRunningJobs.map((job) =>
          repository.saveBackgroundJob({
            ...job,
            status: "queued",
            error: undefined,
          }),
        ),
      ).then(() => hydrate(false));
      return;
    }

    const maxConcurrent = resolveMaxConcurrentBackgroundTasks(
      aiSettings?.maxConcurrentBackgroundTasks,
    );
    const activeBtCount = backgroundJobs.filter(
      (job) =>
        isBackgroundTaskJob(job) &&
        (inFlightBackgroundJobsRef.current.has(job.id) ||
          backgroundJobControllersRef.current[job.id]),
    ).length;
    const slots = maxConcurrent - activeBtCount;
    if (slots <= 0) {
      return;
    }

    const queuedBtJobs = sortQueuedBackgroundTasks(
      backgroundJobs.filter(
        (job) =>
          isBackgroundTaskJob(job) &&
          !isAudiobookListenBackgroundJob(job) &&
          job.status === "queued" &&
          !inFlightBackgroundJobsRef.current.has(job.id) &&
          !activeBackgroundJobIdsRef.current.has(job.id),
      ),
    );

    for (const job of queuedBtJobs.slice(0, slots)) {
      startBackgroundTaskJob(job);
    }
  }, [
    aiSettings?.maxConcurrentBackgroundTasks,
    backgroundJobs,
    errorMessage,
    hydrate,
    loading,
    repository,
    startBackgroundTaskJob,
  ]);

  useEffect(() => {
    if (loading || errorMessage) {
      return;
    }

    if (activeNonBackgroundJobRef.current) {
      const isStillActive = backgroundJobs.some(
        (job) =>
          job.id === activeNonBackgroundJobRef.current &&
          (job.status === "queued" || job.status === "running"),
      );
      if (isStillActive) {
        return;
      }
      activeNonBackgroundJobRef.current = null;
    }

    const nextJob = backgroundJobs.find(
      (job) =>
        (job.type === "metachat_generate" || job.type === "guided_chapter_generate") &&
        (job.status === "queued" || job.status === "running"),
    );

    if (!nextJob) {
      return;
    }

    if (inFlightBackgroundJobsRef.current.has(nextJob.id)) {
      return;
    }

    const controller = new AbortController();
    activeNonBackgroundJobRef.current = nextJob.id;
    backgroundJobControllersRef.current[nextJob.id] = controller;

    void processBackgroundJob(nextJob, controller.signal).finally(() => {
      delete backgroundJobControllersRef.current[nextJob.id];
      if (activeNonBackgroundJobRef.current === nextJob.id) {
        activeNonBackgroundJobRef.current = null;
      }
      void hydrate(false);
    });
  }, [backgroundJobs, errorMessage, hydrate, loading, processBackgroundJob]);

  useEffect(() => {
    if (loading || errorMessage) {
      return;
    }

    const activeGuidedJob = backgroundJobs.find(
      (job) =>
        job.type === "guided_chapter_generate" &&
        (job.status === "queued" || job.status === "running"),
    );

    if (!activeGuidedJob?.storyId) {
      return;
    }

    if (guidedGenerationStatus?.jobId === activeGuidedJob.id) {
      return;
    }

    const plan = activeGuidedJob.payload?.guidedPlan;
    setGuidedGenerationStatus(
      buildGuidedChapterUiStatus(
        activeGuidedJob.storyId,
        {
          phase: "generating",
          currentChapter: activeGuidedJob.progress?.current ?? 1,
          totalChapters: activeGuidedJob.progress?.total ?? plan?.chapters.length ?? 1,
          message: activeGuidedJob.progress?.label ?? "Resuming guided chapter generation…",
          chapters:
            plan?.chapters.map((chapter, index) => ({
              label: chapter.label,
              status:
                index < (activeGuidedJob.progress?.current ?? 1) - 1
                  ? "done"
                  : index === (activeGuidedJob.progress?.current ?? 1) - 1
                    ? "active"
                    : "pending",
            })) ?? [],
        },
        {
          jobId: activeGuidedJob.id,
          startedAtMs: Date.parse(activeGuidedJob.startedAt ?? activeGuidedJob.createdAt),
        },
      ),
    );
  }, [backgroundJobs, errorMessage, guidedGenerationStatus?.jobId, loading]);

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
      const { apiKey, model } = await resolveAIProfile(providerType, storyConfig?.model, "indexing");
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
                const prevRpStats =
                  (rawPrev?.rpStats as StoryStateData["rpStats"] | undefined) ??
                  (safeParseStoryStateData(storyState.stateJson))?.rpStats;
                if (prevRpStats) {
                  return JSON.stringify(
                    applyAuthorDirectivesToStoryState(
                      { ...rawNew, rpStats: prevRpStats },
                      refreshedMessages,
                    ),
                  );
                }
              }
            } catch {}
            return JSON.stringify(
              applyAuthorDirectivesToStoryState(
                safeParseStoryStateData(rebuilt.stateJson),
                refreshedMessages,
              ),
            );
          }

          const withAuthorDirectives = applyAuthorDirectivesToStoryState(
            parsed,
            refreshedMessages,
          );

          return finalizeStoryStateForSave({
            parsedState: withAuthorDirectives as StoryStateData,
            previousStateJson: storyState?.stateJson,
            totalMessages: refreshedMessages.length,
            now,
            mode: "deep",
            playerName: playerCharacter.name,
            playerAliases: normalizePlayerCharacterAliases(playerCharacter.aliases),
            playerCharacter: {
              name: playerCharacter.name,
              aliases: playerCharacter.aliases,
            },
            messages: refreshedMessages,
            universeImportedCharacters: story.universePackSnapshot?.universe?.importedCharacters ?? [],
          });
        } catch {
          return JSON.stringify(
            applyAuthorDirectivesToStoryState(
              safeParseStoryStateData(rebuilt.stateJson),
              refreshedMessages,
            ),
          );
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

    const syncAuthorDirectiveStateForStory = async (storyId: string) => {
      const [existingState, storyMessages] = await Promise.all([
        repository.getStoryState(storyId),
        repository.listStoryMessages(storyId),
      ]);

      const now = new Date().toISOString();
      const nextStateJson = JSON.stringify(
        applyAuthorDirectivesToStoryState(
          parseStoryStateJson(existingState?.stateJson ?? ""),
          storyMessages,
        ),
      );

      await repository.saveStoryState({
        id: existingState?.id ?? `story-state:${storyId}`,
        storyId,
        stateJson: nextStateJson,
        updatedAt: now,
      });
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
      audiobookExportStatus,
      guidedGenerationStatus,
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
      getMetaMessagesForScope: (scopeId) =>
        sortByTimestampAsc(metaMessages.filter((message) => message.storyId === scopeId)),
      getMetaMessagesForStory: (storyId) =>
        sortByTimestampAsc(metaMessages.filter((message) => message.storyId === storyId)),
      getChaptersForStory: (storyId) =>
        [...chapters]
          .filter((chapter) => chapter.storyId === storyId)
          .sort((a, b) => a.endsAtIndex - b.endsAtIndex),
      getJobsForStory: (storyId) =>
        backgroundJobs.filter((job) => job.storyId === storyId),
      getMetaChatJobs: (scopeId) =>
        backgroundJobs.filter(
          (job) => job.type === "metachat_generate" && job.storyId === scopeId,
        ),
      getMetaChatDraft: (scopeId) =>
        storyUiStates.find((record) => record.storyId === scopeId)?.metaChatDraft ?? "",
      getMetaChatReferences: (scopeId) =>
        storyUiStates.find((record) => record.storyId === scopeId)?.metaChatReferences ?? [],
      getStoryCharacterTtsRegistry: (storyId) => {
        const record = storyUiStates.find((entry) => entry.storyId === storyId);
        if (!record?.characterTtsVoices && !record?.characterTtsLabels) {
          return undefined;
        }

        return {
          voices: record.characterTtsVoices ?? {},
          labels: record.characterTtsLabels ?? {},
        };
      },
      async saveStoryCharacterTtsRegistry(storyId, registry) {
        await saveStoryUiStateRecord(storyId, {
          characterTtsVoices: registry.voices,
          characterTtsLabels: registry.labels,
        });
      },
      getPlayerCharactersForUniverse: (universeIdOrIds) => {
        const selectedIds = normalizeUniverseIds(
          Array.isArray(universeIdOrIds) ? universeIdOrIds : [universeIdOrIds],
        );
        if (!selectedIds.length) {
          return [];
        }
        return sortByCreatedAtDesc(
          playerCharacters.filter(
            (character) =>
              (character.scope ?? "library") === "library" &&
              characterMatchesUniverses(character, selectedIds),
          ),
        );
      },
      getStoriesForUniverse: (universeId) =>
        sortByUpdatedAtDesc(
          stories.filter((story) => getUniverseIds(story).includes(universeId)),
        ),
      getStoriesForPlayerCharacter: (playerCharacterId) =>
        sortByUpdatedAtDesc(
          stories.filter((story) => story.playerCharacterId === playerCharacterId),
        ),
      getParentStory: (storyId) => {
        const currentStory = stories.find((story) => story.id === storyId);
        return currentStory?.parentStoryId
          ? stories.find((story) => story.id === currentStory.parentStoryId)
          : undefined;
      },
      getChildStories: (storyId) =>
        sortByCreatedAtDesc(stories.filter((story) => story.parentStoryId === storyId)),
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
        const { apiKey, model } = await resolveAIProfile(providerType, undefined, "creation");
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
            maxTokens: 3000,
            temperature: 0,
            jsonMode: true,
          });
        } catch (error) {
          rethrowUserFacingGenerationError(error, providerType);
        }

        const jsonText =
          extractFirstJsonObject(response.content) ??
          tryRepairTruncatedJson(response.content) ??
          response.content.trim();
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
      async generateAiDocument(input) {
        const settings = await getNormalizedAISettings();
        if (!settings) {
          throw new Error("Configure an AI provider in Settings before generating documents.");
        }

        const providerType = settings.activeProviderType;
        const { apiKey, model } = await resolveAIProfile(providerType, undefined, "creation");
        const provider = createAIProvider(providerType);
        const preset = getAiDocumentPreset(input.presetId);
        const structure = input.structure ?? preset.defaultStructure ?? "single";
        const outputFormat = input.outputFormat ?? "markdown";

        let sourceMaterial = "";
        let sourceLabel = "";
        let storyTitle: string | undefined;
        let chapterSegments: import("../../lib/aiDocumentGenerator/types").ChapterSourceSegment[] = [];

        if (input.source.type === "story") {
          const bundle = await repository.getStoryExportBundle(input.source.storyId);
          if (!bundle) {
            throw new Error("Story not found.");
          }
          sourceMaterial = resolveSourceMaterialForStructure(bundle, structure);
          sourceLabel = input.source.label.trim() || bundle.story.title;
          storyTitle = bundle.story.title;
          chapterSegments = segmentStoryBundleByChapter(bundle);
        } else {
          sourceMaterial = input.source.text;
          sourceLabel = input.source.label.trim() || "Uploaded export";
          chapterSegments = segmentUploadedSourceByChapter(input.source.text);
        }

        if (!sourceMaterial.trim()) {
          throw new Error("Source material is empty.");
        }

        let streamedDraft = "";
        const onChunk =
          input.onChunk ??
          ((chunk: string) => {
            streamedDraft += chunk;
          });
        const onChunkReset =
          input.onChunkReset ??
          (() => {
            streamedDraft = "";
          });

        const documentMaxTokens = preset.supportsGeminiTts ? 16000 : 12000;

        const generateChunk = async (messages: AIChatMessage[]) => {
          let response: GenerateResponseResult;
          try {
            response = await generateResponseWithRetry({
              providerType,
              provider,
              apiKey,
              model,
              messages,
              maxTokens: documentMaxTokens,
              temperature: 0.35,
              signal: input.signal,
              onChunk,
              onChunkReset,
              debugTrace: {
                traceId: makeGenerationAuditTraceId("other"),
                mode: "other",
                stage: "ai-document",
              },
            });
          } catch (error) {
            rethrowUserFacingGenerationError(error, providerType);
          }

          const content = response.content.trim() || streamedDraft.trim();
          if (!content) {
            rethrowUserFacingGenerationError(
              createAIGenerationError(
                "validation",
                "Document generator returned empty output.",
              ),
              providerType,
            );
          }
          return content;
        };

        let markdown = "";
        if (structure === "chapter-by-chapter" && chapterSegments.length > 1) {
          markdown = await generateChapterStructuredDocument({
            preset,
            customPrompt: input.customPrompt,
            sourceLabel,
            chapterSegments,
            fullSourceMaterial: sourceMaterial,
            generateChunk,
            onProgress: input.onProgress
              ? ({ steps }) => {
                  const runningStep = steps.find((step) => step.status === "running");
                  input.onProgress?.(
                    runningStep?.label ?? steps[steps.length - 1]?.label ?? "Generating document…",
                  );
                }
              : undefined,
            signal: input.signal,
          });
        } else {
          const messages = buildAiDocumentMessages({
            preset,
            customPrompt: input.customPrompt,
            sourceLabel,
            sourceMaterial,
            structure,
          });
          markdown = await generateChunk(messages);
        }

        if (outputFormat === "gemini-audio-wav") {
          if (!preset.supportsGeminiTts) {
            throw new Error("Gemini audio is only available for podcast document types.");
          }

          const geminiApiKey = settings.apiKeys?.gemini?.trim() ?? "";
          if (!geminiApiKey) {
            throw new Error("Add a Gemini API key in Settings → AI to generate podcast audio.");
          }

          input.onProgress?.("Generating Gemini podcast audio…");
          const wavBuffer = await generateGeminiPodcastAudioFromMarkdown({
            apiKey: geminiApiKey,
            markdown,
            signal: input.signal,
            onProgress: input.onProgress,
            onChunkComplete: input.onAudioChunkComplete,
            resume: input.audioResume,
            tts: settings.geminiPodcastTts,
          });

          return {
            filename: buildAiDocumentFilename(preset.filenameStem, storyTitle, "wav"),
            mimeType: "audio/wav",
            content: wavBuffer,
          };
        }

        return {
          filename: buildAiDocumentFilename(preset.filenameStem, storyTitle, "md"),
          mimeType: "text/markdown",
          content: markdown,
        };
      },
      async generateAiDocumentAudioFromMarkdown(input) {
        const settings = await getNormalizedAISettings();
        const geminiApiKey = settings?.apiKeys?.gemini?.trim() ?? "";
        if (!geminiApiKey) {
          throw new Error("Add a Gemini API key in Settings → AI to generate podcast audio.");
        }

        const markdown = input.markdown.trim();
        if (!markdown) {
          throw new Error("The uploaded Markdown file is empty.");
        }

        input.onProgress?.("Generating Gemini podcast audio…");
        const wavBuffer = await generateGeminiPodcastAudioFromMarkdown({
          apiKey: geminiApiKey,
          markdown,
          signal: input.signal,
          onProgress: input.onProgress,
          onChunkComplete: input.onChunkComplete,
          resume: input.resume,
          tts: settings?.geminiPodcastTts,
        });

        return {
          filename: buildAudioFilenameFromMarkdownUpload(input.label),
          mimeType: "audio/wav",
          content: wavBuffer,
        };
      },
      async deleteUniverse(id) {
        const linkedCharacters = playerCharacters.some((character) =>
          getUniverseIds(character).includes(id),
        );
        const linkedStories = stories.some((story) => getUniverseIds(story).includes(id));

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
        const nextCharacter = applyUniverseIdsFromDraft(draft, {
          id: createEntityId("player-character"),
          name: draft.name.trim(),
          aliases: normalizePlayerCharacterAliases(draft.aliases),
          knownTies: normalizePlayerCharacterKnownTies(draft.knownTies),
          age: draft.age.trim(),
          gender: draft.gender.trim(),
          species: draft.species?.trim() ?? "",
          pronouns: draft.pronouns.trim(),
          characterConcept: draft.characterConcept?.trim() || undefined,
          appearance: draft.appearance.trim(),
          personality: draft.personality.trim(),
          background: draft.background.trim(),
          goals: "",
          notes: draft.notes.trim(),
          universeId: draft.universeId,
          scope: draft.scope ?? "library",
          storyId: draft.storyId,
          createdAt: new Date().toISOString(),
        } satisfies PlayerCharacter);

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
          ...applyUniverseIdsFromDraft(
            {
              universeId: story.universeId,
              universeIds: getUniverseIds(story),
            },
            {
              ...playerCharacter,
              scope: "library",
              storyId: undefined,
              createdAt: new Date().toISOString(),
            },
          ),
          scope: "library",
          storyId: undefined,
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

        const nextCharacter = applyUniverseIdsFromDraft(draft, {
          ...currentCharacter,
          name: draft.name.trim(),
          aliases: normalizePlayerCharacterAliases(draft.aliases),
          knownTies: normalizePlayerCharacterKnownTies(draft.knownTies),
          age: draft.age.trim(),
          gender: draft.gender.trim(),
          species: draft.species?.trim() ?? "",
          pronouns: draft.pronouns.trim(),
          characterConcept: draft.characterConcept?.trim() || undefined,
          appearance: draft.appearance.trim(),
          personality: draft.personality.trim(),
          background: draft.background.trim(),
          goals: currentCharacter.goals,
          notes: draft.notes.trim(),
          universeId: draft.universeId,
          scope: draft.scope ?? currentCharacter.scope ?? "library",
          storyId: draft.storyId ?? currentCharacter.storyId,
        });

        const identityChanged =
          currentCharacter.name.trim() !== nextCharacter.name.trim() ||
          currentCharacter.pronouns.trim() !== nextCharacter.pronouns.trim() ||
          (currentCharacter.species ?? "").trim() !== (nextCharacter.species ?? "").trim() ||
          currentCharacter.gender.trim() !== nextCharacter.gender.trim() ||
          getUniverseIds(currentCharacter).join("|") !== getUniverseIds(nextCharacter).join("|");

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
        const universeIds = normalizeUniverseIds(
          draft.universeIds?.length ? draft.universeIds : [draft.universeId],
        );
        const universePackSnapshots = await buildUniversePackSnapshotsForIds(repository, universeIds);
        const storyId = createEntityId("story");
        const universePackSnapshot = universePackSnapshots[0];
        const rpMode = draft.rpMode ?? true;
        const guidedHistory = draft.guidedStoryHistory;
        const useGuidedHistory =
          guidedHistory?.enabled &&
          Array.isArray(guidedHistory.chapters) &&
          guidedHistory.chapters.length > 0 &&
          guidedHistory.chapters.every((chapter) => chapter.overview.trim());

        const nextStory: Story = {
          id: storyId,
          title: draft.title.trim(),
          universeId: universeIds[0] ?? draft.universeId,
          universeIds,
          playerCharacterId: draft.playerCharacterId,
          parentStoryId: draft.parentStoryId,
          rootStoryId: draft.rootStoryId ?? storyId,
          lineageDepth: draft.lineageDepth ?? 0,
          lineageType: draft.lineageType,
          sequelSeedSourceStoryId: draft.sequelSeedSourceStoryId,
          universePackSnapshot,
          universePackSnapshots:
            universePackSnapshots.length > 1 ? universePackSnapshots : undefined,
          isArchived: draft.isArchived,
          readOnlyReason: undefined,
          readOnlyLockedAt: undefined,
          matureFictionMode: draft.matureFictionMode ?? true,
          rpMode,
          rpConfig: draft.rpConfig ?? (rpMode ? DEFAULT_RP_CONFIG : undefined),
          autoIndexMode: draft.autoIndexMode ?? "chapter",
          autoIndexInterval: draft.autoIndexInterval ?? 20,
          accentThemeKey: draft.accentThemeKey,
          accentThemeCustom: draft.accentThemeCustom,
          currentSummary: draft.currentSummary.trim(),
          guidedGenerationMeta: useGuidedHistory
            ? {
                historyChapterCount:
                  guidedHistory.chapterCount ?? guidedHistory.chapters?.length ?? 0,
              }
            : undefined,
          createdAt: now,
          updatedAt: now,
        };

        await repository.saveStory(nextStory);

        if (!useGuidedHistory) {
          await repository.saveStoryMessage({
            id: createEntityId("story-message"),
            storyId,
            role: "system",
            content: "Chapter I.",
            timestamp: now,
            speakerType: "system",
            chapterBoundary: {
              kind: "start",
              label: "Chapter I",
            },
          });
        }

        await hydrate(false);

        if (useGuidedHistory && guidedHistory.chapters) {
          const labels = resolveUpcomingChapterLabels([], [], guidedHistory.chapters.length);
          const plan: GuidedChapterPlan = {
            overallDirection: guidedHistory.overallDirection?.trim() || draft.currentSummary.trim(),
            chapters: guidedHistory.chapters.map((chapter, index) => ({
              label: chapter.label?.trim() || labels[index] || `Chapter ${index + 1}`,
              overview: chapter.overview.trim(),
              scenesPerChapter: chapter.scenesPerChapter,
            })),
          };
          await queueGuidedChapterJob(storyId, { entry: "story_history", plan });
        }

        return nextStory;
      },
      async createSequel(input) {
        const now = new Date().toISOString();
        const sourceStory = await repository.getStory(input.sourceStoryId);

        if (!sourceStory) {
          throw new Error("Source story not found.");
        }

        const [playerCharacter, universePackSnapshots, sourceStateRecord, sourceSummaries, sourceAiConfig] =
          await Promise.all([
            repository.getPlayerCharacter(input.playerCharacterId),
            buildUniversePackSnapshotsForIds(repository, getUniverseIds(sourceStory)),
            repository.getStoryState(sourceStory.id),
            repository.listStorySummaries(sourceStory.id),
            repository.getStoryAIConfig(sourceStory.id),
          ]);

        if (!playerCharacter) {
          throw new Error("Player character not found.");
        }

        if (!characterMatchesUniverses(playerCharacter, getUniverseIds(sourceStory))) {
          throw new Error(
            "Sequel protagonists must belong to at least one universe from the source story.",
          );
        }

        const storyId = createEntityId("story");
        const parsedSourceState = sourceStateRecord?.stateJson?.trim()
          ? safeParseStoryStateData(sourceStateRecord.stateJson)
          : null;
        const sourceSummary =
          sourceStory.currentSummary.trim() ||
          sourceSummaries[0]?.summary?.trim() ||
          parsedSourceState?.summaries?.currentSituation?.trim() ||
          "";
        const sequelSummary = buildSequelSummaryText({
          sourceStory,
          sourceSummary,
          sourceState: parsedSourceState,
          openingNote: input.openingNote,
        });
        const sequelState = createSequelStoryStateData({
          sourceState: parsedSourceState,
          sourceSummary: sequelSummary,
          now,
        });
        const universePackSnapshot = universePackSnapshots[0];
        const nextStory: Story = {
          id: storyId,
          title: input.title.trim(),
          universeId: sourceStory.universeId,
          universeIds: getUniverseIds(sourceStory),
          playerCharacterId: input.playerCharacterId,
          parentStoryId: sourceStory.id,
          rootStoryId: sourceStory.rootStoryId ?? sourceStory.id,
          lineageDepth: (sourceStory.lineageDepth ?? 0) + 1,
          lineageType: "sequel",
          sequelSeedSourceStoryId: sourceStory.id,
          universePackSnapshot,
          universePackSnapshots:
            universePackSnapshots.length > 1 ? universePackSnapshots : undefined,
          isArchived: false,
          matureFictionMode: sourceStory.matureFictionMode,
          rpMode: sourceStory.rpMode,
          rpConfig: sourceStory.rpConfig,
          autoIndexMode: sourceStory.autoIndexMode,
          autoIndexInterval: sourceStory.autoIndexInterval ?? 20,
          accentThemeKey: sourceStory.accentThemeKey,
          accentThemeCustom: sourceStory.accentThemeCustom,
          currentSummary: sequelSummary.trim(),
          createdAt: now,
          updatedAt: now,
        };

        await repository.saveStory(nextStory);
        await repository.saveStoryState({
          id: `story-state:${storyId}`,
          storyId,
          stateJson: JSON.stringify(sequelState),
          updatedAt: now,
        });
        await repository.saveStoryMessage({
          id: createEntityId("story-message"),
          storyId,
          role: "system",
          content: "Chapter I.",
          timestamp: now,
          speakerType: "system",
          chapterBoundary: {
            kind: "start",
            label: "Chapter I",
          },
        });
        await repository.saveStory({
          ...sourceStory,
          readOnlyReason: "sequel_prequel",
          readOnlyLockedAt: sourceStory.readOnlyLockedAt ?? now,
          updatedAt: now,
        });

        if (sourceAiConfig) {
          await repository.saveStoryAIConfig({
            ...sourceAiConfig,
            id: createEntityId("story-ai-config"),
            storyId,
            createdAt: now,
            updatedAt: now,
          });
        }

        await hydrate(false);
        return nextStory;
      },
      async createBranch(input) {
        const now = new Date().toISOString();
        const sourceStory = await repository.getStory(input.sourceStoryId);

        if (!sourceStory) {
          throw new Error("Source story not found.");
        }

        const [
          universePack,
          sourceMessages,
          sourceMetaMessages,
          sourceChapters,
          sourceSummaries,
          sourceStateRecord,
          sourceAiConfig,
        ] = await Promise.all([
          repository.getUniverseExportBundle(sourceStory.universeId),
          repository.listStoryMessages(sourceStory.id),
          repository.listStoryMetaMessages(sourceStory.id),
          repository.listStoryChapters(sourceStory.id),
          repository.listStorySummaries(sourceStory.id),
          repository.getStoryState(sourceStory.id),
          repository.getStoryAIConfig(sourceStory.id),
        ]);

        const storyId = createEntityId("story");
        const nextStory: Story = {
          ...sourceStory,
          id: storyId,
          title: input.title.trim(),
          parentStoryId: sourceStory.id,
          rootStoryId: sourceStory.rootStoryId ?? sourceStory.id,
          lineageDepth: (sourceStory.lineageDepth ?? 0) + 1,
          lineageType: "branch",
          sequelSeedSourceStoryId: undefined,
          universePackSnapshot: buildUniversePackSnapshot(universePack),
          readOnlyReason: undefined,
          readOnlyLockedAt: undefined,
          createdAt: now,
          updatedAt: now,
        };

        const messageIdMap = new Map<string, string>();
        const clonedMessages = sourceMessages.map((message) => {
          const nextId = createEntityId("story-message");
          messageIdMap.set(message.id, nextId);
          return {
            ...message,
            id: nextId,
            storyId,
          };
        });
        const clonedMetaMessages = sourceMetaMessages.map((message) => ({
          ...message,
          id: createEntityId("story-meta-message"),
          storyId,
        }));
        const clonedChapters = sourceChapters.map((chapter) => ({
          ...chapter,
          id: createEntityId("story-chapter"),
          storyId,
          endsAtMessageId: messageIdMap.get(chapter.endsAtMessageId) ?? chapter.endsAtMessageId,
        }));
        const clonedSummaries = sourceSummaries.map((summary) => ({
          ...summary,
          id: createEntityId("story-summary"),
          storyId,
        }));
        const clonedState = (() => {
          if (!sourceStateRecord) {
            return null;
          }

          let stateJson = sourceStateRecord.stateJson;
          try {
            const parsed = JSON.parse(sourceStateRecord.stateJson) as Record<string, unknown>;
            stateJson = JSON.stringify({
              ...parsed,
              updatedAt: now,
            });
          } catch {}

          return {
            ...sourceStateRecord,
            id: `story-state:${storyId}`,
            storyId,
            stateJson,
            updatedAt: now,
          };
        })();

        await repository.saveStory(nextStory);
        await Promise.all(clonedMessages.map((message) => repository.saveStoryMessage(message)));
        await Promise.all(
          clonedMetaMessages.map((message) => repository.saveStoryMetaMessage(message)),
        );
        await Promise.all(clonedChapters.map((chapter) => repository.saveStoryChapter(chapter)));
        await Promise.all(clonedSummaries.map((summary) => repository.saveStorySummary(summary)));

        if (clonedState) {
          await repository.saveStoryState(clonedState);
        }

        if (sourceAiConfig) {
          await repository.saveStoryAIConfig({
            ...sourceAiConfig,
            id: createEntityId("story-ai-config"),
            storyId,
            createdAt: now,
            updatedAt: now,
          });
        }

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

        if ("accentThemeKey" in patch) {
          if (patch.accentThemeKey) {
            nextStory.accentThemeKey = patch.accentThemeKey;
          } else {
            delete nextStory.accentThemeKey;
            delete nextStory.accentThemeCustom;
          }
        }

        if ("accentThemeCustom" in patch) {
          if (patch.accentThemeCustom?.trim()) {
            nextStory.accentThemeCustom = patch.accentThemeCustom.trim();
          } else {
            delete nextStory.accentThemeCustom;
          }
        }

        await repository.saveStory(nextStory);
        await hydrate(false);

        return nextStory;
      },
      async deleteStory(id) {
        await repository.deleteStory(id);
        await markMediaAssetsOrphanedForStory(id);
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
        await assertStoryWritable(draft.storyId);
        const prefix = draft.role === "user" ? extractSpeakerPrefix(draft.content) : null;
        const rawUserContent = draft.content.trim();
        const isContinueInstruction =
          draft.role === "user" &&
          (draft.speakerType === "continue" ||
            (!prefix && isContinueInstructionText(rawUserContent)));
        const authorDirective =
          draft.role === "user"
            ? resolveAuthorDirective(prefix?.speakerLabel, draft.authorDirective)
            : undefined;
        const resolvedUserSpeakerType =
          draft.role === "user"
            ? resolveUserSpeakerTypeForContinue(
                isContinueInstruction,
                resolveUserSpeakerTypeForAuthorDirective(
                  authorDirective,
                  resolveUserSpeakerType(prefix?.speakerLabel, draft.speakerType),
                ),
              )
            : draft.speakerType;
        const resolvedUserSpeakerName =
          draft.role === "user"
            ? resolveUserSpeakerNameForContinue(
                isContinueInstruction,
                resolveUserSpeakerNameForAuthorDirective(
                  authorDirective,
                  resolveUserSpeakerName(
                    prefix?.speakerLabel,
                    draft.speakerName,
                    draft.speakerType,
                  ),
                ),
              )
            : draft.speakerName?.trim() || prefix?.speakerLabel || undefined;
        const nextMessage: StoryMessage = {
          id: createEntityId("story-message"),
          storyId: draft.storyId,
          role: draft.role,
          content: (prefix?.strippedContent ?? draft.content).trim(),
          timestamp: new Date().toISOString(),
          speakerName: resolvedUserSpeakerName,
          speakerType: resolvedUserSpeakerType,
          directorIntent:
            draft.role === "user"
              ? authorDirective || isContinueInstruction
                ? undefined
                : draft.directorIntent ??
                  detectDirectorIntent((prefix?.strippedContent ?? draft.content).trim()) ??
                  undefined
              : draft.directorIntent,
          authorDirective,
          editedAt: draft.editedAt,
          regeneratedAt: draft.regeneratedAt,
          revision: draft.revision,
        };

        await repository.saveStoryMessage(nextMessage);
        if (authorDirective) {
          await syncAuthorDirectiveStateForStory(draft.storyId);
          void runDeepIndexProcess(draft.storyId, { trigger: "auto" }).catch(() => undefined);
        }
        await touchStory(draft.storyId);
        await hydrate(false);

        return nextMessage;
      },
      async updateMessage(id, draft) {
        const currentMessage = await repository.getStoryMessage(id);

        if (!currentMessage) {
          return null;
        }

        await assertStoryWritable(currentMessage.storyId);

        const prefix = draft.role === "user" ? extractSpeakerPrefix(draft.content) : null;
        const rawUserContent = draft.content.trim();
        const isContinueInstruction =
          draft.role === "user" &&
          ((draft.speakerType ?? currentMessage.speakerType) === "continue" ||
            (!prefix && isContinueInstructionText(rawUserContent)));
        const authorDirective =
          draft.role === "user"
            ? resolveAuthorDirective(
                prefix?.speakerLabel,
                draft.authorDirective ?? currentMessage.authorDirective,
              )
            : undefined;
        const resolvedUserSpeakerType =
          draft.role === "user"
            ? resolveUserSpeakerTypeForContinue(
                isContinueInstruction,
                resolveUserSpeakerTypeForAuthorDirective(
                  authorDirective,
                  resolveUserSpeakerType(
                    prefix?.speakerLabel,
                    draft.speakerType ?? currentMessage.speakerType,
                  ),
                ),
              )
            : draft.speakerType;
        const resolvedUserSpeakerName =
          draft.role === "user"
            ? resolveUserSpeakerNameForContinue(
                isContinueInstruction,
                resolveUserSpeakerNameForAuthorDirective(
                  authorDirective,
                  resolveUserSpeakerName(
                    prefix?.speakerLabel,
                    draft.speakerName,
                    draft.speakerType ?? currentMessage.speakerType,
                  ),
                ),
              )
            : draft.speakerName?.trim() || prefix?.speakerLabel || undefined;
        const nextMessage: StoryMessage = {
          ...currentMessage,
          role: draft.role,
          content: (prefix?.strippedContent ?? draft.content).trim(),
          speakerName: resolvedUserSpeakerName,
          speakerType: resolvedUserSpeakerType,
          directorIntent:
            draft.role === "user"
              ? authorDirective || isContinueInstruction
                ? undefined
                : draft.directorIntent ??
                  detectDirectorIntent((prefix?.strippedContent ?? draft.content).trim()) ??
                  undefined
              : draft.directorIntent ?? currentMessage.directorIntent,
          authorDirective,
          editedAt: draft.editedAt ?? currentMessage.editedAt,
          regeneratedAt: draft.regeneratedAt ?? currentMessage.regeneratedAt,
          revision: draft.revision ?? currentMessage.revision,
        };

        await repository.saveStoryMessage(nextMessage);
        if (authorDirective || currentMessage.authorDirective) {
          await syncAuthorDirectiveStateForStory(currentMessage.storyId);
          void runDeepIndexProcess(currentMessage.storyId, { trigger: "auto" }).catch(() => undefined);
        }
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

        await assertStoryWritable(currentMessage.storyId);

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
      async regenerateLastAssistantMessage(storyId, opts) {
        const story = await assertStoryWritable(storyId);

        const existingMessages = await repository.listStoryMessages(storyId);
        const lastMessage = existingMessages[existingMessages.length - 1];
        const previousMessage = existingMessages[existingMessages.length - 2];

        if (!lastMessage || lastMessage.role !== "assistant") {
          throw new Error("The latest message is not an assistant reply.");
        }

        if (!previousMessage || previousMessage.role !== "user") {
          throw new Error("Cannot regenerate without a preceding user message.");
        }

        const [universeContext, playerCharacter] = await Promise.all([
          resolveStoryUniverseContext({
            story,
            getUniverse: repository.getUniverse,
            listUniverseImports: repository.listUniverseImports,
          }),
          repository.getPlayerCharacter(story.playerCharacterId),
        ]);

        if (!playerCharacter) {
          throw new Error("Story references missing player character.");
        }

        const [summaries, storyConfig, storyState] = await Promise.all([
          repository.listStorySummaries(storyId),
          repository.getStoryAIConfig(storyId),
          repository.getStoryState(storyId),
        ]);
        const effectiveUniverse = universeContext.universe;
        const effectiveImports = universeContext.imports;

        const settings = await getNormalizedAISettings();

        if (!settings) {
          throw new Error("Configure an AI provider in Settings before generating scenes.");
        }

        const providerType = storyConfig?.providerType ?? settings.activeProviderType;
        const { apiKey, model } = await resolveAIProfile(providerType, storyConfig?.model, "story");
        const provider = createAIProvider(providerType);
        const traceId = makeGenerationAuditTraceId("story");

        const playerNameForValidation = buildPlayerNameForValidation(
          playerCharacter,
          storyState?.stateJson,
        );

        const recentMessages = sortByTimestampAsc(existingMessages.slice(0, -1)).slice(-31);
        const historyMessages = recentMessages.slice(0, -1);

        const sanitizedHistoryMessages = historyMessages.map((message) => {
          if (message.role !== "assistant") {
            return message;
          }

          return {
            ...message,
            content: normalizeTranscriptForDisplay(message.content),
          };
        });

        const latestPriorUserMessage = getLatestPriorUserMessage(sanitizedHistoryMessages);
        const allowDirectedPlayerControl = shouldAllowDirectedPlayerControlForUserTurn(
          previousMessage,
          latestPriorUserMessage,
        );

        const context = buildStoryChatContext({
          universe: effectiveUniverse,
          story,
          playerCharacter,
          imports: effectiveImports,
          summaries,
          storyState,
          recentMessages: sanitizedHistoryMessages,
          latestUserMessage: previousMessage.content,
          latestUserMessageSpeakerType: previousMessage.speakerType,
          allowDirectedPlayerControl,
          directorIntent: previousMessage.directorIntent ?? null,
        });

        const streamAttempt = { current: 0 };
        const reportStreamAttempt = () => {
          reportStreamGenerationAttempt(opts?.onGenerationAttempt, streamAttempt);
        };
        reportStreamGenerationAttempt(opts?.onGenerationAttempt, streamAttempt);

        const assistantContent = await generateResponseWithRetry({
          providerType,
          provider,
          apiKey,
          model,
          messages: context,
          signal: opts?.signal,
          idleTimeoutMs: getStoryStreamIdleTimeoutMs(model),
          onChunk: opts?.onChunk,
          onChunkReset: opts?.onChunkReset,
        });

        const sceneDepth = inferSceneDepth(previousMessage.content);
        const target = getSceneWordTarget(sceneDepth);
        const wordCount = assistantContent.content.split(/\s+/).filter(Boolean).length;
        const shouldRewriteForSize = sceneDepth === "light" && wordCount > target.maxWords * 2;
        const finalAssistantText = shouldRewriteForSize
          ? (
              await (async () => {
                opts?.onChunkReset?.();
                return generateResponseWithRetry({
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
                  signal: opts?.signal,
                  onChunk: opts?.onChunk,
                  onChunkReset: opts?.onChunkReset,
                  idleTimeoutMs: getStoryStreamIdleTimeoutMs(model),
                });
              })()
            ).content
          : assistantContent.content;

        const formatRewritePrompt = [
          "Rewrite the following story scene into the required Story Engine transcript grammar.",
          "Do not add new story beats. Rewrite only for format, clarity, and compliance.",
          allowDirectedPlayerControl
            ? "Do not repeat the latest Director note verbatim. Realize it as scene content and continue from the next beat."
            : "Do not re-narrate the latest player message. Treat it as established scene state and continue from the next beat.",
          allowDirectedPlayerControl ? formatDirectorNoteInterpretationGuidance() : "",
          "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
          "Only resolve success or failure when the player's message leaves the outcome open as an attempt.",
          "Formatting rules (strict):",
          "- Every paragraph must begin with either a character name followed by a colon (e.g. Morgan: *action* \"dialogue\") or 'Narrator:' followed by the narration in *...*.",
          "- Every character line must start with 'Name:'.",
          "- Actions must be wrapped as *...* (asterisks only for actions).",
          '- Dialogue must be wrapped in double quotes like \"...\"',
          "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
          "- Narration must use the format: Narrator: *prose text.*",
          "- Raw italic prose without a speaker label is forbidden. Never emit *...* or _..._ blocks without a Narrator: prefix.",
          "Mystery rule (strict):",
          "- If the player introduces an unknown situation, unidentified person, undisclosed discovery, unexplained emergency, mystery, secret, or unusual event, do not invent or reveal the underlying explanation unless the player explicitly provides it.",
          "Information ownership rule (strict):",
          "- Do not invent facts that could only have been communicated by the player character off-screen.",
          "- If NPCs lack details, they must ask clarifying questions instead of asserting specifics as if the player already said them.",
          allowDirectedPlayerControl
            ? "- Never write lines that pretend the Director note was spoken aloud in-scene."
            : "- Never write lines like 'You're saying X' or 'You said X' unless X is explicitly present in the player's message or already established in prior story events/state.",
          "Ownership rules (strict):",
          formatPlayerCharacterOwnershipRulesForRewrite(playerCharacter, allowDirectedPlayerControl),
          allowDirectedPlayerControl
            ? "- Do not treat the Director note itself as in-world dialogue."
            : "- Never continue the player's action chain beyond consequences and NPC/world reactions.",
          "Sanitization rules:",
          allowDirectedPlayerControl
            ? "- Never repeat the latest Director note."
            : "- Never repeat the latest player message.",
          "- Never use asterisks for emphasis.",
        ].join("\n");

        const ownershipRewritePrompt = [
          "Rewrite the following story scene to remove any player-character dialogue, actions, thoughts, feelings, decisions, or internal monologue.",
          formatPlayerCharacterOwnershipRulesForRewrite(playerCharacter, false),
          "Never narrate actions/thoughts for the player character.",
          "Remove any repetition of the latest player message.",
          "Keep continuity, character voice, and natural pacing.",
          "Do not re-narrate the latest player message. Treat it as established scene state and continue from the next beat.",
          "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
          "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
          "Formatting rules:",
          "- Every character line must start with 'Name:'.",
          "- Actions must be wrapped as *...* (asterisks only for actions).",
          '- Dialogue must be wrapped in double quotes like \"...\"',
          "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
          "- Narration must use the format: Narrator: *prose text.*",
          "- Every paragraph must begin with either a character name followed by a colon or 'Narrator:' followed by narration in *...*.",
          "- Assign each speaker only their own dialogue and actions. Never label another character's line with the player character's name.",
          "Mystery rule:",
          "- If the player introduces an unknown situation, unidentified person, undisclosed discovery, unexplained emergency, mystery, secret, or unusual event, do not invent or reveal the underlying explanation unless the player explicitly provides it.",
          "Information ownership rule:",
          "- Do not invent facts that could only have been communicated by the player character off-screen.",
          "- If NPCs lack details, they must ask clarifying questions instead of asserting specifics as if the player already said them.",
          allowDirectedPlayerControl
            ? "- Never write lines that pretend the Director note was spoken aloud in-scene."
            : "- Never write lines like 'You're saying X' or 'You said X' unless X is explicitly present in the player's message or already established in prior story events/state.",
        ].join("\n");

        const hiddenDialogueInferencePattern =
          /\b(you're saying|you said|as you said|like you said|from what you said)\b/i;
        const hiddenDialogueRewritePrompt = [
          "Rewrite the following scene to remove any hidden inference of player dialogue or player-only information.",
          allowDirectedPlayerControl
            ? `The latest Director note is:\n${previousMessage.content}`
            : `The latest player message is:\n${previousMessage.content}`,
          `The player character is: ${resolvePlayerCharacterPreferredSceneName(playerCharacter)}.`,
          formatPlayerCharacterPronounAndNamingRules(playerCharacter),
          allowDirectedPlayerControl
            ? "Do not repeat the Director note as dialogue. Realize it as scene content and continue naturally."
            : "Do not re-narrate the latest player message. Treat it as established scene state and continue from the next beat.",
          "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
          allowDirectedPlayerControl
            ? "Do not attribute the Director note to what the player character said."
            : "Do not attribute extra details to what the player said.",
          "If NPCs need details, have them ask clarifying questions.",
          "Do not invent diagnoses, causes, or specifics unless already established in prior story events/state or explicitly present in the latest player message.",
          "Formatting rules:",
          "- Every character line must start with 'Name:'.",
          "- Actions must be wrapped as *...* (asterisks only for actions).",
          '- Dialogue must be wrapped in double quotes like \"...\"',
          "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
          "- Narration must use the format: Narrator: *prose text.*",
          "- Every paragraph must begin with either a character name followed by a colon or 'Narrator:' followed by narration in *...*.",
          "- Assign each speaker only their own dialogue and actions. Never label another character's line with the player character's name.",
          "Never use asterisks for emphasis.",
        ].join("\n");

        const sceneStateRewritePrompt = [
          allowDirectedPlayerControl
            ? "Rewrite the following scene to remove any re-narration of the latest Director note."
            : "Rewrite the following scene to remove any re-narration of the latest player-established scene state.",
          allowDirectedPlayerControl
            ? `The latest Director note is staging guidance, not spoken dialogue:\n${previousMessage.content}`
            : `The latest player message is canon scene state:\n${previousMessage.content}`,
          "Do not restate those facts in new words. Continue from the current moment and show consequences and NPC/world reactions.",
          "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
          "If a character enters/arrives or a reveal is already stated by the player, start after that moment (reactions, responses, new beats).",
          "Formatting rules:",
          "- Every character line must start with 'Name:'.",
          "- Actions must be wrapped as *...* (asterisks only for actions).",
          '- Dialogue must be wrapped in double quotes like \"...\"',
          "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
          "- Narration must use the format: Narrator: *prose text.*",
          "- Every paragraph must begin with either a character name followed by a colon or 'Narrator:' followed by narration in *...*.",
          "- Assign each speaker only their own dialogue and actions. Never label another character's line with the player character's name.",
          "Never use asterisks for emphasis.",
          "Ownership rules:",
          formatPlayerCharacterOwnershipRulesForRewrite(playerCharacter, allowDirectedPlayerControl),
        ].join("\n");

        const { text: finalStreamText } = await resolveStreamedAssistantTranscript({
          initialText: finalAssistantText,
          latestUserMessage: previousMessage.content,
          playerName: playerNameForValidation,
          allowDirectedPlayerControl,
          hiddenDialoguePattern: hiddenDialogueInferencePattern,
          rewritePrompts: {
            format: formatRewritePrompt,
            ownership: ownershipRewritePrompt,
            hiddenDialogue: hiddenDialogueRewritePrompt,
            sceneState: sceneStateRewritePrompt,
          },
          providerType,
          provider,
          apiKey,
          model,
          signal: opts?.signal,
          onChunk: opts?.onChunk,
          onChunkReset: opts?.onChunkReset,
          reportStreamAttempt,
          streamIdleTimeoutMs: getStoryStreamIdleTimeoutMs(model),
          traceId,
          storyId,
        });

        const nextAssistantMessage: StoryMessage = {
          ...lastMessage,
          content: finalStreamText,
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

        await assertStoryWritable(currentMessage.storyId);

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
      async sendMetaChatMessage(scopeId, content) {
        const trimmed = content.trim();
        if (!trimmed) {
          throw new Error("Message content is required.");
        }
        const existingReferences =
          storyUiStates.find((record) => record.storyId === scopeId)?.metaChatReferences ?? [];
        const resolvedReferences = mergeMetaChatReferences(
          existingReferences,
          resolveInlineMetaChatReferences(trimmed),
        );
        const userMessage: StoryMetaMessage = {
          id: createEntityId("story-meta-message"),
          storyId: scopeId,
          role: "user",
          content: trimmed,
          timestamp: new Date().toISOString(),
          referenceSnapshot: resolvedReferences,
        };

        await repository.saveStoryMetaMessage(userMessage);
        const assistantText = await generateMetaChatAssistantReply(
          scopeId,
          trimmed,
          resolvedReferences,
        );

        const assistantMessage: StoryMetaMessage = {
          id: createEntityId("story-meta-message"),
          storyId: scopeId,
          role: "assistant",
          content: assistantText.trim(),
          timestamp: new Date().toISOString(),
          referenceSnapshot: resolvedReferences,
        };

        await repository.saveStoryMetaMessage(assistantMessage);
        // #region debug-point D:metachat-save
        reportGenerationAudit({
          hypothesisId: "D",
          location: "StoryEngineProvider.tsx:sendMetaChatMessage:save",
          msg: "MetaChat response saved",
          data: {
            storyId: scopeId,
            savedOutput: assistantMessage.content,
            savedLength: assistantMessage.content?.length ?? 0,
          },
        });
        // #endregion
        await saveStoryUiStateRecord(scopeId, {
          metaChatDraft: "",
          metaChatReferences: resolvedReferences,
        });
        await hydrate(false);
        return assistantMessage ?? userMessage;
      },
      queueMetaChatMessage,
      async setMetaChatDraft(scopeId, draft) {
        await saveStoryUiStateRecord(scopeId, { metaChatDraft: draft });
      },
      async clearMetaChatDraft(scopeId) {
        await saveStoryUiStateRecord(scopeId, { metaChatDraft: "" });
      },
      async setMetaChatReferences(scopeId, references) {
        await saveStoryUiStateRecord(scopeId, {
          metaChatReferences: mergeMetaChatReferences(references),
        });
      },
      async resetMetaChatConversation(scopeId) {
        const [scopeMessages, jobs] = await Promise.all([
          repository.listStoryMetaMessages(scopeId),
          repository.listBackgroundJobs(),
        ]);
        await Promise.all(
          scopeMessages.map((message) => repository.deleteStoryMetaMessage(message.id)),
        );
        await Promise.all(
          jobs
            .filter(
              (job) =>
                job.storyId === scopeId &&
                job.type === "metachat_generate" &&
                (job.status === "queued" || job.status === "running"),
            )
            .map((job) => cancelBackgroundJob(job.id)),
        );
        await saveStoryUiStateRecord(scopeId, { metaChatDraft: "" });
        await hydrate(false);
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
          const [storyState, messages] = await Promise.all([
            repository.getStoryState(storyId),
            repository.listStoryMessages(storyId),
          ]);
          const indexStatus = getArchiveIndexStatus(storyState, {
            currentMessageCount: messages.length,
          });

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
        const story = await repository.getStory(storyId);
        const playerCharacter = story
          ? await repository.getPlayerCharacter(story.playerCharacterId)
          : null;
        const existing = await repository.getStoryState(storyId);
        const parsed = existing?.stateJson
          ? (() => { try { return JSON.parse(existing.stateJson); } catch { return {}; } })()
          : {};
        const messageCount =
          typeof parsed.indexes?.messageCount === "number" && Number.isFinite(parsed.indexes.messageCount)
            ? Math.trunc(parsed.indexes.messageCount)
            : (await repository.listStoryMessages(storyId)).length;
        const reconciledIndexes = reconcileStoryIndexes(
          { ...(parsed.indexes ?? {}), relationships },
          messageCount,
          {
            playerName: playerCharacter?.name,
            playerAliases: normalizePlayerCharacterAliases(playerCharacter?.aliases),
            universeImportedCharacters: story?.universePackSnapshot?.universe?.importedCharacters ?? [],
          },
        );
        const next = {
          ...parsed,
          indexes: reconciledIndexes ?? { ...(parsed.indexes ?? {}), relationships },
        };
        await repository.saveStoryState({
          id: `story-state:${storyId}`,
          storyId,
          stateJson: JSON.stringify(next),
          updatedAt: new Date().toISOString(),
        });
      },
      async loadStoryRelationships(storyId) {
        const story = await repository.getStory(storyId);
        if (!story) return [];

        const [playerCharacter, storyState, messages] = await Promise.all([
          repository.getPlayerCharacter(story.playerCharacterId),
          repository.getStoryState(storyId),
          repository.listStoryMessages(storyId),
        ]);

        const stateJson = storyState?.stateJson ?? "";
        const universeImportedCharacters =
          story.universePackSnapshot?.universe?.importedCharacters ?? [];

        const { relationships, changed } = reconcileRelationshipsFromStateJson(stateJson, {
          playerName: playerCharacter?.name,
          playerAliases: normalizePlayerCharacterAliases(playerCharacter?.aliases),
          universeImportedCharacters,
          messageCount: messages.length,
        });

        if (changed && storyState) {
          const parsed = stateJson
            ? (() => { try { return JSON.parse(stateJson) as Record<string, unknown>; } catch { return {}; } })()
            : {};
          const reconciledIndexes = reconcileStoryIndexes(
            {
              ...((parsed.indexes as StoryIndexesV2 | undefined) ?? {}),
              relationships,
            },
            messages.length,
            {
              playerName: playerCharacter?.name,
              playerAliases: normalizePlayerCharacterAliases(playerCharacter?.aliases),
              universeImportedCharacters,
            },
          );
          await repository.saveStoryState({
            id: `story-state:${storyId}`,
            storyId,
            stateJson: JSON.stringify({
              ...parsed,
              indexes: reconciledIndexes ?? { relationships },
            }),
            updatedAt: new Date().toISOString(),
          });
        }

        return relationships;
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
      queueAudiobookJob,
      beginAudiobookPlaybackBackgroundTask,
      promoteQueuedAudiobookListenTasks,
      updateAudiobookPlaybackBackgroundTask,
      finishAudiobookPlaybackBackgroundTask,
      queueAiDocumentJob,
      queuePodcastAudioJob,
      cancelBackgroundJob,
      reorderBackgroundTaskJob,
      cancelStoryIndexing,
      clearStoryIndex,
      queueGuidedChapterJob,
      cancelGuidedChapterGeneration,
      generateGuidedChapterPlan,
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
        const nextMetachatModels = next.metachatModels ?? {};
        const nextIndexingModels = next.indexingModels ?? {};
        const nextCreationModels = next.creationModels ?? {};
        const apiKeys = {
          ...(current?.apiKeys ?? {}),
          ...Object.fromEntries(
            Object.entries(nextApiKeys).filter((entry) => entry[1]?.trim()),
          ),
        } as Partial<Record<AIProviderType, string>>;
        const mergeModelMaps = (
          currentMap: Partial<Record<AIProviderType, string>> | undefined,
          nextMap: Partial<Record<AIProviderType, string>>,
        ) =>
          ({
            ...(currentMap ?? {}),
            ...Object.fromEntries(
              Object.entries(nextMap).filter((entry) => entry[1]?.trim()),
            ),
          }) as Partial<Record<AIProviderType, string>>;
        const defaultModels = mergeModelMaps(current?.defaultModels, nextDefaultModels);
        const metachatModels = mergeModelMaps(current?.metachatModels, nextMetachatModels);
        const indexingModels = mergeModelMaps(current?.indexingModels, nextIndexingModels);
        const creationModels = mergeModelMaps(current?.creationModels, nextCreationModels);
        const geminiPodcastTts = next.geminiPodcastTts
          ? resolveGeminiPodcastTtsSettings({
              ...current?.geminiPodcastTts,
              ...next.geminiPodcastTts,
            })
          : current?.geminiPodcastTts
            ? resolveGeminiPodcastTtsSettings(current.geminiPodcastTts)
            : undefined;
        const geminiNarrationTts = next.geminiNarrationTts
          ? resolveGeminiNarrationTtsSettings({
              ...current?.geminiNarrationTts,
              ...next.geminiNarrationTts,
            })
          : current?.geminiNarrationTts
            ? resolveGeminiNarrationTtsSettings(current.geminiNarrationTts)
            : undefined;
        const maxConcurrentBackgroundTasks = resolveMaxConcurrentBackgroundTasks(
          next.maxConcurrentBackgroundTasks ?? current?.maxConcurrentBackgroundTasks,
        );

        const settings: AISettings = {
          id: "ai-settings",
          activeProviderType: next.activeProviderType,
          apiKeys,
          defaultModels,
          metachatModels,
          indexingModels,
          creationModels,
          geminiPodcastTts,
          geminiNarrationTts,
          maxConcurrentBackgroundTasks,
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
        const existing = await repository.getStoryAIConfig(next.storyId);
        const now = new Date().toISOString();
        const record: StoryAIConfig = {
          id: existing?.id ?? createEntityId("story-ai-config"),
          storyId: next.storyId,
          providerType: next.providerType,
          model: next.model?.trim() || undefined,
          audiobookParallelChapters:
            next.audiobookParallelChapters !== undefined
              ? clampAudiobookParallelChapters(next.audiobookParallelChapters)
              : existing?.audiobookParallelChapters,
          audiobookPerformanceMode:
            next.audiobookPerformanceMode !== undefined
              ? normalizeAudiobookPerformanceMode(next.audiobookPerformanceMode)
              : existing?.audiobookPerformanceMode,
          createdAt: existing?.createdAt ?? now,
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

        const [universeContext, playerCharacter, storyConfig] = await Promise.all([
          resolveStoryUniverseContext({
            story,
            getUniverse: repository.getUniverse,
            listUniverseImports: repository.listUniverseImports,
          }),
          repository.getPlayerCharacter(story.playerCharacterId),
          repository.getStoryAIConfig(storyId),
        ]);

        if (!playerCharacter) {
          throw new Error("Story references missing player character.");
        }

        const settings = await getNormalizedAISettings();
        if (!settings) {
          throw new Error("Configure an AI provider in Settings before using Player Assist.");
        }

        const providerType = storyConfig?.providerType ?? settings.activeProviderType;
        const { apiKey, model } = await resolveAIProfile(providerType, storyConfig?.model, "story");
        const provider = createAIProvider(providerType);

        const [summaries, refreshedMessages] = await Promise.all([
          repository.listStorySummaries(storyId),
          repository.listStoryMessages(storyId),
        ]);

        const sortedMessages = sortByTimestampAsc(refreshedMessages);
        const existingText = opts?.existingText;
        const existingTrimmed = existingText?.trim() ?? "";
        const useDirectorAssist =
          storyHasGeneratedScenes(sortedMessages) || /^\s*Director:/i.test(existingTrimmed);
        const recentMessages = useDirectorAssist
          ? sortedMessages
          : sortedMessages.slice(-30);
        const effectiveUniverse = universeContext.universe;
        const effectiveImports = universeContext.imports;
        const context = useDirectorAssist
          ? buildDirectorAssistContext({
              universe: effectiveUniverse,
              story,
              playerCharacter,
              imports: effectiveImports,
              summaries,
              recentMessages,
              existingText,
            })
          : buildPlayerAssistContext({
              universe: effectiveUniverse,
              story,
              playerCharacter,
              imports: effectiveImports,
              summaries,
              recentMessages,
              existingText,
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
        if (useDirectorAssist) {
          if (!existing?.trim()) {
            return formatDirectorAssistOutput(raw);
          }

          return formatDirectorAssistContinuation(raw, existing.trimEnd());
        }

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
        const { apiKey, model } = await resolveAIProfile(providerType, undefined, "creation");
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
          "notes",
        ];
        const requestedFields = fields?.length ? fields : allowedFields;
        const generatorFields = requestedFields.filter((field) =>
          allowedFields.includes(field),
        ) as PlayerCharacterField[];

        const knownTies = normalizePlayerCharacterKnownTies(existing?.knownTies);
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
          knownTiesConstraint: formatCharacterKnownTiesConstraint(existing),
          antiCanonSprawlGuidance: formatAntiCanonSprawlGuidance(knownTies.length > 0),
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
            maxTokens: 3000,
            temperature: 0,
            jsonMode: true,
          });
        } catch (error) {
          rethrowUserFacingGenerationError(error, providerType);
        }

        const jsonText =
          extractFirstJsonObject(response.content) ??
          tryRepairTruncatedJson(response.content) ??
          response.content.trim();
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
      async generatePlayerCharacterConcept(universeId, existing) {
        const settings = await getNormalizedAISettings();
        if (!settings) {
          throw new Error("Configure an AI provider in Settings before generating characters.");
        }

        const providerType = settings.activeProviderType;
        const { apiKey, model } = await resolveAIProfile(providerType, undefined, "creation");
        const provider = createAIProvider(providerType);

        const trimmedUniverseId = universeId?.trim() ?? "";
        const universe = trimmedUniverseId
          ? await repository.getUniverse(trimmedUniverseId)
          : null;
        const imports = universe ? await repository.listUniverseImports(trimmedUniverseId) : [];
        const importedLoreText = imports[0]?.importedText?.slice(0, 12000) ?? "";

        const previousConcept = existing?.characterConcept?.trim() || undefined;
        const knownTies = normalizePlayerCharacterKnownTies(existing?.knownTies);
        const systemPrompt = buildCharacterConceptGeneratorSystemPrompt({
          universe,
          importedLoreText,
          existing: buildCharacterConceptConstraintsFromDraft(existing),
          aliasConstraint: formatCharacterConceptAliasesConstraint(existing),
          knownTiesConstraint: formatCharacterKnownTiesConstraint(existing),
          antiCanonSprawlGuidance: formatAntiCanonSprawlGuidance(knownTies.length > 0),
          previousConcept,
        });
        const requestConfig = getCharacterConceptRequestConfig(model);
        const characterName = existing?.name?.trim() || undefined;
        let lastConcept = "";

        for (let attempt = 0; attempt < CHARACTER_CONCEPT_MAX_ATTEMPTS; attempt += 1) {
          let response: GenerateResponseResult;
          try {
            response = await generateResponseWithRetry({
              providerType,
              provider,
              apiKey,
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: buildCharacterConceptUserPrompt(attempt, previousConcept) },
              ],
              maxTokens: requestConfig.maxTokens,
              temperature: 0.95,
              thinking:
                providerType === "gemini"
                  ? resolveGeminiMinimalThinkingSettings(model)
                  : undefined,
              timeoutMs: requestConfig.timeoutMs,
              maxAttempts: requestConfig.maxAttempts,
            });
          } catch (error) {
            rethrowUserFacingGenerationError(error, providerType);
          }

          const concept = normalizeGeneratedCharacterConcept(response.content);
          lastConcept = concept;

          if (isCompleteCharacterConcept(concept, characterName)) {
            return concept;
          }
        }

        if (lastConcept) {
          rethrowUserFacingGenerationError(
            createAIGenerationError(
              "parse",
              "Character concept generation returned an incomplete pitch. Try again or choose a different creation model.",
              { diagnostic: lastConcept.slice(0, 400) },
            ),
            providerType,
          );
        }

        rethrowUserFacingGenerationError(
          createAIGenerationError(
            "parse",
            "Character concept generation returned empty text. Try again or choose a different creation model.",
          ),
          providerType,
        );
      },
      async sendChatMessage(storyId, content, opts) {
        const trimmed = content.trim();

        if (!trimmed) {
          throw new Error("Message content is required.");
        }

        const activeGuidedJob = backgroundJobs.find(
          (candidate) =>
            candidate.type === "guided_chapter_generate" &&
            candidate.storyId === storyId &&
            (candidate.status === "queued" || candidate.status === "running"),
        );
        if (activeGuidedJob && !opts?.guidedGenerationInternal) {
          throw new Error(
            "Guided chapter generation is in progress. Wait for it to finish or cancel it before sending chat.",
          );
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

        const story = await assertStoryWritable(storyId);

        const [universeContext, playerCharacter] = await Promise.all([
          resolveStoryUniverseContext({
            story,
            getUniverse: repository.getUniverse,
            listUniverseImports: repository.listUniverseImports,
          }),
          repository.getPlayerCharacter(story.playerCharacterId),
        ]);

        if (!playerCharacter) {
          throw new Error("Story references missing player character.");
        }

        const effectiveUniverse = universeContext.universe;
        const effectiveImports = universeContext.imports;

        const existingMessages = await repository.listStoryMessages(storyId);
        const lastMessage = existingMessages[existingMessages.length - 1];
        const prefix = extractSpeakerPrefix(trimmed);
        const strippedUserContent = (prefix?.strippedContent ?? trimmed).trim();
        const isContinueInstruction =
          !prefix ? isContinueInstructionText(trimmed) : isContinueSpeakerLabel(prefix.speakerLabel);
        const authorDirective = resolveAuthorDirective(prefix?.speakerLabel);
        const expectedUserSpeakerType = resolveUserSpeakerTypeForContinue(
          isContinueInstruction,
          resolveUserSpeakerTypeForAuthorDirective(
            authorDirective,
            resolveUserSpeakerType(prefix?.speakerLabel, "player"),
          ),
        );
        const expectedUserSpeakerName = resolveUserSpeakerNameForContinue(
          isContinueInstruction,
          resolveUserSpeakerNameForAuthorDirective(
            authorDirective,
            resolveUserSpeakerName(prefix?.speakerLabel, undefined, expectedUserSpeakerType),
          ),
        );

        const shouldReuseLastUserMessage =
          lastMessage?.role === "user" &&
          lastMessage.content.trim() === strippedUserContent &&
          (lastMessage.speakerType ?? "player") === expectedUserSpeakerType &&
          (lastMessage.speakerName?.trim() || undefined) === expectedUserSpeakerName &&
          JSON.stringify(lastMessage.authorDirective ?? null) === JSON.stringify(authorDirective ?? null) &&
          lastMessage.storyId === storyId;
        const detectedDirectorIntent = authorDirective || isContinueInstruction
          ? undefined
          : opts?.directorIntentOverride ?? detectDirectorIntent(strippedUserContent);
        const detectedChapterBoundary = authorDirective || isContinueInstruction
          ? { detected: false as const }
          : detectChapterBoundary(strippedUserContent);
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
              speakerName: expectedUserSpeakerName,
              speakerType: expectedUserSpeakerType,
              ...(authorDirective ? { authorDirective } : {}),
              ...(detectedDirectorIntent ? { directorIntent: detectedDirectorIntent } : {}),
              ...(chapterBoundary ? { chapterBoundary } : {}),
            };

        if (!shouldReuseLastUserMessage) {
          await repository.saveStoryMessage(userMessage);
        } else if (
          (lastMessage.speakerName?.trim() || undefined) !== expectedUserSpeakerName ||
          (lastMessage.speakerType ?? "player") !== expectedUserSpeakerType ||
          JSON.stringify(lastMessage.authorDirective ?? null) !== JSON.stringify(authorDirective ?? null) ||
          JSON.stringify(lastMessage.directorIntent ?? null) !== JSON.stringify(detectedDirectorIntent ?? null) ||
          JSON.stringify(lastMessage.chapterBoundary ?? null) !== JSON.stringify(chapterBoundary ?? null)
        ) {
          await repository.saveStoryMessage({
            ...lastMessage,
            speakerName: expectedUserSpeakerName,
            speakerType: expectedUserSpeakerType,
            authorDirective,
            directorIntent: detectedDirectorIntent ?? undefined,
            chapterBoundary,
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

        const [summaries, refreshedMessages, storyConfig, storyState, storedChapters] = await Promise.all([
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
          chapterBoundary?.kind === "start" || chapterBoundary?.label === "The End"
            ? getExistingActiveChapterLabel(storyId, existingMessages, storedChapters)
            : null;
        const previousStoryMessage =
          userMessageIndex > 0 ? sortedForNumbering[userMessageIndex - 1] : null;
        const createdChapter = (() => {
          if (chapterBoundary?.kind === "end") {
            const resolvedChapterLabel =
              chapterBoundary.label === "The End"
                ? previousActiveChapterLabel ?? "Chapter I"
                : chapterBoundary.label;
            if (storedChapters.some((chapter) => chapter.endsAtMessageId === userMessage.id)) {
              return null;
            }
            return {
              id: createEntityId("story-chapter"),
              storyId,
              label: resolvedChapterLabel,
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

        const shouldSkipAssistantResponse = Boolean(opts?.skipAssistantResponse || authorDirective);
        if (shouldSkipAssistantResponse) {
          if (authorDirective) {
            await syncAuthorDirectiveStateForStory(storyId);
            void runDeepIndexProcess(storyId, { trigger: "auto" }).catch(() => undefined);
          }
          await touchStory(storyId);
          await hydrate(false);
          return {
            message: userMessage,
            appliedRpChanges: null,
            pendingCoreStatChanges: null,
            rpEventSummary: null,
          };
        }

        const settings = await getNormalizedAISettings();

        if (!settings) {
          throw new Error("Configure an AI provider in Settings before generating scenes.");
        }

        const providerType = storyConfig?.providerType ?? settings.activeProviderType;
        const { apiKey, model } = await resolveAIProfile(providerType, storyConfig?.model, "story");
        const provider = createAIProvider(providerType);

        const playerNameForValidation = buildPlayerNameForValidation(
          playerCharacter,
          storyState?.stateJson,
        );

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
            content: normalizeTranscriptForDisplay(message.content),
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

        const shouldSkipAssistantReply = Boolean(chapterBoundary);
        const latestPriorUserMessage = getLatestPriorUserMessage(historyMessages);
        const allowDirectedPlayerControl = (() => {
          if (isContinueInstruction && opts?.directorStagingNote?.trim()) {
            return true;
          }
          if (isContinueInstruction && opts?.guidedDirectedScene) {
            return true;
          }
          return shouldAllowDirectedPlayerControlForUserTurn(
            userMessage,
            latestPriorUserMessage,
          );
        })();
        let assistantMessage: StoryMessage | null = null;
        let appliedRpChanges: RpChangelogEntry[] | null = null;
        let pendingCoreStatChanges: RpStatDelta[] | null = null;
        let rpEventSummary: string | null = null;
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
            latestUserMessageSpeakerType: userMessage.speakerType,
            allowDirectedPlayerControl,
            directorIntent: userMessage.directorIntent ?? null,
            directorStagingNote: opts?.directorStagingNote,
            guidedDirectedScene: opts?.guidedDirectedScene ?? false,
            guidedChapterContext: opts?.guidedChapterContext,
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

          const streamAttempt = { current: 0 };
          const reportStreamAttempt = () => {
            reportStreamGenerationAttempt(opts?.onGenerationAttempt, streamAttempt);
          };
          reportStreamGenerationAttempt(opts?.onGenerationAttempt, streamAttempt);

          let assistantContent: GenerateResponseResult;
          try {
            assistantContent = await generateResponseWithRetry({
              providerType,
              provider,
              apiKey,
              model,
              messages: context,
              maxTokens: opts?.guidedChapterContext ? 4096 : undefined,
              signal: opts?.signal,
              idleTimeoutMs: getStoryStreamIdleTimeoutMs(model),
              onChunk: opts?.onChunk,
              onChunkReset: opts?.onChunkReset,
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
                  latestUserMessageSpeakerType: userMessage.speakerType,
                  allowDirectedPlayerControl,
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
                await (async () => {
                  opts?.onChunkReset?.();
                  return generateResponseWithRetry({
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
                    signal: opts?.signal,
                    onChunk: opts?.onChunk,
                    onChunkReset: opts?.onChunkReset,
                    idleTimeoutMs: getStoryStreamIdleTimeoutMs(model),
                    debugTrace: {
                      traceId,
                      mode: "story",
                      storyId,
                      stage: "size-rewrite",
                      lastUserText: assistantContent.content,
                    },
                  });
                })()
              ).content
            : assistantContent.content;

          const formatRewritePrompt = [
            "Rewrite the following story scene into the required Story Engine transcript grammar.",
            "Do not add new story beats. Rewrite only for format, clarity, and compliance.",
            allowDirectedPlayerControl
              ? "Do not repeat the latest Director note verbatim. Realize it as scene content and continue from the next beat."
              : "Do not re-narrate the latest player message. Treat it as established scene state and continue from the next beat.",
            allowDirectedPlayerControl ? formatDirectorNoteInterpretationGuidance() : "",
            "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
            "Only resolve success or failure when the player's message leaves the outcome open as an attempt.",
            "Formatting rules (strict):",
            "- Every paragraph must begin with either a character name followed by a colon (e.g. Morgan: *action* \"dialogue\") or 'Narrator:' followed by the narration in *...*.",
            "- Every character line must start with 'Name:'.",
            "- Actions must be wrapped as *...* (asterisks only for actions).",
            '- Dialogue must be wrapped in double quotes like "..."',
            "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
            "- Narration must use the format: Narrator: *prose text.*",
            "- Raw italic prose without a speaker label is forbidden. Never emit *...* or _..._ blocks without a Narrator: prefix.",
            "Mystery rule (strict):",
            "- If the player introduces an unknown situation, unidentified person, undisclosed discovery, unexplained emergency, mystery, secret, or unusual event, do not invent or reveal the underlying explanation unless the player explicitly provides it.",
            "Information ownership rule (strict):",
            "- Do not invent facts that could only have been communicated by the player character off-screen.",
            "- If NPCs lack details, they must ask clarifying questions instead of asserting specifics as if the player already said them.",
            allowDirectedPlayerControl
              ? "- Never write lines that pretend the Director note was spoken aloud in-scene."
              : "- Never write lines like 'You're saying X' or 'You said X' unless X is explicitly present in the player's message or already established in prior story events/state.",
            "Ownership rules (strict):",
            formatPlayerCharacterOwnershipRulesForRewrite(playerCharacter, allowDirectedPlayerControl),
            allowDirectedPlayerControl
              ? "- Do not treat the Director note itself as in-world dialogue."
              : "- Never continue the player's action chain beyond consequences and NPC/world reactions.",
            "Sanitization rules:",
            allowDirectedPlayerControl
              ? "- Never repeat the latest Director note."
              : "- Never repeat the latest player message.",
            "- Never use asterisks for emphasis.",
          ].join("\n");

          const ownershipRewritePrompt = [
            allowDirectedPlayerControl
              ? "Rewrite the following story scene to preserve the directed scene while removing any formatting or continuity problems."
              : "Rewrite the following story scene to remove any player-character dialogue, actions, thoughts, feelings, decisions, or internal monologue.",
            formatPlayerCharacterOwnershipRulesForRewrite(playerCharacter, allowDirectedPlayerControl),
            allowDirectedPlayerControl
              ? "The latest user message was a Director note, not protagonist dialogue."
              : "",
            allowDirectedPlayerControl
              ? "It is valid for this one rewritten scene to temporarily include player-character dialogue/actions if the directed scene requires it."
              : "Never narrate actions/thoughts for the player character.",
            allowDirectedPlayerControl
              ? "Do not treat the Director note itself as dialogue spoken by the player character."
              : "Remove any repetition of the latest player message.",
            "Keep continuity, character voice, and natural pacing.",
            allowDirectedPlayerControl
              ? "Do not repeat the Director note verbatim. Realize it as scene content and continue from the next beat."
              : "Do not re-narrate the latest player message. Treat it as established scene state and continue from the next beat.",
            "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
            "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
            "Formatting rules:",
            "- Every character line must start with 'Name:'.",
            "- Actions must be wrapped as *...* (asterisks only for actions).",
            '- Dialogue must be wrapped in double quotes like "..."',
            "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
            "- Narration must use the format: Narrator: *prose text.*",
          "- Every paragraph must begin with either a character name followed by a colon or 'Narrator:' followed by narration in *...*.",
          "- Assign each speaker only their own dialogue and actions. Never label another character's line with the player character's name.",
            "Mystery rule:",
            "- If the player introduces an unknown situation, unidentified person, undisclosed discovery, unexplained emergency, mystery, secret, or unusual event, do not invent or reveal the underlying explanation unless the player explicitly provides it.",
            "Information ownership rule:",
            "- Do not invent facts that could only have been communicated by the player character off-screen.",
            "- If NPCs lack details, they must ask clarifying questions instead of asserting specifics as if the player already said them.",
            allowDirectedPlayerControl
              ? "- Never write lines that pretend the Director note was spoken aloud in-scene."
              : "- Never write lines like 'You're saying X' or 'You said X' unless X is explicitly present in the player's message or already established in prior story events/state.",
          ].join("\n");

          const hiddenDialogueInferencePattern =
            /\b(you're saying|you said|as you said|like you said|from what you said)\b/i;
          const hiddenDialogueRewritePrompt = [
            "Rewrite the following scene to remove any hidden inference of player dialogue or player-only information.",
            allowDirectedPlayerControl
              ? `The latest Director note is:\n${userMessage.content}`
              : `The latest player message is:\n${userMessage.content}`,
            `The player character is: ${resolvePlayerCharacterPreferredSceneName(playerCharacter)}.`,
            formatPlayerCharacterPronounAndNamingRules(playerCharacter),
            allowDirectedPlayerControl
              ? "Do not repeat the Director note as dialogue. Realize it as scene content and continue naturally."
              : "Do not re-narrate the latest player message. Treat it as established scene state and continue from the next beat.",
            "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
            allowDirectedPlayerControl
              ? "Do not attribute the Director note to what the player character said."
              : "Do not attribute extra details to what the player said.",
            "If NPCs need details, have them ask clarifying questions.",
            "Do not invent diagnoses, causes, or specifics unless already established in prior story events/state or explicitly present in the latest player message.",
            "Formatting rules:",
            "- Every character line must start with 'Name:'.",
            "- Actions must be wrapped as *...* (asterisks only for actions).",
            '- Dialogue must be wrapped in double quotes like \"...\"',
            "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
            "- Narration must use the format: Narrator: *prose text.*",
          "- Every paragraph must begin with either a character name followed by a colon or 'Narrator:' followed by narration in *...*.",
          "- Assign each speaker only their own dialogue and actions. Never label another character's line with the player character's name.",
            "Never use asterisks for emphasis.",
          ].join("\n");

          const sceneStateRewritePrompt = [
            allowDirectedPlayerControl
              ? "Rewrite the following scene to remove any re-narration of the latest Director note."
              : "Rewrite the following scene to remove any re-narration of the latest player-established scene state.",
            allowDirectedPlayerControl
              ? `The latest Director note is staging guidance, not spoken dialogue:\n${userMessage.content}`
              : `The latest player message is canon scene state:\n${userMessage.content}`,
            "Do not restate those facts in new words. Continue from the current moment and show consequences and NPC/world reactions.",
            "Preserve explicit player-declared outcomes as canon. Add consequences, reactions, or new tension instead of contradicting them.",
            "If a character enters/arrives or a reveal is already stated by the player, start after that moment (reactions, responses, new beats).",
            "Formatting rules:",
            "- Every character line must start with 'Name:'.",
            "- Actions must be wrapped as *...* (asterisks only for actions).",
            '- Dialogue must be wrapped in double quotes like \"...\"',
            "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
            "- Narration must use the format: Narrator: *prose text.*",
          "- Every paragraph must begin with either a character name followed by a colon or 'Narrator:' followed by narration in *...*.",
          "- Assign each speaker only their own dialogue and actions. Never label another character's line with the player character's name.",
            "Never use asterisks for emphasis.",
            "Ownership rules:",
            formatPlayerCharacterOwnershipRulesForRewrite(playerCharacter, allowDirectedPlayerControl),
          ].join("\n");

          const { text: finalStreamText } = await resolveStreamedAssistantTranscript({
            initialText: finalAssistantText,
            latestUserMessage: userMessage.content,
            playerName: playerNameForValidation,
            allowDirectedPlayerControl,
            skipSceneStateCheck: opts?.guidedGenerationInternal,
            hiddenDialoguePattern: hiddenDialogueInferencePattern,
            rewritePrompts: {
              format: formatRewritePrompt,
              ownership: ownershipRewritePrompt,
              hiddenDialogue: hiddenDialogueRewritePrompt,
              sceneState: sceneStateRewritePrompt,
            },
            providerType,
            provider,
            apiKey,
            model,
            signal: opts?.signal,
            onChunk: opts?.onChunk,
            onChunkReset: opts?.onChunkReset,
            reportStreamAttempt,
            streamIdleTimeoutMs: getStoryStreamIdleTimeoutMs(model),
            traceId,
            storyId,
          });

          assistantMessage = {
            id: createEntityId("story-message"),
            storyId,
            role: "assistant",
            content: finalStreamText,
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
              const extracted = await extractRpStatChanges(
                finalStreamText,
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
                },
              );
              if (extracted) {
                const { deltas: autoDeltas, narrative, npcHpChanges, pendingTransaction: extractedPendingTx, suggestedCondition, characterStateSummary } = extracted;

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

                if (summary) {
                  const eventEntry: RpEventLogEntry = { ts: Date.now(), summary };
                  const prevLog: RpEventLogEntry[] = Array.isArray(nextStats.eventLog) ? nextStats.eventLog : [];
                  nextStats = { ...nextStats, eventLog: [eventEntry, ...prevLog].slice(0, 100) };

                  const latestState = await repository.getStoryState(storyId);
                  const latestParsed = latestState?.stateJson
                    ? (() => { try { return JSON.parse(latestState.stateJson) as Record<string, unknown>; } catch { return {} as Record<string, unknown>; } })()
                    : {} as Record<string, unknown>;
                  await repository.saveStoryState({
                    id: `story-state:${storyId}`,
                    storyId,
                    stateJson: JSON.stringify({ ...latestParsed, rpStats: nextStats }),
                    updatedAt: new Date().toISOString(),
                  });
                  appliedRpChanges = applied;
                  rpEventSummary = summary;
                } else if (npcSummaryParts.length || nextStats.timeState !== currentRpStats.timeState || extractedPendingTx !== undefined || characterStateSummary || suggestedCondition) {
                  const latestState = await repository.getStoryState(storyId);
                  const latestParsed = latestState?.stateJson
                    ? (() => { try { return JSON.parse(latestState.stateJson) as Record<string, unknown>; } catch { return {} as Record<string, unknown>; } })()
                    : {} as Record<string, unknown>;
                  await repository.saveStoryState({
                    id: `story-state:${storyId}`,
                    storyId,
                    stateJson: JSON.stringify({ ...latestParsed, rpStats: nextStats }),
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
            playerCharacter,
            storyState: await repository.getStoryState(storyId),
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
                  const label = formatTranscriptSpeakerForIndexing(
                    message,
                    playerCharacter.name,
                  );
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
                "Continue lines are continuation notes preserved in the transcript. They are not on-screen beats; use them only to understand that the scene was intentionally allowed to keep unfolding.",
                "Director lines are staging notes preserved in the transcript. Use them as context, but summarize what actually happens in the scene, not the note itself.",
                "Canon/Secret/Reveal/Retcon lines are author declarations preserved in the transcript. Treat them as authoritative continuity constraints, secrecy rules, or retcons, but do not summarize the declaration itself as if it were an on-screen beat.",
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
            if (opts?.guidedGenerationInternal) {
              return;
            }

            const latestStoryState = await repository.getStoryState(storyId);
            const baseParsed = latestStoryState?.stateJson
              ? safeParseStoryStateData(latestStoryState.stateJson)
              : null;
            const preservedState = latestStoryState?.stateJson?.trim()
              ? parseStoryStateJson(latestStoryState.stateJson)
              : normalizeStoryStateToV2(null);

            const baseState = baseParsed ? normalizeStoryStateToV2(baseParsed) : preservedState;
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

            try {
              if (
                baseState.messagesSinceDeepIndexUpdate !== nextDeepCounter ||
                shouldBootstrapAutoDeepAnchor
              ) {
                const now = new Date().toISOString();
                const reconciledIndexes = reconcileStoryIndexes(baseState.indexes, totalMessages, {
                  playerName: playerCharacter.name,
                  playerAliases: normalizePlayerCharacterAliases(playerCharacter.aliases),
                  universeImportedCharacters: story.universePackSnapshot?.universe?.importedCharacters ?? [],
                });

                const patched = withIndexedMetadata(
                  {
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
            } catch {
              // state-save failure — auto-index runs independently below
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

        return { message: assistantMessage, appliedRpChanges, pendingCoreStatChanges, rpEventSummary };
      },
    };
  }, [
    aiSettings,
    assertStoryWritable,
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
    backgroundJobs,
    queueGuidedChapterJob,
    rebuildStatus,
    guidedGenerationStatus,
  ]);

  sendChatMessageRef.current = value.sendChatMessage;

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
