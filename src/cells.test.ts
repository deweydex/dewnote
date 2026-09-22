// Reading a runnable cell's body. The `name:` rule is the one that has
// actually bitten, and it is dewlab's own.

import { describe, expect, test } from "bun:test";
import { cellLanguage, isRunnable, parseCell, wrapSqlCode } from "./cells.ts";

describe("isRunnable", () => {
  test("takes `exec` from the info string, not the language", () => {
    expect(isRunnable("python", "exec")).toBe(true);
    expect(isRunnable("sql", "exec")).toBe(true);
  });

  test("a fence without it is illustrative code", () => {
    expect(isRunnable("python", "")).toBe(false);
    expect(isRunnable("html", "site")).toBe(false);
  });

  test("dewlab's bare `exec` shorthand counts", () => {
    expect(isRunnable("exec", "")).toBe(true);
  });
});

describe("cellLanguage", () => {
  test("anything that is not literally sql is Python, `exec` included", () => {
    expect(cellLanguage("sql")).toBe("sql");
    expect(cellLanguage("python")).toBe("python");
    expect(cellLanguage("exec")).toBe("python");
  });
});

describe("parseCell", () => {
  test("reads the header lines and leaves the code alone", () => {
    const cell = parseCell("id: first\nhint: errors:2\nexpect: total == 6\nx = 1\nprint(x)");
    expect(cell.id).toBe("first");
    expect(cell.hint).toBe("errors:2");
    expect(cell.expect).toBe("total == 6");
    expect(cell.code).toBe("x = 1\nprint(x)");
  });

  test("a cell with no header at all is all code", () => {
    expect(parseCell("print(1)").code).toBe("print(1)");
    expect(parseCell("print(1)").id).toBeNull();
  });

  test("a type-annotated first line is code, not a `name:` header", () => {
    // dewlab's own ca6e16e: `=` never appears in a real name, so its
    // presence means this was never the header.
    const cell = parseCell('name: str = "Ada"\nprint(name)');
    expect(cell.name).toBeNull();
    expect(cell.code).toBe('name: str = "Ada"\nprint(name)');
  });

  test("a header line after code is code", () => {
    const cell = parseCell("id: a\nx = 1\nname: later");
    expect(cell.name).toBeNull();
    expect(cell.code).toBe("x = 1\nname: later");
  });
});

describe("wrapSqlCode", () => {
  test("leaves the call as the cell's trailing expression, so the usual render path takes it", () => {
    const wrapped = wrapSqlCode("SELECT 1");
    expect(wrapped).toContain("_dn_sql.run_sql_cell(db,");
    expect(wrapped.trimEnd().endsWith(')')).toBe(true);
  });

  test("passes the SQL through intact, quotes, backslashes and newlines included", () => {
    const sql = "SELECT 'it''s', \"quoted\", 'a\\b'\nFROM t;";
    const argument = /run_sql_cell\(db, ([\s\S]*)\)\s*$/.exec(wrapSqlCode(sql))![1]!;
    // A JSON string literal is a valid Python string literal for these.
    expect(JSON.parse(argument)).toBe(sql);
  });
});
