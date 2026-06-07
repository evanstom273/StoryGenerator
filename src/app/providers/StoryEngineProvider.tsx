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
import { getProviderDefaultModel } from "../../lib/ai/models";
import { getSceneWordTarget, inferSceneDepth } from "../../lib/ai/sceneSizing";
import { buildPlayerAssistContext } from "../../lib/ai/playerAssistContext";
import {
  buildCharacterGeneratorSystemPrompt,
  type PlayerCharacterField,
} from "../../lib/ai/characterGenerator";
import { extractFirstJsonObject, safeParseJsonObject } from "../../lib/ai/json";
import {
  buildStoryStateExtractionPrompt,
  parseStoryStateData,
} from "../../lib/ai/storyStateExtractor";
import {
  normalizeStoryStateToV2,
  finalizeStoryStateForSave,
  reconcileStoryIndexes,
  safeParseStoryStateData,
  withIndexedMetadata,
} from "../../lib/storyStateV2";
import { rebuildStoryMemoryAndIndexes } from "../../lib/ai/rebuildMemory";
import { runAndroidAutoBackupIfNeeded } from "../../lib/androidAutoBackup";
import {
  getPlayerCharacterAuthorshipViolation,
} from "../../lib/storyText/playerProtection";
import {
  detectSceneStateRenarration,
  sanitizeAssistantTranscript,
} from "../../lib/storyText/transcriptSanitizer";
import { extractSpeakerPrefix } from "../../lib/storyText/extractSpeakerPrefix";
import type {
  AIProviderType,
  AISettings,
  DeveloperBug,
  DeveloperBugDraft,
  DeveloperFeatureRequest,
  DeveloperFeatureRequestDraft,
  DeveloperTestingNote,
  DeveloperTestingNoteDraft,
  GuardedDeleteResult,
  PlayerCharacterExportBundleV1,
  PlayerCharacter,
  PlayerCharacterDraft,
  StorageStatus,
  Story,
  StoryAIConfig,
  StoryEngineBackup,
  StoryDraft,
  StoryExportBundle,
  StoryMessage,
  StoryMessageDraft,
  StoryState,
  StorySummary,
  UniverseExportBundleV1,
  Universe,
  UniverseDraft,
  UniverseImport,
} from "../../types/models";

interface StoryEngineContextValue {
  loading: boolean;
  errorMessage: string | null;
  storageStatus: StorageStatus;
  universes: Universe[];
  playerCharacters: PlayerCharacter[];
  stories: Story[];
  messages: StoryMessage[];
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
  };
  getUniverseById: (id: string) => Universe | undefined;
  getPlayerCharacterById: (id: string) => PlayerCharacter | undefined;
  getStoryById: (id: string) => Story | undefined;
  getDeveloperBugById: (id: string) => DeveloperBug | undefined;
  getDeveloperFeatureRequestById: (id: string) => DeveloperFeatureRequest | undefined;
  getDeveloperTestingNoteById: (id: string) => DeveloperTestingNote | undefined;
  getMessagesForStory: (storyId: string) => StoryMessage[];
  getPlayerCharactersForUniverse: (universeId: string) => PlayerCharacter[];
  getStoriesForUniverse: (universeId: string) => Story[];
  getStoriesForPlayerCharacter: (playerCharacterId: string) => Story[];
  createUniverse: (draft: UniverseDraft) => Promise<Universe>;
  updateUniverse: (id: string, draft: UniverseDraft) => Promise<Universe | null>;
  deleteUniverse: (id: string) => Promise<GuardedDeleteResult>;
  createPlayerCharacter: (draft: PlayerCharacterDraft) => Promise<PlayerCharacter>;
  promoteStoryPlayerCharacter: (storyId: string) => Promise<PlayerCharacter>;
  updatePlayerCharacter: (
    id: string,
    draft: PlayerCharacterDraft,
  ) => Promise<PlayerCharacter | null>;
  deletePlayerCharacter: (id: string) => Promise<GuardedDeleteResult>;
  createStory: (draft: StoryDraft) => Promise<Story>;
  updateStory: (id: string, patch: Partial<StoryDraft>) => Promise<Story | null>;
  deleteStory: (id: string) => Promise<void>;
  createMessage: (draft: StoryMessageDraft) => Promise<StoryMessage>;
  updateMessage: (
    id: string,
    draft: Omit<StoryMessageDraft, "storyId">,
  ) => Promise<StoryMessage | null>;
  deleteMessage: (id: string) => Promise<void>;
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
  exportStory: (storyId: string) => Promise<StoryExportBundle | null>;
  exportUniverse: (universeId: string) => Promise<UniverseExportBundleV1 | null>;
  exportPlayerCharacter: (
    characterId: string,
  ) => Promise<PlayerCharacterExportBundleV1 | null>;
  fetchStoryState: (storyId: string) => Promise<StoryState | null>;
  refreshStoryState: (storyId: string, opts?: { force?: boolean }) => Promise<void>;
  updateIndexesDeep: (storyId: string, opts?: { signal?: AbortSignal }) => Promise<void>;
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
  generatePlayerAssistMessage: (storyId: string) => Promise<string>;
  generatePlayerCharacterDraft: (
    universeId: string,
    fields?: Array<keyof PlayerCharacterDraft>,
    existing?: Partial<PlayerCharacterDraft>,
  ) => Promise<Partial<PlayerCharacterDraft>>;
  sendChatMessage: (storyId: string, content: string) => Promise<StoryMessage>;
  editAssistantMessage: (messageId: string, content: string) => Promise<StoryMessage | null>;
  regenerateLastAssistantMessage: (storyId: string) => Promise<StoryMessage>;
}

