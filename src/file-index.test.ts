import { describe, expect, test } from "bun:test";
import { buildFileIndex, defaultEntryFor, distinctValues, indexEntryFor } from "./file-index.ts";

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

  test("reads dewlab's own status and version fields, when present", () => {
    const content = "---\ntitle: A Rule\nslug: a-rule\nstatus: archived\nversion: 2026.01.02.1\n---\n\nBody.\n";
    const entry = indexEntryFor("a-rule/v2026.01.02.1.md", content);
    expect(entry.status).toBe("archived");
    expect(entry.version).toBe("2026.01.02.1");
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

describe("defaultEntryFor", () => {
  function entry(path: string, extra: Partial<{ title: string; status: string; version: string }>): { path: string; content: string } {
    const fields = { slug: "a-rule", ...extra };
    const yaml = Object.entries(fields)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    return { path, content: `---\n${yaml}\n---\n` };
  }

  test("a single matching entry is returned outright", () => {
    const index = buildFileIndex([entry("a-rule.md", { title: "A Rule" })]);
    expect(defaultEntryFor(index, "a-rule")?.title).toBe("A Rule");
  });

  test("no matching slug returns undefined", () => {
    expect(defaultEntryFor(buildFileIndex([entry("a-rule.md", { title: "A Rule" })]), "missing")).toBeUndefined();
  });

  test("among several versions, the newest live one wins over an older live one", () => {
    const index = buildFileIndex([
      entry("a-rule/v2026.01.01.1.md", { title: "Older", status: "live", version: "2026.01.01.1" }),
      entry("a-rule/v2026.06.01.1.md", { title: "Newer", status: "live", version: "2026.06.01.1" }),
    ]);
    expect(defaultEntryFor(index, "a-rule")?.title).toBe("Newer");
  });

  test("live outranks archived regardless of version dates", () => {
    const index = buildFileIndex([
      entry("a-rule/v2026.06.01.1.md", { title: "Archived but newer", status: "archived", version: "2026.06.01.1" }),
      entry("a-rule/v2026.01.01.1.md", { title: "Live but older", status: "live", version: "2026.01.01.1" }),
    ]);
    expect(defaultEntryFor(index, "a-rule")?.title).toBe("Live but older");
  });

  test("with no live version at all, the newest version regardless of status wins", () => {
    const index = buildFileIndex([
      entry("a-rule/v2026.01.01.1.md", { title: "Older archived", status: "archived", version: "2026.01.01.1" }),
      entry("a-rule/v2026.06.01.1.md", { title: "Newer beta", status: "beta", version: "2026.06.01.1" }),
    ]);
    expect(defaultEntryFor(index, "a-rule")?.title).toBe("Newer beta");
  });

  test("no status field at all is treated as live, dewlab's own default", () => {
    const index = buildFileIndex([
      entry("a-rule/draft.md", { title: "A draft", status: "draft", version: "2026.06.01.1" }),
      entry("a-rule/plain.md", { title: "No status field" }),
    ]);
    expect(defaultEntryFor(index, "a-rule")?.title).toBe("No status field");
  });

  test("a two-digit version number correctly outranks a one-digit one, not lexicographically", () => {
    const index = buildFileIndex([
      entry("a-rule/v9.md", { title: "Ninth release", status: "live", version: "2026.01.01.9" }),
      entry("a-rule/v10.md", { title: "Tenth release", status: "live", version: "2026.01.01.10" }),
    ]);
    expect(defaultEntryFor(index, "a-rule")?.title).toBe("Tenth release");
  });
});
