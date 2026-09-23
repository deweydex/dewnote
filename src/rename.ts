// Renaming, moving and deleting documents.
//
// A tutorial's id is its folder's name and its file's name, the page's
// address, and the key every reader's saved work is kept under
// (dewlab's `id_of()`). Other files name it too: course lists, other
// pages' `tutorial:` links, a practice page's `practice_for:`, a mixed
// practice page's `practice_across:`, a context page's `context_for:`,
// and `courses/redirects.yaml`. Renaming a tutorial means changing all of
// those together, or the build stops; deleting one means none of them
// may be left pointing at it.
//
// Planning only, over text somebody else read, so it runs without a
// browser. What a plan says to do is a list of `Change`s the store
// applies as one commit (store.ts).

import { extractFrontMatter } from "./frontmatter.ts";
import { idFromPath } from "./workspace.ts";
import { isModuleFile } from "./modules.ts";

import type { TreeChange } from "./github.ts";

export type Change = TreeChange;

export interface Plan {
  changes: Change[];
  /** One line per kind of thing changed, for the confirmation. */
  summary: string[];
  /** Where each file that moves ends up, old path to new: what the
   * shell re-keys its own copies (drafts, recent documents) by. */
  moves: Map<string, string>;
}

export type Refusal = { error: string };

/** The shape dewlab gives an id: lower-case words joined by hyphens. */
export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TUTORIAL_FILE_RE = /^tutorials\/([^/]+)\/\1\.md$/;

/** The id of the tutorial whose own file `path` is, or undefined for any
 * other file (a practice page, a frozen release, a page outside
 * `tutorials/`). */
export function tutorialIdOf(path: string): string | undefined {
  return TUTORIAL_FILE_RE.exec(path)?.[1];
}

/** The files in a tutorial's folder whose names dewlab derives from the
 * id, and so have to change with it. Anything else in the folder (an
 * image, a frozen release) keeps its name, because the tutorial's own
 * markdown refers to it by that name. */
function renamedName(name: string, from: string, to: string): string {
  for (const suffix of [".md", "-practice.md", ".glossary.yaml", "-practice.glossary.yaml"]) {
    if (name === `${from}${suffix}`) return `${to}${suffix}`;
  }
  return name;
}

/** `tutorial:<id>` links and `tutorials/<id>.html` addresses, for every
 * id in `ids`. */
function rewriteLinks(text: string, ids: ReadonlyMap<string, string>): string {
  let out = text;
  for (const [from, to] of ids) {
    out = out
      .replace(new RegExp(`tutorial:${from}(?![\\w-])`, "g"), `tutorial:${to}`)
      .replace(new RegExp(`tutorials/${from}\\.html`, "g"), `tutorials/${to}.html`);
  }
  return out;
}

/** Every id in the YAML lines that list ids — the whole value of a
 * `- item`, or an item of a `[a, b]` flow list — and, when `keys` is
 * given, only the values of those keys. A series title that happens to
 * be spelled like an id is left alone. */
