export type EntityId = string;
export type Timestamp = string;

export type StoryMessageRole = "user" | "assistant" | "system";
export type StoryMessageSpeakerType =
  | "player"
  | "continue"
  | "director"
  | "author"
  | "canon"
  | "narrator"
  | "system";
export type StorySpeakerAttributionEvidence =
  | "named-player-action-target"
  | "dialogue-second-person-address"
  | "dialogue-imperative-address"
  | "dialogue-player-vocative";
export interface StorySpeakerAttributionAudit {
  version: 1;
  repairedAt: Timestamp;
  repairs: Array<{
    lineNumber: number;
    from: string;
    to: string;
    evidence: StorySpeakerAttributionEvidence[];
  }>;
}
export type StoryAuthorDirectiveKind = "canon" | "secret" | "reveal" | "retcon";
export type ExportFormat = "json" | "markdown" | "txt" | "pdf";
export type AIProviderType = "openai" | "gemini" | "openrouter" | "anthropic";
export type StoryAdultContentMode =
  | "standard"
  | "mature_non_graphic"
  | "explicit_consensual_adults";
export type DeveloperBugStatus = "open" | "in-progress" | "resolved" | "closed";
export type DeveloperFeaturePriority = "low" | "medium" | "high";
export type BackgroundJobStatus =
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "cancelled";
export type BackgroundJobType =
  | "story_index"
  | "story_audiobook"
  | "ai_document"
  | "podcast_audio"
  | "guided_chapter_generate"
  | "metachat_generate"
  | "story_export"
  | "story_archive_export";
export type MediaAssetCategory = "audiobook" | "chapter" | "ai_document" | "podcast";
export type MediaAssetFormat = "wav" | "opus";

export interface MediaAsset {
  id: EntityId;
  category: MediaAssetCategory;
  libraryKey: string;
  title: string;
  subtitle: string;
  storyId?: EntityId;
  storyTitleSnapshot?: string;
  sourceJobId?: EntityId;
  createdAtMs: number;
  updatedAtMs: number;
  durationMs: number;
  format: MediaAssetFormat;
  mimeType: "audio/wav" | "audio/webm" | "audio/ogg";
  byteLength: number;
  audioBytes: Uint8Array;
  orphaned: boolean;
  lastPositionMs: number;
  lastPlayedAtMs?: number;
  contentDigest?: string;
}
export type MaxConcurrentBackgroundTasks = 1 | 2 | 3 | 4 | 5;
export type MetaChatScopeKind = "story" | "global";
export type MetaChatReferenceKind = "story" | "character" | "universe";

export type SceneParticipantCapabilities = {
  canSpeak: boolean;
  canPerformPhysicalActions: boolean;
  canBeAddressed: boolean;
  canBePhysicallyInteractedWith: boolean;
};

export type SceneParticipantCapabilityOverrideSource =
  | "live_scene_state"
  | "director_instruction";

/**
 * Explicit, scene-scoped capability constraints.
 * Created only by structured live scene-state updates or structured Director
 * instructions. Never inferred from transcript, indexing, or memory.
 */
export type SceneParticipantCapabilityOverride = {
  participantKey: string;
  capabilities: Partial<SceneParticipantCapabilities>;
  source: SceneParticipantCapabilityOverrideSource;
};

export type DirectorIntent = {
  timeSkip?: { unit: "hours" | "days" | "weeks" | "months"; amount: number };
  /** Exact minutes to advance, bypasses unit/amount conversion. Set by slash commands. */
  exactMinutes?: number;
  sceneCut?: boolean;
  target?: string;
  /** Absolute time-of-day set, e.g. from "It's 12pm". Sets clock to this hour:minute without advancing. */
  absoluteTime?: { hour: number; minute: number };
  /** Structured participation directives only. Never inferred from free text. */
  participantCapabilityOverrides?: SceneParticipantCapabilityOverride[];
  /** Explicit Director clear of all current-scene capability overrides. */
  clearParticipantCapabilityOverrides?: boolean;
  /** Explicit Director clear of named participant overrides only. */
  clearedParticipantKeys?: string[];
};

export type StoryAuthorDirective = {
  kind: StoryAuthorDirectiveKind;
};

export type StoryAuthorDirectiveState = {
  canon: string[];
  retcons: string[];
  hiddenSecrets: string[];
  revealedSecrets: string[];
  revealDirectives: string[];
};

export interface UniverseWikiSource {
  url: string;
  label?: string;
  order: number;
}

