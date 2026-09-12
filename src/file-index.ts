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
  if (title !== undefined) entry.title = title;
  if (slug !== undefined) entry.slug = slug;
  if (module !== undefined) entry.module = module;
  if (series !== undefined) entry.series = series;
  return entry;
}

export function buildFileIndex(files: { path: string; content: string }[]): FileIndexEntry[] {
  return files.map(({ path, content }) => indexEntryFor(path, content));
}

/** §5.10's own module/series pickers read from these — every distinct
 * value actually in use, sorted, so a picker offers `computational-methods`
 * once rather than once per tutorial that names it. */
export function distinctValues(index: FileIndexEntry[], field: "module" | "series"): string[] {
  const values = new Set<string>();
  for (const entry of index) {
    const value = entry[field];
    if (value) values.add(value);
  }
  return [...values].sort();
}
