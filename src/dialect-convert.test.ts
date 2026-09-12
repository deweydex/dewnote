// Each test names the exact row of DIALECTS.md §5's table it checks.

import { describe, expect, test } from "bun:test";
import { convertDialect } from "./dialect-convert.ts";

describe("dewlab -> dewstack", () => {
  test("python exec with id: x becomes py cell=x", () => {
    const source = "```python exec\nid: filter-evening\n1 + 1\n```\n";
    const { markdown, report } = convertDialect(source, "dewlab", "dewstack");
    expect(markdown).toBe("```py cell=filter-evening\n1 + 1\n```\n");
    expect(report).toEqual([]);
  });

  test("a hint has no home in dewstack, and is reported rather than silently dropped", () => {
    const source = "```python exec\nid: x\nhint: try again\n1 + 1\n```\n";
    const { markdown, report } = convertDialect(source, "dewlab", "dewstack");
    expect(markdown).toBe("```py cell=x\n1 + 1\n```\n");
    expect(report).toEqual(['"x": hint: has no home in dewstack — dropped ("try again")']);
  });

  test("expect: and name: also have no home in dewstack, each reported on its own line", () => {
    const source = "```python exec\nid: x\nexpect: total == 6\nname: totals\n1 + 1\n```\n";
    const { markdown, report } = convertDialect(source, "dewlab", "dewstack");
    expect(markdown).toBe("```py cell=x\n1 + 1\n```\n");
    expect(report).toEqual([
      '"x": expect: has no home in dewstack — dropped ("total == 6")',
      '"x": name: has no home in dewstack — dropped ("totals")',
    ]);
  });

  test("an illustrative (non-exec) fence is unaffected", () => {
    const source = "```python\n1 + 1\n```\n";
    const { markdown, report } = convertDialect(source, "dewlab", "dewstack");
    expect(markdown).toBe(source);
    expect(report).toEqual([]);
  });

  test("sql exec has no dewstack equivalent (a shared connection, not a per-name one) — kept as illustrative, reported", () => {
    const source = "```sql exec\nid: totals\nselect count(*) from readings;\n```\n";
    const { markdown, report } = convertDialect(source, "dewlab", "dewstack");
    expect(markdown).toBe("```sql\nid: totals\nselect count(*) from readings;\n```\n");
    expect(report.length).toBe(1);
    expect(report[0]).toContain("no dewstack equivalent");
  });

  test("front matter drops year, covers, and practice_* fields, keeps the rest", () => {
    const source = "---\ntitle: A Rule\nyear: 2026\ncovers: {}\npractice_for: other-slug\nmodule: computational-methods\n---\n\nBody.\n";
    const { markdown, report } = convertDialect(source, "dewlab", "dewstack");
    expect(markdown).not.toContain("year:");
    expect(markdown).not.toContain("covers:");
    expect(markdown).not.toContain("practice_for:");
    expect(markdown).toContain("title: A Rule");
    expect(markdown).toContain("module: computational-methods");
    expect(report).toEqual([]);
  });
});

describe("dewstack -> dewlab", () => {
  test("py cell=x becomes python exec with id: x", () => {
    const source = "```py cell=totals\ndf.sum()\n```\n";
    const { markdown, report } = convertDialect(source, "dewstack", "dewlab");
    expect(markdown).toBe("```python exec\nid: totals\ndf.sum()\n```\n");
    expect(report).toEqual([]);
  });

  test("sql-check, site=, and app= fences have no dewlab equivalent and become illustrative, reported", () => {
    const cases = [
      "```sql-check db=orders task=check_totals\n```\n",
      "```html site=widget\n<div></div>\n```\n",
      "```js app=dashboard\nconsole.log(1);\n```\n",
    ];
    for (const source of cases) {
      const { markdown, report } = convertDialect(source, "dewstack", "dewlab");
      expect(markdown).not.toContain("site=");
      expect(markdown).not.toContain("app=");
      expect(report.length).toBe(1);
      expect(report[0]).toContain("no dewlab equivalent");
    }
  });

  test("sql cell=x becomes sql exec, using the database name as the new id", () => {
    const source = "```sql cell=orders\nselect * from orders;\n```\n";
    const { markdown, report } = convertDialect(source, "dewstack", "dewlab");
    expect(markdown).toBe("```sql exec\nid: orders\nselect * from orders;\n```\n");
    expect(report).toEqual([]);
  });

  test("persist has no home in dewlab's sql exec, and is reported", () => {
    const source = "```sql cell=orders persist\nselect * from orders;\n```\n";
    const { markdown, report } = convertDialect(source, "dewstack", "dewlab");
    expect(markdown).toBe("```sql exec\nid: orders\nselect * from orders;\n```\n");
    expect(report).toEqual(['"orders": persist has no home in dewlab\'s sql exec (no per-document save/restore there) — dropped']);
  });

  test("two sql cell=x fences sharing a name convert to two sql exec fences, with a report about the colliding id", () => {
    const source = "```sql cell=orders\ncreate table orders (id integer);\n```\n\n```sql cell=orders\nselect * from orders;\n```\n";
    const { markdown, report } = convertDialect(source, "dewstack", "dewlab");
    expect(markdown).toContain("id: orders\ncreate table orders (id integer);");
    expect(markdown).toContain("id: orders\nselect * from orders;");
    expect(report).toEqual(['"orders": another cell already used this name — dewlab requires a unique id per exec cell; rename one by hand after converting']);
  });

  test("front matter adds an empty year and empty covers, and reports the gap", () => {
    const source = "---\ntitle: A Page\nmodule_title: Data\n---\n\nBody.\n";
    const { markdown, report } = convertDialect(source, "dewstack", "dewlab");
    expect(markdown).toContain("year:");
    expect(markdown).toContain("covers:");
    expect(report).toEqual(['front matter: dewlab requires "year" — left blank, fill in before using this document']);
  });
});

describe("either dialect -> plain", () => {
  test("dewlab's exec attribute is dropped, the language is kept", () => {
    const source = "```python exec\nid: x\n1 + 1\n```\n";
    const { markdown, report } = convertDialect(source, "dewlab", "plain");
    expect(markdown).toBe("```python\nid: x\n1 + 1\n```\n");
    expect(report).toEqual(['fence "python exec": attributes dropped for plain markdown, language kept']);
  });

  test("dewstack's cell= attribute is dropped, the language is kept", () => {
    const source = "```sql cell=orders\nselect 1;\n```\n";
    const { markdown, report } = convertDialect(source, "dewstack", "plain");
    expect(markdown).toBe("```sql\nselect 1;\n```\n");
    expect(report).toEqual(['fence "sql cell=orders": attributes dropped for plain markdown, language kept']);
  });

  test("a fence with no attributes at all is unaffected", () => {
    const source = "```python\n1 + 1\n```\n";
    const { markdown, report } = convertDialect(source, "dewlab", "plain");
    expect(markdown).toBe(source);
    expect(report).toEqual([]);
  });
});

test("converting a dialect to itself is the identity, with no report", () => {
  const source = "```python exec\nid: x\n1 + 1\n```\n";
  expect(convertDialect(source, "dewlab", "dewlab")).toEqual({ markdown: source, report: [] });
});

test("prose, math, and fold blocks pass through every conversion untouched", () => {
  const source = [
    "# A Rule\n\n",
    "Where it lives.\n\n",
    "$$x^2$$\n\n",
    '<details class="dl-hint"><summary>hint</summary>\n\nTry again.\n\n</details>\n',
  ].join("");
  const { markdown } = convertDialect(source, "dewlab", "dewstack");
  expect(markdown).toBe(source);
});
