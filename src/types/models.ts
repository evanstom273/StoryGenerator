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
export type StoryAuthorDirectiveKind = "canon" | "secret" | "reveal" | "retcon";
export type ExportFormat = "json" | "markdown" | "txt" | "pdf" | "archive_pdf";
export type AIProviderType = "openai" | "gemini" | "openrouter" | "anthropic";
export type DeveloperBugStatus = "open" | "in-progress" | "resolved" | "closed";
export type DeveloperFeaturePriority = "low" | "medium" | "high";
export type AutoIndexInterval = 5 | 10 | 15 | 20 | "disabled";
export type AutoIndexMode = "disabled" | "messages" | "chapter";
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
export type MediaAssetFormat = "wav";

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
  mimeType: "audio/wav";
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

export type DirectorIntent = {
  timeSkip?: { unit: "hours" | "days" | "weeks" | "months"; amount: number };
  /** Exact minutes to advance, bypasses unit/amount conversion. Set by slash commands. */
  exactMinutes?: number;
  sceneCut?: boolean;
  target?: string;
  /** Absolute time-of-day set, e.g. from "It's 12pm". Sets clock to this hour:minute without advancing. */
  absoluteTime?: { hour: number; minute: number };
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
  month: number;   // 1–12
  day: number;     // 1–31
  hour: number;    // 0–23
  minute: number;  // 0–59
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

export type PendingTransaction = {
  description: string;
  amount: number;
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
  universePackSnapshot?: UniversePackSnapshotV1;
  universePackSnapshots?: UniversePackSnapshotV1[];
  isArchived?: boolean;
  readOnlyReason?: "sequel_prequel";
  readOnlyLockedAt?: Timestamp;
  matureFictionMode?: boolean;
  rpMode?: boolean;
  rpConfig?: RpConfig;
  autoIndexMode?: AutoIndexMode;
  autoIndexInterval?: AutoIndexInterval;
  accentThemeKey?: string;
  accentThemeCustom?: string;
  currentSummary: string;
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

export type AIModelRole = "story" | "metachat" | "indexing" | "creation";

export interface AISettings {
  id: "ai-settings";
  activeProviderType: AIProviderType;
  apiKeys: Partial<Record<AIProviderType, string>>;
  /** Story generation, Director, Continue, guided chapters, Story History */
  defaultModels: Partial<Record<AIProviderType, string>>;
  /** MetaChat only */
  metachatModels?: Partial<Record<AIProviderType, string>>;
  /** Deep indexing, summaries, relationship extraction, memories */
  indexingModels?: Partial<Record<AIProviderType, string>>;
  /** Character/universe generation and related creation tools */
  creationModels?: Partial<Record<AIProviderType, string>>;
  geminiPodcastTts?: GeminiPodcastTtsSettings;
  geminiNarrationTts?: GeminiNarrationTtsSettings;
  /** Max simultaneous long-running background tasks (index, audiobook, documents, podcast). */
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
  };
}

export interface StorySummary {
  id: EntityId;
  storyId: EntityId;
  summary: string;
  generatedAt: Timestamp;
}

export type MemoryArchitectureVersion = "1.0" | "2.0";

export type EvidenceRef = {
  messageNumbers: number[];
};

export type IndexedEntity = {
  id?: string;
  name: string;
  aliases?: string[];
  description?: string;
  firstSeenMessage?: number;
  lastSeenMessage?: number;
  evidence?: EvidenceRef;
};

export type RelationshipTier =
  // Close / warm
  | "stranger"
  | "acquaintance"
  | "friend"
  | "close friend"
  | "best friend"
  | "confidant"
  | "family"
  | "partner"
  | "lover"
  | "devoted"
  | "mentor"
  | "mentee"
  | "caregiver"
  | "patient"
  // Professional / contextual
  | "ally"
  | "colleague"
  | "professional"
  // Complex / difficult
  | "complicated"
  | "guarded"
  | "distant"
  | "estranged"
  // Negative
  | "rival"
  | "adversary"
  | "enemy"
  | "nemesis"
  | "threat";

export type NpcInnerLife = {
  emotionalState?: string;
  howTheyDescribeYou?: string;
  whatTheyWant?: string;
  whatTheyreNotSaying?: string;
};

export type RelationshipArc = {
  statusPhrase?: string;
  milestones?: string[];
  tension?: string;
};

export type RelationshipHistoryEntry = {
  summary: string;
  messageNumber?: number;
};

export type RelationshipIndexEntry = {
  a: string;
  b: string;
  friendship?: number;
  trust?: number;
  respect?: number;
  loyalty?: number;
  comfort?: number;
  suspicion?: number;
  fear?: number;
  affection?: number;
  tension?: number;
  hostility?: number;
  dependency?: number;
  tier?: RelationshipTier;
  history?: RelationshipHistoryEntry[];
  summary?: string;
  evidence?: EvidenceRef;
  npcInnerLife?: NpcInnerLife;
  arc?: RelationshipArc;
  playerIntention?: string;
};

export type RpCondition = {
  id: string;
  label: string;
  addedAt: number;
};

export type StoryIndexesV2 = {
  messageCount?: number;
  messageNumberingVersion?: "1.0";
  characters?: Record<string, IndexedEntity>;
  locations?: Record<string, IndexedEntity>;
  items?: Record<string, IndexedEntity>;
  factions?: Record<string, IndexedEntity>;
  relationships?: RelationshipIndexEntry[];
  worldFacts?: Array<{
    fact: string;
    evidence?: EvidenceRef;
    sourceLabel?: string;
    sourceUrl?: string;
  }>;
  significantMemories?: Array<{
    moment: string;
    evidence?: EvidenceRef;
    sourceLabel?: string;
    sourceUrl?: string;
  }>;
  openThreads?: Array<{
    thread: string;
    evidence?: EvidenceRef;
    sourceLabel?: string;
    sourceUrl?: string;
  }>;
};

export type StorySceneSnapshotV2 = {
  currentLocation?: string;
  currentObjective?: string;
  activeParticipants?: string[];
  sceneSummary?: string;
};

export type StoryThreadsV2 = {
  openThreads?: string[];
};

export type StoryStateCharacterState = {
  canonicalName?: string;
  displayName?: string;
  aliases?: string[];
  pronouns?: string;
  gender?: string;
  titleOrRank?: string;
  relationships?: Record<string, string>;
  status?: string;
  statusBullets?: string[];
  strengths?: string[];
  weaknesses?: string[];
  characterTraitsPersistent?: string[];
  characterStateTransient?: string[];
  notes?: string[];
};

export type StoryStateData = {
  updatedAt: Timestamp;
  characters: Record<string, StoryStateCharacterState>;
  worldFacts: string[];
  unresolvedThreads: string[];
  sceneState?: string[];
  significantMemories?: string[];
  relationshipState?: string[];
  relationships?: Record<
    string,
    Record<
      string,
      {
        trust?: "low" | "medium" | "high" | "unknown";
        respect?: "low" | "medium" | "high" | "unknown";
        friendship?: "low" | "medium" | "high" | "unknown";
        loyalty?: "low" | "medium" | "high" | "unknown";
        fear?: "low" | "medium" | "high" | "unknown";
        attraction?: "low" | "medium" | "high" | "unknown";
        rivalry?: "low" | "medium" | "high" | "unknown";
        hostility?: "low" | "medium" | "high" | "unknown";
      }
    >
  >;
  npcs?: Record<
    string,
    {
      description?: string;
      role?: string;
      firstSeen?: string;
      lastSeen?: string;
      significance?: "minor" | "recurring" | "major";
      memories?: string[];
    }
  >;
  locations?: Record<
    string,
    {
      description?: string;
      tags?: string[];
      notes?: string[];
      lastSeen?: string;
    }
  >;
  summaries?: {
    premise?: string;
    protagonistSummary?: string;
    currentSituation?: string;
    recentDevelopments?: string[];
    characterSummaries?: Record<string, string>;
    relationshipSummary?: string;
    worldSummary?: string;
  };
  authorDirectives?: StoryAuthorDirectiveState;
  memoryArchitectureVersion?: MemoryArchitectureVersion;
  indexedAt?: Timestamp;
  lastIndexedAt?: Timestamp;
  lastDeepIndexedAt?: Timestamp;
  lastAutoDeepIndexedAt?: Timestamp;
  lastIndexedMessageCount?: number;
  lastDeepIndexedMessageCount?: number;
  lastAutoDeepIndexedMessageCount?: number;
  messagesSinceDeepIndexUpdate?: number;
  indexes?: StoryIndexesV2;
  scene?: StorySceneSnapshotV2;
  threads?: StoryThreadsV2;
  rpStats?: RpStats;
};

export type StoryStateDataV2 = Partial<StoryStateData> & {
  memoryArchitectureVersion?: MemoryArchitectureVersion;
  indexedAt?: Timestamp;
  indexes?: StoryIndexesV2;
  scene?: StorySceneSnapshotV2;
  threads?: StoryThreadsV2;
};

export interface StoryState {
  id: EntityId;
  storyId: EntityId;
  stateJson: string;
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
  matureFictionMode?: boolean;
  rpMode?: boolean;
  rpConfig?: RpConfig;
  autoIndexMode?: AutoIndexMode;
  autoIndexInterval?: AutoIndexInterval;
  accentThemeKey?: string;
  accentThemeCustom?: string;
  currentSummary: string;
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
    storySummaries: StorySummary[];
    storyStates: StoryState[];
    storyAiConfigs: StoryAIConfig[];
    storyUiStates?: StoryUiState[];
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
