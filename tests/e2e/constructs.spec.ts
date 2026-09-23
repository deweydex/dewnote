// One case per markdown construct dewlab writes, checked through the
// real editor. The corpus suite (roundtrip.spec.ts) says whether the
// fixtures survive; this says which construct broke when one does not,
// and what each looks like and does on screen.

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
  "strikethrough": "The old way was ~~this~~, and the new way is that.\n",
  "inline maths": "The value $x^2 + 1$ here.\n",
  "display maths": "$$\n\\frac{a}{b} = c\n$$\n",
  "inline break": "A line<br />and the next.\n",
  "answer written as a bare number": "1. One.\n2.\n",
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
  // Crepe's GFM preset parses these into real nodes — a `<sup>` atom for
  // the reference, a `<dl>` for each definition — so they survive an
  // edit. dewlab does not write them yet; this says dewnote is ready if
  // it starts to.
  "footnote": "A claim[^1] and another[^b].\n\n[^1]: The first note.\n\n[^b]: The second.\n",
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

test("display maths written on one line stays display maths", async ({ page }) => {
  // Milkdown reads `$$x = 1$$` on one line as inline maths, at a
  // different size. dewlab reads it as a block, and so must the editor.
  await page.goto(BUILT_APP);
  const out = await page.evaluate(async () => {
    await (globalThis as any).__dewnote.open("$$x = 1$$\n");
    return (globalThis as any).__dewnote.markdown() as string;
  });
  expect(out).toBe("$$\nx = 1\n$$\n");
  await expect(page.locator(".milkdown .katex").first()).toBeVisible();
});

test("inline maths renders through KaTeX", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(() => (globalThis as any).__dewnote.open("A $x^2$ value.\n"));
  await expect(page.locator(".milkdown .katex")).toHaveCount(1);
});

test("a table is editable, not raw pipes", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(() => {
    // The gate would take the click this test makes.
    document.querySelector(".dn-gate")?.remove();
    return (globalThis as any).__dewnote.open("| A | B |\n| - | - |\n| 1 | 2 |\n");
  });
  await expect(page.locator(".milkdown td").first()).toHaveText("1");

  // Typing into a cell changes that cell in the file.
  await page.locator(".milkdown td").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type("0");
  const out = await page.evaluate(() => (globalThis as any).__dewnote.markdown() as string);
  expect(out).toMatch(/^\| 10 +\| 2 \|$/m);
});

