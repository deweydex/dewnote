import { describe, expect, test } from "bun:test";
import { parseDocument } from "./blocks.ts";
import {
  declaredPackages,
  execCellLanguage,
  isHintFence,
  isRunnableFence,
  isSitePaneFence,
  parseCellSource,
  parseCellSourceFromFenceText,
  parseHintFence,
  parseSitePaneInfo,
  parseSqlCellInfo,
  sqlPersistStorageKey,
  sqlScriptFromFenceText,
  wrapSqlExecCode,
} from "./cell.ts";

function fenceBlock(source: string) {
  const doc = parseDocument(source);
  const block = doc.blocks.find((b) => b.kind === "fence");
  if (!block) throw new Error("no fence block in fixture");
  return block;
}

const NO_HEADERS = { hint: null, expect: null, name: null };

describe("parseCellSource", () => {
  test("reads an id and hint header off the fence body", () => {
    const block = fenceBlock("```python exec\nid: totals\nhint: sum the list\nprint(sum(xs))\n```\n");
    expect(parseCellSource(block)).toEqual({ id: "totals", hint: "sum the list", expect: null, name: null, code: "print(sum(xs))" });
  });

  test("works with just an id, no hint", () => {
    const block = fenceBlock("```python exec\nid: totals\nprint(1)\n```\n");
    expect(parseCellSource(block)).toEqual({ id: "totals", ...NO_HEADERS, code: "print(1)" });
  });

  test("is fine with no header lines at all", () => {
    const block = fenceBlock("```python exec\nprint(1)\n```\n");
    expect(parseCellSource(block)).toEqual({ id: null, ...NO_HEADERS, code: "print(1)" });
  });

  test("keeps multi-line code intact, headers and all", () => {
    const block = fenceBlock("```python exec\nid: c\nx = 1\ny = 2\nprint(x + y)\n```\n");
    expect(parseCellSource(block).code).toBe("x = 1\ny = 2\nprint(x + y)");
  });

  test("does not treat a code line that merely contains a colon as a header", () => {
    const block = fenceBlock("```python exec\nid: c\nd = {'a': 1}\n```\n");
    expect(parseCellSource(block)).toEqual({ id: "c", ...NO_HEADERS, code: "d = {'a': 1}" });
  });

  test("stops reading headers at the first non-header line, even if a later line looks like one", () => {
    const block = fenceBlock("```python exec\nid: c\nprint('id: not a header')\n```\n");
    expect(parseCellSource(block)).toEqual({ id: "c", ...NO_HEADERS, code: "print('id: not a header')" });
  });

  // dewlab's own header grammar as of d2a21ed (2026-09-10) — DIALECTS.md
  // §1. Not recognising these used to mean the line fell through into
  // `code`, and `expect: len(xs) == 4` is not valid Python.
  test("reads expect: and name: headers, in either order, without swallowing them into code", () => {
    const block = fenceBlock("```python exec\nid: c\nexpect: total == 6\nname: totals\nprint(total)\n```\n");
    expect(parseCellSource(block)).toEqual({ id: "c", hint: null, expect: "total == 6", name: "totals", code: "print(total)" });
  });

  test("a name: line containing = is real code, not a header — dewlab's own ca6e16e fix", () => {
    const block = fenceBlock('```python exec\nid: c\nname: str = "Ada"\nprint(name)\n```\n');
    expect(parseCellSource(block)).toEqual({ id: "c", ...NO_HEADERS, code: 'name: str = "Ada"\nprint(name)' });
  });

  test("an expect: line may itself contain =, and still reads as a header", () => {
    const block = fenceBlock("```python exec\nid: c\nexpect: total == 6\nprint(total)\n```\n");
    expect(parseCellSource(block).expect).toBe("total == 6");
  });
});

describe("parseCellSourceFromFenceText", () => {
  test("agrees with parseCellSource on the same text", () => {
    const text = "```python exec\nid: totals\nhint: sum the list\nprint(sum(xs))\n```\n";
    expect(parseCellSourceFromFenceText(text)).toEqual(parseCellSource(fenceBlock(text)));
  });

  test("reads a live editor's un-committed text directly, no trailing newline required", () => {
    expect(parseCellSourceFromFenceText("```python exec\nid: c\nprint(1)\n```")).toEqual({
      id: "c",
      ...NO_HEADERS,
      code: "print(1)",
    });
  });
});

describe("declaredPackages", () => {
  test("reads a list of package names", () => {
    expect(declaredPackages({ packages: ["sympy", "requests"] })).toEqual(["sympy", "requests"]);
  });

  test("is empty when the field is absent", () => {
    expect(declaredPackages({ title: "A doc" })).toEqual([]);
  });

  test("is empty rather than throwing when the field isn't a list", () => {
    expect(declaredPackages({ packages: "sympy" })).toEqual([]);
    expect(declaredPackages({ packages: 5 })).toEqual([]);
  });

  test("drops non-string entries from an otherwise valid list", () => {
    expect(declaredPackages({ packages: ["sympy", 5, null] })).toEqual(["sympy"]);
  });
});

describe("parseSqlCellInfo", () => {
  test("reads the database name a cell=name fence shares", () => {
    expect(parseSqlCellInfo("sql cell=products")).toEqual({ name: "products", persist: false });
  });

  test("is null for a plain sql fence with no cell=", () => {
    expect(parseSqlCellInfo("sql")).toBeNull();
  });

  test("is null for a python exec fence", () => {
    expect(parseSqlCellInfo("python exec")).toBeNull();
  });

  test("is null for an empty info string", () => {
    expect(parseSqlCellInfo("")).toBeNull();
  });

  test("tolerates trailing whitespace", () => {
    expect(parseSqlCellInfo("sql cell=totals  ")).toEqual({ name: "totals", persist: false });
  });

  test("reads persist as a real flag, not just tolerated syntax", () => {
    expect(parseSqlCellInfo("sql cell=totals persist")).toEqual({ name: "totals", persist: true });
  });
});

