import type {
  AISettings,
  EntityId,
  PlayerCharacter,
  Story,
  StoryAIConfig,
  StoryEngineBackup,
  StoryExportBundle,
  StoryState,
  StoryMessage,
  StorySummary,
  Universe,
  UniverseImport,
} from "../types/models";
import {
  clearStore,
  deleteAllByIndex,
  deleteFromStore,
  getAllByIndex,
  getAllFromStore,
  getFromStore,
  putInStore,
} from "./idb";
import {
  sortByCreatedAtDesc,
  sortByTimestampAsc,
  sortByUpdatedAtDesc,
} from "./dates";

export interface StoryEngineRepository {
  listUniverses(): Promise<Universe[]>;
  getUniverse(id: EntityId): Promise<Universe | null>;
  saveUniverse(universe: Universe): Promise<Universe>;
  deleteUniverse(id: EntityId): Promise<void>;
  listPlayerCharacters(): Promise<PlayerCharacter[]>;
  getPlayerCharacter(id: EntityId): Promise<PlayerCharacter | null>;
  savePlayerCharacter(character: PlayerCharacter): Promise<PlayerCharacter>;
  deletePlayerCharacter(id: EntityId): Promise<void>;
  listStories(): Promise<Story[]>;
  getStory(id: EntityId): Promise<Story | null>;
  saveStory(story: Story): Promise<Story>;
  deleteStory(id: EntityId): Promise<void>;
  listAllMessages(): Promise<StoryMessage[]>;
  listStoryMessages(storyId: EntityId): Promise<StoryMessage[]>;
  getStoryMessage(id: EntityId): Promise<StoryMessage | null>;
  saveStoryMessage(message: StoryMessage): Promise<StoryMessage>;
  deleteStoryMessage(id: EntityId): Promise<void>;
  getStoryExportBundle(storyId: EntityId): Promise<StoryExportBundle | null>;
  getAISettings(): Promise<AISettings | null>;
  saveAISettings(settings: AISettings): Promise<AISettings>;
  getStoryAIConfig(storyId: EntityId): Promise<StoryAIConfig | null>;
  saveStoryAIConfig(config: StoryAIConfig): Promise<StoryAIConfig>;
  listUniverseImports(universeId: EntityId): Promise<UniverseImport[]>;
  saveUniverseImport(record: UniverseImport): Promise<UniverseImport>;
  listStorySummaries(storyId: EntityId): Promise<StorySummary[]>;
  saveStorySummary(record: StorySummary): Promise<StorySummary>;
  getStoryState(storyId: EntityId): Promise<StoryState | null>;
  saveStoryState(record: StoryState): Promise<StoryState>;
  exportWorkspaceBackup(): Promise<StoryEngineBackup>;
  clearWorkspace(): Promise<void>;
  importWorkspaceBackup(backup: StoryEngineBackup): Promise<void>;
}

