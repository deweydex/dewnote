import { describe, expect, test } from "bun:test";
import { findBrokenLinks } from "./link-check.ts";
import type { FileIndexEntry } from "./file-index.ts";

const INDEX: FileIndexEntry[] = [
  { path: "tutorials/data/filtering/filtering.md", slug: "filtering", title: "Filtering" },
  { path: "tutorials/data/grouping/grouping.md", slug: "grouping", title: "Grouping" },
];

describe("findBrokenLinks", () => {
  test("a link to a real slug is not reported", () => {
    const source = "See [filtering](tutorial:filtering) for more.\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([]);
  });

  test("a link to a slug not in the index is reported, with its own visible text", () => {
    const source = "See [sorting rows](tutorial:sorting) for more.\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([{ slug: "sorting", text: "sorting rows" }]);
  });

  test("an anchor after the slug doesn't change whether the slug itself resolves", () => {
    const source = "See [filtering](tutorial:filtering#worked-example) for more.\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([]);
  });

  test("an ordinary link (no tutorial: scheme) is ignored entirely", () => {
    const source = "See [the docs](https://example.com/filtering) or [a file](./notes.md).\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([]);
  });

  test("with an empty index, every tutorial: link is reported — an unopened folder, not an error", () => {
    const source = "See [filtering](tutorial:filtering).\n";
    expect(findBrokenLinks(source, [])).toEqual([{ slug: "filtering", text: "filtering" }]);
  });

  test("several links in one document are each checked independently", () => {
    const source = "[a](tutorial:filtering) and [b](tutorial:missing) and [c](tutorial:grouping)\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([{ slug: "missing", text: "b" }]);
  });
});