test("a task list shows which items are done, and a click ticks one", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(() => {
    document.querySelector(".dn-gate")?.remove();
    return (globalThis as any).__dewnote.open("- [ ] to do\n- [x] done\n");
  });
  const boxes = page.locator(".milkdown .milkdown-icon.label");
  await expect(boxes.nth(0)).toHaveClass(/unchecked/);
  await expect(boxes.nth(1)).toHaveClass(/(^|\s)checked/);

  await boxes.nth(0).click();
  const out = await page.evaluate(() => (globalThis as any).__dewnote.markdown() as string);
  // Trailing blank lines aside: clicking into a list at the end of a
  // document leaves Milkdown's empty trailing paragraph behind (see
  // planning/ROADMAP.md).
  expect(out.trimEnd()).toBe("- [x] to do\n- [x] done");
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
  // Saved escaped, which dewlab renders as a plain `$`, so it can never
  // be read as maths later.
  const out = await page.evaluate(() => (globalThis as any).__dewnote.markdown() as string);
  expect(out).toBe("It costs \\$5 and \\$6 in total.\n");
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

test("a running cell can be stopped by the button that started it", async ({ page }) => {
  await page.goto(BUILT_APP);
  // Pyodide needs a network the sandbox does not have, so the run is
  // held open rather than faked fast: what is under test is the button's
  // own state machine, not the interpreter.
  await page.evaluate(() => {
    (globalThis as any).__dewnoteRunCell = "never";
    // This suite drives the editor directly, so the gate is still up and
    // would swallow the click.
    document.querySelector(".dn-gate")?.remove();
  });
  await page.evaluate(() =>
    (globalThis as any).__dewnote.open("```python exec\nid: a\nwhile True:\n    pass\n```\n"),
  );

  const run = page.locator(".dn-cell-run");
  await expect(run).toHaveText("Run");
  await run.click();

  // It says it is running, and offers the way out.
  await expect(run).toHaveText("Stop");
  await expect(run).toHaveClass(/is-running/);

  await run.click();
  expect(await page.evaluate(() => (globalThis as any).__dewnoteStopped)).toBe(true);
  await expect(run).toHaveText("Run again");
  await expect(run).not.toHaveClass(/is-running/);
});

test("Run sends the cell's code, without its header lines, and shows what comes back", async ({ page }) => {
  // The interpreter is a stub that echoes what it was sent; real Python
  // is in pyodide.spec.ts. What is checked here is the editor's half:
  // the right code goes out and the answer lands under the cell.
  await page.goto(BUILT_APP);
  await page.evaluate(() => {
    (globalThis as any).__dewnoteRunCell = true;
    document.querySelector(".dn-gate")?.remove();
  });
  await page.evaluate(() =>
    (globalThis as any).__dewnote.open("```python exec\nid: a\nhint: errors:3\nprint(1)\n```\n"),
  );

  await page.locator(".dn-cell-run").click();
  const output = page.locator(".dn-cell-output");
  await expect(output).toContainText("print(1)");
  await expect(output).not.toContainText("id: a");
  await expect(output).not.toContainText("errors:3");
  await expect(page.locator(".dn-cell-run")).toHaveText("Run again");
});

test("an output that predates an edit is kept, and marked as older", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(() => {
    (globalThis as any).__dewnoteRunCell = true;
    document.querySelector(".dn-gate")?.remove();
  });
  await page.evaluate(() =>
    (globalThis as any).__dewnote.open("```python exec\nid: a\nprint(1)\n```\n"),
  );
  await page.locator(".dn-cell-run").click();
  await expect(page.locator(".dn-cell-output")).toBeVisible();

  // Edit the cell; the output belongs to the code as it was.
  await page.locator(".milkdown .cm-content").click();
  await page.keyboard.type("  ");
  await expect(page.locator(".dn-cell-output.is-stale")).toBeVisible();
});

test("Run every cell stops at the first cell that fails", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/one.md": [
      "---", "title: One", "---", "", "# One", "",
      "```python exec", "id: a", "raise ValueError('first')", "```", "",
      "```python exec", "id: b", "print(2)", "```", "",
    ].join("\n"),
  });
  await page.locator(".dn-wp-input").fill("one");
  await page.keyboard.press("Enter");

  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("run every cell");
  await page.keyboard.press("Enter");

  // The first cell fails whether or not Pyodide can load: it raises if
  // it runs, and errors if the interpreter is unreachable. Either way
  // the second is never attempted. A cell that was never run says
  // "Run"; one that has been says "Run again".
  const buttons = page.locator(".dn-cell-run");
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveText("Run again", { timeout: 30_000 });
  await expect(page.locator(".dn-cell-output.is-error")).toHaveCount(1);
  await expect(buttons.nth(1)).toHaveText("Run");
});

test("Run every cell passes over questions and runs a cell below the fold", async ({ page }) => {
  await page.goto(BUILT_APP);
  const filler = Array.from({ length: 80 }, (_, at) => `Paragraph ${at + 1}.\n`);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/one.md": [
      "---", "title: One", "---", "", "# One", "",
      // A question carries an `id:` but never runs; it must not end the run.
      "```question", "id: q", "type: fill-in-the-blank", "", "Two and two is {4}.", "```", "",
      ...filler,
      "```python exec", "id: far", "raise ValueError('reached')", "```", "",
    ].join("\n"),
  });
  await page.locator(".dn-wp-input").fill("one");
  await page.keyboard.press("Enter");
  // The cell is far below the fold, so it has not mounted.
  await expect(page.locator(".dn-cell-run")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("run every cell");
  await page.keyboard.press("Enter");

  // Give the run time to happen, then bring the cell into view: its
  // panel shows it was run, although it was never on screen.
  await page.waitForTimeout(3_000);
  await page.locator(".milkdown pre, .milkdown .milkdown-code-block").last().scrollIntoViewIfNeeded();
  await expect(page.locator(".dn-cell-run")).toHaveText("Run again", { timeout: 30_000 });
  await expect(page.locator(".dn-cell-output.is-error")).toHaveCount(1);
});

