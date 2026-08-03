const DATABASE_NAME = "story-engine-db";
const DATABASE_VERSION = 9;

export type StoreName =
  | "universes"
  | "playerCharacters"
  | "stories"
  | "messages"
  | "storyMetaMessages"
  | "storyChapters"
  | "aiSettings"
  | "storyAiConfigs"
  | "universeImports"
  | "storySummaries"
  | "storyStates"
  | "backgroundJobs"
  | "storyUiStates"
  | "developerBugs"
  | "developerFeatureRequests"
  | "developerTestingNotes"
  | "autoBackups"
  | "geminiTtsCache";

let databasePromise: Promise<IDBDatabase> | null = null;

function ensureIndexedDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this browser.");
  }
}

export function openStoryEngineDatabase() {
  ensureIndexedDb();

  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction;
      const oldVersion = event.oldVersion;
      const newVersion = event.newVersion ?? DATABASE_VERSION;

      if (!transaction) {
        throw new Error("IndexedDB upgrade transaction was not available.");
      }

      const ensureStore = <T extends StoreName>(
        storeName: T,
        options: IDBObjectStoreParameters,
      ) => {
        if (!database.objectStoreNames.contains(storeName)) {
          return database.createObjectStore(storeName, options);
        }
        return transaction.objectStore(storeName);
      };

      const ensureIndex = (
        store: IDBObjectStore,
        indexName: string,
        keyPath: string | string[],
        options: IDBIndexParameters,
      ) => {
        if (store.indexNames.contains(indexName)) {
          return;
        }
        store.createIndex(indexName, keyPath, options);
      };

      ensureStore("universes", { keyPath: "id" });

      const playerCharacters = ensureStore("playerCharacters", { keyPath: "id" });
      ensureIndex(playerCharacters, "universeId", "universeId", { unique: false });
      ensureIndex(playerCharacters, "universeIds", "universeIds", { unique: false, multiEntry: true });

      const stories = ensureStore("stories", { keyPath: "id" });
      ensureIndex(stories, "universeId", "universeId", { unique: false });
      ensureIndex(stories, "universeIds", "universeIds", { unique: false, multiEntry: true });
      ensureIndex(stories, "playerCharacterId", "playerCharacterId", { unique: false });

      const messages = ensureStore("messages", { keyPath: "id" });
      ensureIndex(messages, "storyId", "storyId", { unique: false });

      const storyMetaMessages = ensureStore("storyMetaMessages", { keyPath: "id" });
      ensureIndex(storyMetaMessages, "storyId", "storyId", { unique: false });

      const storyChapters = ensureStore("storyChapters", { keyPath: "id" });
      ensureIndex(storyChapters, "storyId", "storyId", { unique: false });

      ensureStore("aiSettings", { keyPath: "id" });

      const storyAiConfigs = ensureStore("storyAiConfigs", { keyPath: "id" });
      ensureIndex(storyAiConfigs, "storyId", "storyId", { unique: false });

      const universeImports = ensureStore("universeImports", { keyPath: "id" });
      ensureIndex(universeImports, "universeId", "universeId", { unique: false });

      const storySummaries = ensureStore("storySummaries", { keyPath: "id" });
      ensureIndex(storySummaries, "storyId", "storyId", { unique: false });

      const storyStates = ensureStore("storyStates", { keyPath: "id" });
      ensureIndex(storyStates, "storyId", "storyId", { unique: false });

      const backgroundJobs = ensureStore("backgroundJobs", { keyPath: "id" });
      ensureIndex(backgroundJobs, "storyId", "storyId", { unique: false });
      ensureIndex(backgroundJobs, "status", "status", { unique: false });

      const storyUiStates = ensureStore("storyUiStates", { keyPath: "id" });
      ensureIndex(storyUiStates, "storyId", "storyId", { unique: true });

      ensureStore("developerBugs", { keyPath: "id" });
      ensureStore("developerFeatureRequests", { keyPath: "id" });
      ensureStore("developerTestingNotes", { keyPath: "id" });

      const autoBackups = ensureStore("autoBackups", { keyPath: "id" });
      ensureIndex(autoBackups, "createdAt", "createdAt", { unique: false });

      const geminiTtsCache = ensureStore("geminiTtsCache", { keyPath: "id" });
      ensureIndex(geminiTtsCache, "createdAtMs", "createdAtMs", { unique: false });

      const runMigrations = (fromVersion: number, toVersion: number) => {
        if (fromVersion < 2 && toVersion >= 2) {
          return;
        }

        if (fromVersion < 3 && toVersion >= 3) {
          return;
        }

        if (fromVersion < 4 && toVersion >= 4) {
          return;
        }

        if (fromVersion < 5 && toVersion >= 5) {
          return;
        }

        if (fromVersion < 6 && toVersion >= 6) {
          return;
        }

        if (fromVersion < 7 && toVersion >= 7) {
          const migrateUniverseIds = (storeName: "playerCharacters" | "stories") => {
            const store = transaction.objectStore(storeName);
            const request = store.openCursor();

            request.onsuccess = () => {
              const cursor = request.result;
              if (!cursor) {
                return;
              }

              const record = cursor.value as {
                universeId?: string;
                universeIds?: string[];
              };

              if (!record.universeIds?.length && record.universeId?.trim()) {
                cursor.update({
                  ...record,
                  universeIds: [record.universeId.trim()],
                });
              }

              cursor.continue();
            };
          };

          migrateUniverseIds("playerCharacters");
          migrateUniverseIds("stories");
        }

        if (fromVersion < 8 && toVersion >= 8) {
          return;
        }

        if (fromVersion < 9 && toVersion >= 9) {
          return;
        }
      };

      runMigrations(oldVersion, newVersion);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open IndexedDB."));
  });

  return databasePromise;
}

