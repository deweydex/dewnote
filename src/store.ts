// Where documents come from and go back to.
//
// Two stores, one interface: a local folder and a GitHub repository.
// Neither has a file browser of its own, because the palette is the
// browser — what is left is the protocol and a way to name it.
//
// A store never touches the DOM and never decides what to show. It reads
// bytes, writes bytes, and says plainly when a write did not happen.

import * as github from "./github.ts";
import * as folder from "./folder.ts";
import { saveProblem, messageOf, type SaveProblem } from "./save-problem.ts";
import type { Change } from "./rename.ts";
import type { BranchChange } from "./pull-request.ts";

export interface StoreFile {
  path: string;
  content: string;
}

export type Progress = (done: number, total: number) => void;

/** Read `items` `width` at a time. Serially, a repository of 190 files is
 * 190 round trips one after another, which takes long enough that the
 * interface looks broken; GitHub's rate limiter is the reason not to
 * simply fire all of them at once. */
async function inParallel<T, R>(
  items: readonly T[],
  width: number,
  read: (item: T) => Promise<R>,
  onProgress?: Progress,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(width, items.length) }, async () => {
    for (let at = next++; at < items.length; at = next++) {
      results[at] = await read(items[at]!);
      done += 1;
      onProgress?.(done, items.length);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface Store {
  readonly kind: "folder" | "repo";
  /** False for a workspace that promises to keep nothing, the sample:
   * no copy of unsaved changes is kept in the browser for it. */
  readonly keepsDrafts?: boolean;
  /** What the spine says: a folder's name, or `owner/repo · base → branch`. */
  readonly label: string;
  /** Every markdown file and module descriptor, read once when the
   * workspace opens and refreshed on save. `onProgress` is called as
   * files arrive, because reading a repository is hundreds of requests
   * and silence for that long is indistinguishable from a hang. */
  list(onProgress?: Progress): Promise<StoreFile[]>;
  read(path: string): Promise<string>;
  /** An image the document names. `null` where nothing is at that path,
   * which is a normal outcome for a document being written. */
  readBytes(path: string): Promise<Uint8Array<ArrayBuffer> | null>;
  /** The names directly inside `folder`, for choosing an asset name
   * that is not already somebody else's. */
  listFolder(folder: string): Promise<string[]>;
  /** Every image in the workspace, by path. Read once when the
   * workspace opens: the editor never opens an image, so neither
   * `list()` nor the index sees one, and without this an image whose
   * file was renamed is indistinguishable from one that is fine. */
  imagePaths(): Promise<string[]>;
  /** An image written beside a document. */
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  /** Throws a `SaveProblem` and nothing else. Every failure an author can
   * do something about has a sentence written for them. */
  write(path: string, text: string, message: string): Promise<void>;
  /** Several changes that belong together, as one commit where the
   * store has commits: a tutorial renamed, with every file that names
   * it. Throws a `SaveProblem`, as `write` does, and on a repository
   * nothing is changed when it throws. A folder has no transactions, so
   * there each change is made in turn, removals last, and a failure
   * part-way is reported with what was left undone. */
  apply(changes: readonly Change[], message: string): Promise<void>;
  /** Repository only: opens a draft pull request for the working
   * branch, and answers with its URL. */
  publish?(title: string, body: string): Promise<string>;
  /** Repository only: forgets the token this browser keeps for the
   * next session. The workspace itself is closed by reloading. */
  disconnect?(): void;
  /** Repository only: the pull request already open for the working
   * branch, by URL, or null. */
  existingPullRequest?(): Promise<string | null>;
  /** Repository only: every file the working branch changes against the
   * base branch, which is what a pull request would show. */
  branchChanges?(): Promise<BranchChange[]>;
  /** Repository only: the file as readers have it, on the base branch.
   * `null` where the base branch has no such file. A release freezes
   * this rather than the last save, which on a repository is only the
   * working branch. A store without it has no published copy of its
   * own, and the shell uses the file as the workspace opened with it. */
  readPublished?(path: string): Promise<string | null>;
}

function isSaveProblem(value: unknown): value is SaveProblem {
  return typeof value === "object" && value !== null && "conflict" in value && "message" in value;
}

/** Rethrows anything that is already a `SaveProblem`, and wraps anything
 * else in one — so a caller only ever has one shape to handle, and a
 * surprise from `fetch` or the file system still reaches the author as a
 * sentence rather than as a silent dirty marker. */
function asProblem(error: unknown, conflict = false): never {
  if (isSaveProblem(error)) throw error;
  throw saveProblem(messageOf(error), conflict);
}

// ── a local folder ───────────────────────────────────────────────────

export async function openFolder(): Promise<Store | null> {
  const root = await folder.chooseFolder();
  if (!root) return null;

  const handles = new Map<string, FileSystemFileHandle>();

  return {
    kind: "folder",
    label: root.name,

    async list(onProgress) {
      const [markdown, descriptors] = await Promise.all([
        folder.listMarkdownFiles(root),
        folder.listModuleFiles(root),
      ]);
      const found = [...markdown, ...descriptors];
      for (const file of found) handles.set(file.path, file.handle);
      return inParallel(found, 16, async (file) => ({
        path: file.path,
        content: await folder.readFile(file.handle),
      }), onProgress);
    },

    async read(path) {
      const handle = handles.get(path);
      if (!handle) throw new Error(`nothing at ${path}`);
      return folder.readFile(handle);
    },

    readBytes: (path) => folder.readBytesAt(root, path),

    listFolder: (path) => folder.listNamesIn(root, path).catch(() => []),

    async imagePaths() {
      const found = await folder.listImageFiles(root).catch(() => []);
      return found.map((file) => file.path);
    },

    async writeBytes(path, bytes) {
      try {
        const made = await folder.createFile(root, path, bytes as Uint8Array<ArrayBuffer>);
        handles.set(path, made.handle);
      } catch (error) {
        asProblem(error);
      }
    },

    async apply(changes) {
      const done: string[] = [];
      try {
        // Everything new first, so a failure leaves the old files in
        // place: a copy too many rather than a file lost.
        for (const change of changes) {
          if (change.kind === "write") {
            const handle = handles.get(change.path);
            if (handle) await folder.writeFile(handle, change.text);
            else handles.set(change.path, (await folder.createFile(root, change.path, change.text)).handle);
            done.push(change.path);
          } else if (change.kind === "move") {
            const bytes = await folder.readBytesAt(root, change.from);
            if (!bytes) throw new Error(`${change.from} is no longer there.`);
            handles.set(change.to, (await folder.createFile(root, change.to, bytes)).handle);
            done.push(change.to);
          }
        }
        for (const change of changes) {
          if (change.kind === "write") continue;
          const path = change.kind === "move" ? change.from : change.path;
          await folder.removeFile(root, path);
          handles.delete(path);
          done.push(path);
        }
      } catch (error) {
        asProblem(saveProblem(
          done.length === 0
            ? `Nothing was changed: ${messageOf(error)}`
            : `Stopped part-way: ${messageOf(error)} ${done.length} file${done.length === 1 ? " had" : "s had"} ` +
              "already changed, so check the folder before carrying on.",
        ));
      }
    },

    async write(path, text) {
      const handle = handles.get(path);
      try {
        if (handle) await folder.writeFile(handle, text);
        else handles.set(path, (await folder.createFile(root, path, text)).handle);
      } catch (error) {
        asProblem(error);
      }
    },
  };
}

export const canOpenFolder = folder.supportsDirectoryPicker;

// ── a GitHub repository ──────────────────────────────────────────────

export interface RepoOptions {
  repo: github.RepoRef;
  base: string;
  branch: string;
  token: string;
}

export async function openRepo(options: RepoOptions): Promise<Store> {
  const { repo, base, branch, token } = options;
  await github.ensureBranch(repo, branch, base, token);

  /** The blob sha each file was read at. Sending it back with a write is
   * GitHub's own optimistic-concurrency check, and it is the only thing
   * standing between two tabs and a silent overwrite. */
  const shas = new Map<string, string>();

  return {
    kind: "repo",
    label: `${repo.owner}/${repo.repo} · ${base} → ${branch}`,

    async list(onProgress) {
      const [markdown, descriptors] = await Promise.all([
        github.listMarkdownFiles(repo, branch, token),
        github.listModuleFiles(repo, branch, token),
      ]);
      return inParallel([...markdown, ...descriptors], 8, async (file) => {
        const { content, sha } = await github.getFileContent(repo, file.path, branch, token);
        shas.set(file.path, sha);
        return { path: file.path, content };
      }, onProgress);
    },

    async read(path) {
      const { content, sha } = await github.getFileContent(repo, path, branch, token);
      shas.set(path, sha);
      return content;
    },

    async readBytes(path) {
      try {
        return await github.getFileBytes(repo, path, branch, token);
      } catch {
        return null;
      }
    },

    listFolder: (path) => github.listDirectory(repo, path, branch, token).catch(() => []),

    async imagePaths() {
      const found = await github.listImageFiles(repo, branch, token).catch(() => []);
      return found.map((file) => file.path);
    },

    async writeBytes(path, bytes) {
      try {
        const result = await github.putFileContent(
          repo, path, bytes, shas.get(path), branch, `Add ${path}`, token,
        );
        shas.set(path, result.sha);
      } catch (error) {
        asProblem(error);
      }
    },

    async write(path, text, message) {
      try {
        const result = await github.putFileContent(
          repo, path, text, shas.get(path), branch, message, token,
        );
        shas.set(path, result.sha);
      } catch (error) {
        const status = error instanceof github.GithubApiError ? error.status : 0;
        // 409 is the one failure the author has to resolve rather than
        // retry: the file moved under them and both versions exist.
        if (status === 409) {
          asProblem(saveProblem(
            `Not saved: ${path} was changed on ${branch} after you opened it, probably from another tab or by someone else. ` +
              "Your changes are still on screen. Save again to compare the two versions and choose one.",
            true,
          ));
        }
        if (status === 422 && !shas.has(path)) {
          asProblem(saveProblem(`Not saved: ${path} already exists on ${branch}. Open that file instead.`));
        }
        if (status === 401 || status === 403) {
          asProblem(saveProblem(
            "Not saved: GitHub refused the token. It may have expired, or may not have write access to Contents. " +
              "Reload dewnote and connect with a new token.",
          ));
        }
        asProblem(error);
      }
    },

    async apply(changes, message) {
      try {
        const written = await github.commitChanges(repo, branch, changes, shas, message, token);
        for (const change of changes) {
          if (change.kind === "remove") shas.delete(change.path);
          if (change.kind === "move") shas.delete(change.from);
        }
        for (const [path, sha] of written) shas.set(path, sha);
      } catch (error) {
        if (error instanceof github.CommitRefused) {
          asProblem(saveProblem(`Nothing was changed: ${error.message}`, error.conflict));
        }
        const status = error instanceof github.GithubApiError ? error.status : 0;
        if (status === 401 || status === 403) {
          asProblem(saveProblem(
            "Nothing was changed: GitHub refused the token. It may have expired, or may not have write access to Contents.",
          ));
        }
        asProblem(error);
      }
    },

    publish: async (title, body) =>
      (await github.openPullRequest(repo, branch, base, title, body, token)).html_url,

    disconnect: () => github.forgetToken(),

    existingPullRequest: async () =>
      (await github.findPullRequest(repo, branch, base, token))?.html_url ?? null,

    branchChanges: () => github.compareBranches(repo, base, branch, token),

    async readPublished(path) {
      try {
        return (await github.getFileContent(repo, path, base, token)).content;
      } catch (error) {
        if (error instanceof github.GithubApiError && error.status === 404) return null;
        throw error;
      }
    },
  };
}
