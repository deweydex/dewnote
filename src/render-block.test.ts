import { describe, expect, test } from "bun:test";
import { parseFold, renderBlockPreview } from "./render-block.ts";
import { parseDocument } from "./blocks.ts";

function firstBlockOfKind(source: string, kind: string) {
  const { blocks } = parseDocument(source);
  const block = blocks.find((b) => b.kind === kind);
  if (!block) throw new Error(`no ${kind} block in fixture`);
  return block;
}

describe("renderBlockPreview: prose", () => {
  test("renders markdown and inline maths", () => {
    const block = firstBlockOfKind("A paragraph with *emphasis* and $x^2$ in it.\n", "prose");
    const html = renderBlockPreview(block, "plain");
    expect(html).toContain("<em>emphasis</em>");
    expect(html).toContain("katex");
  });

  test("does not treat a price as maths", () => {
    // DIALECTS.md §1: dewlab's own rule is that inline maths never matches
    // against whitespace on either side — texmath's default rule agrees,
    // checked here rather than assumed.
    const block = firstBlockOfKind("It costs $5 or maybe $10, depending.\n", "prose");
    const html = renderBlockPreview(block, "dewlab");
    expect(html).not.toContain("katex");
    expect(html).toContain("$5");
  });
});

describe("renderBlockPreview: math", () => {
  test("renders a single-line display block", () => {
    const block = firstBlockOfKind("$$a^2 + b^2 = c^2$$\n", "math");
    const html = renderBlockPreview(block, "dewlab");
    expect(html).toContain("katex");
  });

  test("renders a multi-line display block", () => {
    const source = "$$\nx = 1, \\quad\ny = 2\n$$\n";
    const block = firstBlockOfKind(source, "math");
    const html = renderBlockPreview(block, "dewlab");
    expect(html).toContain("katex");
  });
});

describe("parseFold", () => {
  test("splits a dl-hint fold with an inline summary", () => {
    const text = '<details class="dl-hint"><summary>hint</summary>\n\nTry *this*.\n\n</details>\n';
    const parts = parseFold(text);
    expect(parts.tag).toBe("details");
    expect(parts.className).toBe("dl-hint");
    expect(parts.summaryHtml).toBe("hint");
    expect(parts.bodyMarkdown).toBe("Try *this*.");
  });

  test("finds the last closing tag when the body itself mentions the tag name", () => {
    const text =
      '<details class="dl-answer"><summary>answer</summary>\n\n' +
      "Wrap it in `</details>` as text, then explain.\n\n</details>\n";
    const parts = parseFold(text);
    expect(parts.bodyMarkdown).toContain("as text, then explain.");
  });

  test("handles a fold with no inline summary", () => {
    const text = '<aside class="dl-note" id="x">\n\nSome text.\n\n</aside>\n';
    const parts = parseFold(text);
    expect(parts.tag).toBe("aside");
    expect(parts.className).toBe("dl-note");
    expect(parts.summaryHtml).toBe("");
    expect(parts.bodyMarkdown).toBe("Some text.");
  });
});

describe("renderBlockPreview: fold", () => {
  test("renders a real <details> with the body as markdown", () => {
    const source = '<details class="dl-hint"><summary>hint</summary>\n\nName the *columns*.\n\n</details>\n';
    const block = firstBlockOfKind(source, "fold");
    const html = renderBlockPreview(block, "dewlab");
    expect(html).toStartWith('<details class="dl-hint">');
    expect(html).toContain("<summary>hint</summary>");
    expect(html).toContain("<em>columns</em>");
  });

  test("falls back to the class name as a label when there is no inline summary", () => {
    const source = '<details class="dl-answer">\n\nThe answer is 4.\n\n</details>\n';
    const block = firstBlockOfKind(source, "fold");
    const html = renderBlockPreview(block, "dewlab");
    expect(html).toContain("<summary>answer</summary>");
  });

  test("a fence quoted inside a fold's body still renders (as markdown-it's own fence, not a live cell)", () => {
    const source = '<details class="dl-answer"><summary>answer</summary>\n\n```python\n1 + 1\n```\n\n</details>\n';
    const block = firstBlockOfKind(source, "fold");
    const html = renderBlockPreview(block, "dewlab");
    expect(html).toContain("<pre>");
    expect(html).toContain("1 + 1");
  });
});

describe("renderBlockPreview: frontmatter", () => {
  test("summarises the field count without dumping raw YAML", () => {
    const source = "---\ntitle: A tutorial\nslug: a-tutorial\n---\n\nBody.\n";
    const block = firstBlockOfKind(source, "frontmatter");
    const html = renderBlockPreview(block, "plain");
    expect(html).toContain("2 fields");
    expect(html).not.toContain("title:");
  });
});

describe("renderBlockPreview: fence", () => {
  test("throws — fences have no rendered state to produce", () => {
    const block = firstBlockOfKind("```python\n1\n```\n", "fence");
    expect(() => renderBlockPreview(block, "plain")).toThrow();
  });
});
