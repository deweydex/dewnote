// Plan §5.10's own index: "opening a folder, or a GitHub repository,
// builds a small in-memory index: one pass over every markdown file's
// front matter... refreshed on save." This is that pass, kept as a pure
// function over already-read file content so it can be exercised without
// a browser or a real GitHub token — folder-panel.ts and repo-panel.ts
// are the two places that actually read the files and call this.
//
// Only string-valued fields are kept — a `year: 2026` or a `covers: {}`
// isn't something a picker offers as a name, and treating a non-string
// value as one here would just be a different way of silently
// mis-indexing a file, the kind of thing §5.10 built this to prevent in
// the first place.

import { extractFrontMatter } from "./frontmatter.ts";

export interface FileIndexEntry {
  /** The path this entry was read from — a folder-relative path
   * (folder-store.ts) or a repo path (github.ts); the caller's own
   * space, not reinterpreted here. */
  path: string;
  title?: string;
  slug?: string;
  module?: string;
  series?: string;
  /** dewlab's own `status` (`draft`/`beta`/`live`/`archived`, `build.py`'s
   * own `STATUSES`) and `version` (a `YYYY.MM.DD.N` release date,
   * `build.py`'s own `VERSION_RE`) — read here only so `defaultEntryFor`
   * can pick the one file among several sharing a slug that dewlab's own
   * build would actually serve. Absent entirely on a plain-markdown or
   * dewstack document, which have no versioning concept at all. */
  status?: string;
  version?: string;
}

function stringField(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Front matter only, never the body — the same "stays fast even on a
 * large folder" reasoning §5.10 gives for reading front matter alone
 * rather than the whole file. */
export function indexEntryFor(path: string, content: string): FileIndexEntry {
  const { fields } = extractFrontMatter(content);
  const entry: FileIndexEntry = { path };
  const title = stringField(fields, "title");
  const slug = stringField(fields, "slug");
  const module = stringField(fields, "module");
  const series = stringField(fields, "series");
  const status = stringField(fields, "status");
  const version = stringField(fields, "version");
  if (title !== undefined) entry.title = title;
  if (slug !== undefined) entry.slug = slug;
  if (module !== undefined) entry.module = module;
  if (series !== undefined) entry.series = series;
  if (status !== undefined) entry.status = status;
  if (version !== undefined) entry.version = version;
  return entry;
}

export function buildFileIndex(files: { path: string; content: string }[]): FileIndexEntry[] {
  return files.map(({ path, content }) => indexEntryFor(path, content));
}

const STATUS_RANK: Record<string, number> = { draft: 0, archived: 1, beta: 2, live: 3 };

/** `build.py`'s own `Tutorial.status`: absent means `"live"`, not
 * "unknown" — most tutorials never set this field at all. An unrecognised
 * value (a typo, or a future status this hasn't been taught about yet)
 * ranks below every known one rather than crashing a lookup over it. */
function statusRank(status: string | undefined): number {
  return STATUS_RANK[status ?? "live"] ?? -1;
}

const VERSION_RE = /^(\d{4})\.(\d{2})\.(\d{2})\.(\d+)$/;

/** The same sortable tuple `build.py`'s own `Tutorial.released` builds —
 * numbers, not the string, so `2026.09.04.10` correctly outranks
 * `2026.09.04.9` (a plain string compare would not: `"10"` sorts before
 * `"9"`). Missing or unparseable sorts lowest, never highest — a file
 * with no real version is never preferred over one that has one. */
function versionRank(version: string | undefined): [number, number, number, number] {
  const match = version ? VERSION_RE.exec(version) : null;
  if (!match) return [-1, -1, -1, -1];
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
}

function isNewer(a: FileIndexEntry, b: FileIndexEntry): boolean {
  const statusDiff = statusRank(a.status) - statusRank(b.status);
  if (statusDiff !== 0) return statusDiff > 0;
  const [aRank, bRank] = [versionRank(a.version), versionRank(b.version)];
  for (let i = 0; i < 4; i++) if (aRank[i] !== bRank[i]) return aRank[i]! > bRank[i]!;
  return false;
}

/** Among every entry sharing `slug`, the one `build.py`'s own
 * `versions_of()` would mark `is_default` — the newest `live` version,
 * or (with no live version at all) the newest version regardless of
 * status. Every version still gets its own entry in the index itself
 * (an author working on a draft, or browsing an archived one, needs to
 * find it by path); this only decides which *one* answers "what does
 * this slug mean" for a lookup that has to pick exactly one — today,
 * series-panel.ts's own title lookup. Returns `undefined` for a slug
 * nothing in `index` claims. */
export function defaultEntryFor(index: FileIndexEntry[], slug: string): FileIndexEntry | undefined {
  let best: FileIndexEntry | undefined;
  for (const entry of index) {
    if (entry.slug !== slug) continue;
    if (!best || isNewer(entry, best)) best = entry;
  }
  return best;
}

/** §5.10's own module/series pickers read from these — every distinct
 * value actually in use, sorted, so a picker offers `computational-methods`
 * once rather than once per tutorial that names it. `"slug"` is the same
 * mechanism for a different purpose: not "which values repeat," since a
 * slug is unique per tutorial, but "every real slug this index knows
 * about" — `practice_for`'s own datalist, so naming which tutorial a
 * practice page is for offers real choices rather than free text with
 * nothing to check it against. */
export function distinctValues(index: FileIndexEntry[], field: "module" | "series" | "slug"): string[] {
  const values = new Set<string>();
  for (const entry of index) {
    const value = entry[field];
    if (value) values.add(value);
  }
  return [...values].sort();
}
