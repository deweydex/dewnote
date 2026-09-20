// Which series lists a tutorial.
//
// dewlab moved placement out of a tutorial's front matter: a page's id
// is its path, and which series lists that id lives in
// `courses/<id>.yaml`. So placing a tutorial means editing a course
// file, and the one rule that matters is not to disturb the rest of it.
//
// A line splice, not a re-dump: re-serialising the YAML would refold
// every quoted string and reorder nothing usefully. `modules.ts` gives
// the exact line range of each series' `- id` items, and refuses to
// give one it is unsure of — a range this is wrong about is how an
// insert lands in somebody's prose.

import type { Module, ModuleSeries } from "./modules.ts";

export interface Placement {
  courseId: string;
  courseTitle: string;
  seriesTitle: string;
}

/** Every series that lists `id`, across every course. A tutorial can be
 * on more than one. */
export function placementsOf(id: string, modules: readonly Module[]): Placement[] {
  const found: Placement[] = [];
  for (const module of modules) {
    for (const series of module.contents) {
      if (series.tutorials.includes(id)) {
        found.push({
          courseId: module.id,
          courseTitle: module.title ?? module.id,
          seriesTitle: series.title,
        });
      }
    }
  }
  return found;
}

/** Add `id` to the end of `series`' own list, in `content`. */
export function addToSeries(
  content: string,
  series: ModuleSeries,
  id: string,
): string | { error: string } {
  if (series.tutorials.includes(id)) return { error: `${id} is already in ${series.title}.` };
  if (!series.tutorialsRange) {
    return { error: `The list under ${series.title} is not written in a form dewnote can edit.` };
  }
  const lines = content.split("\n");
  lines.splice(series.tutorialsRange.end, 0, `${series.indent}- ${id}`);
  return lines.join("\n");
}

/** Take `id` out of `series`' own list. */
export function removeFromSeries(
  content: string,
  series: ModuleSeries,
  id: string,
): string | { error: string } {
  if (!series.tutorialsRange) {
    return { error: `The list under ${series.title} is not written in a form dewnote can edit.` };
  }
  const lines = content.split("\n");
  const { start, end } = series.tutorialsRange;
  const at = lines.findIndex(
    (line, index) => index >= start && index < end && line.trim() === `- ${id}`,
  );
  if (at === -1) return { error: `${id} is not listed under ${series.title}.` };
  lines.splice(at, 1);
  return lines.join("\n");
}
