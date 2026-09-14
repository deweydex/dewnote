// Writing a course file back — the other half of courses.ts, and the one
// that actually moves a tutorial.
//
// Everything here is one operation: replace the lines a series'
// `tutorials:` list occupies with a different list of ids. Reordering
// within a series, moving a tutorial to a sibling series, adding one and
// removing one are all that same splice with a different array, which is
// why courses.ts records the range rather than this module hunting for
// it. Nothing else in the file is read, written or re-serialised: a
// course file's `card:` is a folded scalar whose continuation lines are
// indented prose and its `description:` is single-quoted with blank
// lines inside it, both student-facing text on dewlab's front page, and
// both would be refolded and requoted by any round trip through a YAML
// dumper (DECISIONS.md 1 — the file is the document).
//
// ## What it refuses
//
// Three refusals, each returning a reason rather than throwing, because
// every one of them is something a reader can see and act on rather than
// a bug:
//
// - A series whose range courses.ts could not record. That is a flow
//   list, or a file the line scan and js-yaml read differently. Writing
//   somewhere this module isn't sure about is how a reader loses the
//   prose above it.
// - Adding an id the course already lists in another series. dewlab's
//   own `read_course()` fails the build on that — "A tutorial sits in
//   one place on a course" — so writing it would hand somebody a file
//   that no longer builds, with no sign here that anything was wrong.
// - An id that names no tutorial, when the caller passes the ids it
//   knows about. A course listing an id with no `tutorials/<id>/`
//   folder behind it also stops dewlab's build.
//
// ## What it does not check
//
// Whether the ids are *the ones the reader meant*. This writes what it
// is given, in the order it is given, which is what makes a drag a drag.

import type { Course, CourseSeries } from "./courses.ts";

/** One series' new list of ids. Several may be applied at once — a drag
 * from one series to a sibling is two of these against the same file. */
export interface SeriesEdit {
  series: CourseSeries;
  tutorials: string[];
}

/** Either the file's new text, or why nothing was written. Never a
 * partial write: a refusal leaves the file exactly as it was. */
export type WriteResult = { ok: true; content: string } | { ok: false; reason: string };

/** The ids a course already lists, anywhere in it — dewlab's own
 * `read_course()` reads this as the rule that a tutorial sits in one
 * place on a course. Exported because the panel wants it too, to grey
 * out the tutorials an "add to this series" list should not offer. */
export function idsListedBy(course: Course): Set<string> {
  return new Set(course.contents.flatMap((series) => series.tutorials));
}

/**
 * Splices each edit's ids into the lines its series' `tutorials:` list
 * occupies, and returns the whole file's new text.
 *
 * Applied from the bottom of the file upwards, so an edit that changes
 * how many lines a list takes never shifts a range that has not been
 * written yet — the reason a two-series move needs no re-parse between
 * its two halves.
 */
export function writeCourseFile(content: string, edits: SeriesEdit[]): WriteResult {
  const ranges: { start: number; end: number; lines: string[]; title: string }[] = [];
  for (const edit of edits) {
    const range = edit.series.tutorialsRange;
    if (!range) {
      return {
        ok: false,
        reason: `"${edit.series.title}" is written in a form dewnote can't rewrite safely — edit the course file directly.`,
      };
    }
    ranges.push({
      start: range.start,
      end: range.end,
      lines: edit.tutorials.map((id) => `${edit.series.indent}- ${id}`),
      title: edit.series.title,
    });
  }

  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  for (let at = 1; at < sorted.length; at += 1) {
    // Descending, so the previous one starts later: it overlaps when it
    // starts before this one ends. Two edits to the same series would
    // land here too, and are just as much a caller bug.
    if (sorted[at - 1]!.start < sorted[at]!.end) {
      return { ok: false, reason: `"${sorted[at]!.title}" and "${sorted[at - 1]!.title}" overlap in the file — nothing was written.` };
    }
  }

  const lines = content.split("\n");
  for (const range of sorted) {
    lines.splice(range.start, range.end - range.start, ...range.lines);
  }
  return { ok: true, content: lines.join("\n") };
}

/** Where a tutorial sits: which series of a course, and where in it. */
export interface Position {
  series: number;
  index: number;
}

