// The workspace index: what every file is, and where it sits.
//
// One pass over every markdown file's front matter, built when a
// workspace opens and refreshed on save. Pure, over content somebody
// else read, so it runs without a browser or a token.
//
// Only string-valued fields are kept: a `year: 2026` is not a name a
// picker can offer.
//
// A page's id comes from its path — dewlab's `id_of()`, "from where its
// file is and nothing else" — so `id` is derived, never read from a
// field, and `courses` is a join against the course files.
// `module`/`series` stay because dewstack places a tutorial from its
// front matter.

import type { Course } from "./courses.ts";
import { extractFrontMatter } from "./frontmatter.ts";

export interface FileIndexEntry {
  /** The path this entry was read from — a folder-relative path
   * (folder-store.ts) or a repo path (github.ts); the caller's own
   * space, not reinterpreted here. */
  path: string;
  /** The page's id, derived from the path the way dewlab's own `id_of()`
   * derives it. Site-wide and unique per *page*, which is not the same as
   * unique per *file* — see `defaultEntryFor`. */
  id?: string;
  title?: string;
  /** dewstack's own front-matter placement. A dewlab file written since
   * the move to `modules/` has none of these. */
  slug?: string;
  module?: string;
  series?: string;
  /** A practice page follows this tutorial onto every course that lists
   * it; it is deliberately not listed in the course file itself. */
  practiceFor?: string;
  /** A mixed practice page draws on several tutorials and is placed by a
   * course's top-level `mixed:` list rather than inside a series. */
  practiceAcross?: string[];
  /** Ids of the courses whose own `contents` list this entry's id, filled
   * in by `buildFileIndex` when it's given the course files. Empty (not
   * absent) for an indexed dewlab tutorial no course lists — which is a
   * real and buildable state, "published but on no course", and worth
   * telling apart from a file that was never cross-referenced at all. */
  courses?: string[];
  /** dewlab's own `status` (`draft`/`beta`/`live`/`archived`, `build.py`'s
   * own `STATUSES`) and `version` (a `YYYY.MM.DD.N` release date,
   * `build.py`'s own `VERSION_RE`) — read here only so `defaultEntryFor`
   * can pick the one file among several sharing an id that dewlab's own
   * build would actually serve. Absent entirely on a plain-markdown or
   * dewstack document, which have no versioning concept at all. */
  status?: string;
  version?: string;
}

/** `v2026.08.23.1.md` — a frozen past release, sitting in the folder of
 * the tutorial it is a release of (`build.py`'s own `VERSION_FILE_RE`). */
const VERSION_FILE_RE = /^v\d{4}\.\d{2}\.\d{2}\.\d+$/;

/**
 * A page's id from its path alone, following dewlab's `id_of()`:
 *
 * - a tutorial is `tutorials/<id>/<id>.md` — the id is the file's stem;
 * - a practice page is `<id>-practice.md` and gets its own id;
 * - a frozen release is `v<version>.md` and takes the *folder's* name.
 *
 * Derived, never read from a field: the id is the page's address and the
 * key a reader's saved work lives under, so a field that could disagree
 * with the folder would break both.
 */
export function idFromPath(path: string): string {
  const segments = path.split("/");
  const fileName = segments[segments.length - 1] ?? "";
  const stem = fileName.replace(/\.[^./]*$/, "");
  if (VERSION_FILE_RE.test(stem)) return segments[segments.length - 2] ?? stem;
  return stem;
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
  const entry: FileIndexEntry = { path, id: idFromPath(path) };
  const title = stringField(fields, "title");
  const slug = stringField(fields, "slug");
  const module = stringField(fields, "module");
  const series = stringField(fields, "series");
  const status = stringField(fields, "status");
  const version = stringField(fields, "version");
  const practiceFor = stringField(fields, "practice_for");
  const practiceAcross = Array.isArray(fields["practice_across"])
    ? fields["practice_across"].filter((value): value is string => typeof value === "string")
    : undefined;
  if (title !== undefined) entry.title = title;
  if (slug !== undefined) entry.slug = slug;
  if (module !== undefined) entry.module = module;
  if (series !== undefined) entry.series = series;
  if (status !== undefined) entry.status = status;
  if (version !== undefined) entry.version = version;
  if (practiceFor !== undefined) entry.practiceFor = practiceFor;
  if (practiceAcross !== undefined) entry.practiceAcross = practiceAcross;
  return entry;
}

/** Which courses list each tutorial id — one pass over the course files,
 * so the join below is a lookup rather than a scan per entry. A course
 * listing the same id in two of its own series names that course once. */
export function courseMembership(courses: Course[]): Map<string, string[]> {
  const listedBy = new Map<string, string[]>();
  for (const course of courses) {
    for (const series of course.contents) {
      for (const id of series.tutorials) {
        const already = listedBy.get(id);
        if (!already) listedBy.set(id, [course.id]);
        else if (!already.includes(course.id)) already.push(course.id);
      }
    }
    for (const id of course.mixed ?? []) {
      const already = listedBy.get(id);
      if (!already) listedBy.set(id, [course.id]);
      else if (!already.includes(course.id)) already.push(course.id);
    }
  }
  return listedBy;
}

