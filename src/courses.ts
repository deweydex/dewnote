// Where a tutorial sits in a course, read from dewlab's own `courses/`
// directory — the replacement for the `<series>.order.yaml` files
// series.ts used to read, after dewlab moved placement out of a
// tutorial's front matter entirely (its DECISIONS_LOG 7.17x, and the
// spec it wrote for this editor in `refactor/EDITOR.md` §2, recoverable
// at `git show b7c5a6d:refactor/EDITOR.md` since that folder was deleted
// when the refactor finished).
//
// The shape, read against real course files rather than a summary of
// them: `courses/index.yaml` is `{order: [course-id, ...]}`; each
// `courses/<id>.yaml` is `{title, code, status, card, description,
// contents: [{title, tutorials: [tutorial-id, ...]}, ...]}`. A tutorial
// id is site-wide now — `tutorials/<id>/<id>.md` — so an id names one
// page from any course, and a course file is the only place that says
// which pages it holds and in what order.
//
// ## Why this records line ranges
//
// frontmatter.ts sets the house pattern for editing YAML here: read it
// with js-yaml for structure, never re-dump it, and write by replacing
// the exact text of the one thing that changed, so everything untouched
// stays byte-identical (DECISIONS.md 1 — the file is the document). A
// course file needs that discipline more than front matter does, not
// less: `card:` is a folded scalar whose continuation lines are indented
// prose, and `description:` is a single-quoted scalar carrying blank
// lines inside it. Both are student-facing text on dewlab's own front
// page. Re-serialising the file to reorder one list would refold and
// requote them on every drag.
//
// So each series records `tutorialsRange`, the half-open line range its
// `- id` items occupy, and the `indent` those items carry. Reordering,
// adding to and removing from a series are then one operation — splice
// different lines into the same range — rather than three features, and
// every other byte of the file is left alone.
//
// ## When a range is null
//
// The scan understands one shape: a block list of `- id` items under a
// `tutorials:` key. That is what dewlab's own migration writes and what
// a person editing the file by hand would write. A flow list
// (`tutorials: [a, b]`) still *parses* — js-yaml handles it, so the
// panel can show it — but gets `tutorialsRange: null`, because this
// module does not know how to rewrite one without reformatting it. A
// null range is the caller's signal to show the series read-only rather
// than to guess. The same goes for any file where the scan's own reading
// of the ids disagrees with what js-yaml parsed: rather than trust a
// line range that might not hold what this thinks it holds, it writes
// nowhere.

import { load as parseYaml } from "js-yaml";

export interface CourseSeries {
  title: string;
  /** Tutorial ids, in the order the course file lists them. */
  tutorials: string[];
  /** Half-open `[start, end)` line range of the `- id` items under this
   * series' own `tutorials:` key, for a writer to splice. An empty list
   * has `start === end`, positioned where its first item would go. Null
   * when the list isn't in the block form this module can rewrite (see
   * the header). */
  tutorialsRange: { start: number; end: number } | null;
  /** The exact leading whitespace each `- id` item carries, so a spliced
   * line matches the ones around it. */
  indent: string;
}

export interface Course {
  /** The file's own name minus `.yaml` — the course id, which is also
   * its page's address on the built site. */
  id: string;
  path: string;
  title: string;
  /** dewlab's own `status:` — "beta" and so on. Absent in a file that
   * doesn't set one. */
  status?: string;
  contents: CourseSeries[];
}

const YAML_SUFFIX = ".yaml";

/** Files this module reads, by path: anything directly inside a
 * `courses/` directory, except the two that aren't courses. `index.yaml`
 * carries the order courses are shown in and `redirects.yaml` maps old
 * addresses to new ones; neither lists tutorials. */
export function isCourseFile(path: string): boolean {
  if (!path.endsWith(YAML_SUFFIX)) return false;
  const segments = path.split("/");
  const fileName = segments[segments.length - 1]!;
  if (segments[segments.length - 2] !== "courses") return false;
  return fileName !== "index.yaml" && fileName !== "redirects.yaml";
}

/** `courses/index.yaml`'s own `order:` list — the order the courses are
 * shown in. An empty list for anything this can't read, which leaves the
 * caller to fall back on its own ordering rather than show nothing. */
export function parseCourseIndex(content: string): string[] {
  let data: unknown;
  try {
    data = parseYaml(content);
  } catch {
    return [];
  }
  if (!data || typeof data !== "object") return [];
  const { order } = data as Record<string, unknown>;
  if (!Array.isArray(order)) return [];
  return order.filter((entry): entry is string => typeof entry === "string");
}

