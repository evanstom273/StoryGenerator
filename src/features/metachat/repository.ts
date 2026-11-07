import {
  getAllFromStore,
  getFromStore,
  openStoryEngineDatabase,
} from "../../lib/idb";
import type {
  MetaChatConversation,
  Story,
  StoryMetaMessage,
  StoryUiState,
} from "../../types/models";
import type { Conversation } from "./types";

export interface ConversationRepository {
  list(): Promise<Conversation[]>;
  get(id: string): Promise<Conversation | null>;
  /** Compare-and-swap commits the complete turn atomically, including memory/proposals. */
  save(
    record: Conversation,
    expectedRevision: number | null,
  ): Promise<Conversation>;
  migrateLegacy(): Promise<void>;
}
export const CONVERSATION_CONFLICT =
  "This conversation changed in another tab. Reload it before trying again.";

export function createConversationRepository(): ConversationRepository {
  const repository: ConversationRepository = {
    async list() {
      return (await getAllFromStore<Conversation>("metaChatThreads"))
        .filter((item) => !item.deletedAt && item.messages.length > 0)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    get(id) {
      return getFromStore<Conversation>("metaChatThreads", id);
    },
    async save(record, expectedRevision) {
      const db = await openStoryEngineDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("metaChatThreads", "readwrite");
        const store = tx.objectStore("metaChatThreads");
        const request = store.get(record.id);
        let result: Conversation;
        let error: Error | undefined;
        request.onsuccess = () => {
          const current = request.result as Conversation | undefined;
          if (
            (current?.revision ?? null) !== expectedRevision ||
            current?.deletedAt
          ) {
            error = new Error(CONVERSATION_CONFLICT);
            tx.abort();
            return;
          }
          result = { ...record, revision: (expectedRevision ?? -1) + 1 };
          store.put(result);
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () =>
          reject(
            error ?? tx.error ?? new Error("Could not save the conversation."),
          );
      });
    },
    async migrateLegacy() {
      const [headers, messages, uiStates, stories] = await Promise.all([
        getAllFromStore<MetaChatConversation>("metaChatConversations"),
        getAllFromStore<StoryMetaMessage>("storyMetaMessages"),
        getAllFromStore<StoryUiState>("storyUiStates"),
        getAllFromStore<Story>("stories"),
      ]);
      const groups = new Map<string, StoryMetaMessage[]>();
      for (const message of messages) {
        const group = groups.get(message.storyId) ?? [];
        group.push(message);
        groups.set(message.storyId, group);
      }
      for (const [scope, items] of groups) {
        const id = `metachat-v2-legacy:${scope}`;
        if (await repository.get(id)) continue;
        items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        const header = headers.find((item) => item.id === scope);
        const story = stories.find((item) => item.id === scope);
        const references =
          uiStates.find((item) => item.storyId === scope)?.metaChatReferences ??
          [];
        const attachments = [...references];
        if (
          story &&
          !attachments.some(
            (item) => item.kind === "story" && item.id === story.id,
          )
        ) {
          attachments.push({ kind: "story", id: story.id, label: story.title });
        }
        const record: Conversation = {
          version: 2,
          id,
          title:
            header?.title ??
            (story ? `${story.title} discussion` : "Imported conversation"),
          createdAt: header?.createdAt ?? items[0].timestamp,
          updatedAt: header?.updatedAt ?? items[items.length - 1].timestamp,
          revision: 0,
          attachments,
          revisions: [],
          migratedFrom: scope,
          messages: items.map((item) => ({
            id: item.id,
            role: item.role,
            content: item.content,
            createdAt: item.timestamp,
            attachments: item.referenceSnapshot,
          })),
        };
        try {
          await repository.save(record, null);
        } catch (error) {
          if (!(await repository.get(id))) throw error;
        }
      }
      // Legacy stores are intentionally untouched, including empty headers and drafts.
    },
  };
  return repository;
}
