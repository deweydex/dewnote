// Parses a dewlab-style exec cell's body — the `id:` and optional `hint:`
// header lines DIALECTS.md documents (`HEADER_RE`,
// `^\s*(id|hint)\s*:\s*(.*)$`), followed by the code itself — out of a
// fence block's raw text. blocks.ts deliberately never does this itself:
// it only needs a fence's own info string to split the document
// correctly, and the header lines are a rendering/running concern, not
// a document-model one.

import type { Block } from "./blocks.ts";

export interface CellSource {
  id: string | null;
  hint: string | null;
  code: string;
}

const HEADER_RE = /^\s*(id|hint)\s*:\s*(.*)$/;

/** Everything between the opening ```lang info line and the closing ```
 * line, exactly as blocks.ts sees it — a fence block's own text always
 * starts and ends with fence lines (blocks.ts's own invariant), so this
 * holds for every fence block it ever produces. */
function fenceBody(fenceText: string): string {
  const lines = fenceText.split("\n");
  let end = lines.length - 1;
  while (end > 0 && lines[end] === "") end--;
  return lines.slice(1, end).join("\n");
}

function parseHeaderAndCode(body: string): CellSource {
  const lines = body.split("\n");
  let id: string | null = null;
  let hint: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const match = HEADER_RE.exec(lines[i]!);
    if (!match) break;
    if (match[1] === "id") id = match[2]!.trim();
    else hint = match[2]!.trim();
    i++;
  }
  return { id, hint, code: lines.slice(i).join("\n") };
}

export function parseCellSource(block: Block): CellSource {
  return parseHeaderAndCode(fenceBody(block.text));
}

/** Same parse, run directly against a fence's live text — what a Run
 * click needs, since the code just typed into a still-focused fence
 * editor isn't in `block.text` until that editor next blurs and commits
 * (see app.ts's header comment). */
export function parseCellSourceFromFenceText(fenceText: string): CellSource {
  return parseHeaderAndCode(fenceBody(fenceText));
}

/** Whether a fence's info string marks it runnable — dewlab's own and
 * only convention (DIALECTS.md §1): the word "exec" anywhere in the
 * info string, alongside the language. A fence without it is
 * illustrative, read-only code, never executed. */
export function isRunnableFence(info: string): boolean {
  return info.split(/\s+/).includes("exec");
}

export interface SqlCellInfo {
  /** The database this cell's script runs against — dewstack's own
   * sharing key (DIALECTS.md §2): every `sql cell=name` fence on the
   * page with the same name runs against the same in-memory SQLite
   * connection, in the order they're run, not the order they appear. */
  name: string;
  /** Whether this fence asked to have its script remembered across
   * visits (`cell=name persist`). See `sqlPersistStorageKey` for what
   * this actually does in dewnote, which is not what it does in
   * dewstack — DECISIONS.md has the reasoning. */
  persist: boolean;
}

const SQL_CELL_RE = /^sql\s+cell=([a-z0-9-]+)(\s+persist)?\s*$/;

/** Parses a dewstack SQL cell's info string (` ```sql cell=name `, or
 * ` ```sql cell=name persist `). Unlike a dewlab exec cell, there are no
 * header lines — the info string carries everything, and the fence body
 * is the SQL script itself, verbatim. `null` for anything else, fence
 * body included: a fence not shaped like this is not a SQL cell,
 * whatever language its info string names. */
export function parseSqlCellInfo(info: string): SqlCellInfo | null {
  const match = SQL_CELL_RE.exec(info.trim());
  return match ? { name: match[1]!, persist: !!match[2] } : null;
}

/** The localStorage key a persisted SQL cell's saved script lives under.
 * Keyed by name alone, matching dewstack's own convention — dewnote has
 * no per-document identity yet to fold in, a real (if narrow) gap: two
 * differently-named documents each using `cell=totals persist` would
 * offer each other's saved script for restore. Harmless rather than
 * destructive, though, because of *how* it's offered — see
 * `parseSqlCellInfo`'s own doc comment and DECISIONS.md for why restore
 * is a reader's own explicit choice here, never automatic. */
export function sqlPersistStorageKey(name: string): string {
  return `dewnote-sql:${name}`;
}

/** A SQL cell's whole fence body, verbatim — there are no header lines
 * to peel off the way an exec cell has, so this is the same extraction
 * `parseCellSourceFromFenceText` does internally, exported under its own
 * name for a SQL cell's Run to call directly against the fence's live
 * text. */
export function sqlScriptFromFenceText(fenceText: string): string {
  return fenceBody(fenceText);
}

/** dewlab's `packages:` front-matter field (DIALECTS.md §1) — a document
 * declaring a package `loadPackagesFromImports` can't infer from a cell's
 * own `import` lines (a different import name than the package's own, or
 * a package a cell needs without importing it by name). Anything not a
 * list of strings is treated as absent rather than thrown on — front
 * matter is arbitrary YAML a person typed, not a schema this editor
 * enforces. */
export function declaredPackages(fields: Record<string, unknown>): string[] {
  const value = fields["packages"];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
