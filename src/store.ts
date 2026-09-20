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
  /** Repository only: opens (or finds) the draft pull request for the
   * working branch, and answers with its URL. */
  publish?(): Promise<string>;
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
          asProblem(saveProblem(`${path} changed on ${branch} since you opened it.`, true));
        }
        if (status === 422 && !shas.has(path)) {
          asProblem(saveProblem(`${path} already exists on ${branch}.`));
        }
        asProblem(error);
      }
    },

    publish: async () =>
      (await github.openPullRequest(repo, branch, base, `Edits from dewnote (${branch})`, token))
        .html_url,
  };
}
