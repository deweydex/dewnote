// Unsaved changes, kept in the browser until they are saved or thrown
// away.
//
// The unsaved-changes question covers every way the author can leave a
// document on purpose. This covers the ways they do not: a crashed tab,
// a browser that quits, a laptop that runs out of battery. It is a copy
// in IndexedDB, keyed by workspace and path, and nothing more: it is
// never written anywhere else, and a browser that refuses storage (a
// private window, a file:// page with storage blocked) just means no
// copy is kept. Every failure here is silent on purpose; losing a
// safety net is not something to interrupt the author about.

const DATABASE = "dewnote";
const STORE = "drafts";

let opening: Promise<IDBDatabase | null> | null = null;

function database(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

async function run<T>(
  mode: IDBTransactionMode,
  act: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const db = await database();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const request = act(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export interface Draft {
  /** The document's markdown when the copy was taken. */
  text: string;
  /** When, in milliseconds since the epoch. */
  at: number;
}

export async function keepDraft(key: string, text: string): Promise<void> {
  await run("readwrite", (store) => store.put({ text, at: Date.now() } satisfies Draft, key));
}

export async function draftFor(key: string): Promise<Draft | undefined> {
  const found = await run("readonly", (store) => store.get(key) as IDBRequest<Draft | undefined>);
  return found && typeof found.text === "string" ? found : undefined;
}

export async function dropDraft(key: string): Promise<void> {
  await run("readwrite", (store) => store.delete(key));
}