export interface Universe {
  id: EntityId;
  name: string;
  description: string;
  wikiUrl: string;
  wikiUrls?: UniverseWikiSource[];
  mode?: "referenced" | "custom";
  concept?: string;
  genreTheme?: string;
  tone?: string;
  universeBlueprint?: string;
  notes?: string;
  importedLore: string[];
  importedCharacters: string[];
  importedLocations: string[];
  importedRelationships: string[];
  createdAt: Timestamp;
}

export interface PlayerCharacter {
  id: EntityId;
  name: string;
  aliases?: string[];
  knownTies?: string[];
  age: string;
  gender: string;
  species: string;
  pronouns: string;
  characterConcept?: string;
  appearance: string;
  personality: string;
  background: string;
  goals: string;
  notes: string;
  universeId: EntityId;
  universeIds?: EntityId[];
  scope?: "library" | "story";
  storyId?: EntityId;
  createdAt: Timestamp;
}

export type RpCalendarConfig = {
  monthNames?: string[];    // 12 names; default Gregorian
  weekdayNames?: string[];  // 7 names starting Sunday; default English
  yearSuffix?: string;      // e.g. "CE", "3E", "BBY"
};

export type RpTimeState = {
  year: number;
  month: number;   // 1â€“12
  day: number;     // 1â€“31
  hour: number;    // 0â€“23
  minute: number;  // 0â€“59
  storyDay: number; // days elapsed since story began (1-indexed)
};

export type RpRecurringFrequency = "weekly" | "monthly" | "annually";

export type RpRecurringEvent = {
  id: string;
  label: string;
  amount: number;              // positive = income, negative = expense
  amountMin?: number;          // when both set, a random integer in [amountMin, amountMax] is applied
  amountMax?: number;
  frequency: RpRecurringFrequency;
  dayOfWeek?: number;          // 0=Sun..6=Sat, used for weekly
  dayOfMonth?: number;         // 1-31, used for monthly/annually
  month?: number;              // 1-12, used for annually
  nextDue: RpTimeState;
};

