// What the palette reads out of a document it has not opened, and the
// fence rule that makes it right: a `#` inside a fence is a comment or a
// shell prompt, never a heading.

import { describe, expect, test } from "bun:test";
import { headingsOf, openingOf, plainInline, proseRuns } from "./markdown.ts";

describe("openingOf", () => {
  const TUTORIAL = [
    "---",
    "title: Storing and Computing",
    "---",
    "",
    "# Storing and Computing",
    "",
    "**Programming Design Principles / Maths for IT**",
    "",
    "Last time we learned to do arithmetic. But we had a *limitation*:",
    "every result was gone once we had it.",
    "",
    "## Variables",
    "",
    "A variable is a name.",
    "",
  ].join("\n");

  test("skips front matter, the title, and the bold module line", () => {
    expect(openingOf(TUTORIAL)).toBe(
      "Last time we learned to do arithmetic. But we had a limitation: every result was gone once we had it.",
    );
  });

  test("reads inline markdown as the words it stands for", () => {
    expect(openingOf("A [link](x.md) and `code` and **bold**.\n")).toBe("A link and code and bold.");
  });

  test("a document with nothing but headings has no opening, rather than a heading", () => {
    expect(openingOf("# Only\n\n## Headings\n")).toBe("");
  });

  test("a long opening is cut rather than allowed to fill the pane", () => {
    expect(openingOf(`${"word ".repeat(200)}\n`).length).toBe(320);
  });
});

describe("headingsOf", () => {
  test("lists the headings under the title, without their marks", () => {
    expect(headingsOf("# Title\n\n## First **step**\n\n### Deeper\n\n#### Deepest\n")).toEqual([
      "First step",
      "Deeper",
      "Deepest",
    ]);
  });

  test("a `#` inside a fence is a comment, not a heading", () => {
    expect(headingsOf("# Title\n\n```python exec\nid: a\n# not a heading\n```\n\n## Real\n")).toEqual(["Real"]);
  });
});

describe("proseRuns", () => {
  test("leaves the inside of a fence out", () => {
    expect(proseRuns("Before.\n\n```python exec\nid: a\n# not prose\n```\n\nAfter.\n")).toEqual([
      "Before.",
      "After.",
    ]);
  });

  test("leaves front matter out", () => {
    expect(proseRuns("---\ntitle: T\n---\n\nBody.\n")).toEqual(["Body."]);
  });

  test("keeps a paragraph's own line breaks, since prose is hard-wrapped", () => {
    expect(proseRuns("One line\nand its wrap.\n")).toEqual(["One line\nand its wrap."]);
  });
});

describe("plainInline", () => {
  test("reads a link as its words", () => {
    expect(plainInline("See [the tree](tree.html).")).toBe("See the tree.");
  });
});
