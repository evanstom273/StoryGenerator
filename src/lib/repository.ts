import type {
  EntityId,
  PlayerCharacter,
  Story,
  StoryExportBundle,
  StoryMessage,
  Universe,
} from "../types/models";
import {
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

      const [universe, playerCharacter, messages] = await Promise.all([
        getFromStore<Universe>("universes", story.universeId),
        getFromStore<PlayerCharacter>("playerCharacters", story.playerCharacterId),
        getAllByIndex<StoryMessage>("messages", "storyId", storyId),
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
      };
    },
  };
}

export const storyEngineRepository = createIndexedDbStoryEngineRepository();

