// Which top-level scalar fields each dialect's front-matter form shows,
// and in what order — decision 11, built as data rather than a code path
// per decision 3. Only a scalar field (string/number/boolean) gets a row
// here; a list or nested mapping (dewlab's `packages`, `covers`,
// `practice_for`, `practice_across` — see DIALECTS.md §1) has no row and
// stays reachable only through the form's raw-YAML fallback in app.ts.
//
// `module` and `series` carry `indexedAs`, naming which of file-index.ts's
// `distinctValues` fields a text field's row should offer as autocomplete
// suggestions — decision 11's own "module and series fields are a picker
// over it, not free text," now that the index (§5.10) exists. A plain
// HTML `<datalist>` is the picker: type anything (the "new" escape hatch
// decision 11 names, for free, since a datalist never restricts input to
// its own options) or pick a suggestion. `practice_for`/`practice_across`
// are lists, not scalars, so they stay out of this form entirely (see
// above) — decision 11's own mention of them belongs to the raw-YAML
// fallback, not a row here.

import type { DialectName } from "./dialect.ts";

export interface FrontMatterFieldSpec {
  key: string;
  label: string;
  required: boolean;
  kind: "text" | "select";
  options?: { value: string; label: string }[];
  /** Which file-index.ts field this text field's own datalist suggestions
   * should be drawn from (app.ts's buildFrontMatterRow). Undefined for a
   * field with no meaningful cross-file index — title and slug are each
   * unique per document, so suggesting one from elsewhere would suggest
   * the wrong document's own value. */
  indexedAs?: "module" | "series";
}

const DEWLAB_FIELDS: FrontMatterFieldSpec[] = [
  { key: "title", label: "Title", required: true, kind: "text" },
  { key: "slug", label: "Slug", required: true, kind: "text" },
  { key: "module", label: "Module", required: true, kind: "text", indexedAs: "module" },
  { key: "module_title", label: "Module title", required: true, kind: "text" },
  { key: "year", label: "Year", required: true, kind: "text" },
  { key: "series", label: "Series", required: true, kind: "text", indexedAs: "series" },
  { key: "version", label: "Version", required: true, kind: "text" },
  {
    key: "status",
    label: "Status",
    required: false,
    kind: "select",
    options: [
      { value: "live", label: "Live" },
      { value: "archived", label: "Archived" },
    ],
  },
];

const DEWSTACK_FIELDS: FrontMatterFieldSpec[] = [
  { key: "title", label: "Title", required: true, kind: "text" },
  { key: "slug", label: "Slug", required: true, kind: "text" },
  { key: "module", label: "Module", required: true, kind: "text", indexedAs: "module" },
  { key: "module_title", label: "Module title", required: true, kind: "text" },
  { key: "series", label: "Series", required: true, kind: "text", indexedAs: "series" },
  { key: "version", label: "Version", required: true, kind: "text" },
  {
    key: "status",
    label: "Status",
    required: false,
    kind: "select",
    options: [
      { value: "live", label: "Live" },
      { value: "draft", label: "Draft" },
    ],
  },
];

const FIELD_LISTS: Record<DialectName, FrontMatterFieldSpec[]> = {
  dewlab: DEWLAB_FIELDS,
  dewstack: DEWSTACK_FIELDS,
  // Plain markdown's front matter is arbitrary keys, not a fixed shape
  // (DIALECTS.md §3) — there is no dialect-specific list to build a form
  // from, so a plain document has no form at all, only the raw editor.
  plain: [],
};

/** The fixed rows a dialect's form offers: required fields always shown,
 * optional ones only when the caller finds them already present with a
 * scalar value. An empty list (plain markdown) is the caller's own signal
 * to skip the form and fall back to the raw-YAML editor. */
export function frontMatterFieldsFor(dialect: DialectName): FrontMatterFieldSpec[] {
  return FIELD_LISTS[dialect];
}

/** True if `fields[key]` is a plain scalar the form can show and edit
 * directly — a string, number or boolean, never a list or mapping. */
export function isScalarField(fields: Record<string, unknown>, key: string): boolean {
  const value = fields[key];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
