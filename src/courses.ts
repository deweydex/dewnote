// Where a tutorial sits in a course, read from dewlab's descriptor
// directory. `courses/` is current; `modules/` is accepted too, since
// older checkouts use it.
//
// The shape: `courses/index.yaml` is `{order: [course-id, ...]}`, and
// each `courses/<id>.yaml` is `{title, code, status, card, description,
// contents: [{title, tutorials: [tutorial-id, ...]}, ...]}`.

import { load as parseYaml } from "js-yaml";

export interface CourseSeries {
  title: string;
  /** Tutorial ids, in the order the course file lists them. */
  tutorials: string[];
  /** Half-open `[start, end)` line range of the `- id` items under this
   * series' own `tutorials:` key, for a writer to splice. An empty list
   * has `start === end`, positioned where its first item would go. Null
   * when the list isn't in the block form this file can rewrite. */
  tutorialsRange: { start: number; end: number } | null;
  /** The exact leading whitespace each `- id` item carries, so a spliced
   * line matches the ones around it. */
  indent: string;
  /** Complete line range for this series entry inside `contents:`. */
  entryRange?: { start: number; end: number } | null;
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
  /** Mixed practice pages are course-level rather than members of one
   * series. Paired practice pages are discovered through `practice_for`. */
  mixed?: string[];
  /** Half-open `[start, end)` line range of the entries under
   * `contents:` — where a new series is appended. Null when the scan
   * could not be sure.
   *
   * Separate from the per-series ranges because `contents:` can be
   * followed by another top-level key (`mixed:`), so it ends mid-file
   * rather than running to the end. */
  contentsRange: { start: number; end: number } | null;
  /** The exact leading whitespace a `- title:` entry carries — `""` in
   * every real course file, where the dash sits at column 0 while the
   * `tutorials:` under it is indented two. Recorded rather than derived
   * from the tutorials indent, because deriving it is a guess and a
   * wrong one splices a series into somebody's prose. */
  entryIndent: string;
  /** What one level of indentation is worth inside an entry — the gap
   * between a `- title:` line and its own `tutorials:` key. Two spaces
   * everywhere today; read from the file rather than assumed so a course
   * file written with four still round-trips. */
  innerIndent: string;
}

const YAML_SUFFIX = ".yaml";

/** Course files, by path: anything directly inside a `courses/` or
 * legacy `modules/` directory, except the two that aren't courses.
 * `index.yaml` carries the order courses are shown in and
 * `redirects.yaml` maps old addresses to new ones; neither lists
 * tutorials. */
