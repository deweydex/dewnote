import { describe, expect, test } from "bun:test";
import { brokenLinks, brokenLinksIn } from "./links.ts";

const KNOWN = new Set(["grid-of-numbers", "storing-and-computing"]);

describe("brokenLinksIn", () => {
  test("finds a link to an id nothing claims", () => {
    const found = brokenLinksIn("a.md", "See [the next one](tutorial:does-not-exist).\n", KNOWN);
    expect(found).toEqual([{ path: "a.md", target: "does-not-exist", text: "the next one", line: 1 }]);
  });

  test("says nothing about a link that resolves", () => {
    expect(brokenLinksIn("a.md", "[grid](tutorial:grid-of-numbers)\n", KNOWN)).toEqual([]);
  });

  test("an anchor is part of the target's page, not of the target", () => {
    expect(brokenLinksIn("a.md", "[x](tutorial:grid-of-numbers#variables)\n", KNOWN)).toEqual([]);
  });

  test("reports the line, so the report can be read against the file", () => {
    const source = "One.\n\nTwo.\n\n[x](tutorial:nope)\n";
    expect(brokenLinksIn("a.md", source, KNOWN)[0]!.line).toBe(5);
  });

  test("leaves an ordinary link alone — only `tutorial:` is a scheme dewlab resolves", () => {
    expect(brokenLinksIn("a.md", "[x](https://example.com) [y](other.md)\n", KNOWN)).toEqual([]);
  });

  test("finds every broken link on one line", () => {
    const found = brokenLinksIn("a.md", "[a](tutorial:no-one) and [b](tutorial:no-two)\n", KNOWN);
    expect(found.map((link) => link.target)).toEqual(["no-one", "no-two"]);
  });
});

describe("brokenLinks", () => {
  const INDEX = [
    { path: "tutorials/grid-of-numbers/grid-of-numbers.md", id: "grid-of-numbers" },
    { path: "tutorials/storing-and-computing/storing-and-computing.md", id: "storing-and-computing" },
  ];

  test("checks the whole workspace, not only the open document", () => {
    const files = [
      { path: "tutorials/a/a.md", content: "[x](tutorial:missing-one)\n" },
      { path: "tutorials/b/b.md", content: "[y](tutorial:grid-of-numbers)\n" },
      { path: "tutorials/c/c.md", content: "[z](tutorial:missing-two)\n" },
    ];
    expect(brokenLinks(files, INDEX).map((link) => link.target)).toEqual([
      "missing-one",
      "missing-two",
    ]);
  });

  test("a course descriptor is not prose and is not checked", () => {
    const files = [{ path: "courses/maths.yaml", content: "[x](tutorial:nope)\n" }];
    expect(brokenLinks(files, INDEX)).toEqual([]);
  });

  test("nothing broken is an empty list, not an absence", () => {
    expect(brokenLinks([{ path: "a.md", content: "[x](tutorial:grid-of-numbers)\n" }], INDEX)).toEqual([]);
  });
});
