export type EntityId = string;
export type Timestamp = string;

export type StoryMessageRole = "user" | "assistant" | "system";
export type StoryMessageSpeakerType =
  | "player"
  | "canon"
  | "narrator"
  | "system";
export type ExportFormat = "json" | "markdown" | "txt";

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

export interface UniverseDraft {
  name: string;
  description: string;
  wikiUrl: string;
}

export interface PlayerCharacterDraft {
  name: string;
  age: string;
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
}

export interface GuardedDeleteResult {
  ok: boolean;
  reason?: string;
}
