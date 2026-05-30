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
import type {
  GuardedDeleteResult,
  PlayerCharacter,
  PlayerCharacterDraft,
  StorageStatus,
  Story,
  StoryDraft,
  StoryExportBundle,
  StoryMessage,
  StoryMessageDraft,
  Universe,
  UniverseDraft,
} from "../../types/models";

interface StoryEngineContextValue {
  loading: boolean;
  errorMessage: string | null;
  storageStatus: StorageStatus;
  universes: Universe[];
  playerCharacters: PlayerCharacter[];
  stories: Story[];
  messages: StoryMessage[];
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

  const hydrate = useCallback(
    async (showLoadingState: boolean) => {
      if (showLoadingState) {
        setLoading(true);
      }

      try {
        const [nextUniverses, nextPlayerCharacters, nextStories, nextMessages] =
          await Promise.all([
            repository.listUniverses(),
            repository.listPlayerCharacters(),
            repository.listStories(),
            repository.listAllMessages(),
          ]);

        setUniverses(sortByCreatedAtDesc(nextUniverses));
        setPlayerCharacters(sortByCreatedAtDesc(nextPlayerCharacters));
        setStories(sortByUpdatedAtDesc(nextStories));
        setMessages(sortByTimestampAsc(nextMessages));
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
    [repository],
  );

  useEffect(() => {
    void hydrate(true);
  }, [hydrate]);

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
    };
  }, [
    errorMessage,
    hydrate,
    loading,
    messages,
    playerCharacters,
    repository,
    stories,
    touchStory,
    universes,
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
