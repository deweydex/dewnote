// Finding text across the workspace, and replacing it.
//
// Over every markdown document's text as dewnote holds it: the whole
// file, front matter included, since a title or a `practice_for:` is as
// likely a thing to look for as a sentence. Course files are left out;
// they are edited through the series commands.
//
// Literal text, not a pattern: an author looking for `f(x)` means those
// four characters.

import type { Change } from "./rename.ts";

export interface FindOptions {
  matchCase: boolean;
}

export interface FindHit {
  path: string;
  /** 1-based. */
  line: number;
  /** Where the match starts in `text`, 0-based. */
  column: number;
  length: number;
  /** The whole line the match is on. */
  text: string;
}

function pattern(query: string, { matchCase }: FindOptions): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "g" : "gi");
}

function documents(files: Iterable<[string, string]>): [string, string][] {
  return [...files].filter(([path]) => path.endsWith(".md")).sort(([a], [b]) => a.localeCompare(b));
}

/** Every match, file by file in path order, then line by line. A match
 * never spans a line break. */
export function findAll(files: Iterable<[string, string]>, query: string, options: FindOptions): FindHit[] {
  if (!query || query.includes("\n")) return [];
  const re = pattern(query, options);
  const hits: FindHit[] = [];
  for (const [path, content] of documents(files)) {
    const lines = content.split("\n");
    lines.forEach((text, at) => {
      for (const match of text.matchAll(re)) {
        hits.push({ path, line: at + 1, column: match.index!, length: match[0].length, text });
      }
    });
  }
  return hits;
}

/** Every match replaced by `replacement`, as it is typed: nothing in it
 * is read as a pattern. One write per document that changes. */
export function replaceAll(
  files: Iterable<[string, string]>,
  query: string,
  replacement: string,
  options: FindOptions,
): { changes: Change[]; count: number } {
  if (!query || query.includes("\n")) return { changes: [], count: 0 };
  const re = pattern(query, options);
  const changes: Change[] = [];
  let count = 0;
  for (const [path, content] of documents(files)) {
    let here = 0;
    const text = content.replace(re, () => {
      here += 1;
      return replacement;
    });
    if (here > 0 && text !== content) {
      changes.push({ kind: "write", path, text });
      count += here;
    }
  }
  return { changes, count };
}
