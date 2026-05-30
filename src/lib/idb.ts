const DATABASE_NAME = "story-engine-db";
const DATABASE_VERSION = 1;

export type StoreName =
  | "universes"
  | "playerCharacters"
  | "stories"
  | "messages";

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

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains("universes")) {
        database.createObjectStore("universes", { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains("playerCharacters")) {
        const store = database.createObjectStore("playerCharacters", {
          keyPath: "id",
        });
        store.createIndex("universeId", "universeId", { unique: false });
      }

      if (!database.objectStoreNames.contains("stories")) {
        const store = database.createObjectStore("stories", {
          keyPath: "id",
        });
        store.createIndex("universeId", "universeId", { unique: false });
        store.createIndex("playerCharacterId", "playerCharacterId", {
          unique: false,
        });
      }

      if (!database.objectStoreNames.contains("messages")) {
        const store = database.createObjectStore("messages", {
          keyPath: "id",
        });
        store.createIndex("storyId", "storyId", { unique: false });
      }
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

