import { describe, expect, test } from "bun:test";
import { buildFileIndex, distinctValues, indexEntryFor } from "./file-index.ts";

describe("indexEntryFor", () => {
  test("reads title, slug, module, and series from front matter", () => {
    const content = "---\ntitle: A Rule\nslug: a-rule\nmodule: computational-methods\nseries: intro\n---\n\nBody.\n";
    expect(indexEntryFor("a-rule.md", content)).toEqual({
      path: "a-rule.md",
      title: "A Rule",
      slug: "a-rule",
      module: "computational-methods",
      series: "intro",
    });
  });

  test("a file with no front matter at all indexes with only its path", () => {
    expect(indexEntryFor("plain.md", "Just prose.\n")).toEqual({ path: "plain.md" });
  });

  test("a non-string field (year: 2026, covers: {}) is left out rather than coerced", () => {
    const content = "---\ntitle: A Rule\nyear: 2026\ncovers: {}\n---\n\nBody.\n";
    const entry = indexEntryFor("a-rule.md", content);
    expect(entry.title).toBe("A Rule");
    expect((entry as unknown as Record<string, unknown>)["year"]).toBeUndefined();
    expect(entry.module).toBeUndefined();
  });
});

describe("buildFileIndex", () => {
  test("indexes every file independently, in the order given", () => {
    const index = buildFileIndex([
      { path: "one.md", content: "---\ntitle: One\n---\n" },
      { path: "two.md", content: "---\ntitle: Two\n---\n" },
    ]);
    expect(index.map((e) => e.title)).toEqual(["One", "Two"]);
  });
});

describe("distinctValues", () => {
  test("collects every distinct module name, sorted, once each", () => {
    const index = buildFileIndex([
      { path: "a.md", content: "---\nmodule: computational-methods\n---\n" },
      { path: "b.md", content: "---\nmodule: data-wrangling\n---\n" },
      { path: "c.md", content: "---\nmodule: computational-methods\n---\n" },
      { path: "d.md", content: "No front matter.\n" },
    ]);
    expect(distinctValues(index, "module")).toEqual(["computational-methods", "data-wrangling"]);
  });
});
