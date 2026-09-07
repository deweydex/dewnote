# The Python half of a dewstack-style SQL cell (` ```sql cell=name `,
# DIALECTS.md §2) — a trimmed adaptation of dewstack's sql_tools.py. Kept:
# one in-memory sqlite3 connection per cell name, shared by every cell on
# the page using that name, and run_sql's own contract — a script (not one
# statement), comments stripped, run as a script, the last statement's
# result rendered as an HTML table if it has one, an affected-row count
# otherwise. Dropped: get_connection (dewnote has no py-cell/read_sql
# bridge yet — a real gap, not an oversight, see DECISIONS.md) and the
# five sql-check functions (sql-check is dewstack's own quiz-grading
# convention, hardcoded to one tutorial there; dewnote has no equivalent
# concept yet).
#
# Written directly against what the worker (src/runtime/worker-source.ts)
# needs: run_sql(db_name, script) -> str, a complete HTML fragment, the
# same "Python returns HTML, JS assigns it" wire format dewstack itself
# uses — no message envelope to design.

import html
import sqlite3
from typing import Any

_connections: dict[str, sqlite3.Connection] = {}


def _connection(db_name: str) -> sqlite3.Connection:
    if db_name not in _connections:
        _connections[db_name] = sqlite3.connect(":memory:")
    return _connections[db_name]


def reset(db_name: str) -> None:
    """Used by a cell's own Reset control — closes and discards the
    connection, so a CREATE TABLE can be run again from scratch."""
    conn = _connections.pop(db_name, None)
    if conn is not None:
        conn.close()


def _strip_comments(script: str) -> str:
    lines = []
    for line in script.splitlines():
        index = line.find("--")
        lines.append(line if index == -1 else line[:index])
    return "\n".join(lines)


def _table_html(columns: list[str], rows: list[tuple[Any, ...]], max_rows: int = 50) -> str:
    shown = rows[:max_rows]
    head = "".join(f"<th>{html.escape(str(c))}</th>" for c in columns)
    body = "".join(
        "<tr>" + "".join(f"<td>{'' if v is None else html.escape(str(v))}</td>" for v in row) + "</tr>"
        for row in shown
    )
    note = '<p class="dn-sql-note">Showing the first 50 rows.</p>' if len(rows) > max_rows else ""
    return f'<div class="dn-sql-result"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>{note}'


def run_sql(db_name: str, script: str) -> str:
    """Runs `script` as a sequence of `;`-separated statements against
    `db_name`'s own connection (created on first use), all but the last
    for effect, the last one's result rendered: a table if it has rows to
    show, an affected-row count otherwise. A naive split on `;` — a
    semicolon inside a string literal would break it, a limitation
    inherited from dewstack's own run_sql rather than fixed here."""
    conn = _connection(db_name)
    statements = [s.strip() for s in _strip_comments(script).split(";")]
    statements = [s for s in statements if s]
    if not statements:
        return '<p class="dn-sql-note">Nothing to run.</p>'
    try:
        cursor = None
        for statement in statements:
            cursor = conn.execute(statement)
        conn.commit()
        assert cursor is not None
        if cursor.description:
            columns = [d[0] for d in cursor.description]
            return _table_html(columns, cursor.fetchall())
        return f'<p class="dn-sql-note">{cursor.rowcount if cursor.rowcount >= 0 else 0} row(s) affected.</p>'
    except sqlite3.Error as exc:
        return f'<pre class="dn-error">{html.escape(str(exc))}</pre>'
