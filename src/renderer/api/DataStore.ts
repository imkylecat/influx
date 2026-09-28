import { Logger } from "../utils/Logger";

const logger = new Logger("DataStore");
const DATABASE_NAME = "Influx";
const STORE_NAME = "data";

// Fluxer removes window.indexedDB as it starts, so this is taken before then.
const factory: IDBFactory | null = (() => {
  try {
    return window.indexedDB ?? null;
  } catch {
    return null;
  }
})();

let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    if (!factory) {
      reject(new Error("No IndexedDB available"));
      return;
    }
    const request = factory.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const store = (await openDatabase()).transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// For data too large for settings. Values are stored as they are, so dates stay dates.
export async function getData<T>(key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>("readonly", (store) => store.get(key));
  } catch (error) {
    logger.error(`Failed to load ${key}`, error);
    return undefined;
  }
}

export async function setData(key: string, value: unknown): Promise<void> {
  try {
    await run("readwrite", (store) => store.put(value, key));
  } catch (error) {
    logger.error(`Failed to save ${key}`, error);
  }
}

export async function deleteData(key: string): Promise<void> {
  try {
    await run("readwrite", (store) => store.delete(key));
  } catch (error) {
    logger.error(`Failed to delete ${key}`, error);
  }
}
