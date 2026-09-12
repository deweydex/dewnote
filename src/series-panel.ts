// Step 4's own "the series view from order.yaml" (PLAN.md §6 step 4),
// UI half — series.ts is the parsing. Mounted the same independent way
// outline-panel.ts is: a toggle and a docked rail, read-only, closed
// until asked. Reads a plain array handed in via `setSeries` (fed by
// folder-panel.ts's and repo-panel.ts's own order-file reads, alongside
// the front-matter index each already builds) rather than pulling from
// a document the way outline-panel.ts's own `getSource` does — a series
// is a property of the open folder or repository, not of whichever
// tutorial happens to be on screen, so nothing here needs to know a
// document is even open.
//
// Each series lists its own tutorials by slug, using the file index's
// title where the slug is actually indexed and the bare slug otherwise
// (an order file naming a tutorial not yet opened, or not part of this
// folder at all, is a real and unremarkable case — dewlab's own build
// would fail on it, but this is a viewer, not a build). Deliberately not
// clickable: opening one by a click needs a store-agnostic "open this
// path" hook neither folder-panel.ts nor repo-panel.ts exposes today,
// real plumbing left for later rather than rushed here.
//
// A slug can index to more than one file — dewlab's own versioned
// releases (`status`/`version` in front matter, `build.py`'s
// `versions_of()`) mean a live tutorial, an archived one, and a frozen
// past release can all share a slug. file-index.ts's `defaultEntryFor`
// is what picks the one build.py itself would call `is_default` (the
// newest live version, or the newest version at all if none is live);
// picking whichever entry happened to be indexed first, as this used to,
// would show an archived or superseded title as often as the real one.

import { defaultEntryFor, type FileIndexEntry } from "./file-index.ts";
import type { Series } from "./series.ts";

export interface SeriesPanel {
  /** Replaces the whole series list — called every time folder-panel.ts
   * or repo-panel.ts (re)builds its own order-file read, the same
   * "handed the whole thing every time" shape app.ts's setFileIndex
   * already has. */
  setSeries(series: Series[]): void;
  destroy(): void;
}

/** Mounted once, independently of any particular document or store.
 * `getFileIndex` is read fresh on every render, not cached at mount
 * time, so a series rendered before a folder's index finishes building
 * still gets titles once it catches up. */
export function mountSeriesPanel(getFileIndex: () => FileIndexEntry[]): SeriesPanel {
  let series: Series[] = [];

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "dn-series-toggle";
  toggle.setAttribute("aria-label", "Series");
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "☰";

  const panel = document.createElement("div");
  panel.className = "dn-series-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", "Series");
  panel.hidden = true;
  toggle.setAttribute("aria-controls", (panel.id = "dn-series-panel"));

  const header = document.createElement("div");
  header.className = "dn-series-header";
  const heading = document.createElement("h2");
  heading.textContent = "Series";
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
  empty.textContent = "No order.yaml files found — open a folder or repository with any.";
  panel.appendChild(empty);

  function titleFor(slug: string): string {
    return defaultEntryFor(getFileIndex(), slug)?.title ?? slug;
  }

  function render() {
    body.replaceChildren();
    empty.hidden = series.length > 0;

    const byModule = new Map<string, Series[]>();
    for (const one of series) {
      const list = byModule.get(one.module) ?? [];
      list.push(one);
      byModule.set(one.module, list);
    }

    for (const module of [...byModule.keys()].sort()) {
      const section = document.createElement("section");
      section.className = "dn-series-module";
      const moduleHeading = document.createElement("h3");
      moduleHeading.textContent = module || "(no module)";
      section.appendChild(moduleHeading);

      for (const one of [...byModule.get(module)!].sort((a, b) => a.title.localeCompare(b.title))) {
        const seriesBlock = document.createElement("div");
        seriesBlock.className = "dn-series-block";
        const seriesHeading = document.createElement("h4");
        seriesHeading.textContent = one.title;
        seriesBlock.appendChild(seriesHeading);

        const list = document.createElement("ol");
        list.className = "dn-series-list";
        for (const slug of one.order) {
          const item = document.createElement("li");
          item.textContent = titleFor(slug);
          list.appendChild(item);
        }
        seriesBlock.appendChild(list);
        section.appendChild(seriesBlock);
      }
      body.appendChild(section);
    }
  }

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) render();
  });

  document.body.append(toggle, panel);

  return {
    setSeries(next) {
      series = next;
      if (!panel.hidden) render();
    },
    destroy() {
      toggle.remove();
      panel.remove();
    },
  };
}
