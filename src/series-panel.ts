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
// would fail on it, but this is a viewer, not a build). An indexed entry
// is a real, clickable button, opening it through active-store.ts's own
// "open this path" hook — the same routing folder-panel.ts's and
// repo-panel.ts's own file lists use, just reached from here instead. A
// slug with nothing indexed for it renders as plain text: there is no
// path to send anywhere.
//
// A slug can index to more than one file — dewlab's own versioned
// releases (`status`/`version` in front matter, `build.py`'s
// `versions_of()`) mean a live tutorial, an archived one, and a frozen
// past release can all share a slug. file-index.ts's `defaultEntryFor`
// is what picks the one build.py itself would call `is_default` (the
// newest live version, or the newest version at all if none is live);
// picking whichever entry happened to be indexed first, as this used to,
// would show an archived or superseded title (and open its path) as
// often as the real one.

import { createFile, openPath } from "./active-store.ts";
import { defaultEntryFor, type FileIndexEntry } from "./file-index.ts";
import type { Series } from "./series.ts";
import { iconRail } from "./icon-rail.ts";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function textInput(placeholder: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.spellcheck = false;
  return input;
}

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
  toggle.title = "Series";
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

  // "New series" — plan §6 step 4's own other still-open item, next to
  // this one. Only ever writes through active-store.ts's own
  // createFile, so it works or fails exactly the way any other write
  // through that hook would (today: a local folder, since
  // repo-panel.ts doesn't implement createFile yet) — this has no
  // separate knowledge of which store is actually open. The module
  // field is left for the reader to fill in or leave blank rather than
  // detected automatically: whether the currently open folder already
  // *is* one module's own directory, or is the whole multi-module
  // tutorials/ tree, isn't something order.yaml data alone can tell
  // apart reliably (a folder with no series in it yet looks the same
  // either way) — the reader already knows which case they're in.
  const createSection = document.createElement("section");
  createSection.className = "dn-series-create";
  const createHeading = document.createElement("h3");
  createHeading.className = "dn-series-create-heading";
  createHeading.textContent = "New series";
  createSection.appendChild(createHeading);

  const moduleInput = textInput("Module (leave blank if already inside one)");
  moduleInput.className = "dn-series-create-field";
  const slugInput = textInput("series-slug");
  slugInput.className = "dn-series-create-field";
  const titleInput = textInput("Series title");
  titleInput.className = "dn-series-create-field";
  createSection.append(moduleInput, slugInput, titleInput);

  const createButton = document.createElement("button");
  createButton.type = "button";
  createButton.className = "dn-series-create-button";
  createButton.textContent = "Create";
  createSection.appendChild(createButton);

  const createStatus = document.createElement("p");
  createStatus.className = "dn-series-create-status";
  createSection.appendChild(createStatus);
  panel.appendChild(createSection);

  createButton.addEventListener("click", async () => {
    const module = moduleInput.value.trim();
    const slug = slugInput.value.trim();
    const title = titleInput.value.trim();
    if (!SLUG_RE.test(slug)) {
      createStatus.textContent = "Series slug must be lowercase letters, digits, and hyphens.";
      return;
    }
    if (!title) {
      createStatus.textContent = "Enter a series title.";
      return;
    }
    const path = module ? `${module}/${slug}.order.yaml` : `${slug}.order.yaml`;
    // js-yaml isn't reached for here — build.py's own order files never
    // need more than one string field and one empty list, and dumping
    // through a full YAML serialiser for that would risk quoting a
    // title differently than a human would type it by hand.
    const content = `series: ${title}\norder: []\n`;
    createButton.disabled = true;
    createStatus.textContent = "Creating…";
    try {
      await createFile(path, content);
      createStatus.textContent = `Created ${path}.`;
      moduleInput.value = "";
      slugInput.value = "";
      titleInput.value = "";
    } catch (err) {
      createStatus.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      createButton.disabled = false;
    }
  });

  const body = document.createElement("div");
  panel.appendChild(body);

  const empty = document.createElement("p");
  empty.className = "dn-series-empty";
  empty.textContent = "No order.yaml files found — open a folder or repository with any.";
  panel.appendChild(empty);

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
          const entry = defaultEntryFor(getFileIndex(), slug);
          const item = document.createElement("li");
          if (entry) {
            const link = document.createElement("button");
            link.type = "button";
            link.className = "dn-series-link";
            link.textContent = entry.title ?? slug;
            link.addEventListener("click", () => void openPath(entry.path));
            item.appendChild(link);
          } else {
            item.textContent = slug;
          }
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

  iconRail().appendChild(toggle);
  document.body.appendChild(panel);

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
