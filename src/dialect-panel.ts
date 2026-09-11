// Step 6's third slice, wired into the UI — DIALECTS.md §5's conversion
// table (src/dialect-convert.ts) made reachable without a terminal.
// Mounted the same quiet, independent way settings-panel.ts and
// repo-panel.ts are; a real dialog rather than a hover reveal, since
// checking the report after a convert is the whole point of having one.
//
// Takes the same {getSource, loadDocument} host repo-panel.ts does, not
// the file bar directly: converting in place is exactly "load a new
// source into the current document," and the file bar's own dirty
// check (it polls getSource() already) notices the change on its own —
// nothing here needs to know the file bar exists at all.

import { convertDialect } from "./dialect-convert.ts";
import type { DialectName } from "./dialect.ts";

export interface DialectPanelHost {
  getSource(): string;
  loadDocument(source: string, name: string): void;
}

export interface DialectPanel {
  destroy(): void;
}

const DIALECTS: { value: DialectName; label: string }[] = [
  { value: "dewlab", label: "dewlab" },
  { value: "dewstack", label: "dewstack" },
  { value: "plain", label: "Plain markdown" },
];

function dialectSelect(initial: DialectName): HTMLSelectElement {
  const select = document.createElement("select");
  for (const { value, label } of DIALECTS) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === initial;
    select.appendChild(option);
  }
  return select;
}

/** Mounted once, independently of any particular document. */
export function mountDialectPanel(host: DialectPanelHost): DialectPanel {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "dn-dialect-toggle";
  toggle.setAttribute("aria-label", "Convert dialect");
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "⇄";

  const panel = document.createElement("div");
  panel.className = "dn-dialect-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", "Convert dialect");
  panel.hidden = true;
  toggle.setAttribute("aria-controls", (panel.id = "dn-dialect-panel"));

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });

  const header = document.createElement("div");
  header.className = "dn-dialect-header";
  const heading = document.createElement("h2");
  heading.textContent = "Convert dialect";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "dn-dialect-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  });
  header.append(heading, closeButton);
  panel.appendChild(header);

  const hint = document.createElement("p");
  hint.className = "dn-dialect-hint";
  hint.textContent = "Converts fences and front matter block by block, per DIALECTS.md §5 — not always lossless; anything that didn't map is listed below.";
  panel.appendChild(hint);

  const row = document.createElement("div");
  row.className = "dn-dialect-row";
  const fromSelect = dialectSelect("dewlab");
  const arrow = document.createElement("span");
  arrow.className = "dn-dialect-arrow";
  arrow.textContent = "→";
  const toSelect = dialectSelect("dewstack");
  row.append(fromSelect, arrow, toSelect);
  panel.appendChild(row);

  const convertButton = document.createElement("button");
  convertButton.type = "button";
  convertButton.className = "dn-dialect-convert";
  convertButton.textContent = "Convert";
  panel.appendChild(convertButton);

  const report = document.createElement("ul");
  report.className = "dn-dialect-report";
  panel.appendChild(report);

  convertButton.addEventListener("click", () => {
    const from = fromSelect.value as DialectName;
    const to = toSelect.value as DialectName;
    const { markdown, report: notes } = convertDialect(host.getSource(), from, to);
    host.loadDocument(markdown, "converted.md");
    report.replaceChildren();
    if (notes.length === 0) {
      const item = document.createElement("li");
      item.className = "dn-dialect-report-clean";
      item.textContent = "Converted — everything mapped.";
      report.appendChild(item);
    } else {
      for (const note of notes) {
        const item = document.createElement("li");
        item.textContent = note;
        report.appendChild(item);
      }
    }
  });

  document.body.append(toggle, panel);

  return {
    destroy() {
      toggle.remove();
      panel.remove();
    },
  };
}
