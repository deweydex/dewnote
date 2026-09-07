// The reading/editing texture settings, and the running-Python settings
// beside them — decision 7's "every one of those values is a user
// setting" (family, size, measure, cell tint, theme), plus a couple of
// dewnote-specific additions (a separate code font size, and where
// Pyodide loads from). Modelled directly on dewstack's own
// assets/settings.js: one small object in localStorage, applied to
// <html> as CSS custom properties before first paint, a default value
// removing its attribute/property rather than setting it so the
// stylesheet's own default stays authoritative.
//
// Deliberately not built here: named aesthetic presets ("manuscript",
// "chalkboard") — planning/mockups/dewnote-sketch.html sketches three,
// but that sketch is exploratory, not a ratified decision the way
// decision 7 is, and choosing new palettes is real art direction, not
// engineering. Theme (light/dark/system) is the one preset dewlab's own
// tokens already fully define (`theme/dewlab-tokens.css`'s own
// `[data-theme="dark"]` block) and is built below; anything beyond that
// is left for a deliberate follow-up, not invented here.

export type Theme = "system" | "light" | "dark";
export type BodyFont = "serif" | "sans" | "mono";
export type Margins = "comfortable" | "compact";

export interface Settings {
  theme: Theme;
  bodyFont: BodyFont;
  /** px, matching --dl-font-size's own unit. */
  textSize: number;
  /** rem, matching --dl-line-width's own unit. */
  measure: number;
  margins: Margins;
  cellTint: boolean;
  /** px — the code editor's own font size, independent of textSize, since
   * a comfortable prose size and a comfortable code size are rarely the
   * same number for the same reader. */
  codeFontSize: number;
  /** Empty string means the built-in default (jsDelivr) — see
   * pyodide-engine.ts's own PYODIDE_BASE. A real gap this doesn't cover
   * yet: nothing currently reads this setting, since pyodide-engine.ts's
   * base URL is a module-level constant, not parameterised — see
   * DECISIONS.md. */
  pyodideBase: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  bodyFont: "serif",
  textSize: 18,
  measure: 34,
  margins: "comfortable",
  cellTint: true,
  codeFontSize: 15,
  pyodideBase: "",
};

const TEXT_SIZE_RANGE = { min: 14, max: 24 };
const MEASURE_RANGE = { min: 24, max: 48 };
const CODE_FONT_SIZE_RANGE = { min: 11, max: 20 };

const STORAGE_KEY = "dewnote:settings";

function clamp(value: number, range: { min: number; max: number }): number {
  return Math.min(range.max, Math.max(range.min, value));
}

/** The actual validation/fallback logic, kept free of `localStorage`
 * itself so it can be unit-tested directly against a plain value —
 * bun:test has no DOM or storage globals, matching every other
 * DOM-touching module in this codebase (app.ts included), which are
 * verified through Playwright instead, never a jsdom shim. Falls back to
 * `DEFAULT_SETTINGS` field by field — a value from an older version of
 * this settings shape, or hand-edited storage, degrades one field at a
 * time rather than discarding everything else that's still good. */
export function parseSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };
  const value = raw as Partial<Record<keyof Settings, unknown>>;

  const theme: Theme = value.theme === "light" || value.theme === "dark" ? value.theme : "system";
  const bodyFont: BodyFont = value.bodyFont === "sans" || value.bodyFont === "mono" ? value.bodyFont : "serif";
  const margins: Margins = value.margins === "compact" ? "compact" : "comfortable";
  const cellTint = typeof value.cellTint === "boolean" ? value.cellTint : DEFAULT_SETTINGS.cellTint;
  const pyodideBase = typeof value.pyodideBase === "string" ? value.pyodideBase : "";

  const textSize =
    typeof value.textSize === "number" && Number.isFinite(value.textSize)
      ? clamp(value.textSize, TEXT_SIZE_RANGE)
      : DEFAULT_SETTINGS.textSize;
  const measure =
    typeof value.measure === "number" && Number.isFinite(value.measure)
      ? clamp(value.measure, MEASURE_RANGE)
      : DEFAULT_SETTINGS.measure;
  const codeFontSize =
    typeof value.codeFontSize === "number" && Number.isFinite(value.codeFontSize)
      ? clamp(value.codeFontSize, CODE_FONT_SIZE_RANGE)
      : DEFAULT_SETTINGS.codeFontSize;

  return { theme, bodyFont, textSize, measure, margins, cellTint, codeFontSize, pyodideBase };
}

/** Never throws: private browsing or blocked storage just means this
 * visit starts from the defaults, the same as dewstack's own
 * loadTexture. */
export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return { ...DEFAULT_SETTINGS };
    return parseSettings(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing or blocked storage: this visit's choice applies
    // to this page view only, same as dewstack's own saveTexture.
  }
}

const BODY_FONT_STACKS: Record<BodyFont, string> = {
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  sans: '"Iowan Old Style", -apple-system, "Segoe UI", sans-serif',
  mono: '"SF Mono", "Cascadia Mono", Menlo, Consolas, monospace',
};

const MARGIN_PADDING: Record<Margins, string> = {
  comfortable: "3rem 1.25rem 8rem",
  compact: "1.25rem 1rem 4rem",
};

/** `null` means "this property/attribute should be removed, not set to
 * anything" — the default-removes-the-attribute rule stated above,
 * computed here as plain data so it can be unit-tested without a DOM
 * (`applySettings`, below, is the only thing that actually touches
 * `document`). `theme` maps to `data-theme`, everything else to a CSS
 * custom property on `<html>`. */
export function settingsToRootProperties(settings: Settings): Record<string, string | null> {
  return {
    "data-theme": settings.theme === "system" ? null : settings.theme,
    "--dl-font-family": mapDefault(BODY_FONT_STACKS[settings.bodyFont], BODY_FONT_STACKS.serif),
    "--dl-font-size": mapDefault(`${settings.textSize}px`, `${DEFAULT_SETTINGS.textSize}px`),
    "--dl-line-width": mapDefault(`${settings.measure}rem`, `${DEFAULT_SETTINGS.measure}rem`),
    "--dn-page-padding": mapDefault(MARGIN_PADDING[settings.margins], MARGIN_PADDING.comfortable),
    "--dn-cell-tint": mapDefault(settings.cellTint ? "1" : "0", "1"),
    "--dn-code-font-size": mapDefault(`${settings.codeFontSize}px`, `${DEFAULT_SETTINGS.codeFontSize}px`),
  };
}

function mapDefault(value: string, defaultValue: string): string | null {
  return value === defaultValue ? null : value;
}

/** Writes every setting to `<html>`, called before the document mounts
 * so there is never a flash of default texture before the reader's own
 * choice applies (dewstack's own "FAQ's way", decision 7). */
export function applySettings(settings: Settings): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(settingsToRootProperties(settings))) {
    if (key === "data-theme") {
      if (value === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", value);
    } else if (value === null) {
      root.style.removeProperty(key);
    } else {
      root.style.setProperty(key, value);
    }
  }
}
