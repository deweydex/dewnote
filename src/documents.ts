// A new markdown file, or a copy of one: what it is called and where it
// goes. Pure, so the rules are tested without a browser; the asking and
// the writing are in file-flows.ts.

import { isTutorialPath } from "./workspace.ts";

/** The number a file name starts with: 22 in `22-for-josh.md`. */
function leadingNumber(name: string): number | null {
  const match = /^(\d+)(?!\d)/.exec(name);
  return match ? Number(match[1]) : null;
}

/** The folder a path sits in, or "" for the top of the workspace. */
export function folderOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

/** Where a new document goes: beside the open one, unless that is one
 * of dewlab's tutorials, whose folder the build reads page by page; then
 * the top of the workspace. */
export function folderForNew(openPath: string | null): string {
  if (!openPath || isTutorialPath(openPath)) return "";
  return folderOf(openPath);
}

/** A name to offer, which the author can take or type over. In a folder
 * of numbered drafts it is the next number: `23-` for a new file, and
 * `23-for-josh` for a copy of `22-for-josh`. Otherwise a copy is the
 * name with `-copy` after it, and a new file starts blank. */
export function suggestName(namesInFolder: readonly string[], from?: string): string {
  const numbers = namesInFolder
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .map(leadingNumber)
    .filter((number): number is number => number !== null);
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : null;
  if (from !== undefined) {
    const stem = from.replace(/\.md$/i, "");
    if (next !== null && leadingNumber(stem) !== null) return `${next}${stem.replace(/^\d+/, "")}`;
    return `${stem}-copy`;
  }
  return next !== null ? `${next}-` : "";
}

/** The path a name makes in `folder`, or why it cannot be one. `.md` is
 * added when it is not typed. */
export function documentPath(
  folder: string,
  name: string,
  existing: ReadonlySet<string> | ReadonlyMap<string, unknown>,
): { path: string } | { error: string } {
  const stem = name.trim().replace(/\.md$/i, "").trim();
  if (!stem || /^-+$/.test(stem)) return { error: "Not created: the document needs a name." };
  if (/[\\/]/.test(stem)) {
    return { error: "Not created: a name cannot contain a slash. Move or rename this file… puts a document in another folder." };
  }
  if (stem.startsWith(".")) return { error: "Not created: a name starting with a dot is a hidden file, which dewnote does not list." };
  const path = folder ? `${folder}/${stem}.md` : `${stem}.md`;
  if (existing.has(path)) return { error: `Not created: there is already a document at ${path}.` };
  return { path };
}