/** One course file, or null for anything that isn't one or this can't
 * make sense of. dewlab's own build treats a malformed course file as a
 * hard failure; this is an editor, which has to stay open on a file it
 * doesn't understand, so an unreadable one is left out silently the way
 * series.ts's own order files always were. */
export function parseCourseFile(path: string, content: string): Course | null {
  if (!isCourseFile(path)) return null;

  let data: unknown;
  try {
    data = parseYaml(content);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { title, status, contents } = data as Record<string, unknown>;
  if (typeof title !== "string" || !title.trim()) return null;
  if (!Array.isArray(contents)) return null;

  const segments = path.split("/");
  const id = segments[segments.length - 1]!.slice(0, -YAML_SUFFIX.length);
  const ranges = scanTutorialBlocks(content);

  const series: CourseSeries[] = [];
  for (const [index, entry] of contents.entries()) {
    if (!entry || typeof entry !== "object") return null;
    const { title: seriesTitle, tutorials } = entry as Record<string, unknown>;
    if (typeof seriesTitle !== "string") return null;
    const ids = Array.isArray(tutorials)
      ? tutorials.filter((one): one is string => typeof one === "string")
      : [];
    // The Nth block the scan found is the Nth series js-yaml parsed —
    // true whenever every series is in the block form, which is the
    // only case with a writable range anyway. A block whose own ids
    // don't match the parsed ones means the scan misread the file, so
    // that series gets no range rather than a wrong one.
    const scanned = ranges[index];
    const agrees =
      scanned !== undefined &&
      scanned.ids.length === ids.length &&
      scanned.ids.every((one, at) => one === ids[at]);
    series.push({
      title: seriesTitle,
      tutorials: ids,
      tutorialsRange: agrees ? { start: scanned.start, end: scanned.end } : null,
      indent: scanned?.indent ?? "  ",
    });
  }

  return {
    id,
    path,
    title: title.trim(),
    ...(typeof status === "string" ? { status } : {}),
    contents: series,
  };
}

/** Every real course among `files`, in `index.yaml`'s own order where
 * one is given — courses it doesn't name keep their own relative order,
 * after the ones it does, so a course file added by hand shows up rather
 * than vanishing until someone remembers to list it. */
export function parseCourseFiles(
  files: { path: string; content: string }[],
  indexOrder: string[] = [],
): Course[] {
  const courses = files.flatMap((file) => {
    const course = parseCourseFile(file.path, file.content);
    return course ? [course] : [];
  });
  const rank = new Map(indexOrder.map((id, at) => [id, at]));
  return courses.sort((a, b) => {
    const left = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const right = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return left === right ? 0 : left - right;
  });
}

interface ScannedBlock {
  ids: string[];
  start: number;
  end: number;
  indent: string;
}

const TUTORIALS_KEY_RE = /^(\s*)tutorials\s*:\s*(.*)$/;
const LIST_ITEM_RE = /^(\s*)-\s+(.*?)\s*$/;

/**
 * Every `tutorials:` block list in the file, in the order they appear,
 * as line ranges over `content`'s own lines.
 *
 * Deliberately a line scan rather than anything cleverer: the one thing
 * a writer needs is which lines to replace, and a scan that can only
 * recognise the shape it knows how to rewrite is safer than a parser
 * that returns a position for a shape it would mangle. A `tutorials:`
 * key with anything after the colon is a flow list or a scalar, and is
 * skipped — `parseCourseFile` then finds no block for that series and
 * hands back a null range.
 */
function scanTutorialBlocks(content: string): ScannedBlock[] {
  const lines = content.split("\n");
  const blocks: ScannedBlock[] = [];

  for (let at = 0; at < lines.length; at += 1) {
    const key = TUTORIALS_KEY_RE.exec(lines[at]!);
    if (!key || key[2] !== "") continue;

    const keyIndent = key[1]!;
    const start = at + 1;
    let end = start;
    let indent: string | null = null;
    const ids: string[] = [];

    for (let item = start; item < lines.length; item += 1) {
      const match = LIST_ITEM_RE.exec(lines[item]!);
      if (!match) break;
      // An item has to be indented at least as far as its own key, or
      // it belongs to something above this list rather than to it.
      if (match[1]!.length < keyIndent.length) break;
      if (indent === null) indent = match[1]!;
      else if (match[1] !== indent) break;
      ids.push(match[2]!);
      end = item + 1;
    }

    blocks.push({ ids, start, end, indent: indent ?? `${keyIndent}` });
    at = end - 1;
  }

  return blocks;
}