/** Where `id` sits on this course, or null if it isn't on it.
 *
 * A course lists a tutorial at most once — dewlab's own `read_course()`
 * fails the build otherwise — so an id names one position, which is what
 * lets a caller hold on to an id across a re-read rather than an index
 * that a change under it would quietly redirect. */
export function locateTutorial(course: Course, id: string): Position | null {
  for (const [series, entry] of course.contents.entries()) {
    const index = entry.tutorials.indexOf(id);
    if (index !== -1) return { series, index };
  }
  return null;
}

/** The index of the series called `title`, or -1.
 *
 * By title rather than by position for the same reason: two series on a
 * course can't share a title (`read_course()` again, after normalising
 * punctuation), so a title survives a re-read of a file somebody else
 * edited in the meantime where a position would silently name whichever
 * series had moved into that slot. */
export function findSeries(course: Course, title: string): number {
  return course.contents.findIndex((series) => series.title === title);
}

/**
 * Moves the tutorial at `from` to `to` — a drag, whether it lands in the
 * same series or a sibling one.
 *
 * `to.index` is read against the destination list *as it stands once the
 * tutorial has been taken out of its old place*, which is the only
 * reading that behaves the same whether the drag crossed series or not.
 * Dragging the second of three items to the end is `{index: 2}` either
 * way.
 */
export function moveTutorial(course: Course, content: string, from: Position, to: Position): WriteResult {
  const source = course.contents[from.series];
  const target = course.contents[to.series];
  if (!source || !target) return { ok: false, reason: "That series is no longer in this course — reopen it." };

  const id = source.tutorials[from.index];
  if (id === undefined) return { ok: false, reason: "That tutorial is no longer where it was — reopen the course." };

  if (from.series === to.series) {
    const ids = [...source.tutorials];
    ids.splice(from.index, 1);
    ids.splice(clamp(to.index, ids.length), 0, id);
    return writeCourseFile(content, [{ series: source, tutorials: ids }]);
  }

  const sourceIds = [...source.tutorials];
  sourceIds.splice(from.index, 1);
  const targetIds = [...target.tutorials];
  targetIds.splice(clamp(to.index, targetIds.length), 0, id);
  return writeCourseFile(content, [
    { series: source, tutorials: sourceIds },
    { series: target, tutorials: targetIds },
  ]);
}

/** Lists `id` in one of the course's series, at `index` (the end when
 * that is past it). Refused when the course already lists it somewhere,
 * since dewlab's build fails on a course that lists a tutorial twice. */
export function addTutorial(course: Course, content: string, seriesIndex: number, id: string, index?: number): WriteResult {
  const series = course.contents[seriesIndex];
  if (!series) return { ok: false, reason: "That series is no longer in this course — reopen it." };
  const listed = idsListedBy(course);
  if (listed.has(id)) {
    const holder = course.contents.find((one) => one.tutorials.includes(id));
    return { ok: false, reason: `${course.title} already lists ${id}, under "${holder?.title ?? "another series"}". A tutorial sits in one place on a course.` };
  }
  const ids = [...series.tutorials];
  ids.splice(clamp(index ?? ids.length, ids.length), 0, id);
  return writeCourseFile(content, [{ series, tutorials: ids }]);
}

/**
 * Takes `id` out of one of the course's series.
 *
 * This unlists a tutorial; it never deletes the file. A tutorial on no
 * course still builds, and its id is the key a reader's saved work lives
 * under, so throwing the file away is a different and much heavier act
 * than taking it off a reading order — one this panel deliberately
 * doesn't offer.
 */
export function removeTutorial(course: Course, content: string, seriesIndex: number, id: string): WriteResult {
  const series = course.contents[seriesIndex];
  if (!series) return { ok: false, reason: "That series is no longer in this course — reopen it." };
  const at = series.tutorials.indexOf(id);
  if (at === -1) return { ok: false, reason: `"${series.title}" doesn't list ${id} — reopen the course.` };
  const ids = [...series.tutorials];
  ids.splice(at, 1);
  return writeCourseFile(content, [{ series, tutorials: ids }]);
}

function clamp(index: number, length: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.trunc(index), length);
}