export function createIndexedDbStoryEngineRepository(): StoryEngineRepository {
  return {
    async listUniverses() {
      const universes = await getAllFromStore<Universe>("universes");
      return sortByCreatedAtDesc(universes);
    },
    getUniverse(id) {
      return getFromStore<Universe>("universes", id);
    },
    saveUniverse(universe) {
      return putInStore("universes", universe);
    },
    deleteUniverse(id) {
      return deleteFromStore("universes", id);
    },
    async listPlayerCharacters() {
      const characters = await getAllFromStore<PlayerCharacter>("playerCharacters");
      return sortByCreatedAtDesc(characters);
    },
    getPlayerCharacter(id) {
      return getFromStore<PlayerCharacter>("playerCharacters", id);
    },
    savePlayerCharacter(character) {
      return putInStore("playerCharacters", character);
    },
    deletePlayerCharacter(id) {
      return deleteFromStore("playerCharacters", id);
    },
    async listStories() {
      const stories = await getAllFromStore<Story>("stories");
      return sortByUpdatedAtDesc(stories);
    },
    getStory(id) {
      return getFromStore<Story>("stories", id);
    },
    saveStory(story) {
      return putInStore("stories", story);
    },
    async deleteStory(id) {
      await deleteFromStore("stories", id);
      await deleteAllByIndex("messages", "storyId", id);
    },
    async listAllMessages() {
      const messages = await getAllFromStore<StoryMessage>("messages");
      return sortByTimestampAsc(messages);
    },
    async listStoryMessages(storyId) {
      const messages = await getAllByIndex<StoryMessage>("messages", "storyId", storyId);
      return sortByTimestampAsc(messages);
    },
    getStoryMessage(id) {
      return getFromStore<StoryMessage>("messages", id);
    },
    saveStoryMessage(message) {
      return putInStore("messages", message);
    },
    deleteStoryMessage(id) {
      return deleteFromStore("messages", id);
    },
    async getStoryExportBundle(storyId) {
      const story = await getFromStore<Story>("stories", storyId);

      if (!story) {
        return null;
      }

      const [universe, playerCharacter, messages, storyState] = await Promise.all([
        getFromStore<Universe>("universes", story.universeId),
        getFromStore<PlayerCharacter>("playerCharacters", story.playerCharacterId),
        getAllByIndex<StoryMessage>("messages", "storyId", storyId),
        getFromStore<StoryState>("storyStates", `story-state:${storyId}`),
      ]);

      if (!universe || !playerCharacter) {
        return null;
      }

      return {
        exportedAt: new Date().toISOString(),
        story,
        universe,
        playerCharacter,
        messages: sortByTimestampAsc(messages),
        storyState: storyState ?? undefined,
      };
    },
    getAISettings() {
      return getFromStore<AISettings>("aiSettings", "ai-settings");
    },
    saveAISettings(settings) {
      return putInStore("aiSettings", settings);
    },
    async getStoryAIConfig(storyId) {
      const configs = await getAllByIndex<StoryAIConfig>("storyAiConfigs", "storyId", storyId);

      if (!configs.length) {
        return null;
      }

      return [...configs].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      )[0]!;
    },
    saveStoryAIConfig(config) {
      return putInStore("storyAiConfigs", config);
    },
    async listUniverseImports(universeId) {
      const imports = await getAllByIndex<UniverseImport>(
        "universeImports",
        "universeId",
        universeId,
      );

      return [...imports].sort(
        (left, right) =>
          new Date(right.importedAt).getTime() - new Date(left.importedAt).getTime(),
      );
    },
    saveUniverseImport(record) {
      return putInStore("universeImports", record);
    },
    async listStorySummaries(storyId) {
      const summaries = await getAllByIndex<StorySummary>(
        "storySummaries",
        "storyId",
        storyId,
      );

      return [...summaries].sort(
        (left, right) =>
          new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime(),
      );
    },
    saveStorySummary(record) {
      return putInStore("storySummaries", record);
    },
    getStoryState(storyId) {
      return getFromStore<StoryState>("storyStates", `story-state:${storyId}`);
    },
    saveStoryState(record) {
      return putInStore("storyStates", record);
    },
    async exportWorkspaceBackup() {
      const [
        universes,
        playerCharacters,
        stories,
        messages,
        universeImports,
        storySummaries,
        storyStates,
        storyAiConfigs,
        aiSettings,
      ] = await Promise.all([
        getAllFromStore<Universe>("universes"),
        getAllFromStore<PlayerCharacter>("playerCharacters"),
        getAllFromStore<Story>("stories"),
        getAllFromStore<StoryMessage>("messages"),
        getAllFromStore<UniverseImport>("universeImports"),
        getAllFromStore<StorySummary>("storySummaries"),
        getAllFromStore<StoryState>("storyStates"),
        getAllFromStore<StoryAIConfig>("storyAiConfigs"),
        getFromStore<AISettings>("aiSettings", "ai-settings"),
      ]);

      const sanitizedAISettings = (() => {
        if (!aiSettings) {
          return null;
        }

        const { apiKeys: _ignored, ...rest } = aiSettings;
        return rest;
      })();

      const readPref = (key: string, fallback: boolean) => {
        try {
          const value = localStorage.getItem(key);
          if (value === null) return fallback;
          if (value === "true") return true;
          if (value === "false") return false;
          return fallback;
        } catch {
          return fallback;
        }
      };

      return {
        backupVersion: 1,
        exportedAt: new Date().toISOString(),
        data: {
          universes,
          playerCharacters,
          stories,
          messages,
          universeImports,
          storySummaries,
          storyStates,
          storyAiConfigs,
          aiSettings: sanitizedAISettings as any,
        },
        uiPrefs: {
          rightSidebarCollapsed: readPref("story-engine:v2:right-collapsed", true),
          readerMode: readPref("story-engine:v2:reader-mode", false),
          showChrome: readPref("story-engine:v2:show-chrome", false),
        },
      };
    },
    async clearWorkspace() {
      await Promise.all([
        clearStore("messages"),
        clearStore("stories"),
        clearStore("playerCharacters"),
        clearStore("universes"),
        clearStore("universeImports"),
        clearStore("storySummaries"),
        clearStore("storyStates"),
        clearStore("storyAiConfigs"),
        clearStore("aiSettings"),
      ]);
    },
    async importWorkspaceBackup(backup) {
      if (!backup || backup.backupVersion !== 1) {
        throw new Error("Unsupported backup format.");
      }

      await Promise.all([
        clearStore("messages"),
        clearStore("stories"),
        clearStore("playerCharacters"),
        clearStore("universes"),
        clearStore("universeImports"),
        clearStore("storySummaries"),
        clearStore("storyStates"),
        clearStore("storyAiConfigs"),
        clearStore("aiSettings"),
      ]);

      const data = backup.data;

      await Promise.all([
        ...data.universes.map((record) => putInStore("universes", record)),
        ...data.playerCharacters.map((record) => putInStore("playerCharacters", record)),
        ...data.stories.map((record) => putInStore("stories", record)),
        ...data.messages.map((record) => putInStore("messages", record)),
        ...data.universeImports.map((record) => putInStore("universeImports", record)),
        ...data.storySummaries.map((record) => putInStore("storySummaries", record)),
        ...data.storyStates.map((record) => putInStore("storyStates", record)),
        ...data.storyAiConfigs.map((record) => putInStore("storyAiConfigs", record)),
        ...(data.aiSettings ? [putInStore("aiSettings", data.aiSettings as any)] : []),
      ]);

      const writePref = (key: string, value: boolean) => {
        try {
          localStorage.setItem(key, value ? "true" : "false");
        } catch {}
      };

      writePref("story-engine:v2:right-collapsed", backup.uiPrefs.rightSidebarCollapsed);
      writePref("story-engine:v2:reader-mode", backup.uiPrefs.readerMode);
      writePref("story-engine:v2:show-chrome", backup.uiPrefs.showChrome);
    },
  };
}

export const storyEngineRepository = createIndexedDbStoryEngineRepository();