function mapYamlIds(
  yaml: string,
  keys: readonly string[] | null,
  edit: (id: string) => string | null,
): string {
  const lines = yaml.split("\n");
  const out: string[] = [];
  let inKey = keys === null;
  let keyIndent = -1;
  for (const line of lines) {
    const indent = /^\s*/.exec(line)![0].length;
    const keyLine = /^(\s*)(-\s+)?([A-Za-z_][\w-]*)\s*:(.*)$/.exec(line);
    if (keys !== null && keyLine && !keyLine[2]) {
      inKey = keys.includes(keyLine[3]!);
      keyIndent = indent;
    } else if (keys !== null && line.trim() && indent <= keyIndent && !/^\s*-/.test(line)) {
      inKey = false;
    }
    if (!inKey) {
      out.push(line);
      continue;
    }
    const item = /^(\s*-\s+)([a-z0-9-]+)(\s*(?:#.*)?)$/.exec(line);
    if (item) {
      const next = edit(item[2]!);
      if (next !== null) out.push(`${item[1]}${next}${item[3]}`);
      continue;
    }
    const scalar = keys !== null ? /^(\s*[A-Za-z_][\w-]*\s*:\s*)([a-z0-9-]+)(\s*(?:#.*)?)$/.exec(line) : null;
    if (scalar) {
      const next = edit(scalar[2]!);
      out.push(next === null ? `${scalar[1]!.trimEnd()}` : `${scalar[1]}${next}${scalar[3]}`);
      continue;
    }
    const flow = /^(.*:\s*\[)([^\]]*)(\].*)$/.exec(line);
    if (flow) {
      const items = flow[2]!.split(",").map((each) => each.trim()).filter(Boolean);
      const kept = items.flatMap((each) => {
        const next = edit(each);
        return next === null ? [] : [next];
      });
      out.push(`${flow[1]}${kept.join(", ")}${flow[3]}`);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

const REFERENCE_KEYS = ["practice_for", "practice_across", "context_for"] as const;

/** A document's front matter with `edit` applied to the ids its
 * reference keys name. The body is untouched. */
function mapFrontMatterIds(source: string, edit: (id: string) => string | null): string {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/.exec(source);
  if (!match) return source;
  const yaml = mapYamlIds(match[2]!, REFERENCE_KEYS, edit);
  return yaml === match[2] ? source : match[1] + yaml + match[3] + source.slice(match[0].length);
}

function isRedirects(path: string): boolean {
  return /(^|\/)courses\/redirects\.yaml$/.test(path);
}

function isCourse(path: string): boolean {
  return isModuleFile(path);
}

const address = (id: string) => `tutorials/${id}.html`;

/** Where `courses/redirects.yaml` is, or would be. */
function redirectsPath(files: ReadonlyMap<string, string>): string {
  const existing = [...files.keys()].find(isRedirects);
  if (existing) return existing;
  const course = [...files.keys()].find(isCourse);
  return course ? `${course.split("/").slice(0, -1).join("/")}/redirects.yaml` : "courses/redirects.yaml";
}

function isDraft(content: string | undefined): boolean {
  return extractFrontMatter(content ?? "").fields["status"] === "draft";
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The folder listing, and the markdown already read from it, in case
 * the listing came back short. */
function folderContents(files: ReadonlyMap<string, string>, folder: string, names: readonly string[]): Set<string> {
  const found = new Set(names);
  for (const path of files.keys()) {
    const name = path.slice(folder.length + 1);
    if (path.startsWith(`${folder}/`) && !name.includes("/")) found.add(name);
  }
  return found;
}

// ── renaming a tutorial ────────────────────────────────────────────────

export interface RenameInput {
  /** Every markdown and course file, by path. */
  files: ReadonlyMap<string, string>;
  /** Every file name directly inside the tutorial's folder, markdown or
   * not: the folder moves as a whole. */
  folderNames: readonly string[];
  from: string;
  to: string;
}

/** Everything that has to change for tutorial `from` to become `to`. */
export function planRename({ files, folderNames, from, to }: RenameInput): Plan | Refusal {
  if (to === from) return { error: "That is the name it already has." };
  if (!ID_RE.test(to)) {
    return { error: `"${to}" cannot be an id. Use lower-case letters, digits and single hyphens, like counting-darts.` };
  }
  if (to.endsWith("-practice")) return { error: "An id ending -practice is kept for practice pages." };
  const folder = `tutorials/${from}`;
  const target = `tutorials/${to}`;
  if ([...files.keys()].some((path) => path.startsWith(`${target}/`))) {
    return { error: `There is already a folder called ${target}.` };
  }

  const practice = `${folder}/${from}-practice.md`;
  const ids = new Map([[from, to]]);
  if (files.has(practice)) ids.set(`${from}-practice`, `${to}-practice`);
  const rename = (id: string) => ids.get(id) ?? id;

  const changes: Change[] = [];
  const rewritten = new Set<string>();
  const moved = new Map<string, string>();

  const inFolder = folderContents(files, folder, folderNames);
  for (const name of inFolder) {
    const oldPath = `${folder}/${name}`;
    const newPath = `${target}/${renamedName(name, from, to)}`;
    moved.set(oldPath, newPath);
  }

  // Every markdown and course file, rewritten; a file in the folder is
  // written at its new path, and the old one removed.
  for (const [path, content] of files) {
    let next = content;
    if (path.endsWith(".md")) next = mapFrontMatterIds(rewriteLinks(next, ids), rename);
    else if (isCourse(path)) next = mapYamlIds(next, null, rename);
    const newPath = moved.get(path);
    if (newPath) {
      changes.push({ kind: "write", path: newPath, text: next }, { kind: "remove", path });
      moved.delete(path);
    } else if (next !== content) {
      changes.push({ kind: "write", path, text: next });
      rewritten.add(path);
    }
  }
  for (const [oldPath, newPath] of moved) changes.push({ kind: "move", from: oldPath, to: newPath });

  // Old addresses keep working for anything a reader could have
  // bookmarked. A draft was never served, and a line pointing at a page
  // the build does not write stops the build, so drafts get none.
  const redirects = redirectsPath(files);
  const current = files.get(redirects);
  const lines = (current ?? "# old address -> new address, one per line; build.py writes a stub page at each old one.\n")
    .replace(/\n*$/, "")
    .split("\n");
  const sent = new Set(lines.map((line) => /^(\S+):/.exec(line)?.[1]).filter(Boolean));
  const kept = lines.flatMap((line) => {
    const pair = /^(\S+):\s*(\S+)\s*$/.exec(line);
    if (!pair) return [line];
    const [, old, now] = pair as unknown as [string, string, string];
    // A line from the new address, left by renaming it away earlier,
    // would now point from a page the build writes.
    if ([...ids.values()].some((id) => old === address(id))) return [];
    const target_ = [...ids].find(([id]) => now === address(id));
    return [target_ ? `${old}: ${address(target_[1])}` : line];
  });
  const added: string[] = [];
  for (const [oldId, newId] of ids) {
    const source = oldId === from ? files.get(`${folder}/${from}.md`) : files.get(practice);
    if (isDraft(source) || sent.has(address(oldId))) continue;
    added.push(`${address(oldId)}: ${address(newId)}`);
  }
  const nextRedirects = [...kept, ...added].join("\n") + "\n";
  if (current === undefined ? added.length > 0 : nextRedirects !== current) {
    changes.push({ kind: "write", path: redirects, text: nextRedirects });
  }

  const moves = new Map([...inFolder].map((name) => [`${folder}/${name}`, `${target}/${renamedName(name, from, to)}`]));
  const summary = [`Moves ${folder}/ to ${target}/ (${plural(inFolder.size, "file")}).`];
  const courses = [...rewritten].filter(isCourse);
  const pages = [...rewritten].filter((path) => path.endsWith(".md"));
  if (courses.length) summary.push(`Updates ${plural(courses.length, "course list")}.`);
  if (pages.length) summary.push(`Updates links or references in ${plural(pages.length, "other page")}.`);
  if (added.length) summary.push(`Sends the old ${added.length === 1 ? "address" : "addresses"} on to the new, in ${redirects}.`);
  return { changes, summary, moves };
}

// ── deleting ───────────────────────────────────────────────────────────

/** The files outside `except` that still point at `ids`, with how. */
function referencesTo(
  files: ReadonlyMap<string, string>,
  ids: readonly string[],
  except: (path: string) => boolean,
): string[] {
  const found: string[] = [];
  for (const [path, content] of files) {
    if (except(path)) continue;
    if (isRedirects(path)) {
      const count = content.split("\n").filter((line) =>
        ids.some((id) => new RegExp(`:\\s*${address(id).replace(/[.]/g, "\\.")}\\s*$`).test(line)),
      ).length;
      if (count) found.push(`${path} sends ${plural(count, "old address", "old addresses")} to it`);
      continue;
    }
    if (!path.endsWith(".md")) continue;
    if (ids.some((id) => new RegExp(`tutorial:${id}(?![\\w-])`).test(content))) {
      found.push(`${path} links to it`);
      continue;
    }
    const fields = extractFrontMatter(content).fields;
    const named = REFERENCE_KEYS.find((key) => {
      const value = fields[key];
      const list = Array.isArray(value) ? value.map(String) : value === undefined || value === null ? [] : [String(value)];
      return list.some((each) => ids.includes(each));
    });
    if (named) found.push(`${path} names it in ${named}:`);
  }
  return found;
}

function refusal(what: string, references: string[]): Refusal {
  return {
    error:
      `${what} cannot be deleted while other files point at it: ${references.join("; ")}. ` +
      "Change those first, or set its status to archived instead.",
  };
}

export interface DeleteTutorialInput {
  files: ReadonlyMap<string, string>;
  folderNames: readonly string[];
  id: string;
}

/** A tutorial's whole folder, and its lines in every course list. */
export function planDeleteTutorial({ files, folderNames, id }: DeleteTutorialInput): Plan | Refusal {
  const folder = `tutorials/${id}`;
  const references = referencesTo(files, [id, `${id}-practice`], (path) => path.startsWith(`${folder}/`));
  if (references.length) return refusal(`tutorials/${id}`, references);

  const inFolder = folderContents(files, folder, folderNames);
  const changes: Change[] = [...inFolder].map((name) => ({ kind: "remove", path: `${folder}/${name}` }));
  let courses = 0;
  for (const [path, content] of files) {
    if (!isCourse(path)) continue;
    const next = mapYamlIds(content, null, (each) => (each === id ? null : each));
    if (next !== content) {
      changes.push({ kind: "write", path, text: next });
      courses += 1;
    }
  }
  const summary = [`Deletes ${folder}/ (${plural(inFolder.size, "file")}).`];
  if (courses) summary.push(`Takes it out of ${plural(courses, "course list")}.`);
  return { changes, summary, moves: new Map() };
}

/** One document that is not a tutorial's own file: a practice page (with
 * its glossary, if it has one), a frozen release, or a page outside
 * `tutorials/`. */
export function planDeleteFile(
  files: ReadonlyMap<string, string>,
  folderNames: readonly string[],
  path: string,
): Plan | Refusal {
  if (tutorialIdOf(path)) return { error: "Delete a tutorial with Delete this tutorial, which removes its whole folder." };
  const inTutorials = path.startsWith("tutorials/");
  const id = idFromPath(path);
  const isRelease = /\/v\d{4}\.\d{2}\.\d{2}\.\d+\.md$/.test(path);
  if (inTutorials && !isRelease) {
    const references = referencesTo(files, [id], (each) => each === path);
    if (references.length) return refusal(path, references);
  }
  const changes: Change[] = [{ kind: "remove", path }];
  const glossary = `${id}.glossary.yaml`;
  if (inTutorials && !isRelease && folderNames.includes(glossary)) {
    changes.push({ kind: "remove", path: `${path.split("/").slice(0, -1).join("/")}/${glossary}` });
  }
  const summary = [`Deletes ${path}${changes.length > 1 ? `, and its glossary, ${glossary}` : ""}.`];
  return { changes, summary, moves: new Map() };
}

// ── moving any other document ──────────────────────────────────────────

/** A document outside `tutorials/` to a new path. Nothing links to such
 * a page by id, so only the file moves. */
export function planMove(files: ReadonlyMap<string, string>, from: string, to: string): Plan | Refusal {
  const path = to.trim().replace(/^\/+/, "");
  if (path === from) return { error: "That is where it already is." };
  if (!path.endsWith(".md")) return { error: "A document's name ends in .md." };
  if (path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    return { error: `"${path}" is not a path inside the workspace.` };
  }
  if (path.startsWith("tutorials/")) {
    return { error: "A page in tutorials/ is named after its tutorial's id. Make a new tutorial instead." };
  }
  if (files.has(path)) return { error: `There is already a file at ${path}.` };
  const text = files.get(from);
  if (text === undefined) return { error: `There is nothing at ${from}.` };
  return {
    changes: [{ kind: "write", path, text }, { kind: "remove", path: from }],
    summary: [`Moves ${from} to ${path}.`],
    moves: new Map([[from, path]]),
  };
}

/** Where every path ends up after `changes`, for the shell's own copy
 * of the workspace: text by path, and which paths are gone. */
export function applyToFiles(files: Map<string, string>, changes: readonly Change[]): void {
  for (const change of changes) {
    if (change.kind === "write") files.set(change.path, change.text);
    else if (change.kind === "remove") files.delete(change.path);
    else if (files.has(change.from)) {
      files.set(change.to, files.get(change.from)!);
      files.delete(change.from);
    }
  }
}
