import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { createConversationRepository } from "../repository";
import { getAllFromStore, openStoryEngineDatabase } from "../../../lib/idb";

it("upgrades a real version-12 database without deleting legacy messages, headers or drafts", async () => {
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("story-engine-db", 12);
    request.onupgradeneeded = () => {
      for (const name of [
        "stories",
        "metaChatConversations",
        "storyMetaMessages",
        "storyUiStates",
      ])
        request.result.createObjectStore(name, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const legacyMessage = {
    id: "old-message",
    storyId: "old-chat",
    role: "user",
    content: "A discussion worth keeping",
    timestamp: "2026-01-01T00:00:00Z",
  };
  const draft = {
    id: "draft",
    storyId: "old-chat",
    metaChatDraft: "Unsent thought",
    metaChatReferences: [],
    updatedAt: "2026-01-01T00:00:00Z",
  };
  await new Promise<void>((resolve, reject) => {
    const tx = old.transaction(
      ["metaChatConversations", "storyMetaMessages", "storyUiStates"],
      "readwrite",
    );
    tx.objectStore("metaChatConversations").put({
      id: "old-chat",
      title: "Old chat",
      createdAt: legacyMessage.timestamp,
      updatedAt: legacyMessage.timestamp,
    });
    tx.objectStore("storyMetaMessages").put(legacyMessage);
    tx.objectStore("storyUiStates").put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  old.close();
  const repository = createConversationRepository();
  await repository.migrateLegacy();
  expect((await openStoryEngineDatabase()).version).toBe(13);
  expect(await getAllFromStore("storyMetaMessages")).toEqual([legacyMessage]);
  expect(await getAllFromStore("storyUiStates")).toEqual([draft]);
  expect((await repository.list())[0].messages[0].content).toBe(
    legacyMessage.content,
  );
  expect((await repository.list())[0].title).toBe("Old chat");
});
