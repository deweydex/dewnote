// One key, and it reaches the workspace. dewlab has 122 tutorials across
// seven courses: three letters and Enter beats any menu.
//
// Four sections, in the order they are most often wanted:
//
//   Tutorials — the file index by title, resolved through
//               `defaultEntryFor` so a slug with three versions offers
//               the one dewlab's build would serve.
//   Pages     — dewlab's own `pages/` files.
//   Series    — every series in every course, opening at its first
//               tutorial.
//   Do        — commands.ts's registry.
//
// The right-hand half says what the highlighted row is before Enter
// commits to it: path, status, version, opening sentence, headings. A
// list of paths says where a file is; this says what it says.

import { defaultEntryFor, type FileIndexEntry } from "./workspace.ts";
import { availableCommands, fuzzyScore, type Command } from "./commands.ts";
import type { Course } from "./courses.ts";
import { headingsOf, openingOf, plainInline } from "./markdown.ts";

export interface PaletteHost {
  getIndex(): FileIndexEntry[];
  getCourses(): Course[];
  /** Opens a path through whichever store is mounted. False means it
   * could not, and the palette stays open rather than closing on a
   * navigation that did not happen. */
  openPath(path: string): Promise<boolean>;
  /** Whether a document is open, which decides how an empty result
   * explains itself. */
  hasDocument(): boolean;
  /** A document's text, when the store can produce it without opening
   * it — for the preview pane. Null when it cannot, which is ordinary
   * rather than an error: the pane then shows what the index knows. */
  readPath?(path: string): Promise<string | null>;
}

export interface WorkspacePalette {
  open(): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

type RowKind = "tutorial" | "page" | "series" | "command";

/** A hand-written site page rather than a tutorial — dewlab's own
 * `pages/about.md`, `pages/home.md`, `pages/features.md`, which its
 * `build.py` reads through `read_page()` and places nowhere in any
 * course. They were always in the index and always openable; they were
 * filed under "Tutorials" with a blank note, which is the sort of small
 * lie that makes a list untrustworthy. They are ordinary markdown and
 * edit and save exactly as a tutorial does. */
export function isSitePage(path: string): boolean {
  return /(?:^|\/)pages\/[^/]+\.md$/i.test(path);
}

interface Row {
  kind: RowKind;
  /** What the matcher sees and the row shows. */
  label: string;
  /** Right-aligned on the row: a series and position, a course, nothing. */
  note?: string;
  /** Extra matchable words that are never shown. */
  keywords?: string[] | undefined;
  entry?: FileIndexEntry | undefined;
  command?: Command | undefined;
  path?: string | undefined;
  run(): void | Promise<void>;
}

const SECTION_OF: Record<RowKind, string> = {
  tutorial: "Tutorials",
  page: "Site pages",
  series: "Series",
  command: "Commands",
};

/** How many rows of each kind survive a query. A palette that lists
 * ninety tutorials is a file list with a text box on top — so the two
 * unbounded sets are capped. Commands are not: there are a dozen, this
 * is the only place they exist, and a reader who opens the palette with
 * nothing typed is looking to find out what there is. Capping them would
 * hide the list from the one gesture meant to reveal it. */
const LIMIT: Record<RowKind, number> = { tutorial: 8, page: 4, series: 6, command: Number.POSITIVE_INFINITY };

/** How much a match on a hidden keyword — a path, an id, a synonym — is
 * worth against a match on the words a reader can see. Enough to find a
 * row nothing visible would have found, not enough to outrank one whose
 * own title says it. */
const KEYWORD_WEIGHT = 0.7;

/** Where a tutorial sits, said the way an author thinks of it: the
 * series it belongs to and how far in. A practice page says so instead,
 * since its position is its tutorial's. */
function noteFor(entry: FileIndexEntry, courses: readonly Course[]): string {
  if (entry.practiceFor) return "practice";
  if (entry.practiceAcross?.length) return "mixed practice";
  for (const course of courses) {
    for (const series of course.contents) {
      const at = series.tutorials.indexOf(entry.id ?? "");
      if (at !== -1) return `${series.title} · ${at + 1} of ${series.tutorials.length}`;
    }
  }
  return entry.series ?? entry.module ?? "";
}

/**
 * The rows a query leaves, best first within each kind, kinds in fixed
 * order — plus which row Enter takes.
 *
 * Two questions, two numbers. Sections are for the eye, which wants a
 * tutorial where a tutorial always is; `best` is for the hand, which
 * wants what you typed. Merged, typing "appear" lands on the first
 * tutorial whose letters contain a-p-p-e-a-r instead of on the
 * appearance settings.
 */
export function rankRows(rows: readonly Row[], query: string): { rows: Row[]; best: number } {
  const scored: { row: Row; score: number }[] = [];
  for (const row of rows) {
    // A keyword is invisible, so a row matched only by one is a weaker
    // answer than a row matched by the words on screen — and without
    // the discount the hidden text wins outright, because a slug is a
    // subsequence goldmine: every hyphen in
    // `mit-pdp-maths-prog-integration` scores as a word start, so
    // "matri" pulled in every series of that course ahead of the
    // tutorial actually called "What a Matrix Does to a Picture".
    let best = fuzzyScore(query, row.label);
    for (const keyword of row.keywords ?? []) {
      const score = fuzzyScore(query, keyword);
      if (score === null) continue;
      const discounted = score * KEYWORD_WEIGHT;
      if (best === null || discounted > best) best = discounted;
    }
    if (best !== null) scored.push({ row, score: best });
  }
  const kinds: RowKind[] = ["tutorial", "page", "series", "command"];
  const out: { row: Row; score: number }[] = [];
  // Subsequence matching says yes to far more than a reader means:
  // "matri" is inside "A Model That Corrects Itself" if you take the
  // letters far enough apart. Once something has matched properly,
  // anything scoring well under it is noise padding the list, so the
  // best score sets the bar for the rest. An empty query has no bar,
  // because every row scores zero and nothing is being asked for.
  const bar = query ? Math.max(...scored.map((item) => item.score)) * 0.6 : Number.NEGATIVE_INFINITY;
  for (const kind of kinds) {
    const ofKind = scored.filter((item) => item.row.kind === kind && item.score >= bar);
    // A stable sort keeps registration/index order among equal scores,
    // which is what makes an empty query show the workspace in its own
    // order rather than an arbitrary one.
    ofKind.sort((a, b) => b.score - a.score);
    out.push(...ofKind.slice(0, LIMIT[kind]));
  }
  let best = 0;
  for (let at = 1; at < out.length; at += 1) {
    if (out[at]!.score > out[best]!.score) best = at;
  }
  return { rows: out.map((item) => item.row), best };
}

export function mountWorkspacePalette(host: PaletteHost): WorkspacePalette {
  let rows: Row[] = [];
  let active = 0;
  let previewToken = 0;

  const overlay = document.createElement("dialog");
  overlay.className = "dn-overlay dn-wp-overlay";

  const box = document.createElement("div");
  box.className = "dn-panel dn-wp-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Find anything in this workspace");