describe("sqlPersistStorageKey", () => {
  test("namespaces the key so it can't collide with anything else in localStorage", () => {
    expect(sqlPersistStorageKey("totals")).toBe("dewnote-sql:totals");
  });

  test("two different cell names get two different keys", () => {
    expect(sqlPersistStorageKey("a")).not.toBe(sqlPersistStorageKey("b"));
  });
});

describe("sqlScriptFromFenceText", () => {
  test("returns the whole body, no header lines to peel off", () => {
    const text = "```sql cell=products\nCREATE TABLE products (id INTEGER);\nSELECT * FROM products;\n```\n";
    expect(sqlScriptFromFenceText(text)).toBe("CREATE TABLE products (id INTEGER);\nSELECT * FROM products;");
  });

  test("works against a live editor's text with no trailing newline", () => {
    expect(sqlScriptFromFenceText("```sql cell=c\nSELECT 1;\n```")).toBe("SELECT 1;");
  });
});

describe("isRunnableFence", () => {
  test("is true when exec is one of the info string's tokens", () => {
    expect(isRunnableFence("python exec")).toBe(true);
    expect(isRunnableFence("exec")).toBe(true);
    expect(isRunnableFence("python exec id=c")).toBe(true);
  });

  test("is false for a plain illustrative fence", () => {
    expect(isRunnableFence("python")).toBe(false);
    expect(isRunnableFence("")).toBe(false);
  });

  test("does not match exec as a substring of another token", () => {
    expect(isRunnableFence("nonexec")).toBe(false);
    expect(isRunnableFence("execute")).toBe(false);
  });
});

describe("execCellLanguage", () => {
  test("is sql only when the fence's first word is literally sql", () => {
    expect(execCellLanguage("sql exec")).toBe("sql");
  });

  test("is python for python exec, and for anything else, dewlab's own default", () => {
    expect(execCellLanguage("python exec")).toBe("python");
    expect(execCellLanguage("exec")).toBe("python");
    expect(execCellLanguage("javascript exec")).toBe("python");
  });
});

describe("wrapSqlExecCode", () => {
  test("wraps the script as a bare expression against the shared db, not an assignment", () => {
    const wrapped = wrapSqlExecCode("select * from readings;");
    expect(wrapped).toBe('import dewnote_sql_tools as _dn_sql\n_dn_sql.run_sql_cell(db, "select * from readings;")');
  });

  test("JSON-escapes the script, so quotes and newlines in it survive as real Python string content", () => {
    const wrapped = wrapSqlExecCode("select 'a' as x;\nselect 2;");
    expect(wrapped).toContain('"select \'a\' as x;\\nselect 2;"');
  });
});

describe("isHintFence", () => {
  test("is true when the fence's first info word is literally hint", () => {
    expect(isHintFence("hint")).toBe(true);
  });

  test("is false for anything else, including a fence that merely mentions hint", () => {
    expect(isHintFence("python exec")).toBe(false);
    expect(isHintFence("")).toBe(false);
    expect(isHintFence("hinted")).toBe(false);
  });
});

describe("parseHintFence", () => {
  test("reads for:, after:, and title:, and the body beneath them", () => {
    const block = fenceBlock("```hint\nfor: totals\nafter: 3 errors\ntitle: Try this\n\nCheck your column names.\n```\n");
    expect(parseHintFence(block)).toEqual({ for: "totals", after: "3 errors", title: "Try this", body: "Check your column names." });
  });

  test("defaults after: and title: when absent, and for: stays null rather than guessed", () => {
    const block = fenceBlock("```hint\nCheck your column names.\n```\n");
    expect(parseHintFence(block)).toEqual({
      for: null,
      after: "errors:5",
      title: "Let’s slow down a moment…",
      body: "Check your column names.",
    });
  });

  test("a hint with no header lines at all is still read correctly, body only", () => {
    const block = fenceBlock("```hint\nJust the body, no headers.\n```\n");
    expect(parseHintFence(block).body).toBe("Just the body, no headers.");
  });
});

describe("isSitePaneFence", () => {
  test("is true for html/css/js site, and false for anything else", () => {
    expect(isSitePaneFence("html site")).toBe(true);
    expect(isSitePaneFence("css site")).toBe(true);
    expect(isSitePaneFence("js site")).toBe(true);
    expect(isSitePaneFence("html")).toBe(false);
    expect(isSitePaneFence("python exec")).toBe(false);
    expect(isSitePaneFence("site html")).toBe(false);
    expect(isSitePaneFence("")).toBe(false);
  });
});

describe("parseSitePaneInfo", () => {
  test("reads id:, site:, and the body beneath them", () => {
    const block = fenceBlock("```html site\nid: hero-markup\nsite: hero\n<button>Hover me</button>\n```\n");
    expect(parseSitePaneInfo(block)).toEqual({ language: "html", id: "hero-markup", site: "hero", body: "<button>Hover me</button>" });
  });

  test("reads the language from the fence's own first word", () => {
    const block = fenceBlock("```css site\nid: hero-style\nsite: hero\n.btn { color: red; }\n```\n");
    expect(parseSitePaneInfo(block).language).toBe("css");
  });

  test("id and site are null when absent, body is whatever remains", () => {
    const block = fenceBlock("```js site\nconsole.log(1);\n```\n");
    expect(parseSitePaneInfo(block)).toEqual({ language: "js", id: null, site: null, body: "console.log(1);" });
  });
});
