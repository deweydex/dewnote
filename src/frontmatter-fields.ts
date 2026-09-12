// Which top-level scalar fields each dialect's front-matter form shows,
// and in what order — decision 11, built as data rather than a code path
// per decision 3. Only a scalar field (string/number/boolean) gets a row
// here; a list or nested mapping (dewlab's `packages`, `covers`,
// `practice_for`, `practice_across` — see DIALECTS.md §1) has no row and
// stays reachable only through the form's raw-YAML fallback in app.ts.
//
// `module` and `series` are still plain text inputs here, not the
// autocomplete-over-a-real-index picker decision 11 eventually wants —
// that needs step 4's file index to exist first (see PLAN.md). This is
// the scoped-down slice of decision 11 that's buildable without it.

import type { DialectName } from "./dialect.ts";

export interface FrontMatterFieldSpec {
  key: string;
  label: string;
  required: boolean;
  kind: "text" | "select";
  options?: { value: string; label: string }[];
}

const DEWLAB_FIELDS: FrontMatterFieldSpec[] = [
  { key: "title", label: "Title", required: true, kind: "text" },
  { key: "slug", label: "Slug", required: true, kind: "text" },
  { key: "module", label: "Module", required: true, kind: "text" },
  { key: "module_title", label: "Module title", required: true, kind: "text" },
  { key: "year", label: "Year", required: true, kind: "text" },
  { key: "series", label: "Series", required: true, kind: "text" },
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
  { key: "module", label: "Module", required: true, kind: "text" },
  { key: "module_title", label: "Module title", required: true, kind: "text" },
  { key: "series", label: "Series", required: true, kind: "text" },
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
