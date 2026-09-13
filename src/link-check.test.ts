import { describe, expect, test } from "bun:test";
import { findBrokenLinks } from "./link-check.ts";
import type { FileIndexEntry } from "./file-index.ts";

const INDEX: FileIndexEntry[] = [
  { path: "tutorials/data/filtering/filtering.md", slug: "filtering", title: "Filtering", module: "data", series: "core" },
  { path: "tutorials/data/grouping/grouping.md", slug: "grouping", title: "Grouping", module: "data", series: "advanced" },
];

describe("findBrokenLinks", () => {
  test("a link to a real slug is not reported", () => {
    const source = "See [filtering](tutorial:filtering) for more.\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([]);
  });

  test("a link to a slug not in the index is reported, with its own visible text", () => {
    const source = "See [sorting rows](tutorial:sorting) for more.\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([{ kind: "tutorial", target: "sorting", text: "sorting rows" }]);
  });

  test("an anchor after the slug doesn't change whether the slug itself resolves", () => {
    const source = "See [filtering](tutorial:filtering#worked-example) for more.\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([]);
  });

  test("an ordinary link (no tutorial:/module:/series: scheme) is ignored entirely", () => {
    const source = "See [the docs](https://example.com/filtering) or [a file](./notes.md).\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([]);
  });

  test("with an empty index, every tutorial: link is reported — an unopened folder, not an error", () => {
    const source = "See [filtering](tutorial:filtering).\n";
    expect(findBrokenLinks(source, [])).toEqual([{ kind: "tutorial", target: "filtering", text: "filtering" }]);
  });

  test("several links in one document are each checked independently", () => {
    const source = "[a](tutorial:filtering) and [b](tutorial:missing) and [c](tutorial:grouping)\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([{ kind: "tutorial", target: "missing", text: "b" }]);
  });

  // decision 33: module:/series: check against distinctValues, not any
  // one file's own front matter — there is no single file a module or
  // series "is."
  test("a module: link to a real module is not reported", () => {
    const source = "See the [whole module](module:data) for context.\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([]);
  });

  test("a module: link to a module nothing names is reported", () => {
    const source = "See [module](module:nonexistent).\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([{ kind: "module", target: "nonexistent", text: "module" }]);
  });

  test("a series: link to a real series is not reported", () => {
    const source = "See the [whole series](series:core) for more.\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([]);
  });

  test("a series: link to a series nothing names is reported", () => {
    const source = "See [series](series:nonexistent).\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([{ kind: "series", target: "nonexistent", text: "series" }]);
  });

  test("tutorial:, module:, and series: links are each checked against their own set, not one another's", () => {
    // "data" is a real module but not a tutorial slug or series name;
    // "core" is a real series but not a module or tutorial slug.
    const source = "[a](tutorial:data) and [b](module:core) and [c](series:filtering)\n";
    expect(findBrokenLinks(source, INDEX)).toEqual([
      { kind: "tutorial", target: "data", text: "a" },
      { kind: "module", target: "core", text: "b" },
      { kind: "series", target: "filtering", text: "c" },
    ]);
  });
});
