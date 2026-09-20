// A local folder, through the File System Access API.
//
// Chrome and Edge only — Safari has no directory picker on any Apple
// platform. `supportsDirectoryPicker` feature-detects rather than
// sniffing a browser, so a browser that gains the API works the day it
// does.

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

/** Walk `root` recursively, collecting every file whose path satisfies
 * `matches`. Takes a `DirectoryLike` rather than the real handle type so
 * the walk can be tested against a fake. */
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

/** Every module file under `root` — Dewlab's current `courses/*.yaml`
 * or the earlier `modules/*.yaml`
 * (modules.ts), which say which tutorials a module lists and in what
 * order, and which series-panel.ts reads alongside `listMarkdownFiles`'s
 * front-matter index. `index.yaml` and `redirects.yaml` come back too:
 * both live in the same directory, the first carries the order the
 * modules are shown in, and `isModuleFile` is what tells them apart. */
export async function listModuleFiles(root: DirectoryLike): Promise<FolderFile[]> {
  return walk(root, (path) => /(^|\/)(?:courses|modules)\/[^/]+\.yaml$/.test(path));
}

export async function readFile(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

/** Every file name directly inside `folder` under `root` — the real
 * directory, not the filtered list `walk` builds.
 *
 * That distinction is the whole point: `listMarkdownFiles` and
 * `listModuleFiles` deliberately see only what this editor opens, so a
 * picture already sitting beside a tutorial is invisible to both. Naming
 * a new one from that list would call a taken name free. Empty for a
 * folder that doesn't exist, which is the right answer for "what is
 * already in it". */
export async function listNamesIn(root: FileSystemDirectoryHandle, folder: string): Promise<string[]> {
  const segments = folder.split("/").filter(Boolean);
  try {
    let dir = root;
    for (const segment of segments) dir = await dir.getDirectoryHandle(segment);
    const names: string[] = [];
    for await (const [name] of (dir as unknown as DirectoryLike).entries()) names.push(name);
    return names;
  } catch {
    return [];
  }
}

/** The raw bytes of the file at `relativePath` under `root`, or null if
 * there is none — an image the editor has to show, which `walk` never
 * listed because it only ever looked for markdown and module files. A
 * missing directory along the way is a missing file, not an error: an
 * image name with nothing behind it is a real state the editor renders
 * (as a broken image, the same as the built page would) rather than
 * something to throw over. */
export async function readBytesAt(root: FileSystemDirectoryHandle, relativePath: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const segments = relativePath.split("/").filter(Boolean);
  const fileName = segments.pop();
  if (!fileName) return null;
  try {
    let dir = root;
    for (const segment of segments) dir = await dir.getDirectoryHandle(segment);
    const handle = await dir.getFileHandle(fileName);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

/** Writes `content` over a file this store already holds — the write
 * half of `readFile` above, for a caller editing a file it never opened
 * into the editor (series-panel.ts's own module-file writes). Separate
 * from `createFile` below on purpose: this one requires the file to
 * exist already and replaces it, where that one requires it not to and
 * refuses to overwrite. */
export async function writeFile(handle: FileSystemFileHandle, content: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

/** Create a file at `relativePath` under `root`, making any missing
 * directories on the way.
 *
 * Fails rather than overwriting if something is already there: a caller
 * creating something new and silently getting someone else's file is the
 * data loss this codebase refuses everywhere else.
 *
 * `content` may be bytes as well as text — an image copied in beside a
 * tutorial is the caller that needs that. */
export async function createFile(root: FileSystemDirectoryHandle, relativePath: string, content: string | Uint8Array<ArrayBuffer>): Promise<FolderFile> {
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
