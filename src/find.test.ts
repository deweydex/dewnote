import { describe, expect, test } from "bun:test";
import { findAll, replaceAll } from "./find.ts";

const files = new Map([
  ["tutorials/b/b.md", "---\ntitle: Lists\n---\n\nA list, and f(x).\nlists of lists\n"],
  ["tutorials/a/a.md", "# LISTS\n"],
  ["courses/one.yaml", "- lists\n"],
]);

describe("findAll", () => {
  test("finds every match in every document, front matter included, in path order", () => {
    const hits = findAll(files, "list", { matchCase: false });
    expect(hits.map((hit) => `${hit.path}:${hit.line}:${hit.column}`)).toEqual([
      "tutorials/a/a.md:1:2",
      "tutorials/b/b.md:2:7",
      "tutorials/b/b.md:5:2",
      "tutorials/b/b.md:6:0",
      "tutorials/b/b.md:6:9",
    ]);
  });

  test("leaves course files alone", () => {
    expect(findAll(files, "- lists", { matchCase: false })).toEqual([]);
  });

  test("with Match case, only the case typed", () => {
    expect(findAll(files, "LISTS", { matchCase: true }).map((hit) => hit.path)).toEqual(["tutorials/a/a.md"]);
  });

  test("reads the query as text, not as a pattern", () => {
    const [hit] = findAll(files, "f(x).", { matchCase: false });
    expect(hit).toMatchObject({ path: "tutorials/b/b.md", line: 5, column: 12, length: 5 });
    expect(findAll(files, ".*", { matchCase: false })).toEqual([]);
  });
});

describe("replaceAll", () => {
  test("one write per document that changes, and a count of every replacement", () => {
    const { changes, count } = replaceAll(files, "lists", "arrays", { matchCase: true });
    expect(count).toBe(2);
    expect(changes).toEqual([
      { kind: "write", path: "tutorials/b/b.md", text: "---\ntitle: Lists\n---\n\nA list, and f(x).\narrays of arrays\n" },
    ]);
  });

  test("takes the replacement as typed, $ signs and all", () => {
    const { changes } = replaceAll(files, "f(x)", "$1 and $&", { matchCase: true });
    expect((changes[0] as { text: string }).text).toContain("A list, and $1 and $&.");
  });

  test("a replacement that changes nothing writes nothing", () => {
    expect(replaceAll(files, "LISTS", "LISTS", { matchCase: false }).changes.map((change) => (change as { path: string }).path))
      .toEqual(["tutorials/b/b.md"]);
    expect(replaceAll(files, "LISTS", "LISTS", { matchCase: true })).toEqual({ changes: [], count: 0 });
  });
});
