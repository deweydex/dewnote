// Whether a leading `---` block is front matter. The index, the checker,
// the palette's preview, the export and the editor all ask, and they have
// to get the same answer, or a file is a page to one and a note to
// another.

import { describe, expect, test } from "bun:test";
import { bodyOf, extractFrontMatter, readableAsMarkdown } from "./frontmatter.ts";

describe("extractFrontMatter", () => {
  test("reads a mapping as fields", () => {
    expect(extractFrontMatter("---\ntitle: T\nstatus: draft\n---\n\n# T\n")).toEqual({
      present: true,
      raw: "title: T\nstatus: draft",
      fields: { title: "T", status: "draft" },
    });
  });

  test("has none when the file does not open with a fence", () => {
    expect(extractFrontMatter("# Notes\n\nText.\n").present).toBe(false);
  });

  test("keeps YAML that does not parse, since a file being written passes through that", () => {
    expect(extractFrontMatter('---\ntitle: "unclosed\n---\n\nBody.\n')).toEqual({
      present: true,
      raw: 'title: "unclosed',
      fields: {},
    });
  });

  test("an empty block is front matter with no fields", () => {
    expect(extractFrontMatter("---\n\n---\n\nBody.\n")).toEqual({ present: true, raw: "", fields: {} });
  });

  test("a sentence between two rules is not front matter", () => {
    expect(extractFrontMatter("---\n\nAn opening line.\n\n---\n\nMore.\n").present).toBe(false);
    expect(extractFrontMatter("---\nAn opening line\n---\n\nMore.\n").present).toBe(false);
  });

  test("nor is a list between two rules", () => {
    expect(extractFrontMatter("---\n- one\n- two\n---\n").present).toBe(false);
  });

  test("reads past a byte-order mark and Windows line endings", () => {
    expect(extractFrontMatter("﻿---\r\ntitle: T\r\n---\r\n\r\nBody.\r\n").fields).toEqual({ title: "T" });
  });
});

describe("bodyOf", () => {
  test("takes front matter off", () => {
    expect(bodyOf("---\ntitle: T\n---\n\nBody.\n")).toBe("\nBody.\n");
  });

  test("leaves a file that opens with a rule whole", () => {
    const source = "---\n\nAn opening line.\n\n---\n\nMore.\n";
    expect(bodyOf(source)).toBe(source);
  });
});

describe("readableAsMarkdown", () => {
  test("leaves front matter, and a file without any, as they are", () => {
    for (const source of ["---\ntitle: T\n---\n\nBody.\n", "# Notes\n\nText.\n", '---\ntitle: "unclosed\n---\n']) {
      expect(readableAsMarkdown(source)).toBe(source);
    }
  });

  test("puts a blank line before a rule that would otherwise be read as front matter", () => {
    expect(readableAsMarkdown("---\n\nAn opening line.\n\n---\n\nMore.\n")).toBe(
      "\n---\n\nAn opening line.\n\n---\n\nMore.\n",
    );
  });
});
