// Parses a dewlab-style exec cell's body — the `id:`, `hint:`, `expect:`
// and `name:` header lines DIALECTS.md documents (`HEADER_RE`, matching
// dewlab's own `d2a21ed`), followed by the code itself — out of a fence
// block's raw text. blocks.ts deliberately never does this itself: it
// only needs a fence's own info string to split the document correctly,
// and the header lines are a rendering/running concern, not a
// document-model one.
//
// `expect:` and `name:` are read and preserved verbatim but not acted on
// — dewnote has no reader-side trigger logic to evaluate `expect:`
// against (that's a staged hint's business, plan §8 item 2) and `name:`
// is reserved on dewlab's own side for a feature dewnote doesn't need to
// know about yet. What matters here is only that *not* recognising them
// used to mean their line fell through into `code` — a real bug, not a
// missing feature: `expect: len(readings) == 4` is not valid Python, and
// dewnote would hand it straight to Pyodide on Run.

import type { Block } from "./blocks.ts";

export interface CellSource {
  id: string | null;
  hint: string | null;
  expect: string | null;
  name: string | null;
  code: string;
}

const HEADER_RE = /^\s*(id|hint|expect|name)\s*:\s*(.*)$/;

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
  let expect: string | null = null;
  let name: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const match = HEADER_RE.exec(lines[i]!);
    if (!match) break;
    const key = match[1]!;
    const value = match[2]!;
    // `name:`, uniquely among these four keys, collides with real code: a
    // type-annotated first line of a cell's own body — `name: str = "Ada"`
    // — is indistinguishable from the header by shape alone. dewlab's own
    // fix (`ca6e16e`, 2026-09-07) is the same rule ported verbatim: `=`
    // never appears in a genuine name (a short label), so its presence
    // means this was never the header. `expect:` keeps matching even with
    // `=` in it, since a real expectation legitimately uses one
    // (`expect: total == 6`).
    if (key === "name" && value.includes("=")) break;
    if (key === "id") id = value.trim();
    else if (key === "hint") hint = value.trim();
    else if (key === "expect") expect = value.trim();
    else name = value.trim();
    i++;
  }
  return { id, hint, expect, name, code: lines.slice(i).join("\n") };
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

/** Which of dewlab's two exec-cell languages a runnable fence is
 * (DIALECTS.md §1, `d2a21ed`) — mirrors dewlab's own `CELL_TYPES`
 * check in `parse_cell()`: the fence's first word decides, and
 * anything other than literally `sql` is Python, `exec` itself
 * included (a bare ` ```exec ` fence, dewlab's own shorthand for
 * `python exec`). Only meaningful for a fence `isRunnableFence`
 * already said yes to. */
export function execCellLanguage(info: string): "python" | "sql" {
  return info.trim().split(/\s+/)[0] === "sql" ? "sql" : "python";
}

/** The Python dewnote actually runs for a `sql exec` cell — the fence's
 * raw SQL text, wrapped into a call against the one shared, page-wide
 * `db` connection (DIALECTS.md §1), mirroring dewlab's own
 * `wrapSqlCode()`. A bare expression, not assigned to anything: unlike
 * dewlab's own `_run_sql_cell` (which renders itself and returns a value
 * that must then be discarded to avoid a second render), dewnote's
 * `dewnote_sql_tools.run_sql_cell` only *returns* a DataFrame or `None`,
 * so leaving this as the cell's own trailing expression is what lets
 * `dewnote_tools.py`'s existing `_render_value` render it — the same
 * path any other cell's trailing DataFrame already takes, not a second
 * rendering mechanism. */
export function wrapSqlExecCode(script: string): string {
  return `import dewnote_sql_tools as _dn_sql\n_dn_sql.run_sql_cell(db, ${JSON.stringify(script)})`;
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

/** dewlab's own staged-hint fence (DIALECTS.md §1, `d2a21ed`) — a
 * `for:`/`after:`/`title:` header, the same shape dewlab's own
 * `parse_hint()` reads, followed by the hint's own markdown body. */
export interface HintFenceInfo {
  /** The exec cell this hint belongs to, from an explicit `for:` line.
   * No default: dewlab's own build falls back to "the exec cell
   * immediately above this fence in the source," but that's a
   * document-wide notion dewnote's own per-fence parsing has no access
   * to here — a real, narrower gap than dewlab's own, left null rather
   * than guessed at (see cell.ts's own `parseHintFence` for where a
   * caller with the surrounding document could still work it out). */
  for: string | null;
  after: string;
  title: string;
  body: string;
}

const HINT_HEADER_RE = /^\s*(for|after|title)\s*:\s*(.*)$/;
export const DEFAULT_HINT_AFTER = "errors:5";
export const DEFAULT_HINT_TITLE = "Let’s slow down a moment…";

/** Whether a fence is a staged-hint fence — its first info word is
 * literally "hint", the same test dewlab's own `extract_blocks()` runs
 * (`info and info[0] == "hint"`). */
export function isHintFence(info: string): boolean {
  return info.trim().split(/\s+/)[0] === "hint";
}

/** Reads a staged-hint fence's own header lines and body, defaults
 * (`errors:5`, dewlab's own default title) included, so a caller with no
 * header lines at all still gets something meaningful to show. */
export function parseHintFence(block: Block): HintFenceInfo {
  const lines = fenceBody(block.text).split("\n");
  const header: Record<string, string> = {};
  let i = 0;
  while (i < lines.length) {
    const match = HINT_HEADER_RE.exec(lines[i]!);
    if (!match || match[1]! in header) break;
    header[match[1]!] = match[2]!.trim();
    i++;
  }
  return {
    for: header["for"] ?? null,
    after: header["after"] || DEFAULT_HINT_AFTER,
    title: header["title"] || DEFAULT_HINT_TITLE,
    body: lines.slice(i).join("\n").trim(),
  };
}
