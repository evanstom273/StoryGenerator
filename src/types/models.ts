export type EntityId = string;
export type Timestamp = string;

export type StoryMessageRole = "user" | "assistant" | "system";
export type StoryMessageSpeakerType =
  | "player"
  | "canon"
  | "narrator"
  | "system";
export type ExportFormat = "json" | "markdown" | "txt" | "pdf";
export type AIProviderType = "openai" | "gemini" | "openrouter";
export type DeveloperBugStatus = "open" | "in-progress" | "resolved" | "closed";
export type DeveloperFeaturePriority = "low" | "medium" | "high";

export interface Universe {
  id: EntityId;
  name: string;
  description: string;
  wikiUrl: string;
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
  appearance: string;
  personality: string;
  background: string;
  goals: string;
  notes: string;
  universeId: EntityId;
  createdAt: Timestamp;
}

export interface Story {
  id: EntityId;
  title: string;
  universeId: EntityId;
  playerCharacterId: EntityId;
  openingPrompt: string;
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
  title: string;
  importedText: string;
  importedAt: Timestamp;
}

export interface StorySummary {
  id: EntityId;
  storyId: EntityId;
  summary: string;
  generatedAt: Timestamp;
}

export type StoryStateCharacterState = {
  canonicalName?: string;
  displayName?: string;
  aliases?: string[];
  pronouns?: string;
  gender?: string;
  titleOrRank?: string;
  relationships?: Record<string, string>;
  status?: string;
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
    characterSummaries?: Record<string, string>;
    relationshipSummary?: string;
    worldSummary?: string;
  };
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
}

export interface PlayerCharacterDraft {
  name: string;
  age: string;
  gender: string;
  species: string;
  pronouns: string;
  appearance: string;
  personality: string;
  background: string;
  goals: string;
  notes: string;
  universeId: EntityId;
}

export interface StoryDraft {
  title: string;
  universeId: EntityId;
  playerCharacterId: EntityId;
  openingPrompt: string;
  currentSummary: string;
}

export interface StoryMessageDraft {
  storyId: EntityId;
  role: StoryMessageRole;
  content: string;
  speakerName?: string;
  speakerType?: StoryMessageSpeakerType;
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
}

export interface UniverseExportBundleV1 {
  exportVersion: 1;
  exportedAt: Timestamp;
  type: "universe";
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
