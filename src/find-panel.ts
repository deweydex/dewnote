// Find and replace across every document, in one panel.
//
// Results follow the typing. Each one names its file and line and opens
// the file; Replace all replaces every match the list shows, in one go.
// What is searched and what a replacement writes is the shell's
// business (find.ts, and the store); this is the panel.

import type { FindHit, FindOptions } from "./find.ts";

export interface FindHost {
  search(query: string, options: FindOptions): FindHit[];
  open(path: string): void;
  /** Resolves with how many were replaced, or null when nothing was
   * (the author kept editing, or the store refused). */
  replace(query: string, replacement: string, options: FindOptions): Promise<number | null>;
}

export interface FindPanel {
  open(): void;
  destroy(): void;
}

/** More than a reader scrolls through, and few enough to draw at once. */
const SHOWN = 200;

/** The line around a match, cut down to something that fits a row. */
function snippet(hit: FindHit): { before: string; match: string; after: string } {
  const start = Math.max(0, hit.column - 40);
  const end = Math.min(hit.text.length, hit.column + hit.length + 60);
  return {
    before: (start > 0 ? "…" : "") + hit.text.slice(start, hit.column).trimStart(),
    match: hit.text.slice(hit.column, hit.column + hit.length),
    after: hit.text.slice(hit.column + hit.length, end) + (end < hit.text.length ? "…" : ""),
  };
}

export function mountFindPanel(host: FindHost): FindPanel {
  const overlay = document.createElement("dialog");
  overlay.className = "dn-overlay dn-find-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.close();
  });
  document.body.appendChild(overlay);

  const box = document.createElement("div");
  box.className = "dn-panel dn-find";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Find in every document");

  const heading = document.createElement("h2");
  heading.textContent = "Find in every document";

  function field(label: string): { wrap: HTMLLabelElement; input: HTMLInputElement } {
    const wrap = document.createElement("label");
    wrap.className = "dn-ask-field";
    const name = document.createElement("span");
    name.textContent = label;
    const input = document.createElement("input");
    input.type = "text";
    input.spellcheck = false;
    wrap.append(name, input);
    return { wrap, input };
  }
  const find = field("Find");
  find.input.classList.add("dn-find-query");
  const replace = field("Replace with (optional)");
  replace.input.classList.add("dn-find-replacement");

  const caseLabel = document.createElement("label");
  caseLabel.className = "dn-find-case";
  const matchCase = document.createElement("input");
  matchCase.type = "checkbox";
  caseLabel.append(matchCase, " Match case");

  const actions = document.createElement("div");
  actions.className = "dn-ask-actions";
  const replaceAll = document.createElement("button");
  replaceAll.type = "button";
  replaceAll.className = "dn-ask-go dn-find-replace";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => overlay.close());
  actions.append(replaceAll, close);

  const summary = document.createElement("p");
  summary.className = "dn-find-summary";
  summary.setAttribute("aria-live", "polite");
  const results = document.createElement("div");
  results.className = "dn-find-results";

  box.append(heading, find.wrap, replace.wrap, caseLabel, actions, summary, results);
  overlay.appendChild(box);

  let hits: FindHit[] = [];
  /** What the last Replace all did, until the search changes. */
  let replaced = "";
  const options = (): FindOptions => ({ matchCase: matchCase.checked });

  function render(): void {
    const query = find.input.value;
    hits = query ? host.search(query, options()) : [];
    const documents = new Set(hits.map((hit) => hit.path)).size;
    summary.textContent = replaced + (!query
      ? "Every document in the workspace, front matter included. Course files are not searched."
      : hits.length === 0
        ? "No matches."
        : `${hits.length} match${hits.length === 1 ? "" : "es"} in ${documents} document${documents === 1 ? "" : "s"}` +
          (hits.length > SHOWN ? `. The first ${SHOWN} are listed.` : "."));

    // Replace is offered only once there is something to replace and
    // something typed to replace it with; an empty field means "find".
    const replacing = replace.input.value !== "";
    replaceAll.hidden = !replacing;
    replaceAll.disabled = hits.length === 0;
    replaceAll.textContent = hits.length === 0 ? "Replace all" : `Replace all ${hits.length}`;

    results.replaceChildren(
      ...hits.slice(0, SHOWN).map((hit) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "dn-report-row dn-find-row";
        const what = document.createElement("span");
        what.className = "dn-find-snippet";
        const { before, match, after } = snippet(hit);
        const mark = document.createElement("mark");
        mark.textContent = match;
        what.append(before, mark, after);
        const where = document.createElement("span");
        where.className = "dn-report-where";
        where.textContent = `${hit.path} · line ${hit.line}`;
        row.append(what, where);
        row.addEventListener("click", () => {
          overlay.close();
          host.open(hit.path);
        });
        return row;
      }),
    );
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    replaced = "";
    clearTimeout(timer);
    timer = setTimeout(render, 120);
  };
  find.input.addEventListener("input", soon);
  const now = () => {
    replaced = "";
    render();
  };
  replace.input.addEventListener("input", now);
  matchCase.addEventListener("change", now);
  find.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      clearTimeout(timer);
      render();
      results.querySelector<HTMLElement>("button")?.focus();
    }
  });

  replaceAll.addEventListener("click", async () => {
    if (hits.length === 0) return;
    replaceAll.disabled = true;
    const done = await host.replace(find.input.value, replace.input.value, options());
    replaced = done === null ? "" : `Replaced ${done}. `;
    render();
  });

  return {
    open() {
      if (!overlay.open) overlay.showModal();
      render();
      find.input.focus();
      find.input.select();
    },
    destroy() {
      clearTimeout(timer);
      overlay.remove();
    },
  };
}
