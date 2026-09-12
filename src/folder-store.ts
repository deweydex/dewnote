// The rest of step 4 (plan §5.5, §6): mounting a real local folder —
// `~/dewlab/tutorials/`, say — rather than one file at a time. This is
// the File System Access API's directory picker, which decision 5 is
// explicit about: Chrome and Edge only, never Safari, on any Apple
// platform — `supportsDirectoryPicker` feature-detects it directly
// rather than sniffing a browser, the same way `store.ts`'s single-file
// path already does for `showOpenFilePicker`.
//
// A file opened from a mounted folder is, structurally, exactly the
// single-file case store.ts and file-bar.ts already built and tested in
// #18 — a name, some content, and a real writable `FileSystemFileHandle`.
// Nothing here duplicates Save or the dirty indicator; `folder-panel.ts`
// hands an opened folder file to the existing file bar instead.

export interface FolderFile {
  /** Path relative to the mounted folder's root, e.g. "content/a.md". */
  path: string;
  handle: FileSystemFileHandle;
}

/** A minimal shape of `FileSystemDirectoryHandle` — just `entries()` —
 * so the walk below can be exercised against a hand-built fake in tests
 * without a real browser or its File System Access implementation. */
export interface DirectoryLike {
  entries(): AsyncIterable<[string, FileSystemHandle | DirectoryLike]>;
}

export function supportsDirectoryPicker(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

/** Opens the OS folder picker with read/write permission. Resolves to
 * null on cancel, matching `store.ts`'s own openFile — not an error. */
export async function chooseFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (
      window as unknown as {
        showDirectoryPicker(opts: { mode: string }): Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker({ mode: "readwrite" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}

/** Walks `root` recursively, collecting every file whose path satisfies
 * `matches` — `listMarkdownFiles` and `listOrderFiles` are both thin
 * wrappers over this with their own suffix check, so the walk itself
 * exists once. Takes a `DirectoryLike` rather than the real
 * `FileSystemDirectoryHandle` type specifically so this is unit-testable
 * against a fake — the same "verify the walk, not the browser API"
 * split `github.ts`'s own truncation fallback uses against a mocked
 * `fetch`. */
async function walk(root: DirectoryLike, matches: (path: string) => boolean): Promise<FolderFile[]> {
  const results: FolderFile[] = [];
  async function step(dir: DirectoryLike, prefix: string): Promise<void> {
    for await (const [name, handle] of dir.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      // Duck-typed on `entries` rather than `.kind`, so a hand-built
      // fake directory in a test needs nothing but that one method —
      // the same minimal shape `DirectoryLike` itself declares.
      if (typeof (handle as Partial<DirectoryLike>).entries === "function") {
        await step(handle as DirectoryLike, path);
      } else if (matches(path)) {
        results.push({ path, handle: handle as FileSystemFileHandle });
      }
    }
  }
  await step(root, "");
  return results;
}

/** Every markdown file under `root`, walked recursively. */
export async function listMarkdownFiles(root: DirectoryLike): Promise<FolderFile[]> {
  return walk(root, (path) => path.endsWith(".md"));
}

/** Every `<series>.order.yaml` file under `root` — series.ts's own
 * reading-order files (DIALECTS.md §1), the source series-panel.ts reads
 * alongside `listMarkdownFiles`'s front-matter index. */
export async function listOrderFiles(root: DirectoryLike): Promise<FolderFile[]> {
  return walk(root, (path) => path.endsWith(".order.yaml"));
}

export async function readFile(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

/** Creates a new file at `relativePath` under `root`, creating any
 * missing intermediate directories along the way (`getDirectoryHandle`'s
 * own `{ create: true }`) — the write half of what `walk` above does for
 * reading. Real `FileSystemDirectoryHandle`, not `DirectoryLike`: the
 * read-only walk only ever needed `entries()`, but creating a file for
 * real needs the browser's own directory- and file-handle methods, which
 * a hand-built fake can still provide (cast `as unknown as
 * FileSystemDirectoryHandle` in a test, the same cast this file's own
 * tests already use for `FileSystemHandle`) without this needing a
 * second, parallel minimal interface.
 *
 * Fails rather than silently overwriting if a file already exists at
 * that exact path — a caller creating something new getting back
 * someone else's file instead, unannounced, is exactly the silent data
 * loss this project's rules elsewhere refuse to risk (folder-panel.ts's
 * own SQL-cell-restore banner, dewnote's push-conflict UI). */
export async function createFile(root: FileSystemDirectoryHandle, relativePath: string, content: string): Promise<FolderFile> {
  const segments = relativePath.split("/").filter(Boolean);
  const fileName = segments.pop();
  if (!fileName) throw new Error(`"${relativePath}" has no file name.`);

  let dir = root;
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create: true });
  }

  const alreadyExists = await dir
    .getFileHandle(fileName)
    .then(() => true)
    .catch(() => false);
  if (alreadyExists) throw new Error(`"${relativePath}" already exists.`);

  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  return { path: relativePath, handle };
}