const StoryEngineContext = createContext<StoryEngineContextValue | null>(null);

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
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
  const [developerBugs, setDeveloperBugs] = useState<DeveloperBug[]>([]);
  const [developerFeatureRequests, setDeveloperFeatureRequests] = useState<
    DeveloperFeatureRequest[]
  >([]);
  const [developerTestingNotes, setDeveloperTestingNotes] = useState<
    DeveloperTestingNote[]
  >([]);
  const [rebuildStatus, setRebuildStatus] = useState<StoryEngineContextValue["rebuildStatus"]>();
  const rebuildAbortRef = useRef<AbortController | null>(null);

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
          nextAISettings,
          nextDeveloperBugs,
          nextDeveloperFeatureRequests,
          nextDeveloperTestingNotes,
        ] = await Promise.all([
          repository.listUniverses(),
          repository.listPlayerCharacters(),
          repository.listStories(),
          repository.listAllMessages(),
          getNormalizedAISettings().catch(() => null),
          repository.listDeveloperBugs(),
          repository.listDeveloperFeatureRequests(),
          repository.listDeveloperTestingNotes(),
        ]);

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

      const resolvedModel =
        storyModelOverride?.trim() ||
        settings.defaultModels?.[providerType]?.trim() ||
        getProviderDefaultModel(providerType);

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

      const summaryText = (() => {
        const direct = story.currentSummary?.trim();
        if (direct) return direct;
        const json = storyState?.stateJson?.trim() ?? "";
        if (!json) return "";
        const parsed = safeParseStoryStateData(json);
        return parsed?.summaries?.worldSummary?.trim() ?? "";
      })();

      const extractionContext = buildStoryStateExtractionPrompt({
        playerName: playerCharacter.name,
        summaryText,
        recentMessages: refreshedMessages,
        existingStateJson: storyState?.stateJson,
        messageNumberStart: 1,
        messageNumberTotal: refreshedMessages.length,
      });

      const stateResponse = await provider.generateResponse({
        apiKey,
        model,
        messages: extractionContext,
      });

      const parsedState = parseStoryStateData(stateResponse.content);
      if (!parsedState) {
        return;
      }

      const now = new Date().toISOString();
      const nextStateJson = finalizeStoryStateForSave({
        parsedState,
        previousStateJson: storyState?.stateJson,
        totalMessages: refreshedMessages.length,
        now,
        mode: "auto",
      });

      await repository.saveStoryState({
        id: `story-state:${storyId}`,
        storyId,
        stateJson: nextStateJson,
        updatedAt: now,
      });

      const fallbackSummary = parsedState.summaries?.worldSummary?.trim();
      if (!story.currentSummary?.trim() && fallbackSummary) {
        await repository.saveStory({
          ...story,
          currentSummary: fallbackSummary,
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
      aiSettings,
      developerBugs,
      developerFeatureRequests,
      developerTestingNotes,
      rebuildStatus,
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
        const nextUniverse: Universe = {
          id: createEntityId("universe"),
          name: draft.name.trim(),
          description: draft.description.trim(),
          wikiUrl: draft.wikiUrl.trim(),
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

        const nextUniverse: Universe = {
          ...currentUniverse,
          name: draft.name.trim(),
          description: draft.description.trim(),
          wikiUrl: draft.wikiUrl.trim(),
        };

        await repository.saveUniverse(nextUniverse);
        await hydrate(false);

        return nextUniverse;
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

        const now = new Date().toISOString();
        const promoted: PlayerCharacter = {
          ...playerCharacter,
          id: createEntityId("player-character"),
          universeId: story.universeId,
          scope: "library",
          storyId: undefined,
          createdAt: now,
        };

        await repository.savePlayerCharacter(promoted);
        await hydrate(false);

        return promoted;
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
        const nextStory: Story = {
          id: createEntityId("story"),
          title: draft.title.trim(),
          universeId: draft.universeId,
          playerCharacterId: draft.playerCharacterId,
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

        const context = buildStoryChatContext({
          universe,
          story,
          playerCharacter,
          imports,
          summaries,
          storyState,
          recentMessages: sanitizedHistoryMessages,
          latestUserMessage: previousMessage.content,
        });

        const assistantContent = await provider.generateResponse({
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
              await provider.generateResponse({
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
                      "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
                      "Formatting rules:",
                      "- Every character line must start with 'Name:'.",
                      "- Actions must be wrapped as *...* (asterisks only for actions).",
                      '- Dialogue must be wrapped in double quotes like \"...\"',
                      "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
                      "- Narration must be standalone italic narration (stored as *...*), never 'Narrator:' labels.",
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
          "Do not re-narrate the latest player message. Treat it as established scene state and continue from the next beat.",
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

        for (let attempt = 0; attempt < 6; attempt += 1) {
          const candidateSanitized = sanitizeAssistantTranscript({
            text: candidateAssistantText,
            latestUserMessage: previousMessage.content,
            playerName: playerNameForValidation,
          });

          if (!candidateSanitized.formatValid) {
            candidateAssistantText = (
              await provider.generateResponse({
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
            candidateAssistantText = (
              await provider.generateResponse({
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
            candidateAssistantText = (
              await provider.generateResponse({
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
            candidateAssistantText = (
              await provider.generateResponse({
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
          throw new Error("Unable to generate a response. Please try again.");
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
      exportStory(storyId) {
        return repository.getStoryExportBundle(storyId);
      },
      fetchStoryState(storyId) {
        return repository.getStoryState(storyId);
      },
      refreshStoryState: refreshStoryStateInternal,
      async updateIndexesDeep(storyId, opts) {
        rebuildAbortRef.current?.abort();
        const controller = new AbortController();
        rebuildAbortRef.current = controller;
        const signal = opts?.signal ?? controller.signal;

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
            onProgress: ({ processed, total, message }) => {
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
                };
              });
            },
          });

          if (signal.aborted) {
            throw new Error("Re-index aborted.");
          }

          setRebuildStatus((current) => {
            if (!current || current.storyId !== storyId) {
              return current;
            }

            return {
              ...current,
              phase: "saving",
              message: "Saving indexed state...",
            };
          });

          const now = new Date().toISOString();
          const nextStateJson = (() => {
            try {
              const parsed = safeParseStoryStateData(result.stateJson);
              if (!parsed) {
                return result.stateJson;
              }
              return finalizeStoryStateForSave({
                parsedState: parsed,
                previousStateJson: existingStoryState?.stateJson,
                totalMessages: allMessages.length,
                now,
                mode: "deep",
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

              const characterCount = indexes.characters && typeof indexes.characters === "object"
                ? Object.keys(indexes.characters).length
                : 0;
              const locationCount = indexes.locations && typeof indexes.locations === "object"
                ? Object.keys(indexes.locations).length
                : 0;
              const threadCount = Array.isArray(indexes.openThreads) ? indexes.openThreads.length : 0;

              const parts = [
                characterCount ? `${characterCount} characters` : null,
                locationCount ? `${locationCount} locations` : null,
                threadCount ? `${threadCount} threads` : null,
              ].filter(Boolean);

              return parts.length ? `Re-index complete. Indexed: ${parts.join(", ")}.` : "Re-index complete.";
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
        } catch (error) {
          setRebuildStatus((current) => {
            const base =
              current?.storyId === storyId
                ? current
                : {
                    storyId,
                    phase: "error" as const,
                    processedMessages: 0,
                    totalMessages: 0,
                  };

            return {
              ...base,
              phase: "error",
              error: error instanceof Error ? error.message : "Re-index failed.",
            };
          });

          throw error;
        } finally {
          if (rebuildAbortRef.current === controller) {
            rebuildAbortRef.current = null;
          }
        }
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
      async generatePlayerAssistMessage(storyId) {
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
        const context = buildPlayerAssistContext({
          universe,
          story,
          playerCharacter,
          imports,
          summaries,
          recentMessages,
        });

        const suggestion = await provider.generateResponse({
          apiKey,
          model,
          messages: context,
        });

        return suggestion.content.trim();
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

        const response = await provider.generateResponse({
          apiKey,
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Generate the JSON now." },
          ],
        });

        const jsonText = extractFirstJsonObject(response.content) ?? response.content.trim();
        const parsed = safeParseJsonObject<Record<string, unknown>>(jsonText);

        if (!parsed) {
          throw new Error("Character generator returned invalid JSON.");
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
      async sendChatMessage(storyId, content) {
        const trimmed = content.trim();

        if (!trimmed) {
          throw new Error("Message content is required.");
        }

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
        const userMessage: StoryMessage = shouldReuseLastUserMessage
          ? lastMessage
          : {
              id: createEntityId("story-message"),
              storyId,
              role: "user",
              content: (prefix?.strippedContent ?? trimmed).trim(),
              timestamp: new Date().toISOString(),
              speakerName: prefix?.speakerLabel,
              speakerType: "player",
            };

        if (!shouldReuseLastUserMessage) {
          await repository.saveStoryMessage(userMessage);
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

        const [imports, summaries, refreshedMessages, storyConfig, storyState] = await Promise.all([
          repository.listUniverseImports(universe.id),
          repository.listStorySummaries(storyId),
          repository.listStoryMessages(storyId),
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

        const context = buildStoryChatContext({
          universe,
          story,
          playerCharacter,
          imports,
          summaries,
          storyState,
          recentMessages: sanitizedHistoryMessages,
          latestUserMessage: userMessage.content,
        });

        const assistantContent = await provider.generateResponse({
          apiKey,
          model,
          messages: context,
        });

        const sceneDepth = inferSceneDepth(userMessage.content);
        const target = getSceneWordTarget(sceneDepth);
        const wordCount = assistantContent.content.split(/\s+/).filter(Boolean).length;
        const shouldRewriteForSize = sceneDepth === "light" && wordCount > target.maxWords * 2;
        const finalAssistantText = shouldRewriteForSize
          ? (
              await provider.generateResponse({
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
                      "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
                      "Formatting rules:",
                      "- Every character line must start with 'Name:'.",
                      "- Actions must be wrapped as *...* (asterisks only for actions).",
                      '- Dialogue must be wrapped in double quotes like "..."',
                      "- If a character acts and speaks, keep both on the same line: Name: *action* \"dialogue\"",
                      "- Narration must be standalone italic narration (stored as *...*), never 'Narrator:' labels.",
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

        for (let attempt = 0; attempt < 6; attempt += 1) {
          const candidateSanitized = sanitizeAssistantTranscript({
            text: candidateAssistantText,
            latestUserMessage: userMessage.content,
            playerName: playerNameForValidation,
          });

          if (!candidateSanitized.formatValid) {
            console.groupCollapsed("story-format:invalid");
            console.log("issues", candidateSanitized.formatIssues);
            console.log("rawAssistantBeforeSanitize", candidateAssistantText);
            console.log("assistantAfterSanitize", candidateSanitized.text);
            console.groupEnd();

            candidateAssistantText = (
              await provider.generateResponse({
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
            console.groupCollapsed("ownership-validator:blocked (loop)");
            console.log("rule", violation.rule);
            console.log("match", violation.match);
            console.log("line", violation.line ?? null);
            console.log("rawAssistantBeforeSanitize", candidateAssistantText);
            console.log("assistantAfterSanitize", candidateSanitized.text);
            console.groupEnd();

            candidateAssistantText = (
              await provider.generateResponse({
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
            candidateAssistantText = (
              await provider.generateResponse({
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
            latestUserMessage: userMessage.content,
            assistantText: candidateSanitized.text,
          });
          if (sceneDup.triggered) {
            console.groupCollapsed("scene-state:renarration");
            console.log("reason", sceneDup.reason);
            console.log("snippet", sceneDup.snippet);
            console.groupEnd();

            candidateAssistantText = (
              await provider.generateResponse({
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
          throw new Error("Unable to generate a response. Please try again.");
        }

        const assistantMessage: StoryMessage = {
          id: createEntityId("story-message"),
          storyId,
          role: "assistant",
          content: finalSanitizedText,
          timestamp: new Date().toISOString(),
          speakerType: "narrator",
        };

        await repository.saveStoryMessage(assistantMessage);

        const updatedMessages = await repository.listStoryMessages(storyId);
        let summaryForState = story.currentSummary;

        if (updatedMessages.length > 0 && updatedMessages.length % 20 === 0) {
          const summaryContext = buildStorySummaryContext({
            storyTitle: story.title,
            playerCharacterName: playerCharacter.name,
            messages: updatedMessages,
          });

          const summaryText = await provider.generateSummary({
            apiKey,
            model,
            storyTitle: story.title,
            messages: summaryContext,
            existingSummary: story.currentSummary,
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

          summaryForState = summaryText;
        }

        if (updatedMessages.length > 0 && updatedMessages.length % 10 === 0) {
          try {
            const extractionContext = buildStoryStateExtractionPrompt({
              playerName: playerCharacter.name,
              summaryText: summaryForState,
              recentMessages: updatedMessages,
              existingStateJson: storyState?.stateJson,
              messageNumberStart: 1,
              messageNumberTotal: updatedMessages.length,
            });

            const stateResponse = await provider.generateResponse({
              apiKey,
              model,
              messages: extractionContext,
            });

            const parsedState = parseStoryStateData(stateResponse.content);

            if (parsedState) {
              const now = new Date().toISOString();
              const nextStateJson = finalizeStoryStateForSave({
                parsedState,
                previousStateJson: storyState?.stateJson,
                totalMessages: updatedMessages.length,
                now,
                mode: "auto",
              });
              const record: StoryState = {
                id: `story-state:${storyId}`,
                storyId,
                stateJson: nextStateJson,
                updatedAt: now,
              };
              await repository.saveStoryState(record);

              const fallbackSummary = parsedState.summaries?.worldSummary?.trim();
              if (!story.currentSummary?.trim() && fallbackSummary) {
                await repository.saveStory({
                  ...story,
                  currentSummary: fallbackSummary,
                  updatedAt: new Date().toISOString(),
                });
              }
            }
          } catch {}
        }

        await touchStory(storyId);
        await hydrate(false);

        const totalMessages = updatedMessages.length;

        void (async () => {
          try {
            const latestStoryState = await repository.getStoryState(storyId);
            const baseParsed = latestStoryState?.stateJson
              ? safeParseStoryStateData(latestStoryState.stateJson)
              : null;

            if (!baseParsed || !latestStoryState?.stateJson) {
              return;
            }

            const baseState = normalizeStoryStateToV2(baseParsed);
            const lastDeepMessageCount =
              baseState.lastDeepIndexedMessageCount ??
              baseState.lastIndexedMessageCount ??
              baseState.indexes?.messageCount ??
              0;
            const nextDeepCounter = Math.max(0, totalMessages - lastDeepMessageCount);

            if (baseState.messagesSinceDeepIndexUpdate !== nextDeepCounter) {
              const now = new Date().toISOString();
              const reconciledIndexes = reconcileStoryIndexes(baseState.indexes, totalMessages);
              const patched = withIndexedMetadata({
                ...baseState,
                memoryArchitectureVersion: "2.0",
                messagesSinceDeepIndexUpdate: nextDeepCounter,
                indexes: reconciledIndexes ?? {
                  messageCount: totalMessages,
                  messageNumberingVersion: "1.0",
                },
              });

              await repository.saveStoryState({
                id: `story-state:${storyId}`,
                storyId,
                stateJson: JSON.stringify(patched),
                updatedAt: now,
              });

              await touchStory(storyId);
              await hydrate(false);
            }

            if (nextDeepCounter < 20) {
              return;
            }

            const rebuilt = await rebuildStoryMemoryAndIndexes({
              storyId,
              repository,
              provider,
              apiKey,
              model,
              onProgress: () => {},
            });

            const now = new Date().toISOString();
            const patchedJson = (() => {
              try {
                const parsed = safeParseStoryStateData(rebuilt.stateJson);
                if (!parsed) {
                  return rebuilt.stateJson;
                }
                return finalizeStoryStateForSave({
                  parsedState: parsed,
                  previousStateJson: latestStoryState?.stateJson,
                  totalMessages,
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
              stateJson: patchedJson,
              updatedAt: now,
            });

            if (!story.currentSummary?.trim() && rebuilt.summaryText?.trim()) {
              await repository.saveStory({
                ...story,
                currentSummary: rebuilt.summaryText.trim(),
                updatedAt: now,
              });
            }

            await touchStory(storyId);
            await hydrate(false);
          } catch {}
        })();
        return assistantMessage;
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