/**
 * The index, optionally cross-referenced against the course files the
 * same store just read. Without them every entry's `courses` is absent —
 * "nothing was cross-referenced" — rather than empty, which means "cross-
 * referenced, and no course lists this."
 */
export function buildFileIndex(
  files: { path: string; content: string }[],
  courses: Course[] = [],
): FileIndexEntry[] {
  const index = files.map(({ path, content }) => indexEntryFor(path, content));
  if (courses.length === 0) return index;
  const listedBy = courseMembership(courses);
  for (const entry of index) {
    // A focused practice page inherits its tutorial's placement. Mixed
    // practice is listed explicitly in a course's top-level `mixed:` list.
    const membershipId = entry.practiceFor ?? entry.id;
    entry.courses = membershipId ? (listedBy.get(membershipId) ?? []) : [];
  }
  return index;
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

/** Among every entry sharing `id`, the one dewlab's `versions_of()`
 * marks `is_default`: the newest `live` version, or the newest of any
 * status when there is no live one. `undefined` for an unknown id.
 *
 * An id is unique per *page*, not per *file* — a frozen release
 * `tutorials/first-steps/v2026.08.23.1.md` carries the same id as the
 * live file beside it. Picking whichever was indexed first would show a
 * frozen release's title where the live one belongs. */
export function defaultEntryFor(index: FileIndexEntry[], id: string): FileIndexEntry | undefined {
  let best: FileIndexEntry | undefined;
  for (const entry of index) {
    if (entry.id !== id) continue;
    if (!best || isNewer(entry, best)) best = entry;
  }
  return best;
}

/** §5.10's own pickers read from these — every distinct value in use,
 * sorted, so dewstack's module picker offers `data` once rather than once
 * per tutorial that names it. `"id"` is the same mechanism for a
 * different purpose: not "which values repeat," since an id names one
 * page, but "every real id this index knows about" — `practice_for`'s own
 * datalist, so naming which tutorial a practice page is for offers real
 * choices rather than free text with nothing to check it against. */
export function distinctValues(index: FileIndexEntry[], field: "module" | "series" | "id"): string[] {
  const values = new Set<string>();
  for (const entry of index) {
    const value = entry[field];
    if (value) values.add(value);
  }
  return [...values].sort();
}

// ─────────────────────────────────────────────────────────────────────
// Where the open document sits: course › series › page.
//
// A pure function of path, index and course descriptors.

import type { CourseSeries } from "./courses.ts";

export interface WorkspaceLocation {
  course: string;
  series: string;
  page: string;
}

/** A page's own title, falling back to its id and then its path — a file
 * with no front matter still has to be nameable. */
function titleOf(entry: FileIndexEntry): string {
  return entry.title ?? entry.id ?? entry.path;
}

/** Which series inside `course` lists `id`, treating a practice page as
 * following the tutorial it is for. dewlab's `mixed:` list places a
 * practice page that draws on several tutorials at course level, with no
 * series of its own. */
function seriesFor(course: Course, id: string, practiceFor: string | undefined): CourseSeries | "mixed" | null {
  const membershipId = practiceFor ?? id;
  for (const series of course.contents) {
    if (series.tutorials.includes(membershipId)) return series;
  }
  if ((course.mixed ?? []).includes(id)) return "mixed";
  return null;
}

/** The breadcrumb for `path`, or `null` when the index has nothing to
 * say about it — an unplaced file, a frozen release, a course file.
 * Returning null rather than a row of empty strings is deliberate: the
 * spine shows the path alone in that case, which is true, where three
 * blank rungs would not be. */
export function locationOf(
  path: string,
  index: FileIndexEntry[],
  courses: Course[],
): WorkspaceLocation | null {
  const entry = index.find((item) => item.path === path);
  if (!entry) return null;
  const id = entry.id;
  if (!id) return null;

  for (const course of courses) {
    const series = seriesFor(course, id, entry.practiceFor);
    if (!series) continue;
    return {
      course: course.title ?? course.id,
      series: series === "mixed" ? "Mixed practice" : series.title,
      page: titleOf(entry),
    };
  }
  return null;
}

/** Every page in `series`, in the order the course lists them, each
 * tutorial followed by its own practice page. The palette opens a series
 * at the first of these. */
export function pagesOfSeries(series: CourseSeries, index: FileIndexEntry[]): { path: string; label: string }[] {
  const pages: { path: string; label: string }[] = [];
  for (const id of series.tutorials) {
    const tutorial = defaultEntryFor(index, id);
    if (tutorial) pages.push({ path: tutorial.path, label: titleOf(tutorial) });
    for (const practice of index.filter((entry) => entry.practiceFor === id)) {
      pages.push({ path: practice.path, label: titleOf(practice) });
    }
  }
  return pages;
}
