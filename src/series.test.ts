import { describe, expect, test } from "bun:test";
import { parseSeriesFile, parseSeriesFiles } from "./series.ts";

describe("parseSeriesFile", () => {
  test("a real order file, dewlab's own shape", () => {
    const content = "series: Python fundamentals\norder:\n  - first-steps\n  - working-with-tables\n";
    expect(parseSeriesFile("tutorials/computational-methods/python-fundamentals.order.yaml", content)).toEqual({
      module: "computational-methods",
      slug: "python-fundamentals",
      title: "Python fundamentals",
      order: ["first-steps", "working-with-tables"],
    });
  });

  test("a leading comment doesn't change anything — it's just YAML", () => {
    const content = "# The reading order of this series.\n\nseries: A table of your own\norder:\n  - a-table-is-a-list-of-rows\n";
    const series = parseSeriesFile("tutorials/database-methods/first-database.order.yaml", content);
    expect(series?.title).toBe("A table of your own");
    expect(series?.order).toEqual(["a-table-is-a-list-of-rows"]);
  });

  test("a path with no parent directory still parses, with an empty module", () => {
    const content = "series: Standalone\norder:\n  - only-one\n";
    expect(parseSeriesFile("standalone.order.yaml", content)?.module).toBe("");
  });

  test("not an order file at all returns null", () => {
    expect(parseSeriesFile("tutorials/data/filtering/filtering.md", "series: x\norder: []\n")).toBeNull();
  });

  test("missing series: returns null", () => {
    expect(parseSeriesFile("tutorials/data/x.order.yaml", "order:\n  - a\n")).toBeNull();
  });

  test("missing order: returns null", () => {
    expect(parseSeriesFile("tutorials/data/x.order.yaml", "series: X\n")).toBeNull();
  });

  test("order: not a list of strings returns null", () => {
    expect(parseSeriesFile("tutorials/data/x.order.yaml", "series: X\norder:\n  a: 1\n")).toBeNull();
    expect(parseSeriesFile("tutorials/data/x.order.yaml", "series: X\norder:\n  - 1\n  - 2\n")).toBeNull();
  });

  test("unparseable YAML returns null rather than throwing", () => {
    expect(parseSeriesFile("tutorials/data/x.order.yaml", "series: [unclosed\n")).toBeNull();
  });
});

describe("parseSeriesFiles", () => {
  test("keeps only the files that turn out to be real series", () => {
    const files = [
      { path: "tutorials/a/one.order.yaml", content: "series: One\norder:\n  - x\n" },
      { path: "tutorials/a/notes.md", content: "# Notes\n" },
      { path: "tutorials/b/two.order.yaml", content: "order:\n  - y\n" },
    ];
    const series = parseSeriesFiles(files);
    expect(series).toHaveLength(1);
    expect(series[0]?.title).toBe("One");
  });
});
