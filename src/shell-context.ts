// What the shell lends the flows it runs.
//
// The shell owns the workspace's state (the store, every file's text,
// the index, the open document) and the few operations that change it
// together: opening, saving, reindexing. A flow (making a tutorial,
// renaming one, opening a pull request) reads that state through here
// and asks the shell to act, rather than keeping its own copy. The
// getters are functions because the shell replaces its maps when a
// workspace opens.

import type { Document } from "./editor.ts";
import type { Spine } from "./spine.ts";
import type { Ask } from "./ask.ts";
import type { Store } from "./store.ts";
import type { FileIndexEntry } from "./workspace.ts";
import type { Course } from "./courses.ts";

export interface OpenDocument {
  path: string;
  /** What the editor made of the file as last saved, so "is this dirty"
   * is a comparison rather than a flag somebody has to remember to
   * clear. */
  saved: string;
  document: Document;
}

export interface ShellContext {
  store(): Store | null;
  /** Every markdown and course file's text, by path, as last saved. */
  files(): Map<string, string>;
  /** Every file as the workspace opened with it: a folder's published
   * copy, for a release. */
  opened(): Map<string, string>;
  /** Every image path in the workspace. */
  images(): Set<string>;
  index(): FileIndexEntry[];
  courses(): Course[];
  open(): OpenDocument | null;
  isDirty(): boolean;

  readonly spine: Spine;
  readonly asker: Ask;

  /** Asks about unsaved changes; false means stay where you are. */
  readyToLeave(): Promise<boolean>;
  /** Opens a file, asking first if that would lose unsaved changes. */
  openPath(path: string): Promise<boolean>;
  /** Opens a file with no question asked, for a caller that has already
   * written what the open document held. */
  showPath(path: string): Promise<boolean>;
  saveNow(): Promise<boolean>;
  /** Replaces the open document's text, keeping its path; unsaved. */
  remount(markdown: string): Promise<void>;
  /** Leaves no document open, and shows the empty page. */
  closeDocument(): void;
  /** Rebuilds the index and course list from `files()`. */
  reindex(): void;
  refreshSpine(): void;
  /** Throws away the browser's kept copy of a file's unsaved changes. */
  dropDraftOf(path: string): Promise<void>;
  /** Carries the recent-documents list across files that moved. */
  followMoves(moves: ReadonlyMap<string, string>): void;
  /** What the checker needs to know about everything else. */
  around(): { ids: Set<string>; images: Set<string> };
  /** Shows the whole workspace's problems. */
  checkWholeWorkspace(): void;
  /** An image the document names, as a data URI. */
  asDataUri(documentPath: string, src: string): Promise<string | null>;
  /** Reloads the page without the "leave site?" prompt. */
  reload(): void;
}
