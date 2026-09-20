// One case per markdown construct dewlab writes, checked through the
// real editor. The corpus suite says whether 184 files survive; this
// says which construct broke when one of them does not.

import { test, expect } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");

const IDENTICAL: Record<string, string> = {
  "tight bullet list": "Before.\n\n- one\n- two\n- three\n\nAfter.\n",
  "loose bullet list": "Before.\n\n- one\n\n- two\n\nAfter.\n",
  "nested bullets": "- one\n  - nested\n- two\n",
  "ordered list": "1. one\n2. two\n",
  "task list": "- [ ] to do\n- [x] done\n",
  "inline maths": "The value $x^2 + 1$ here.\n",
  "display maths": "$$\n\\frac{a}{b} = c\n$$\n",
  "table": "| A | B |\n| - | - |\n| 1 | 2 |\n",
  "blockquote": "> a quotation\n",
  "thematic break": "One.\n\n---\n\nTwo.\n",
  "emphasis and code": "Some *italic*, some **bold**, some `code`.\n",
  "image": "![a diagram](diagram.svg)\n",
  "python exec cell": "```python exec\nid: first\nprint(1)\n```\n",
  "sql exec cell": "```sql exec\nid: rows\nSELECT 1;\n```\n",
  "site pane": "```html site\nid: page\nsite: demo\n<p>hi</p>\n```\n",
  "illustrative fence": "```python\nprint(1)\n```\n",
  "hint fold": '<details class="dl-hint"><summary>stuck?</summary>\n\n1. Check.\n\n</details>\n',
  "front matter": "---\ntitle: A Page\nstatus: live\n---\n\n# A Page\n\nBody.\n",
};

for (const [name, source] of Object.entries(IDENTICAL)) {
  test(`round-trips unchanged: ${name}`, async ({ page }) => {
    await page.goto(BUILT_APP);
    const out = await page.evaluate(async (md) => {
      await (globalThis as any).__dewnote.open(md);
      return (globalThis as any).__dewnote.markdown() as string;
    }, source);
    expect(out).toBe(source);
  });
}

test("display maths renders through KaTeX", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(() =>
    (globalThis as any).__dewnote.open("$$\n\\frac{a}{b} = c\n$$\n"),
  );
  await expect(page.locator(".milkdown .katex")).toHaveCount(1);
});

test("inline maths renders through KaTeX", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(() => (globalThis as any).__dewnote.open("A $x^2$ value.\n"));
  await expect(page.locator(".milkdown .katex")).toHaveCount(1);
});

test("an image is an img element, at the path the markdown names", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(() =>
    (globalThis as any).__dewnote.open("![a diagram](diagram.svg)\n"),
  );
  const image = page.locator(".milkdown img:not(.ProseMirror-separator)");
  await expect(image).toHaveCount(1);
  // Relative, and resolved against the page rather than the document —
  // which is why an image beside a tutorial does not display yet.
  await expect(image).toHaveAttribute("src", "diagram.svg");
});

test("a table is editable, not raw pipes", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(() =>
    (globalThis as any).__dewnote.open("| A | B |\n| - | - |\n| 1 | 2 |\n"),
  );
  await expect(page.locator(".milkdown table")).not.toHaveCount(0);
  await expect(page.locator(".milkdown td").first()).toHaveText("1");
});

test("a task list draws its own checkbox", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(() =>
    (globalThis as any).__dewnote.open("- [ ] to do\n- [x] done\n"),
  );
  await expect(page.locator(".milkdown .milkdown-icon.label")).toHaveCount(2);
});

test("a price is prose, not a formula", async ({ page }) => {
  // remark-math reads any `$…$` as maths; dewlab's build refuses a span
  // with whitespace against a delimiter, and a sentence about money is
  // the common case.
  await page.goto(BUILT_APP);
  await page.evaluate(() =>
    (globalThis as any).__dewnote.open("It costs $5 and $6 in total.\n"),
  );
  await expect(page.locator(".milkdown .katex")).toHaveCount(0);
  await expect(page.locator(".milkdown p")).toContainText("It costs $5 and $6 in total.");
});

test("an escaped dollar is a dollar, and stays one", async ({ page }) => {
  await page.goto(BUILT_APP);
  const out = await page.evaluate(async () => {
    await (globalThis as any).__dewnote.open("It costs \\$5.\n");
    return (globalThis as any).__dewnote.markdown() as string;
  });
  expect(out).toBe("It costs \\$5.\n");
  await expect(page.locator(".milkdown p")).toContainText("It costs $5.");
});
