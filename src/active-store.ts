// The store-agnostic "open this path" hook named as still open in
// PLAN.md §6 step 4 — deliberately not built when the series view first
// shipped, since neither folder-panel.ts nor repo-panel.ts exposed
// anything a third module could call to open a file by path. Each store
// already knows how to open one of its own files correctly (a real
// writable FileSystemFileHandle for a folder; a branch-aware fetch,
// eligible for the same push/conflict flow, for a repository) — this
// only routes a request to whichever store is actually open, rather
// than reimplementing either one's own open logic a second time.
//
// A module-level singleton, not something threaded through every
// caller, for the same reason app.ts's own sharedFileIndex is one:
// there is only ever one store open at a time in this single-document
// editor, and whichever was opened or loaded most recently is the one
// "open this path" should mean.

export interface ActiveStore {
  /** Opens the file at `path` into the current document, the same way a
   * click in that store's own file list already would. Resolves to
   * `false` if no file at that path exists in this store (a stale
   * series entry, an unindexed slug) rather than throwing — a caller
   * asking about a path that turns out not to exist is a normal
   * outcome, not an error. */
  openPath(path: string): Promise<boolean>;
}

let active: ActiveStore | null = null;

/** Called once each store starts existing (folder-panel.ts, repo-panel.ts) —
 * not on every open/load within it, since the registered `openPath`
 * closes over that panel's own live file list and sees every later
 * refresh without needing to re-register. */
export function setActiveStore(store: ActiveStore | null): void {
  active = store;
}

export function openPath(path: string): Promise<boolean> {
  return active ? active.openPath(path) : Promise.resolve(false);
}