export async function getAllFromStore<RecordType>(storeName: StoreName) {
  const database = await openStoryEngineDatabase();

  return new Promise<RecordType[]>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();

    request.onsuccess = () => resolve((request.result as RecordType[]) ?? []);
    request.onerror = () =>
      reject(request.error ?? new Error(`Unable to read ${storeName}.`));
  });
}

export async function getFromStore<RecordType>(
  storeName: StoreName,
  id: string,
) {
  const database = await openStoryEngineDatabase();

  return new Promise<RecordType | null>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(id);

    request.onsuccess = () => resolve((request.result as RecordType) ?? null);
    request.onerror = () =>
      reject(request.error ?? new Error(`Unable to read ${storeName}.`));
  });
}

export async function putInStore<RecordType extends { id: string }>(
  storeName: StoreName,
  value: RecordType,
) {
  const database = await openStoryEngineDatabase();

  return new Promise<RecordType>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);

    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () =>
      reject(transaction.error ?? new Error(`Unable to save ${storeName}.`));
  });
}

export async function putManyInStore<RecordType extends { id: string }>(
  storeName: StoreName,
  values: RecordType[],
) {
  if (!values.length) {
    return;
  }

  const database = await openStoryEngineDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    for (const value of values) {
      store.put(value);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error(`Unable to save ${storeName}.`));
  });
}

export async function deleteFromStore(storeName: StoreName, id: string) {
  const database = await openStoryEngineDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error(`Unable to delete ${storeName}.`));
  });
}

export async function getAllByIndex<RecordType>(
  storeName: StoreName,
  indexName: string,
  value: string,
) {
  const database = await openStoryEngineDatabase();

  return new Promise<RecordType[]>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const index = transaction.objectStore(storeName).index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve((request.result as RecordType[]) ?? []);
    request.onerror = () =>
      reject(request.error ?? new Error(`Unable to read ${storeName}.`));
  });
}

export async function deleteAllByIndex(
  storeName: StoreName,
  indexName: string,
  value: string,
) {
  const database = await openStoryEngineDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const index = transaction.objectStore(storeName).index(indexName);
    const request = index.openCursor(IDBKeyRange.only(value));

    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        return;
      }

      cursor.delete();
      cursor.continue();
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error(`Unable to clear ${storeName}.`));
  });
}

export async function clearStore(storeName: StoreName) {
  const database = await openStoryEngineDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error(`Unable to clear ${storeName}.`));
  });
}