test("Run on a SQL cell sends the query wrapped for the page's database", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(() => {
    (globalThis as any).__dewnoteRunCell = true;
    document.querySelector(".dn-gate")?.remove();
  });
  await page.evaluate(() =>
    (globalThis as any).__dewnote.open("```sql exec\nid: q\nSELECT 1;\n```\n"),
  );
  await page.locator(".dn-cell-run").click();
  const output = page.locator(".dn-cell-output");
  await expect(output).toContainText("run_sql_cell(db,");
  await expect(output).toContainText("SELECT 1;");
});

test.describe("help while writing a Python cell", () => {
  const TWO_CELLS = "```python exec\nid: a\ndef area(width, height):\n    return width * height\n```\n\n```python exec\nid: b\nar\n```\n";

  async function openWithJedi(page: import("@playwright/test").Page, answers: Record<string, unknown>) {
    await page.goto(BUILT_APP);
    await page.evaluate((canned) => {
      (globalThis as any).__dewnoteJedi = canned;
      document.querySelector(".dn-gate")?.remove();
    }, answers);
    await page.evaluate((md) => (globalThis as any).__dewnote.open(md), TWO_CELLS);
    await expect(page.locator(".milkdown .cm-content")).toHaveCount(2);
  }

  /** Puts the cursor at the end of the second cell's last line. */
  async function typeInSecondCell(page: import("@playwright/test").Page, text: string) {
    const second = page.locator(".milkdown .cm-content").nth(1);
    await second.locator(".cm-line").last().click();
    await page.keyboard.press("End");
    await page.keyboard.type(text);
  }

  test("completion offers Jedi's names, and asks with the cells above as context", async ({ page }) => {
    await openWithJedi(page, { complete: [{ label: "area", type: "function" }, { label: "arbitrary_name", type: "variable" }] });
    await typeInSecondCell(page, "b");
    await page.keyboard.press("Control+Space");

    const options = page.locator(".cm-tooltip-autocomplete .cm-completionLabel");
    await expect(options.filter({ hasText: "arbitrary_name" })).toHaveCount(1);

    const asked: any[] = await page.evaluate(() => (globalThis as any).__dewnoteJediAsked);
    const question = asked.find((one) => one.kind === "complete");
    // The cell above, header blanked; this cell's header blanked too, on
    // the same lines, so the position still points at "arb".
    expect(question.context).toBe("\ndef area(width, height):\n    return width * height\n");
    expect(question.source).toBe("\narb");
    expect(question).toMatchObject({ line: 2, column: 3 });
  });

  test("hovering a name shows its documentation", async ({ page }) => {
    await openWithJedi(page, { hover: "area(width, height)\n\nThe area of a rectangle." });
    const name = page.locator(".milkdown .cm-content").first().getByText("area", { exact: false }).first();
    await name.hover();
    await expect(page.locator(".dn-help-doc")).toContainText("The area of a rectangle.");
  });

  test("typing a call shows its signature, with the argument being typed in bold", async ({ page }) => {
    await openWithJedi(page, { signature: { label: "area(width, height)", index: 1 } });
    await typeInSecondCell(page, "ea(3, ");
    const signature = page.locator(".dn-help-signature");
    await expect(signature).toContainText("area(width, height)");
    await expect(signature.locator("strong")).toHaveText("height");

    // Closing the call puts it away.
    await page.keyboard.type("4)");
    await expect(signature).toHaveCount(0);
  });

  test("a block in another language asks nothing", async ({ page }) => {
    await page.goto(BUILT_APP);
    await page.evaluate(() => {
      (globalThis as any).__dewnoteJedi = { signature: { label: "nope()", index: 0 } };
      document.querySelector(".dn-gate")?.remove();
    });
    await page.evaluate(() => (globalThis as any).__dewnote.open("```sql\nSELECT max(\n```\n"));
    await page.locator(".milkdown .cm-line").first().click();
    await page.keyboard.press("End");
    await page.keyboard.type("x, ");
    await page.waitForTimeout(500);
    const asked: any[] = await page.evaluate(() => (globalThis as any).__dewnoteJediAsked);
    expect(asked.filter((one) => one.kind !== "complete")).toEqual([]);
    await expect(page.locator(".dn-help-signature")).toHaveCount(0);
  });
});