  const field = document.createElement("div");
  field.className = "dn-wp-field";
  const label = document.createElement("label");
  label.className = "dn-visually-hidden";
  label.htmlFor = "dn-wp-input";
  label.textContent = "Find a tutorial, a series, or something to do";
  const input = document.createElement("input");
  input.type = "text";
  input.id = "dn-wp-input";
  input.className = "dn-wp-input";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Find a tutorial, a series, or something to do…";
  field.append(label, input);

  const body = document.createElement("div");
  body.className = "dn-wp-body";

  const list = document.createElement("div");
  list.className = "dn-wp-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Results");

  const preview = document.createElement("div");
  preview.className = "dn-wp-preview";

  const empty = document.createElement("p");
  empty.className = "dn-wp-empty";
  empty.hidden = true;

  body.append(list, preview);
  box.append(field, body, empty);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  function buildRows(): Row[] {
    const index = host.getIndex();
    const courses = host.getCourses();
    const built: Row[] = [];

    // One row per *page*, not per file: a slug with a live version and
    // two frozen releases is one thing to open, and `defaultEntryFor`
    // already knows which file dewlab's own build would serve.
    const seen = new Set<string>();
    for (const entry of index) {
      const id = entry.id ?? entry.path;
      if (seen.has(id)) continue;
      seen.add(id);
      const best = entry.id ? defaultEntryFor(index, entry.id) ?? entry : entry;
      const page = isSitePage(best.path);
      built.push({
        kind: page ? "page" : "tutorial",
        label: best.title ?? best.id ?? best.path,
        note: page ? "site page" : noteFor(best, courses),
        keywords: [best.path, best.id ?? ""].filter(Boolean),
        entry: best,
        path: best.path,
        run: async () => { await host.openPath(best.path); },
      });
    }

    for (const course of courses) {
      for (const series of course.contents) {
        const first = series.tutorials[0];
        const target = first ? defaultEntryFor(index, first) : undefined;
        built.push({
          kind: "series",
          label: series.title,
          note: `${series.tutorials.length} tutorial${series.tutorials.length === 1 ? "" : "s"} · ${course.title}`,
          keywords: [course.title, course.id],
          path: target?.path,
          run: async () => { if (target) await host.openPath(target.path); },
        });
      }
    }

    for (const command of availableCommands()) {
      built.push({
        kind: "command",
        label: command.label,
        note: command.section,
        keywords: command.keywords,
        command,
        run: () => command.run(),
      });
    }
    return built;
  }

  function renderList(): void {
    list.replaceChildren();
    let lastKind: RowKind | null = null;
    rows.forEach((row, at) => {
      if (row.kind !== lastKind) {
        const heading = document.createElement("p");
        heading.className = "dn-wp-section";
        heading.textContent = SECTION_OF[row.kind];
        list.appendChild(heading);
        lastKind = row.kind;
      }
      const item = document.createElement("button");
      item.type = "button";
      item.className = "dn-wp-row";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(at === active));
      item.classList.toggle("is-active", at === active);
      const name = document.createElement("span");
      name.className = "dn-wp-row-label";
      name.textContent = row.label;
      const note = document.createElement("span");
      note.className = "dn-wp-row-note";
      note.textContent = row.note ?? "";
      item.append(name, note);
      item.addEventListener("click", () => { void choose(at); });
      item.addEventListener("mousemove", () => {
        if (active === at) return;
        active = at;
        renderList();
        void renderPreview();
      });
      list.appendChild(item);
    });
    empty.hidden = rows.length > 0;
    if (rows.length === 0) {
      // Commands that act on a document are hidden until one is open, so
      // "nothing matches" would be wrong about what exists.
      empty.textContent = host.hasDocument()
        ? `Nothing matches “${input.value}”.`
        : `Nothing matches “${input.value}”. Open a document to see the commands that act on it.`;
    }
    list.querySelector<HTMLElement>(".dn-wp-row.is-active")?.scrollIntoView({ block: "nearest" });
  }

  function previewLine(text: string, className: string): HTMLParagraphElement {
    const line = document.createElement("p");
    line.className = className;
    line.textContent = text;
    return line;
  }

  async function renderPreview(): Promise<void> {
    const token = ++previewToken;
    const row = rows[active];
    preview.replaceChildren();
    if (!row) return;

    if (row.kind === "command") {
      preview.append(previewLine(row.command?.section ?? "", "dn-wp-preview-kicker"));
      preview.append(previewLine(row.label, "dn-wp-preview-title"));
      if (row.command?.detail) preview.append(previewLine(row.command.detail, "dn-wp-preview-body"));
      preview.append(previewLine("↵ run", "dn-wp-preview-keys"));
      return;
    }

    if (row.kind === "series") {
      preview.append(previewLine(row.note ?? "", "dn-wp-preview-kicker"));
      preview.append(previewLine(row.label, "dn-wp-preview-title"));
      const course = host.getCourses().find((item) => item.contents.some((series) => series.title === row.label));
      const series = course?.contents.find((item) => item.title === row.label);
      if (series) {
        const inside = document.createElement("div");
        inside.className = "dn-wp-preview-list";
        for (const id of series.tutorials) {
          const entry = defaultEntryFor(host.getIndex(), id);
          inside.append(previewLine(entry?.title ?? id, "dn-wp-preview-item"));
        }
        preview.appendChild(inside);
      }
      preview.append(previewLine(row.path ? "↵ open the first" : "nothing indexed yet", "dn-wp-preview-keys"));
      return;
    }

    const entry = row.entry;
    if (!entry) return;
    preview.append(previewLine(entry.path, "dn-wp-preview-kicker"));
    preview.append(previewLine(row.label, "dn-wp-preview-title"));
    const facts = [entry.status, entry.version, row.note].filter(Boolean).join(" · ");
    if (facts) preview.append(previewLine(facts, "dn-wp-preview-facts"));

    const source = await host.readPath?.(entry.path).catch(() => null);
    // A slow or failed read must never overwrite a newer highlight.
    if (token !== previewToken) return;
    if (source) {
      const opening = openingOf(source);
      if (opening) preview.append(previewLine(opening, "dn-wp-preview-body"));
      const headings = headingsOf(source);
      if (headings.length) {
        preview.append(previewLine("Inside", "dn-wp-preview-kicker"));
        const inside = document.createElement("div");
        inside.className = "dn-wp-preview-list";
        for (const heading of headings.slice(0, 8)) inside.append(previewLine(heading, "dn-wp-preview-item"));
        preview.appendChild(inside);
      }
    }
    preview.append(previewLine("↵ open", "dn-wp-preview-keys"));
  }

  function refresh(): void {
    const ranked = rankRows(buildRows(), input.value.trim());
    rows = ranked.rows;
    active = ranked.best;
    renderList();
    void renderPreview();
  }

  async function choose(at: number): Promise<void> {
    const row = rows[at];
    if (!row) return;
    // Close first for a command: several of them open a surface of their
    // own, and two overlays fighting over focus is the bug this
    // had. A navigation closes only once it has happened.
    if (row.kind === "command") {
      close();
      await row.run();
      return;
    }
    await row.run();
    close();
  }

  function move(delta: number): void {
    if (rows.length === 0) return;
    active = (active + delta + rows.length) % rows.length;
    renderList();
    void renderPreview();
  }

  function open(): void {
    overlay.showModal();
    input.value = "";
    refresh();
    input.focus();
  }

  function close(): void {
    overlay.close();
    previewToken += 1;
  }

  input.addEventListener("input", refresh);

  box.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Enter") { event.preventDefault(); void choose(active); }
    else if (event.key === "Escape") { event.preventDefault(); close(); }
  });

  overlay.addEventListener("pointerdown", (event) => {
    if (!box.contains(event.target as Node)) close();
  });

  function onKeydown(event: KeyboardEvent): void {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
    event.preventDefault();
    if (!overlay.open) open();
    else close();
  }
  document.addEventListener("keydown", onKeydown);

  return {
    open,
    close,
    isOpen: () => overlay.open,
    destroy() {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
    },
  };
}
