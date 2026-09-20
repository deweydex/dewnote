import { describe, expect, test } from "bun:test";
import { exportHtml, renderBody, titleOf, withoutCellHeaders } from "./export-html.ts";

describe("titleOf", () => {
  test("prefers the front matter's own title", () => {
    expect(titleOf("---\ntitle: A Page\n---\n\n# Something Else\n")).toBe("A Page");
  });

  test("falls back to the first heading", () => {
    expect(titleOf("# Storing and Computing\n\nWords.\n")).toBe("Storing and Computing");
  });

  test("a document with neither still has a name", () => {
    expect(titleOf("Just words.\n")).toBe("Untitled");
  });
});

describe("renderBody", () => {
  test("drops front matter, which a reader never sees on the site either", async () => {
    const html = await renderBody("---\ntitle: A\n---\n\n# A\n\nWords.\n");
    expect(html).not.toContain("title: A");
    expect(html).toContain("<h1>A</h1>");
  });

  test("renders a table, which is GFM rather than commonmark", async () => {
    expect(await renderBody("| A | B |\n| - | - |\n| 1 | 2 |\n")).toContain("<table>");
  });

  test("renders maths through KaTeX rather than leaving the dollars", async () => {
    const html = await renderBody("$$\n\\frac{a}{b}\n$$\n");
    expect(html).toContain("katex");
    expect(html).not.toContain("$$");
  });

  test("a cell is a labelled code block — its output is not in the document", async () => {
    const html = await renderBody("```python exec\nid: a\nprint(1)\n```\n");
    expect(html).toContain("<code");
    expect(html).toContain("print(1)");
  });

  test("keeps a raw-HTML fold, which is how a hint is written", async () => {
    const html = await renderBody('<details class="dl-hint"><summary>stuck?</summary>\n\n1. Try.\n\n</details>\n');
    expect(html).toContain("<details");
    expect(html).toContain("<summary>");
  });
});

describe("exportHtml", () => {
  test("is one file: the stylesheet is inlined, not linked", async () => {
    const html = await exportHtml("# A\n\nWords.\n", { css: ".dn-page{color:red}" });
    expect(html).toContain("<style>.dn-page{color:red}</style>");
    expect(html).not.toContain("<link");
  });

  test("carries KaTeX's stylesheet only when the page really renders maths", async () => {
    const plain = await exportHtml("# A\n", { css: "", katexCss: "KATEXCSS" });
    expect(plain).not.toContain("KATEXCSS");
    const withMaths = await exportHtml("# A\n\n$x^2$\n", { css: "", katexCss: "KATEXCSS" });
    expect(withMaths).toContain("KATEXCSS");
  });

  test("a price is not maths", async () => {
    // A regex over the source reads "$5 and $6" as an inline formula.
    const html = await exportHtml("It costs $5 and $6.\n", { css: "", katexCss: "KATEXCSS" });
    expect(html).not.toContain("KATEXCSS");
  });

  test("inlines an image the document owns, so the file stands alone", async () => {
    const html = await exportHtml("![a](diagram.svg)\n", {
      css: "",
      resolveImage: async (src) => (src === "diagram.svg" ? "data:image/svg+xml;base64,AAA" : null),
    });
    expect(html).toContain('src="data:image/svg+xml;base64,AAA"');
    expect(html).not.toContain('src="diagram.svg"');
  });

  test("leaves an image it cannot find named, so the gap is visible", async () => {
    const html = await exportHtml("![a](missing.png)\n", { css: "", resolveImage: async () => null });
    expect(html).toContain('src="missing.png"');
  });

  test("leaves a web image alone", async () => {
    const html = await exportHtml("![a](https://example.com/x.png)\n", {
      css: "",
      resolveImage: async () => "data:image/png;base64,NO",
    });
    expect(html).toContain('src="https://example.com/x.png"');
  });

  test("names the page after the document", async () => {
    expect(await exportHtml("---\ntitle: A Page\n---\n\n# A Page\n", { css: "" }))
      .toContain("<title>A Page</title>");
  });
});

describe("withoutCellHeaders", () => {
  test("drops a cell's header lines, which the reader has no use for", () => {
    const source = ["```python exec", "id: first-sum", "total = 2 + 2", "```", ""].join("\n");
    expect(withoutCellHeaders(source)).toBe(["```python exec", "total = 2 + 2", "```", ""].join("\n"));
  });

  test("drops every header key, not only `id:`", () => {
    const source = [
      "```python exec", "id: a", "name: Adding up", "hint: errors:3", "expect: total == 4",
      "print(1)", "```", "",
    ].join("\n");
    expect(withoutCellHeaders(source)).toBe(["```python exec", "print(1)", "```", ""].join("\n"));
  });

  test("leaves an illustrative fence alone — it has no header to drop", () => {
    const source = ["```python", "id = 4", "```", ""].join("\n");
    expect(withoutCellHeaders(source)).toBe(source);
  });

  test("leaves prose and front matter exactly as they were", () => {
    const source = ["---", "title: A", "---", "", "Some prose with `id: x` in it.", ""].join("\n");
    expect(withoutCellHeaders(source)).toBe(source);
  });

  test("a cell that is nothing but headers ends up an empty fence, not a broken one", () => {
    expect(withoutCellHeaders("```python exec\nid: a\n```\n")).toBe("```python exec\n\n```\n");
  });
});
