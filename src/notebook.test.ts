// The property that matters: a document that goes out to a notebook and
// comes back is the same bytes. Checked against every fixture, not only
// against a sample somebody wrote by hand.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fromNotebook, joinSegments, segments, toNotebook } from "./notebook.ts";

const FIXTURES = join(import.meta.dir, "..", "fixtures");

function corpus(): { name: string; source: string }[] {
  const out: { name: string; source: string }[] = [];
  for (const dialect of readdirSync(FIXTURES)) {
    for (const file of readdirSync(join(FIXTURES, dialect))) {
      if (!file.endsWith(".md")) continue;
      out.push({ name: `${dialect}/${file}`, source: readFileSync(join(FIXTURES, dialect, file), "utf8") });
    }
  }
  return out;
}

describe("segments", () => {
  test("concatenating them reproduces the document", () => {
    for (const { name, source } of corpus()) {
      expect(joinSegments(segments(source)), name).toBe(source);
    }
  });

  test("front matter is its own segment", () => {
    const parts = segments("---\ntitle: A\n---\n\n# A\n");
    expect(parts[0]!.kind).toBe("frontmatter");
    expect(parts[0]!.text).toBe("---\ntitle: A\n---\n");
  });

  test("a fence is one segment, with its info string", () => {
    const parts = segments("Words.\n\n```python exec\nid: a\nprint(1)\n```\n\nMore.\n");
    const fence = parts.find((part) => part.kind === "fence")!;
    expect(fence.info).toBe("python exec");
    expect(fence.text).toContain("print(1)");
    expect(fence.text).toContain("```");
  });

  test("a `#` inside a fence is not prose", () => {
    const parts = segments("```python\n# not a heading\n```\n");
    expect(parts.filter((part) => part.kind === "prose")).toHaveLength(0);
  });
});

describe("toNotebook", () => {
  const NOTEBOOK = toNotebook(
    "---\ntitle: A\n---\n\n# A\n\nWords.\n\n```python exec\nid: first\nprint(1)\n```\n\n```python\nprint(2)\n```\n",
  );

  test("is nbformat 4.5", () => {
    expect(NOTEBOOK.nbformat).toBe(4);
    expect(NOTEBOOK.nbformat_minor).toBe(5);
  });

  test("front matter is a raw cell, which Jupyter shows but does not run", () => {
    expect(NOTEBOOK.cells[0]!.cell_type).toBe("raw");
  });

  test("prose is a markdown cell", () => {
    expect(NOTEBOOK.cells[1]!.cell_type).toBe("markdown");
    expect(NOTEBOOK.cells[1]!.source).toContain("# A");
  });

  test("a cell takes its own `id:` as the notebook cell's id", () => {
    const cell = NOTEBOOK.cells.find((c) => String(c.source).includes("print(1)"))!;
    expect(cell.id).toBe("first");
  });

  test("an illustrative fence is marked as one rather than claimed runnable", () => {
    const cell = NOTEBOOK.cells.find((c) => String(c.source).includes("print(2)"))!;
    expect(cell.metadata["dewnote_illustrative"]).toBe(true);
  });

  test("every cell keeps its own exact text", () => {
    for (const cell of NOTEBOOK.cells) {
      expect(typeof cell.metadata.dewnote.raw).toBe("string");
    }
  });
});

describe("fromNotebook", () => {
  test("round-trips every fixture byte for byte", () => {
    for (const { name, source } of corpus()) {
      expect(fromNotebook(toNotebook(source)), name).toBe(source);
    }
  });

  test("rebuilds a notebook written in Jupyter, which has no metadata to play back", () => {
    const notebook = {
      nbformat: 4 as const,
      nbformat_minor: 5 as const,
      metadata: {},
      cells: [
        { cell_type: "markdown" as const, id: "a", metadata: {} as never, source: "# Title" },
        { cell_type: "code" as const, id: "b", metadata: {} as never, source: "print(1)" },
      ],
    };
    expect(fromNotebook(notebook)).toBe("# Title\n```python\nprint(1)\n```\n");
  });

  test("accepts a source written as an array of lines, which Jupyter does", () => {
    const notebook = {
      nbformat: 4 as const,
      nbformat_minor: 5 as const,
      metadata: {},
      cells: [{ cell_type: "markdown" as const, id: "a", metadata: {} as never, source: ["# One\n", "Two"] }],
    };
    expect(fromNotebook(notebook)).toBe("# One\nTwo\n");
  });
});
