// One key, and it reaches the workspace rather than the rails.
//
// The palette this replaces (`command-palette.ts`) held a dozen fixed
// rows, each of which found a hidden rail button by CSS selector and
// clicked it. It could do nothing a menu could not, and it left out the
// one thing a palette is better at than any other interface: finding a
// document by name. dewlab has 122 tutorials across seven modules. A
// `<select>` of thirty titles is a scrolling native menu; three letters
// and Enter is not.
//
// So this indexes three things, in the order somebody reaching for it
// most often wants them:
//
//   Tutorials — every entry in the file index, by title, with its
//               series and position, resolved through `defaultEntryFor`
//               so a slug with three versions on disk offers the one
//               dewlab's own build would serve.
//   Series    — every series in every module descriptor, opening at its
//               first tutorial.
//   Do        — commands.ts's registry, which is where the workspace
//               menu's contents live now.
//
// The right-hand half says what the highlighted row actually is before
// Enter commits to it: a tutorial's path, status, version, first
// paragraph and its own headings. That pane is the reason this can
// replace a file list rather than sit beside one — a list of paths tells
// you where a file is, and this tells you what it says.

import { defaultEntryFor, type FileIndexEntry } from "./file-index.ts";
import { availableCommands, fuzzyScore, type Command } from "./commands.ts";
import { parseDocument } from "./blocks.ts";
import type { Module } from "./modules.ts";

export interface PaletteHost {
  getIndex(): FileIndexEntry[];
  getModules(): Module[];
  /** Opens a path through whichever store is mounted. False means it
   * could not, and the palette stays open rather than closing on a
   * navigation that did not happen. */
  openPath(path: string): Promise<boolean>;
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
 * module. They were always in the index and always openable; they were
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
  /** Right-aligned on the row: a series and position, a module, nothing. */
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
  page: "Pages",
  series: "Series",
  command: "Do",
};

/** How many rows of each kind survive a query. A palette that lists
 * ninety tutorials is a file list with a text box on top — so the two
 * unbounded sets are capped. Commands are not: there are a dozen, this
 * is the only place they exist now that the workspace menu is gone, and
 * a reader who opens the palette with nothing typed is looking to find
 * out what there is. Capping those would hide the list from the one
 * gesture meant to reveal it. */
const LIMIT: Record<RowKind, number> = { tutorial: 8, page: 4, series: 6, command: Number.POSITIVE_INFINITY };

/** How much a match on a hidden keyword — a path, an id, a synonym — is
 * worth against a match on the words a reader can see. Enough to find a
 * row nothing visible would have found, not enough to outrank one whose
 * own title says it. */
const KEYWORD_WEIGHT = 0.7;

function ordinal(position: number): string {
  const names = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
  return names[position] ?? `${position + 1}th`;
}

/** Where a tutorial sits, said the way an author thinks of it: the
 * series it belongs to and how far in. A practice page says so instead,
 * since its position is its tutorial's. */
function noteFor(entry: FileIndexEntry, modules: readonly Module[]): string {
  if (entry.practiceFor) return "practice";
  if (entry.practiceAcross?.length) return "mixed practice";
  for (const module of modules) {
    for (const series of module.contents) {
      const at = series.tutorials.indexOf(entry.id ?? "");
      if (at !== -1) return `${series.title} · ${ordinal(at)}`;
    }
  }
  return entry.series ?? entry.module ?? "";
}

/** Inline markdown, read as the words it stands for. The preview is
 * prose a person skims, so `**bold**` should read as bold did, not as
 * four asterisks. Deliberately only the inline marks a tutorial's first
 * paragraph actually carries — a second markdown renderer here would be
 * the drift plan §2 warns about, for a pane nobody edits. */
function plainInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first real sentence, for the preview pane. Front matter and
 * headings are skipped, and so is a dewlab tutorial's own bold subtitle
 * line — it names the module, which the pane says on its own line
 * already, and it is never the sentence that tells a reader what the
 * page is about. */
export function openingOf(source: string): string {
  for (const block of parseDocument(source).blocks) {
    if (block.kind !== "prose") continue;
    const text = block.text.trim();
    if (!text || text.startsWith("#")) continue;
    if (/^(\*\*|__).+(\*\*|__)$/.test(text) && !text.includes("\n")) continue;
    return plainInline(text).slice(0, 320);
  }
  return "";
}

export function headingsOf(source: string): string[] {
  const headings: string[] = [];
  for (const block of parseDocument(source).blocks) {
    if (block.kind !== "prose") continue;
    for (const line of block.text.split("\n")) {
      const match = /^#{2,6}\s+(.+?)\s*$/.exec(line);
      if (match) headings.push(plainInline(match[1]!));
    }
  }
  return headings;
}

/**
 * The rows a query leaves, best first within each kind, kinds in their
 * own fixed order — plus which of them Enter should take.
 *
 * Those are two different questions and answering them with one number
 * was a real bug rather than a subtlety: sections are for the eye, which
 * wants a tutorial to be where a tutorial always is, and the highlight
 * is for the hand, which wants the thing you typed. Typing "appear"
 * with the two merged put the cursor on the first *tutorial* whose
 * letters happened to contain a-p-p-e-a-r — "One Parent, Many
 * Children" — and Enter opened it instead of the appearance settings.
 * So the list keeps its fixed section order and `best` is the index of
 * the highest-scoring row anywhere in it.
 *
 * Pure, and exported, because "the thing you meant is the thing Enter
 * takes" is the palette's whole value and deserves a test rather than a
 * look.
 */
export function rankRows(rows: readonly Row[], query: string): { rows: Row[]; best: number } {
  const scored: { row: Row; score: number }[] = [];
  for (const row of rows) {
    // A keyword is invisible, so a row matched only by one is a weaker
    // answer than a row matched by the words on screen — and without
    // the discount the hidden text wins outright, because a slug is a
    // subsequence goldmine: every hyphen in
    // `mit-pdp-maths-prog-integration` scores as a word start, so
    // "matri" pulled in every series of that module ahead of the
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

  const overlay = document.createElement("div");
  overlay.className = "dn-wp-overlay";
  overlay.hidden = true;

  const box = document.createElement("div");
  box.className = "dn-wp-box";
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
    const modules = host.getModules();
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
        note: page ? "site page" : noteFor(best, modules),
        keywords: [best.path, best.id ?? ""].filter(Boolean),
        entry: best,
        path: best.path,
        run: async () => { await host.openPath(best.path); },
      });
    }

    for (const module of modules) {
      for (const series of module.contents) {
        const first = series.tutorials[0];
        const target = first ? defaultEntryFor(index, first) : undefined;
        built.push({
          kind: "series",
          label: series.title,
          note: `${series.tutorials.length} tutorials · ${module.title}`,
          keywords: [module.title, module.id],
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
    if (rows.length === 0) empty.textContent = `Nothing here matches “${input.value}”.`;
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
      const module = host.getModules().find((item) => item.contents.some((series) => series.title === row.label));
      const series = module?.contents.find((item) => item.title === row.label);
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
    // own, and two overlays fighting over focus is the bug the old shell
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
    overlay.hidden = false;
    input.value = "";
    refresh();
    input.focus();
  }

  function close(): void {
    overlay.hidden = true;
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
    if (overlay.hidden) open();
    else close();
  }
  document.addEventListener("keydown", onKeydown);

  return {
    open,
    close,
    isOpen: () => !overlay.hidden,
    destroy() {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
    },
  };
}