export function isCourseFile(path: string): boolean {
  if (!path.endsWith(YAML_SUFFIX)) return false;
  const segments = path.split("/");
  const fileName = segments[segments.length - 1]!;
  const parent = segments[segments.length - 2];
  if (parent !== "courses" && parent !== "modules") return false;
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
  const { title, status, contents, mixed } = data as Record<string, unknown>;
  if (typeof title !== "string" || !title.trim()) return null;
  // `contents:` with nothing under it parses as null, and dewlab's own
  // read_module maps that to an empty list rather than failing — a
  // course with no series yet is a real, buildable state, and it is
  // exactly the state a course is in just before somebody adds the
  // first one. Refusing it here meant dewnote wouldn't read a file
  // dewlab builds happily.
  const entries = contents === null || contents === undefined ? [] : contents;
  if (!Array.isArray(entries)) return null;

  const segments = path.split("/");
  const id = segments[segments.length - 1]!.slice(0, -YAML_SUFFIX.length);
  const ranges = scanTutorialBlocks(content);

  const block = scanContentsBlock(content);
  const series: CourseSeries[] = [];
  for (const [index, entry] of entries.entries()) {
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
      entryRange: block?.entries[index] ?? null,
    });
  }

  return {
    id,
    path,
    title: title.trim(),
    ...(typeof status === "string" ? { status } : {}),
    contents: series,
    mixed: Array.isArray(mixed) ? mixed.filter((one): one is string => typeof one === "string") : [],
    // The scan has to agree with js-yaml about how many entries there
    // are, the same cross-check each series' own range makes. A block
    // whose entry count differs from the parsed one means the scan
    // misread the file, so it offers no range rather than a wrong one.
    contentsRange: block && countsAgree(block, content, series.length) ? { start: block.start, end: block.end } : null,
    entryIndent: block?.entryIndent ?? "",
    innerIndent: block?.innerIndent ?? "  ",
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
 * Every `tutorials:` block list in the file, in order, as line ranges.
 *
 * A line scan, not a parser: a writer needs to know which lines to
 * replace, and a scan that only recognises the shape it can rewrite is
 * safer than a parser that returns a position for a shape it would
 * mangle. A `tutorials:` key with anything after the colon is a flow
 * list or a scalar, and is skipped.
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

interface ScannedContents {
  start: number;
  end: number;
  entryIndent: string;
  innerIndent: string;
  entries: { start: number; end: number }[];
}

const CONTENTS_KEY_RE = /^(\s*)contents\s*:\s*(.*)$/;

/** A `contents:` entry line, keeping the gap between the dash and the
 * entry's first key — `LIST_ITEM_RE` collapses that, and here it is the
 * thing being measured. */
const ENTRY_RE = /^(\s*)-( +)(\S.*?)\s*$/;

/**
 * Where the `contents:` block's entries sit, so a series can be appended
 * after the last one.
 *
 * The end is the hard part: `contents:` can be followed by a `mixed:`
 * key, so it ends mid-file. The rule — an entry starts with
 * `<indent>- `, and every line after it that is blank or indented
 * further belongs to it; the first line that is neither ends the block.
 *
 * `innerIndent` is read rather than assumed, so a file written with four
 * spaces round-trips like one written with two.
 *
 * Returns null when unsure. A range this is wrong about is how a splice
 * lands in somebody's prose.
 */
function scanContentsBlock(content: string): ScannedContents | null {
  const lines = content.split("\n");

  let keyLine = -1;
  let keyIndent = "";
  for (let at = 0; at < lines.length; at += 1) {
    const key = CONTENTS_KEY_RE.exec(lines[at]!);
    // Anything after the colon is a flow list or a scalar — not a block
    // this knows how to append to.
    if (!key || key[2] !== "") continue;
    keyLine = at;
    keyIndent = key[1]!;
    break;
  }
  if (keyLine === -1) return null;

  const start = keyLine + 1;
  let entryIndent: string | null = null;
  let innerIndent: string | null = null;
  /** The last line that held actual content, so the block ends there
   * rather than at whatever blank lines trail it. A file's own trailing
   * newline is not part of its last series, and appending after it would
   * put a blank line in the middle of `contents:`. */
  let lastContent = start - 1;

  for (let at = start; at < lines.length; at += 1) {
    const line = lines[at]!;
    const item = ENTRY_RE.exec(line);
    if (item && item[1]!.length >= keyIndent.length && (entryIndent === null || item[1] === entryIndent)) {
      entryIndent = item[1]!;
      // How far the entry's own keys are indented, which YAML fixes: a
      // mapping under `- ` starts at the column after the dash and its
      // following spaces, and every later key has to line up with it. So
      // this is read off the dash rather than guessed, and it is "  " for
      // a plain `- ` — which is every course file dewlab has written.
      if (innerIndent === null) innerIndent = " ".repeat(1 + item[2]!.length);
      lastContent = at;
      continue;
    }
    // A blank line is passed over rather than ending the block — one can
    // sit between entries — but it never extends it either.
    if (entryIndent !== null && line.trim() === "") continue;
    // A continuation of the entry above: indented past its dash.
    if (entryIndent !== null) {
      const indent = /^(\s*)/.exec(line)![1]!;
      if (indent.length > entryIndent.length) {
        lastContent = at;
        continue;
      }
    }
    break;
  }
  const end = lastContent + 1;

  if (entryIndent === null) {
    // `contents:` with nothing under it — a real, buildable state
    // (read_module maps it to []), and an empty range is where a first
    // series goes. Two spaces is the only sane guess for the inner
    // indent when there is no entry to read one from, and it is what
    // every course file dewlab has written uses.
    return { start, end: start, entryIndent: keyIndent, innerIndent: "  ", entries: [] };
  }
  const starts: number[] = [];
  for (let at = start; at < end; at += 1) {
    const item = ENTRY_RE.exec(lines[at]!);
    if (item && item[1] === entryIndent) starts.push(at);
  }
  const entries = starts.map((entryStart, index) => ({ start: entryStart, end: starts[index + 1] ?? end }));
  return { start, end, entryIndent, innerIndent: innerIndent ?? "  ", entries };
}

/** How many `- ` entries the scanned block actually holds, against how
 * many series js-yaml parsed. Cheap, and it is the only check that
 * catches a block whose shape the scan read differently. */
function countsAgree(block: ScannedContents, content: string, parsed: number): boolean {
  const lines = content.split("\n").slice(block.start, block.end);
  const entries = lines.filter((line) => {
    const item = ENTRY_RE.exec(line);
    return item !== null && item[1] === block.entryIndent;
  }).length;
  return entries === parsed;
}