export type RpDiceModifiers = {
  str: number; // -2 to +2
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

export type RpConfig = {
  currencyName: string;
  currencyDecimals: boolean;
  maxHp: number;
  startingGold: number;
  allowDebt?: boolean;
  creditLimit?: number | null;
  calendarConfig?: RpCalendarConfig;
  recurringEvents?: RpRecurringEvent[];
  diceRollsEnabled?: boolean;
  diceModifiers?: RpDiceModifiers;
  birthdayMonth?: number;  // 1-12
  birthdayDay?: number;    // 1-31
};

export type RpNpcHpEntry = {
  name: string;
  current: number;
  max: number;
};

export type RpTransactionType = "income" | "expense" | "adjustment" | "recurring";

export type RpChangelogEntry = {
  ts: number;
  field: string;
  from: number;
  to: number;
  reason: string;
  storyTime?: RpTimeState;
  transactionType?: RpTransactionType;
};

export type RpEventLogEntry = {
  ts: number;
  summary: string;
};

export type RpCondition = {
  id: string;
  label: string;
  addedAt: number;
};

export type PendingTransaction = {
  description: string;
  amount: number;
};

export type PlayerIdentityBasis = {
  playerCharacterId: EntityId;
  sceneName: string;
  pronouns: string;
};

export type PlayerIdentityOverride = {
  playerCharacterId: EntityId;
  sourceMessageId: EntityId;
  source: "player_turn" | "director_instruction" | "author_instruction";
  sceneName?: string;
  pronouns?: string;
};

export type RpStats = {
  hp: number;
  gold: number;
  npcHp: Record<string, RpNpcHpEntry>;
  changelog: RpChangelogEntry[];
  eventLog?: RpEventLogEntry[];
  timeState?: RpTimeState;
  pendingTransaction?: PendingTransaction;
  conditions?: RpCondition[];
  characterState?: string;
  characterStateIdentityBasis?: PlayerIdentityBasis;
  pendingConditionSuggestion?: string;
};

export interface Story {
  id: EntityId;
  title: string;
  universeId: EntityId;
  universeIds?: EntityId[];
  playerCharacterId: EntityId;
  parentStoryId?: EntityId;
  rootStoryId?: EntityId;
  lineageDepth?: number;
  lineageType?: "sequel" | "branch";
  sequelSeedSourceStoryId?: EntityId;
  openingPrompt?: string;
  /** Legacy fields accepted only while migrating persisted records. */
  currentSummary: string;
  autoIndexMode?: "disabled" | "messages" | "chapter";
  autoIndexInterval?: 5 | 10 | 15 | 20 | "disabled";
  indexingCadence?: IndexingCadence;
  universePackSnapshot?: UniversePackSnapshotV1;
  universePackSnapshots?: UniversePackSnapshotV1[];
  isArchived?: boolean;
  readOnlyReason?: "sequel_prequel";
  readOnlyLockedAt?: Timestamp;
  adultContentMode?: StoryAdultContentMode;
  /** Legacy compatibility flag. Prefer adultContentMode for new writes. */
  matureFictionMode?: boolean;
  rpMode?: boolean;
  rpConfig?: RpConfig;
  accentThemeKey?: string;
  accentThemeCustom?: string;
  importedCharacterIds?: EntityId[];
  guidedGenerationMeta?: {
    historyChapterCount?: number;
    historyDividerMessageId?: string;
    lastGuidedBatchAt?: Timestamp;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StoryMessage {
  id: EntityId;
  storyId: EntityId;
  role: StoryMessageRole;
  content: string;
  timestamp: Timestamp;
  speakerName?: string;
  speakerType?: StoryMessageSpeakerType;
  speakerAttribution?: StorySpeakerAttributionAudit;
  directorIntent?: DirectorIntent;
  authorDirective?: StoryAuthorDirective;
  chapterBoundary?: {
    kind: "start" | "end";
    label: string;
  };
  guidedChapterSetup?: {
    overallDirection?: string;
    chapterLabel: string;
    chapterOverview: string;
    scenesPerChapter: number;
    scenes: Array<{
      label: string;
      overview: string;
    }>;
    entry?: "story_history" | "workspace";
    generatedAt: Timestamp;
    jobId?: EntityId;
  };
  editedAt?: Timestamp;
  regeneratedAt?: Timestamp;
  revision?: number;
  storyTime?: RpTimeState;
}

export interface StoryMetaMessage {
  id: EntityId;
  storyId: EntityId;
  role: StoryMessageRole;
  content: string;
  timestamp: Timestamp;
  jobId?: EntityId;
  referenceSnapshot?: MetaChatReference[];
}

export interface MetaChatReference {
  id: EntityId;
  kind: MetaChatReferenceKind;
  label: string;
}

export interface StoryChapter {
  id: EntityId;
  storyId: EntityId;
  label: string;
  endsAtMessageId: EntityId;
  endsAtIndex: number;
  createdAt: Timestamp;
  summary?: string;
}

export interface GeminiPodcastTtsSettings {
  hostOneVoice: string;
  hostTwoVoice: string;
  model: string;
}

export interface GeminiNarrationTtsSettings {
  voice: string;
  characterVoice: string;
  model: string;
}

export type AIModelRole = "story" | "metachat" | "creation" | "indexing";

export type IndexingCadence =
  | "every_message"
  | "every_5_messages"
  | "every_10_messages"
  | "every_15_messages"
  | "every_20_messages"
  | "every_chapter";

export interface AISettings {
  id: "ai-settings";
  activeProviderType: AIProviderType;
  apiKeys: Partial<Record<AIProviderType, string>>;
  /** Story generation, Director, Continue, guided chapters, Story History */
  defaultModels: Partial<Record<AIProviderType, string>>;
  /** MetaChat only */
  metachatModels?: Partial<Record<AIProviderType, string>>;
  indexingModels?: Partial<Record<AIProviderType, string>>;
  /** Character/universe generation and related creation tools */
  creationModels?: Partial<Record<AIProviderType, string>>;
  indexingCadence?: IndexingCadence;
  geminiPodcastTts?: GeminiPodcastTtsSettings;
  geminiNarrationTts?: GeminiNarrationTtsSettings;
  /** Max simultaneous long-running background tasks. */
  maxConcurrentBackgroundTasks?: MaxConcurrentBackgroundTasks;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StoryAIConfig {
  id: EntityId;
  storyId: EntityId;
  providerType: AIProviderType;
  model?: string;
  audiobookParallelChapters?: number;
  audiobookPerformanceMode?: "radio_drama" | "single_narrator";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UniverseImport {
  id: EntityId;
  universeId: EntityId;
  sourceUrl: string;
  sourceLabel?: string;
  title: string;
  importedText: string;
  importedAt: Timestamp;
}

export interface StoryUiState {
  id: EntityId;
  storyId: EntityId;
  metaChatDraft?: string;
  metaChatReferences?: MetaChatReference[];
  characterTtsVoices?: Record<string, string>;
  characterTtsLabels?: Record<string, string>;
  updatedAt: Timestamp;
}

export type BackgroundJobStepStatus = "pending" | "running" | "done" | "failed";

export interface BackgroundJobStep {
	id: string;
	label: string;
	status: BackgroundJobStepStatus;
}

export interface BackgroundJob {
  id: EntityId;
  type: BackgroundJobType;
  storyId?: EntityId;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  finishedAt?: Timestamp;
  status: BackgroundJobStatus;
  progress?: {
    current: number;
    total: number;
    label?: string;
    steps?: BackgroundJobStep[];
  };
  error?: string;
  dedupeKey?: string;
  /** Lower values run first among queued background tasks. */
  queueOrder?: number;
  payload?: {
    trigger?: "manual" | "auto";
    incremental?: boolean;
    rebuild?: boolean;
    content?: string;
    metaChatUserMessageId?: EntityId;
    metaChatOpenOnComplete?: boolean;
    metaChatReferences?: MetaChatReference[];
    exportFormat?: ExportFormat;
    guidedEntry?: "story_history" | "workspace";
    guidedPlan?: {
      overallDirection?: string;
      chapters: Array<{
        label: string;
        overview: string;
        scenesPerChapter: number;
      }>;
    };
    aiDocumentPresetId?: string;
    aiDocumentCustomPrompt?: string;
    aiDocumentStructure?: "single" | "chapter-by-chapter";
    aiDocumentOutputFormat?: "markdown" | "gemini-audio-wav";
    aiDocumentSourceType?: "story" | "upload";
    aiDocumentSourceStoryId?: EntityId;
    aiDocumentSourceLabel?: string;
    aiDocumentSourceText?: string;
    audiobookParallelChapters?: number;
    audiobookPerformanceMode?: "radio_drama" | "single_narrator";
    audiobookPurpose?: "export" | "playback" | "chapter_listen";
    audiobookPlayId?: string;
  };
  result?: {
    messageId?: EntityId;
    notificationTitle?: string;
    notificationBody?: string;
    openMetaChat?: boolean;
    aiDocumentFilename?: string;
    aiDocumentMarkdown?: string;
  };
}

export interface StoryState {
  id: EntityId;
  storyId: EntityId;
  stateJson: string;
  updatedAt: Timestamp;
}

/** Legacy parse shape accepted only for permissive migration of old records. */
export type StoryStateCharacterState = any;
export type StorySceneSnapshotV2 = any;
export type StoryStateData = any;
export type StoryStateDataV2 = any;
export type IndexedEntity = any;
export type RelationshipIndexEntry = any;
export type StoryIndexesV2 = any;
export interface StorySummary {
  id: EntityId;
  storyId: EntityId;
  summary: string;
  generatedAt: Timestamp;
}

export interface StoryIndexChapterSummary {
  chapterId: EntityId;
  chapterLabel: string;
  summary: string;
  sourceMessageIds: EntityId[];
  lastIndexedMessageId: EntityId;
  updatedAt: Timestamp;
}

export interface StoryIndexCharacter {
  id: EntityId;
  canonicalName: string;
  aliases: string[];
  description: string;
  status: string;
  developments: string[];
  provenance: EntityId[];
  updatedAt: Timestamp;
}

export interface StoryIndexRelationship {
  id: EntityId;
  characterIdA: EntityId;
  characterIdB: EntityId;
  nature: string;
  state: string;
  developments: string[];
  provenance: EntityId[];
  updatedAt: Timestamp;
}

export interface StoryIndex {
  id?: EntityId;
  storyId: EntityId;
  chapterSummaries: StoryIndexChapterSummary[];
  characters: StoryIndexCharacter[];
  relationships: StoryIndexRelationship[];
  lastIndexedMessageId?: EntityId;
  lastIndexedAt?: Timestamp;
  indexedMessageCount: number;
  updatedAt: Timestamp;
}

export interface DeveloperBug {
  id: EntityId;
  title: string;
  status: DeveloperBugStatus;
  reportedAt: Timestamp;
  description: string;
  reproductionSteps: string;
  expectedBehaviour: string;
  actualBehaviour: string;
  notes: string;
  updatedAt: Timestamp;
}

export interface DeveloperFeatureRequest {
  id: EntityId;
  title: string;
  priority: DeveloperFeaturePriority;
  description: string;
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DeveloperTestingNote {
  id: EntityId;
  title: string;
  content: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UniverseDraft {
  name: string;
  description: string;
  wikiUrl: string;
  wikiUrls?: UniverseWikiSource[];
  mode?: "referenced" | "custom";
  concept?: string;
  genreTheme?: string;
  tone?: string;
  universeBlueprint?: string;
  notes?: string;
}

export interface PlayerCharacterDraft {
  name: string;
  aliases?: string[];
  knownTies?: string[];
  age: string;
  gender: string;
  species: string;
  pronouns: string;
  characterConcept?: string;
  appearance: string;
  personality: string;
  background: string;
  goals?: string;
  notes: string;
  universeId: EntityId;
  universeIds?: EntityId[];
  scope?: "library" | "story";
  storyId?: EntityId;
}

export interface StoryDraft {
  title: string;
  universeId: EntityId;
  universeIds?: EntityId[];
  playerCharacterId: EntityId;
  parentStoryId?: EntityId;
  rootStoryId?: EntityId;
  lineageDepth?: number;
  lineageType?: "sequel" | "branch";
  sequelSeedSourceStoryId?: EntityId;
  isArchived?: boolean;
  adultContentMode?: StoryAdultContentMode;
  /** Legacy compatibility flag. Prefer adultContentMode for new writes. */
  matureFictionMode?: boolean;
  rpMode?: boolean;
  rpConfig?: RpConfig;
  accentThemeKey?: string;
  accentThemeCustom?: string;
  openingPrompt?: string;
  currentSummary: string;
  autoIndexMode?: "disabled" | "messages" | "chapter";
  autoIndexInterval?: 5 | 10 | 15 | 20 | "disabled";
  indexingCadence?: IndexingCadence;
  importedCharacterIds?: EntityId[];
  guidedStoryHistory?: {
    enabled: boolean;
    overallDirection?: string;
    chapterCount?: number;
    chapters?: Array<{
      label?: string;
      overview: string;
      scenesPerChapter: number;
    }>;
  };
}

export interface StoryMessageDraft {
  storyId: EntityId;
  role: StoryMessageRole;
  content: string;
  speakerName?: string;
  speakerType?: StoryMessageSpeakerType;
  directorIntent?: DirectorIntent;
  authorDirective?: StoryAuthorDirective;
  editedAt?: Timestamp;
  regeneratedAt?: Timestamp;
  revision?: number;
}

export interface DeveloperBugDraft {
  id: string;
  title: string;
  status: DeveloperBugStatus;
  description: string;
  reproductionSteps: string;
  expectedBehaviour: string;
  actualBehaviour: string;
  notes: string;
}

export interface DeveloperFeatureRequestDraft {
  id: string;
  title: string;
  priority: DeveloperFeaturePriority;
  description: string;
  notes: string;
}

export interface DeveloperTestingNoteDraft {
  id: string;
  title: string;
  content: string;
}

export interface StorageStatus {
  driver: "IndexedDB";
  ready: boolean;
  universesCount: number;
  playerCharactersCount: number;
  storiesCount: number;
  messagesCount: number;
  totalRecords: number;
  errorMessage?: string;
}

export interface StoryExportBundle {
  exportedAt: Timestamp;
  story: Story;
  universe: Universe;
  playerCharacter: PlayerCharacter;
  messages: StoryMessage[];
  storyState?: StoryState;
  chapters?: StoryChapter[];
  storyIndex?: StoryIndex;
}

export interface UniverseExportBundleV1 {
  exportVersion: 1;
  exportedAt: Timestamp;
  type: "universe" | "universe_pack";
  packVersion?: number;
  universe: Universe;
  universeImports: UniverseImport[];
}

export interface UniversePackSnapshotV1 {
  snapshotVersion: 1;
  exportedAt: Timestamp;
  packVersion: number;
  universe: Universe;
  universeImports: UniverseImport[];
}

export interface PlayerCharacterExportBundleV1 {
  exportVersion: 1;
  exportedAt: Timestamp;
  type: "playerCharacter";
  playerCharacter: PlayerCharacter;
}

export interface GuardedDeleteResult {
  ok: boolean;
  reason?: string;
}

export type StoryEngineBackupV1 = {
  backupVersion: 1;
  exportedAt: Timestamp;
  data: {
    universes: Universe[];
    playerCharacters: PlayerCharacter[];
    stories: Story[];
    messages: StoryMessage[];
    universeImports: UniverseImport[];
    storySummaries?: StorySummary[];
    storyStates: StoryState[];
    storyAiConfigs: StoryAIConfig[];
    storyUiStates?: StoryUiState[];
    storyIndexes?: StoryIndex[];
    aiSettings: (Omit<AISettings, "apiKeys"> & { apiKeys?: Partial<Record<AIProviderType, string>> }) | null;
  };
  uiPrefs: {
    rightSidebarCollapsed: boolean;
    readerMode: boolean;
    showChrome: boolean;
    textSize: "sm" | "md" | "lg" | "xl";
  };
};

export type StoryEngineBackup = StoryEngineBackupV1;
