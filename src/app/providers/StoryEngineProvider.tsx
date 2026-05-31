import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { detectPlayerCharacterAuthorshipViolation } from "../../lib/storyText/playerProtection";
import { sanitizeAssistantTranscript } from "../../lib/storyText/transcriptSanitizer";
import type {
  AIProviderType,
  AISettings,
  GuardedDeleteResult,
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
  getUniverseById: (id: string) => Universe | undefined;
  getPlayerCharacterById: (id: string) => PlayerCharacter | undefined;
  getStoryById: (id: string) => Story | undefined;
  getMessagesForStory: (storyId: string) => StoryMessage[];
  getPlayerCharactersForUniverse: (universeId: string) => PlayerCharacter[];
  getStoriesForUniverse: (universeId: string) => Story[];
  getStoriesForPlayerCharacter: (playerCharacterId: string) => Story[];
  createUniverse: (draft: UniverseDraft) => Promise<Universe>;
  updateUniverse: (id: string, draft: UniverseDraft) => Promise<Universe | null>;
  deleteUniverse: (id: string) => Promise<GuardedDeleteResult>;
  createPlayerCharacter: (draft: PlayerCharacterDraft) => Promise<PlayerCharacter>;
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
  exportStory: (storyId: string) => Promise<StoryExportBundle | null>;
  exportWorkspaceBackup: () => Promise<StoryEngineBackup>;
  importWorkspaceBackup: (backup: StoryEngineBackup) => Promise<void>;
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
  sendChatMessage: (storyId: string, content: string) => Promise<void>;
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
        ] = await Promise.all([
          repository.listUniverses(),
          repository.listPlayerCharacters(),
          repository.listStories(),
          repository.listAllMessages(),
          getNormalizedAISettings().catch(() => null),
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

  const resolveAIProfile = useCallback(
    async (providerType: AIProviderType, storyModelOverride?: string) => {
      const settings = await getNormalizedAISettings();

      if (!settings) {
        throw new Error("Configure an AI provider in Settings before generating messages.");
      }

      const apiKey = settings.apiKeys?.[providerType]?.trim() ?? "";

      if (!apiKey) {
        throw new Error(
          providerType === "gemini"
            ? "Set a Gemini API key in Settings before generating scenes."
            : "Set an OpenAI API key in Settings before generating scenes.",
        );
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

    return {
      loading,
      errorMessage,
      storageStatus,
      universes,
      playerCharacters,
      stories,
      messages,
      aiSettings,
      getUniverseById: (id) => universes.find((universe) => universe.id === id),
      getPlayerCharacterById: (id) =>
        playerCharacters.find((character) => character.id === id),
      getStoryById: (id) => stories.find((story) => story.id === id),
      getMessagesForStory: (storyId) =>
        sortByTimestampAsc(messages.filter((message) => message.storyId === storyId)),
      getPlayerCharactersForUniverse: (universeId) =>
        sortByCreatedAtDesc(
          playerCharacters.filter((character) => character.universeId === universeId),
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
          pronouns: draft.pronouns.trim(),
          appearance: draft.appearance.trim(),
          personality: draft.personality.trim(),
          background: draft.background.trim(),
          goals: draft.goals.trim(),
          notes: draft.notes.trim(),
          universeId: draft.universeId,
          createdAt: new Date().toISOString(),
        };

        await repository.savePlayerCharacter(nextCharacter);
        await hydrate(false);

        return nextCharacter;
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
          pronouns: draft.pronouns.trim(),
          appearance: draft.appearance.trim(),
          personality: draft.personality.trim(),
          background: draft.background.trim(),
          goals: draft.goals.trim(),
          notes: draft.notes.trim(),
          universeId: draft.universeId,
        };

        await repository.savePlayerCharacter(nextCharacter);
        await hydrate(false);

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
          openingPrompt: draft.openingPrompt.trim(),
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
          openingPrompt: patch.openingPrompt?.trim() ?? currentStory.openingPrompt,
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
        const nextMessage: StoryMessage = {
          id: createEntityId("story-message"),
          storyId: draft.storyId,
          role: draft.role,
          content: draft.content.trim(),
          timestamp: new Date().toISOString(),
          speakerName: draft.speakerName?.trim() || undefined,
          speakerType: draft.speakerType,
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

        const nextMessage: StoryMessage = {
          ...currentMessage,
          role: draft.role,
          content: draft.content.trim(),
          speakerName: draft.speakerName?.trim() || undefined,
          speakerType: draft.speakerType,
        };

        await repository.saveStoryMessage(nextMessage);
        await touchStory(currentMessage.storyId);
        await hydrate(false);

        return nextMessage;
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
      exportStory(storyId) {
        return repository.getStoryExportBundle(storyId);
      },
      exportWorkspaceBackup() {
        return repository.exportWorkspaceBackup();
      },
      async importWorkspaceBackup(backup) {
        await repository.importWorkspaceBackup(backup);
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

        const userMessage: StoryMessage = shouldReuseLastUserMessage
          ? lastMessage
          : {
              id: createEntityId("story-message"),
              storyId,
              role: "user",
              content: trimmed,
              timestamp: new Date().toISOString(),
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
            content: sanitizeAssistantTranscript({ text: message.content }).text,
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

        const sanitizedAssistantText = sanitizeAssistantTranscript({
          text: finalAssistantText,
          latestUserMessage: userMessage.content,
        }).text;

        const violatesOwnership = detectPlayerCharacterAuthorshipViolation({
          playerName: playerCharacter.name,
          text: sanitizedAssistantText,
        });

        const safeAssistantText = violatesOwnership
          ? (
              await provider.generateResponse({
                apiKey,
                model,
                messages: [
                  {
                    role: "system",
                    content: [
                      "Rewrite the following story scene to remove any player-character dialogue, actions, thoughts, feelings, decisions, or internal monologue.",
                      `The player character is: ${playerCharacter.name}.`,
                      "Never include a speaker header for the player character.",
                      "Never narrate actions/thoughts for the player character.",
                      "Remove any repetition of the latest player message.",
                      "Never use narrator labels like 'Narrator:' anywhere in the output.",
                      "Keep continuity, character voice, and natural pacing.",
                      "Asterisks are reserved exclusively for actions; never use asterisks for emphasis.",
                    ].join("\n"),
                  },
                  {
                    role: "user",
                    content: sanitizedAssistantText,
                  },
                ],
              })
            ).content
          : sanitizedAssistantText;

        const sanitizedSafeAssistantText = sanitizeAssistantTranscript({
          text: safeAssistantText,
          latestUserMessage: userMessage.content,
        }).text;

        if (
          detectPlayerCharacterAuthorshipViolation({
            playerName: playerCharacter.name,
            text: sanitizedSafeAssistantText,
          })
        ) {
          throw new Error(
            "Generation blocked: AI attempted to speak or act for the player character. Retry.",
          );
        }

        const assistantMessage: StoryMessage = {
          id: createEntityId("story-message"),
          storyId,
          role: "assistant",
          content: sanitizedSafeAssistantText,
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
              openingPrompt: story.openingPrompt,
              summaryText: summaryForState,
              recentMessages: updatedMessages,
              existingStateJson: storyState?.stateJson,
            });

            const stateResponse = await provider.generateResponse({
              apiKey,
              model,
              messages: extractionContext,
            });

            const parsedState = parseStoryStateData(stateResponse.content);

            if (parsedState) {
              const record: StoryState = {
                id: `story-state:${storyId}`,
                storyId,
                stateJson: JSON.stringify(parsedState),
                updatedAt: new Date().toISOString(),
              };
              await repository.saveStoryState(record);
            }
          } catch {}
        }

        await touchStory(storyId);
        await hydrate(false);
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
