// Every reading setting, drawn from one list.
//
// `archive/src/settings-panel.ts` was 298 lines: each control built by
// hand, each with its own label, its own listener and its own way of
// reading its value back. They were all doing the same thing, because
// every setting is a CSS custom property and every control is a range, a
// choice or a switch. So the panel is a loop now, and adding a setting
// is one entry in `ROWS`.

import {
  DEFAULT_SETTINGS,
  applySettings,
  loadSettings,
  saveSettings,
  type Settings,
} from "./settings.ts";

type Row =
  | { key: keyof Settings; label: string; kind: "range"; min: number; max: number; step: number; unit?: string }
  | { key: keyof Settings; label: string; kind: "choice"; options: { value: string; label: string }[] }
  | { key: keyof Settings; label: string; kind: "switch" }
  | { key: keyof Settings; label: string; kind: "text"; placeholder: string };

const ROWS: Row[] = [
  { key: "theme", label: "Theme", kind: "choice", options: [
    { value: "system", label: "Match system" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ] },
  { key: "bodyFont", label: "Body font", kind: "choice", options: [
    { value: "serif", label: "Serif" },
    { value: "sans", label: "Sans" },
    { value: "mono", label: "Mono" },
  ] },
  { key: "textSize", label: "Text size", kind: "range", min: 14, max: 24, step: 1, unit: "px" },
  { key: "measure", label: "Line width", kind: "range", min: 24, max: 48, step: 1, unit: "rem" },
  { key: "lineHeight", label: "Line height", kind: "range", min: 1.2, max: 2.2, step: 0.02 },
  { key: "paragraphSpacing", label: "Paragraph spacing", kind: "choice", options: [
    { value: "tight", label: "Tight" },
    { value: "normal", label: "Normal" },
    { value: "loose", label: "Loose" },
  ] },
  { key: "margins", label: "Margins", kind: "choice", options: [
    { value: "comfortable", label: "Comfortable" },
    { value: "compact", label: "Compact" },
  ] },
  { key: "cellTint", label: "Tinted cells", kind: "switch" },
  { key: "codeFontSize", label: "Code size", kind: "range", min: 11, max: 20, step: 1, unit: "px" },
  { key: "codeFont", label: "Code font", kind: "choice", options: [
    { value: "mono", label: "System mono" },
    { value: "humanist", label: "Humanist" },
    { value: "slab", label: "Slab" },
  ] },
  { key: "pyodideBase", label: "Pyodide source", kind: "text", placeholder: "the default" },
];

export interface SettingsPanel {
  open(): void;
  close(): void;
  destroy(): void;
}

export function mountSettingsPanel(): SettingsPanel {
  let settings = loadSettings();
  applySettings(settings);

  const overlay = document.createElement("div");
  overlay.className = "dn-settings-overlay";
  overlay.hidden = true;

  const box = document.createElement("div");
  box.className = "dn-settings";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Appearance");
  overlay.appendChild(box);

  /** Applied and stored on every input, so a reader dragging a slider
   * sees the page move under them rather than after them. */
  function change<K extends keyof Settings>(key: K, value: Settings[K]): void {
    settings = { ...settings, [key]: value };
    applySettings(settings);
    saveSettings(settings);
  }

  function control(row: Row): HTMLElement {
    const line = document.createElement("label");
    line.className = "dn-settings-row";
    const name = document.createElement("span");
    name.textContent = row.label;
    line.appendChild(name);

    if (row.kind === "range") {
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(row.min);
      input.max = String(row.max);
      input.step = String(row.step);
      input.value = String(settings[row.key]);
      const readout = document.createElement("output");
      const show = () => { readout.textContent = `${input.value}${row.unit ?? ""}`; };
      show();
      input.addEventListener("input", () => {
        change(row.key, Number(input.value) as never);
        show();
      });
      line.append(input, readout);
    } else if (row.kind === "choice") {
      const select = document.createElement("select");
      for (const option of row.options) {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        element.selected = settings[row.key] === option.value;
        select.appendChild(element);
      }
      select.addEventListener("change", () => change(row.key, select.value as never));
      line.appendChild(select);
    } else if (row.kind === "switch") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(settings[row.key]);
      input.addEventListener("change", () => change(row.key, input.checked as never));
      line.appendChild(input);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = row.placeholder;
      input.value = String(settings[row.key] ?? "");
      input.addEventListener("change", () => change(row.key, input.value.trim() as never));
      line.appendChild(input);
    }
    return line;
  }

  function render(): void {
    box.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Appearance";
    box.appendChild(heading);
    for (const row of ROWS) box.appendChild(control(row));

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "dn-settings-reset";
    reset.textContent = "Reset to defaults";
    reset.addEventListener("click", () => {
      settings = { ...DEFAULT_SETTINGS };
      applySettings(settings);
      saveSettings(settings);
      render();
    });
    box.appendChild(reset);
  }

  function close(): void { overlay.hidden = true; }

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && !overlay.hidden) close();
  }
  window.addEventListener("keydown", onKeyDown);

  document.body.appendChild(overlay);

  return {
    open() {
      render();
      overlay.hidden = false;
      box.querySelector<HTMLElement>("select, input")?.focus();
    },
    close,
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      overlay.remove();
    },
  };
}
