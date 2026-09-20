// Links that go nowhere.
//
// `tutorial:` is the only scheme dewlab's build resolves — its
// `resolve_links()` rewrites `tutorial:id` and nothing else — so a
// `module:` or `series:` link ships as a literal broken href. An id is
// site-wide, so a link names one page from anywhere and nothing has to
// be guessed about where it was written.

import { distinctValues, type FileIndexEntry } from "./workspace.ts";

export interface BrokenLink {
  /** The file the link is written in. */
  path: string;
  /** The tutorial id after the colon. */
  target: string;
  /** The link's own words, so a report names which link rather than only
   * which target. */
  text: string;
  /** 1-based, for a report that can be read against the file. */
  line: number;
}

const LINK_RE = /\[([^\]]*)\]\(tutorial:([^)#\s]+)(?:#[^)]*)?\)/g;

/** Every `tutorial:` link in `source` whose target is not in `known`. */
export function brokenLinksIn(path: string, source: string, known: Set<string>): BrokenLink[] {
  const broken: BrokenLink[] = [];
  const lines = source.split("\n");
  for (let at = 0; at < lines.length; at += 1) {
    for (const match of lines[at]!.matchAll(LINK_RE)) {
      const target = match[2]!;
      if (!known.has(target)) {
        broken.push({ path, target, text: match[1] ?? "", line: at + 1 });
      }
    }
  }
  return broken;
}

/** The whole workspace at once, which is what says whether the site is
 * sound. Checking only the open document finds a broken link on the day
 * you happen to open the page it is written on. */
export function brokenLinks(
  files: readonly { path: string; content: string }[],
  index: readonly FileIndexEntry[],
): BrokenLink[] {
  const known = new Set(distinctValues([...index], "id"));
  return files
    .filter((file) => file.path.endsWith(".md"))
    .flatMap((file) => brokenLinksIn(file.path, file.content, known))
    .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}
