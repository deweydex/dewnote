// A runnable cell: what its body says.
//
// dewlab's convention (DIALECTS.md §1) — a fence is runnable when `exec`
// appears in its info string, and its body opens with `id:`, `hint:`,
// `expect:` and `name:` lines before the code.
//
// There is no form for the header. A header line is a line you type.

/** The word "exec" anywhere in the info string, alongside the language.
 * A fence without it is illustrative code, never executed. */
export function isRunnable(language: string, meta: string): boolean {
  return `${language} ${meta}`.split(/\s+/).includes("exec");
}

/** Which of dewlab's two exec languages this is — its own `CELL_TYPES`
 * check in `parse_cell()`. The first word decides, and anything other
 * than literally `sql` is Python, a bare ```` ```exec ```` fence
 * included. Only meaningful where `isRunnable` said yes. */
export function cellLanguage(language: string): "python" | "sql" {
  return language.trim().toLowerCase() === "sql" ? "sql" : "python";
}

export interface CellSource {
  id: string | null;
  hint: string | null;
  expect: string | null;
  name: string | null;
  code: string;
}

const HEADER_RE = /^\s*(id|hint|expect|name)\s*:\s*(.*)$/;

/** Where the header ends and the code starts.
 *
 * `name:` is the one key that collides with real code: a type-annotated
 * first line, `name: str = "Ada"`, has the same shape as the header.
 * dewlab settles this the same way: `=` never appears in a real name,
 * which is a short label, so its presence means this was never the
 * header. `expect:` keeps
 * matching with `=` in it, since a real expectation uses one
 * (`expect: total == 6`). */
function headerLineCount(lines: string[]): number {
  let at = 0;
  while (at < lines.length) {
    const match = HEADER_RE.exec(lines[at]!);
    if (!match) break;
    if (match[1] === "name" && match[2]!.includes("=")) break;
    at += 1;
  }
  return at;
}

/** Reads a code block's body — the text Milkdown holds, with no fence
 * lines around it. */
export function parseCell(body: string): CellSource {
  const lines = body.split("\n");
  const headerCount = headerLineCount(lines);
  const cell: CellSource = { id: null, hint: null, expect: null, name: null, code: "" };
  for (let at = 0; at < headerCount; at += 1) {
    const match = HEADER_RE.exec(lines[at]!)!;
    const value = match[2]!.trim();
    if (match[1] === "id") cell.id = value;
    else if (match[1] === "hint") cell.hint = value;
    else if (match[1] === "expect") cell.expect = value;
    else cell.name = value;
  }
  cell.code = lines.slice(headerCount).join("\n");
  return cell;
}

/** The Python a `sql exec` cell actually runs: the fence's raw SQL,
 * wrapped into a call against the one shared, page-wide `db` connection,
 * mirroring dewlab's own `wrapSqlCode()`. Left as the cell's trailing
 * expression so the existing `_render_value` path renders it, rather
 * than adding a second rendering mechanism. */
export function wrapSqlCode(script: string): string {
  return `import dewnote_sql_tools as _dn_sql\n_dn_sql.run_sql_cell(db, ${JSON.stringify(script)})`;
}

/** What a run produced, ready for the preview panel. */
export interface CellOutput {
  ok: boolean;
  /** Already-rendered HTML from the Python side: a table, a traceback, a
   * repr. Streams are appended to it as they arrive. */
  markup: string;
}
