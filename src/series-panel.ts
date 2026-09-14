// The placement view: which course lists a tutorial, in which series,
// in what order — read from dewlab's own `courses/*.yaml` (courses.ts).
//
// This used to read one `<series>.order.yaml` per series and group them
// by the module folder they sat in. dewlab moved placement into course
// files, so the grouping is now the real one: a course, its series in
// the order the course file lists them, and each series' tutorials in
// the order it lists those. Nothing is sorted here any more — an order
// file's own order was the point before and a course file's is now, and
// sorting series alphabetically (as this did) was only ever standing in
// for an order the old format didn't record.
//
// Kept from before: mounted the same independent way outline-panel.ts
// is, a toggle and a docked rail, closed until asked; fed a whole list
// via `setCourses` rather than pulling from the open document, since
// placement is a property of the open folder or repository and not of
// whichever tutorial happens to be on screen; and each listed tutorial
// is a real button that opens it through active-store.ts's own hook,
// falling back to plain text for an id with no file behind it.
//
// `defaultEntryFor` still picks which file an id means, because an id
// can still be several files: a frozen release `v<version>.md` carries
// the id of the folder it sits in, the same as the live tutorial beside
// it (build.py's own `id_of`). Picking whichever was indexed first would
// show a frozen release's title as often as the real one.
//
// ## Two things this can now say that the old panel could not
//
// A course file naming an id, and a `tutorials/<id>/` folder, are two
// halves that can disagree. So the panel reports both halves of that:
// an id a course lists with nothing indexed for it, and an indexed
// tutorial no course lists. dewlab builds the second happily — "published
// but on no course" is a real state — so it reads as a list to place
// rather than as an error.
//
// ## No "New series" here, for now
//
// It used to create a `<slug>.order.yaml` file. A series is not a file
// any more; it is an entry in a course file's own `contents`, so making
// one means writing into a course file — the same splice reordering,
// adding and removing all need, and all of that lands together in the
// writer that follows this. A form that still wrote an order file would
// write a format dewlab no longer reads.

import { openPath } from "./active-store.ts";
import type { Course } from "./courses.ts";
import { defaultEntryFor, type FileIndexEntry } from "./file-index.ts";
import { iconRail } from "./icon-rail.ts";

export interface SeriesPanel {
  /** Replaces the whole listing — called every time folder-panel.ts or
   * repo-panel.ts (re)reads the open store's course files, the same
   * "handed the whole thing every time" shape app.ts's setFileIndex
   * already has. */
  setCourses(courses: Course[]): void;
  destroy(): void;
}

/** Every indexed tutorial that no course lists, one entry per id (the
 * one `defaultEntryFor` would pick), in path order.
 *
 * Only meaningful once course files have actually been read: an entry
 * whose `courses` is undefined was never cross-referenced, which is not
 * the same as being on no course, and counting those would report every
 * tutorial the moment a folder without a `courses/` directory is open.
 *
 * Exported for its own unit test — the rendering around it is covered
 * against the built app in tests/e2e/series-panel.spec.ts, the same
 * split outline-panel.ts uses, but the rule itself is worth checking
 * directly rather than only through a browser. */
export function tutorialsOnNoCourse(index: FileIndexEntry[]): FileIndexEntry[] {
  const seen = new Set<string>();
  const out: FileIndexEntry[] = [];
  for (const entry of index) {
    if (!entry.id || entry.courses === undefined || entry.courses.length > 0) continue;
    if (!entry.path.includes("tutorials/")) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const best = defaultEntryFor(index, entry.id);
    if (best) out.push(best);
  }
  return out;
}

/** Mounted once, independently of any particular document or store.
 * `getFileIndex` is read fresh on every render, not cached at mount
 * time, so a course rendered before a folder's index finishes building
 * still gets titles once it catches up. */
export function mountSeriesPanel(getFileIndex: () => FileIndexEntry[]): SeriesPanel {
  let courses: Course[] = [];

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "dn-series-toggle";
  toggle.setAttribute("aria-label", "Courses");
  toggle.setAttribute("aria-expanded", "false");
  toggle.title = "Courses";
  toggle.textContent = "☰";

  const panel = document.createElement("div");
  panel.className = "dn-series-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", "Courses");
  panel.hidden = true;
  toggle.setAttribute("aria-controls", (panel.id = "dn-series-panel"));

  const header = document.createElement("div");
  header.className = "dn-series-header";
  const heading = document.createElement("h2");
  heading.textContent = "Courses";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "dn-series-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  });
  header.append(heading, closeButton);
  panel.appendChild(header);

  const body = document.createElement("div");
  panel.appendChild(body);

  const empty = document.createElement("p");
  empty.className = "dn-series-empty";
  empty.textContent = "No course files found — open a folder or repository with a courses/ directory.";
  panel.appendChild(empty);

  function renderSeriesList(ids: string[]): HTMLOListElement {
    const index = getFileIndex();
    const list = document.createElement("ol");
    list.className = "dn-series-list";
    for (const id of ids) {
      const entry = defaultEntryFor(index, id);
      const item = document.createElement("li");
      if (entry) {
        const link = document.createElement("button");
        link.type = "button";
        link.className = "dn-series-link";
        link.textContent = entry.title ?? id;
        link.addEventListener("click", () => void openPath(entry.path));
        item.appendChild(link);
      } else {
        // A course listing an id with no file behind it — dewlab's own
        // build stops on this, so it's worth naming rather than showing
        // as a bare id that looks like any other line.
        item.className = "dn-series-missing";
        item.textContent = `${id} — no file`;
      }
      list.appendChild(item);
    }
    return list;
  }

  function render() {
    body.replaceChildren();
    empty.hidden = courses.length > 0;

    for (const course of courses) {
      const section = document.createElement("section");
      section.className = "dn-series-module";
      const courseHeading = document.createElement("h3");
      courseHeading.textContent = course.title;
      section.appendChild(courseHeading);

      for (const series of course.contents) {
        const seriesBlock = document.createElement("div");
        seriesBlock.className = "dn-series-block";
        const seriesHeading = document.createElement("h4");
        seriesHeading.textContent = series.title;
        seriesBlock.appendChild(seriesHeading);
        seriesBlock.appendChild(renderSeriesList(series.tutorials));
        section.appendChild(seriesBlock);
      }
      body.appendChild(section);
    }

    const loose = tutorialsOnNoCourse(getFileIndex());
    if (loose.length > 0) {
      const section = document.createElement("section");
      section.className = "dn-series-module dn-series-unlisted";
      const looseHeading = document.createElement("h3");
      looseHeading.textContent = "On no course";
      section.appendChild(looseHeading);

      const list = document.createElement("ol");
      list.className = "dn-series-list";
      for (const entry of loose) {
        const item = document.createElement("li");
        const link = document.createElement("button");
        link.type = "button";
        link.className = "dn-series-link";
        link.textContent = entry.title ?? entry.id ?? entry.path;
        link.addEventListener("click", () => void openPath(entry.path));
        item.appendChild(link);
        list.appendChild(item);
      }
      section.appendChild(list);
      body.appendChild(section);
    }
  }

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) render();
  });

  iconRail().appendChild(toggle);
  document.body.appendChild(panel);

  return {
    setCourses(next) {
      courses = next;
      if (!panel.hidden) render();
    },
    destroy() {
      toggle.remove();
      panel.remove();
    },
  };
}
