import type {
  AISettings,
  DeveloperBug,
  DeveloperFeatureRequest,
  DeveloperTestingNote,
  EntityId,
  PlayerCharacterExportBundleV1,
  PlayerCharacter,
  Story,
  StoryAIConfig,
  StoryEngineBackup,
  StoryExportBundle,
  StoryState,
  StoryMessage,
  StorySummary,
  UniverseExportBundleV1,
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
  putManyInStore,
  putInStore,
} from "./idb";
import {
  sortByCreatedAtDesc,
  sortByTimestampAsc,
  sortByUpdatedAtDesc,
} from "./dates";
import { createEntityId } from "./ids";

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
  getUniverseExportBundle(universeId: EntityId): Promise<UniverseExportBundleV1 | null>;
  getPlayerCharacterExportBundle(
    characterId: EntityId,
  ): Promise<PlayerCharacterExportBundleV1 | null>;
  importUniverseExportBundle(bundle: UniverseExportBundleV1): Promise<{ universeId: EntityId }>;
  importPlayerCharacterExportBundle(
    bundle: PlayerCharacterExportBundleV1,
    options: { universeId: EntityId },
  ): Promise<{ characterId: EntityId }>;
  importStoryExportBundle(
    bundle: StoryExportBundle,
  ): Promise<{ storyId: EntityId; universeId: EntityId; playerCharacterId: EntityId }>;
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
  listDeveloperBugs(): Promise<DeveloperBug[]>;
  getDeveloperBug(id: EntityId): Promise<DeveloperBug | null>;
  saveDeveloperBug(record: DeveloperBug): Promise<DeveloperBug>;
  deleteDeveloperBug(id: EntityId): Promise<void>;
  listDeveloperFeatureRequests(): Promise<DeveloperFeatureRequest[]>;
  getDeveloperFeatureRequest(id: EntityId): Promise<DeveloperFeatureRequest | null>;
  saveDeveloperFeatureRequest(
    record: DeveloperFeatureRequest,
  ): Promise<DeveloperFeatureRequest>;
  deleteDeveloperFeatureRequest(id: EntityId): Promise<void>;
  listDeveloperTestingNotes(): Promise<DeveloperTestingNote[]>;
  getDeveloperTestingNote(id: EntityId): Promise<DeveloperTestingNote | null>;
  saveDeveloperTestingNote(record: DeveloperTestingNote): Promise<DeveloperTestingNote>;
  deleteDeveloperTestingNote(id: EntityId): Promise<void>;
  exportWorkspaceBackup(): Promise<StoryEngineBackup>;
  clearWorkspace(): Promise<void>;
  importWorkspaceBackup(
    backup: StoryEngineBackup,
    options?: { mode?: "merge" | "replace"; conflict?: "skip" | "overwrite" },
  ): Promise<void>;
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
    async getUniverseExportBundle(universeId) {
      const [universe, universeImports] = await Promise.all([
        getFromStore<Universe>("universes", universeId),
        getAllByIndex<UniverseImport>("universeImports", "universeId", universeId),
      ]);

      if (!universe) {
        return null;
      }

      return {
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        type: "universe",
        universe,
        universeImports: [...universeImports].sort(
          (left, right) =>
            new Date(right.importedAt).getTime() - new Date(left.importedAt).getTime(),
        ),
      };
    },
    async getPlayerCharacterExportBundle(characterId) {
      const playerCharacter = await getFromStore<PlayerCharacter>(
        "playerCharacters",
        characterId,
      );

      if (!playerCharacter) {
        return null;
      }

      return {
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        type: "playerCharacter",
        playerCharacter,
      };
    },
    async importUniverseExportBundle(bundle) {
      if (!bundle || bundle.exportVersion !== 1 || bundle.type !== "universe") {
        throw new Error("Unsupported universe import format.");
      }

      const now = new Date().toISOString();
      const newUniverseId = createEntityId("universe");
      const universe: Universe = {
        ...(bundle.universe as Universe),
        id: newUniverseId,
        createdAt: now,
      };

      const universeImports = Array.isArray(bundle.universeImports)
        ? bundle.universeImports
        : [];

      await putInStore("universes", universe);
      await Promise.all(
        universeImports.map((record) =>
          putInStore("universeImports", {
            ...(record as UniverseImport),
            id: createEntityId("universe-import"),
            universeId: newUniverseId,
          }),
        ),
      );

      return { universeId: newUniverseId };
    },
    async importPlayerCharacterExportBundle(bundle, options) {
      if (!bundle || bundle.exportVersion !== 1 || bundle.type !== "playerCharacter") {
        throw new Error("Unsupported player character import format.");
      }

      const universeId = options?.universeId;
      if (!universeId) {
        throw new Error("Select a target universe for this player character.");
      }

      const universe = await getFromStore<Universe>("universes", universeId);
      if (!universe) {
        throw new Error("Selected universe was not found.");
      }

      const now = new Date().toISOString();
      const newCharacterId = createEntityId("player-character");
      const playerCharacter: PlayerCharacter = {
        ...(bundle.playerCharacter as PlayerCharacter),
        id: newCharacterId,
        universeId,
        createdAt: now,
      };

      await putInStore("playerCharacters", playerCharacter);

      return { characterId: newCharacterId };
    },
    async importStoryExportBundle(bundle) {
      const hasKeys =
        bundle &&
        typeof (bundle as any).exportedAt === "string" &&
        typeof (bundle as any).story === "object" &&
        typeof (bundle as any).universe === "object" &&
        typeof (bundle as any).playerCharacter === "object" &&
        Array.isArray((bundle as any).messages);

      if (!hasKeys) {
        throw new Error("Unsupported story import format.");
      }

      const now = new Date().toISOString();
      const normalizeKey = (value: unknown) =>
        typeof value === "string" ? value.trim().toLowerCase() : "";

      const bundledUniverse = bundle.universe as Universe;
      const bundledPlayerCharacter = bundle.playerCharacter as PlayerCharacter;
      const bundledStory = bundle.story as Story;

      const existingUniverses = await getAllFromStore<Universe>("universes");
      const bundledWiki = normalizeKey((bundledUniverse as any).wikiUrl);
      const bundledUniverseName = normalizeKey((bundledUniverse as any).name);
      const matchedUniverse =
        (bundledWiki
          ? existingUniverses.find(
              (universe) => normalizeKey((universe as any).wikiUrl) === bundledWiki,
            )
          : undefined) ??
        (bundledUniverseName
          ? existingUniverses.find(
              (universe) => normalizeKey((universe as any).name) === bundledUniverseName,
            )
          : undefined);

      const newUniverseId = matchedUniverse?.id ?? createEntityId("universe");
      const newPlayerCharacterId = createEntityId("player-character");
      const newStoryId = createEntityId("story");

      const universe: Universe | null = matchedUniverse
        ? null
        : {
            ...bundledUniverse,
            id: newUniverseId,
            createdAt: now,
          };

      const existingCharactersForUniverse = await getAllByIndex<PlayerCharacter>(
        "playerCharacters",
        "universeId",
        newUniverseId,
      );
      const bundledCharacterName = normalizeKey((bundledPlayerCharacter as any).name);
      const matchedCharacter = bundledCharacterName
        ? existingCharactersForUniverse.find(
            (character) => normalizeKey((character as any).name) === bundledCharacterName,
          )
        : undefined;

      const playerCharacter: PlayerCharacter | null = matchedCharacter
        ? null
        : {
            ...bundledPlayerCharacter,
            id: newPlayerCharacterId,
            universeId: newUniverseId,
            createdAt: now,
            species: (bundledPlayerCharacter as any).species ?? "",
          };

      const resolvedPlayerCharacterId = matchedCharacter?.id ?? newPlayerCharacterId;

      const resolveExistingStoryId = async () => {
        const bundledStoryId = (bundledStory as any).id;
        if (typeof bundledStoryId === "string" && bundledStoryId.trim()) {
          const existingById = await getFromStore<Story>("stories", bundledStoryId);
          if (existingById) {
            return existingById.id;
          }
        }

        const normalizedTitle = normalizeKey((bundledStory as any).title);
        if (!normalizedTitle) {
          return null;
        }

        const existingStoriesForUniverse = await getAllByIndex<Story>(
          "stories",
          "universeId",
          newUniverseId,
        );

        const matched = existingStoriesForUniverse.find((candidate) => {
          if (candidate.playerCharacterId !== resolvedPlayerCharacterId) {
            return false;
          }

          if (normalizeKey((candidate as any).title) !== normalizedTitle) {
            return false;
          }
          return true;
        });

        return matched?.id ?? null;
      };

      const existingStoryId = await resolveExistingStoryId();
      if (existingStoryId) {
        return {
          storyId: existingStoryId,
          universeId: newUniverseId,
          playerCharacterId: resolvedPlayerCharacterId,
        };
      }

      const story: Story = {
        ...bundledStory,
        id: newStoryId,
        universeId: newUniverseId,
        playerCharacterId: resolvedPlayerCharacterId,
        createdAt: now,
        updatedAt: now,
      };

      const messages = (bundle.messages as StoryMessage[]).map((message) => ({
        ...(message as StoryMessage),
        id: createEntityId("story-message"),
        storyId: newStoryId,
      }));

      const storyState = (bundle as any).storyState as StoryState | undefined;
      const normalizedStoryState = (() => {
        if (!storyState) {
          return null;
        }

        const next: StoryState = {
          ...(storyState as StoryState),
          id: `story-state:${newStoryId}`,
          storyId: newStoryId,
          updatedAt: now,
        };

        try {
          const parsed = JSON.parse(next.stateJson) as any;
          if (parsed && typeof parsed === "object" && typeof parsed.updatedAt === "string") {
            next.stateJson = JSON.stringify({ ...parsed, updatedAt: now });
          }
        } catch {}

        return next;
      })();

      const writePromises: Array<Promise<unknown>> = [putInStore("stories", story)];
      if (universe) {
        writePromises.push(putInStore("universes", universe));
      }
      if (playerCharacter) {
        writePromises.push(putInStore("playerCharacters", playerCharacter));
      }
      await Promise.all(writePromises);

      await Promise.all(messages.map((message) => putInStore("messages", message)));

      if (normalizedStoryState) {
        await putInStore("storyStates", normalizedStoryState);
      }

      return {
        storyId: newStoryId,
        universeId: newUniverseId,
        playerCharacterId: resolvedPlayerCharacterId,
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
    async listDeveloperBugs() {
      const bugs = await getAllFromStore<DeveloperBug>("developerBugs");
      return [...bugs].sort(
        (left, right) =>
          new Date(right.reportedAt).getTime() - new Date(left.reportedAt).getTime(),
      );
    },
    getDeveloperBug(id) {
      return getFromStore<DeveloperBug>("developerBugs", id);
    },
    saveDeveloperBug(record) {
      return putInStore("developerBugs", record);
    },
    deleteDeveloperBug(id) {
      return deleteFromStore("developerBugs", id);
    },
    async listDeveloperFeatureRequests() {
      const features =
        await getAllFromStore<DeveloperFeatureRequest>("developerFeatureRequests");
      return [...features].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      );
    },
    getDeveloperFeatureRequest(id) {
      return getFromStore<DeveloperFeatureRequest>("developerFeatureRequests", id);
    },
    saveDeveloperFeatureRequest(record) {
      return putInStore("developerFeatureRequests", record);
    },
    deleteDeveloperFeatureRequest(id) {
      return deleteFromStore("developerFeatureRequests", id);
    },
    async listDeveloperTestingNotes() {
      const notes =
        await getAllFromStore<DeveloperTestingNote>("developerTestingNotes");
      return [...notes].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      );
    },
    getDeveloperTestingNote(id) {
      return getFromStore<DeveloperTestingNote>("developerTestingNotes", id);
    },
    saveDeveloperTestingNote(record) {
      return putInStore("developerTestingNotes", record);
    },
    deleteDeveloperTestingNote(id) {
      return deleteFromStore("developerTestingNotes", id);
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
        return { ...rest, apiKeys: {} };
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

      const readTextSize = (key: string, fallback: "sm" | "md" | "lg" | "xl") => {
        try {
          const value = localStorage.getItem(key);
          if (value === "sm" || value === "md" || value === "lg" || value === "xl") {
            return value;
          }
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
          aiSettings: sanitizedAISettings,
        },
        uiPrefs: {
          rightSidebarCollapsed: readPref("story-engine:v2:right-collapsed", true),
          readerMode: readPref("story-engine:v2:reader-mode", false),
          showChrome: readPref("story-engine:v2:show-chrome", false),
          textSize: readTextSize("story-engine:v2:text-size", "md"),
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
        clearStore("developerBugs"),
        clearStore("developerFeatureRequests"),
        clearStore("developerTestingNotes"),
      ]);
    },
    async importWorkspaceBackup(backup, options) {
      const version = Number((backup as any)?.backupVersion);
      if (!backup || version !== 1) {
        throw new Error("Unsupported backup format.");
      }

      const mode = options?.mode ?? "merge";
      const conflict = options?.conflict ?? "skip";

      const data = ((backup as any).data ?? {}) as Partial<StoryEngineBackup["data"]>;

      const universes = Array.isArray(data.universes) ? data.universes : [];
      const playerCharacters = Array.isArray(data.playerCharacters) ? data.playerCharacters : [];
      const stories = Array.isArray(data.stories) ? data.stories : [];
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const universeImports = Array.isArray(data.universeImports) ? data.universeImports : [];
      const storySummaries = Array.isArray(data.storySummaries) ? data.storySummaries : [];
      const storyStates = Array.isArray(data.storyStates) ? data.storyStates : [];
      const storyAiConfigs = Array.isArray(data.storyAiConfigs) ? data.storyAiConfigs : [];
      const aiSettingsRecord = data.aiSettings ?? null;

      function assertHasId(store: string, record: unknown) {
        const id = (record as any)?.id;
        if (typeof id !== "string" || !id.trim()) {
          throw new Error(`Backup import failed: ${store} record missing id.`);
        }
      }

      for (const record of universes) assertHasId("universes", record);
      for (const record of playerCharacters) assertHasId("playerCharacters", record);
      for (const record of stories) assertHasId("stories", record);
      for (const record of messages) assertHasId("messages", record);
      for (const record of universeImports) assertHasId("universeImports", record);
      for (const record of storySummaries) assertHasId("storySummaries", record);
      for (const record of storyStates) assertHasId("storyStates", record);
      for (const record of storyAiConfigs) assertHasId("storyAiConfigs", record);
      if (aiSettingsRecord) assertHasId("aiSettings", aiSettingsRecord);

      const normalizedAISettings = (() => {
        if (!aiSettingsRecord || typeof aiSettingsRecord !== "object") {
          return null;
        }
        const record = aiSettingsRecord as any;
        return {
          ...record,
          apiKeys: typeof record.apiKeys === "object" && record.apiKeys !== null ? record.apiKeys : {},
          defaultModels:
            typeof record.defaultModels === "object" && record.defaultModels !== null
              ? record.defaultModels
              : {},
        } as any;
      })();

      const chunk = <T,>(items: T[], size: number) => {
        const chunks: T[][] = [];
        for (let i = 0; i < items.length; i += size) {
          chunks.push(items.slice(i, i + size));
        }
        return chunks;
      };

      if (mode === "replace") {
        await clearStore("messages");
        await clearStore("stories");
        await clearStore("playerCharacters");
        await clearStore("universes");
        await clearStore("universeImports");
        await clearStore("storySummaries");
        await clearStore("storyStates");
        await clearStore("storyAiConfigs");
        await clearStore("aiSettings");
        await clearStore("developerBugs");
        await clearStore("developerFeatureRequests");
        await clearStore("developerTestingNotes");

        await putManyInStore("universes", universes);
        await putManyInStore("playerCharacters", playerCharacters);
        await putManyInStore("stories", stories);

        for (const batch of chunk(messages, 1000)) {
          await putManyInStore("messages", batch);
        }

        await putManyInStore("universeImports", universeImports);
        await putManyInStore("storySummaries", storySummaries);
        await putManyInStore("storyStates", storyStates);
        await putManyInStore("storyAiConfigs", storyAiConfigs);
        if (normalizedAISettings) {
          await putManyInStore("aiSettings", [normalizedAISettings]);
        }
      } else {
        const [
          existingUniverses,
          existingPlayerCharacters,
          existingStories,
          existingMessages,
          existingUniverseImports,
          existingStorySummaries,
          existingStoryStates,
          existingStoryAiConfigs,
        ] = await Promise.all([
          getAllFromStore<Universe>("universes"),
          getAllFromStore<PlayerCharacter>("playerCharacters"),
          getAllFromStore<Story>("stories"),
          getAllFromStore<StoryMessage>("messages"),
          getAllFromStore<UniverseImport>("universeImports"),
          getAllFromStore<StorySummary>("storySummaries"),
          getAllFromStore<StoryState>("storyStates"),
          getAllFromStore<StoryAIConfig>("storyAiConfigs"),
        ]);

        const existingByStore = {
          universes: new Set(existingUniverses.map((record) => record.id)),
          playerCharacters: new Set(existingPlayerCharacters.map((record) => record.id)),
          stories: new Set(existingStories.map((record) => record.id)),
          messages: new Set(existingMessages.map((record) => record.id)),
          universeImports: new Set(existingUniverseImports.map((record) => record.id)),
          storySummaries: new Set(existingStorySummaries.map((record) => record.id)),
          storyStates: new Set(existingStoryStates.map((record) => record.id)),
          storyAiConfigs: new Set(existingStoryAiConfigs.map((record) => record.id)),
        };

        function shouldWrite(store: keyof typeof existingByStore, id: string) {
          if (conflict === "overwrite") {
            return true;
          }
          return !existingByStore[store].has(id);
        }

        await putManyInStore(
          "universes",
          universes.filter((record) => shouldWrite("universes", record.id)),
        );
        await putManyInStore(
          "playerCharacters",
          playerCharacters.filter((record) => shouldWrite("playerCharacters", record.id)),
        );
        await putManyInStore(
          "stories",
          stories.filter((record) => shouldWrite("stories", record.id)),
        );

        const messagesToWrite = messages.filter((record) => shouldWrite("messages", record.id));
        for (const batch of chunk(messagesToWrite, 1000)) {
          await putManyInStore("messages", batch);
        }

        await putManyInStore(
          "universeImports",
          universeImports.filter((record) => shouldWrite("universeImports", record.id)),
        );
        await putManyInStore(
          "storySummaries",
          storySummaries.filter((record) => shouldWrite("storySummaries", record.id)),
        );
        await putManyInStore(
          "storyStates",
          storyStates.filter((record) => shouldWrite("storyStates", record.id)),
        );
        await putManyInStore(
          "storyAiConfigs",
          storyAiConfigs.filter((record) => shouldWrite("storyAiConfigs", record.id)),
        );
        if (normalizedAISettings) {
          await putManyInStore("aiSettings", [normalizedAISettings]);
        }
      }

      const writePref = (key: string, value: boolean) => {
        try {
          localStorage.setItem(key, value ? "true" : "false");
        } catch {}
      };

      const writeTextSize = (key: string, value: unknown) => {
        try {
          if (value === "sm" || value === "md" || value === "lg" || value === "xl") {
            localStorage.setItem(key, value);
          }
        } catch {}
      };

      const prefs = (backup as any).uiPrefs ?? {};
      writePref(
        "story-engine:v2:right-collapsed",
        typeof prefs.rightSidebarCollapsed === "boolean" ? prefs.rightSidebarCollapsed : true,
      );
      writePref(
        "story-engine:v2:reader-mode",
        typeof prefs.readerMode === "boolean" ? prefs.readerMode : false,
      );
      writePref(
        "story-engine:v2:show-chrome",
        typeof prefs.showChrome === "boolean" ? prefs.showChrome : false,
      );
      writeTextSize("story-engine:v2:text-size", prefs.textSize);
    },
  };
}

export const storyEngineRepository = createIndexedDbStoryEngineRepository();
