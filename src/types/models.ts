export type EntityId = string;
export type Timestamp = string;

export type StoryMessageRole = "user" | "assistant" | "system";
export type StoryMessageSpeakerType =
  | "player"
  | "canon"
  | "narrator"
  | "system";
export type ExportFormat = "json" | "markdown" | "txt" | "pdf" | "archive_pdf";
export type AIProviderType = "openai" | "gemini" | "openrouter";
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
  | "metachat_generate"
  | "story_export"
  | "story_archive_export";

export type DirectorIntent = {
  timeSkip?: { unit: "hours" | "days" | "weeks" | "months"; amount: number };
  sceneCut?: boolean;
  target?: string;
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
  scope?: "library" | "story";
  storyId?: EntityId;
  createdAt: Timestamp;
}

export type RpCoreStats = {
  str: number;
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
  coreStats: RpCoreStats;
  allowDebt?: boolean;
  creditLimit?: number | null;
};

export type RpNpcHpEntry = {
  name: string;
  current: number;
  max: number;
};

export type RpChangelogEntry = {
  ts: number;
  field: string;
  from: number;
  to: number;
  reason: string;
};

export type RpEventLogEntry = {
  ts: number;
  summary: string;
};

export type RpStats = {
  hp: number;
  gold: number;
  npcHp: Record<string, RpNpcHpEntry>;
  statOverrides?: Partial<RpCoreStats>;
  changelog: RpChangelogEntry[];
  eventLog?: RpEventLogEntry[];
};

export interface Story {
  id: EntityId;
  title: string;
  universeId: EntityId;
  playerCharacterId: EntityId;
  openingPrompt?: string;
  universePackSnapshot?: UniversePackSnapshotV1;
  isArchived?: boolean;
  matureFictionMode?: boolean;
  rpMode?: boolean;
  rpConfig?: RpConfig;
  autoIndexMode?: AutoIndexMode;
  autoIndexInterval?: AutoIndexInterval;
  currentSummary: string;
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
  chapterBoundary?: {
    kind: "start" | "end";
    label: string;
  };
  editedAt?: Timestamp;
  regeneratedAt?: Timestamp;
  revision?: number;
}

export interface StoryMetaMessage {
  id: EntityId;
  storyId: EntityId;
  role: StoryMessageRole;
  content: string;
  timestamp: Timestamp;
  jobId?: EntityId;
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

export interface AISettings {
  id: "ai-settings";
  activeProviderType: AIProviderType;
  apiKeys: Partial<Record<AIProviderType, string>>;
  defaultModels: Partial<Record<AIProviderType, string>>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StoryAIConfig {
  id: EntityId;
  storyId: EntityId;
  providerType: AIProviderType;
  model?: string;
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
  updatedAt: Timestamp;
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
  };
  error?: string;
  dedupeKey?: string;
  payload?: {
    trigger?: "manual" | "auto";
    content?: string;
    metaChatUserMessageId?: EntityId;
    metaChatOpenOnComplete?: boolean;
    exportFormat?: ExportFormat;
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
  | "stranger"
  | "acquaintance"
  | "friend"
  | "family"
  | "ally"
  | "rival"
  | "enemy"
  | "nemesis"
  | "lover";

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
  tier?: RelationshipTier;
  history?: RelationshipHistoryEntry[];
  summary?: string;
  evidence?: EvidenceRef;
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
  scope?: "library" | "story";
  storyId?: EntityId;
}

export interface StoryDraft {
  title: string;
  universeId: EntityId;
  playerCharacterId: EntityId;
  isArchived?: boolean;
  matureFictionMode?: boolean;
  rpMode?: boolean;
  rpConfig?: RpConfig;
  autoIndexMode?: AutoIndexMode;
  autoIndexInterval?: AutoIndexInterval;
  currentSummary: string;
}

export interface StoryMessageDraft {
  storyId: EntityId;
  role: StoryMessageRole;
  content: string;
  speakerName?: string;
  speakerType?: StoryMessageSpeakerType;
  directorIntent?: DirectorIntent;
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
