// Drives the real single-file build (dist/index.html, from `bun run
// build`) in an actual browser — decision 9's reasoning applies here
// directly: dewlab's own Milkdown traps were invisible from the API and
// found only by clicking through the real editor, not by asserting
// against a mock. Every test remounts a fresh document into the same
// already-loaded page through the window.__dewnote hook main.ts exposes
// for exactly this, rather than needing a second build or harness page.

import { test as base, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");

// An auto fixture, not a beforeEach/afterEach pair: the array it pushes
// into stays live across the whole test (setup through teardown), so an
// error thrown by an interaction in the test body itself is caught too,
// not just one from the initial page load.
const test = base.extend<{ failOnConsoleErrors: void }>({
  failOnConsoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      await use();
      expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
});

async function mount(page: Page, source: string) {
  await page.evaluate((src) => (window as any).__dewnote.mount(src), source);
}

async function getSource(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__dewnote.getSource());
}

test.beforeEach(async ({ page }) => {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
});

test("the starter document renders — heading, cell, and hint fold all visible", async ({ page }) => {
  await expect(page.locator("h1")).toHaveText("Untitled");
  await expect(page.locator(".dn-block-fence .cm-content")).toContainText("1 + 1");
  await expect(page.locator(".dn-block-fold summary")).toHaveText("hint");
  await expect(page.locator(".dn-block-fold")).toContainText("dewlab and dewstack both use");
});

test("clicking a paragraph reveals its markdown source, and blurring commits the edit", async ({ page }) => {
  await mount(page, "First **bold** paragraph.\n\nSecond paragraph, untouched.\n");

  const first = page.locator(".dn-block-render").first();
  await first.click();

  const source = page.locator(".dn-block-source .cm-content").first();
  await expect(source).toContainText("First **bold** paragraph.");

  await page.keyboard.press("End");
  await page.keyboard.type(" Edited.");
  await page.locator("body").click({ position: { x: 5, y: 5 } }); // blur

  await expect(page.locator(".dn-block-render").first().locator("strong")).toHaveText("bold");
  const finalSource = await getSource(page);
  expect(finalSource).toContain("First **bold** paragraph. Edited.");
  expect(finalSource).toContain("Second paragraph, untouched.\n");
});

test("editing one fence and then focusing a second preserves both, not just the last one focused", async ({
  page,
}) => {
  const doc = "```python exec\nid: a\n1\n```\n\n```python exec\nid: b\n2\n```\n";
  await mount(page, doc);

  const cells = page.locator(".dn-block-fence .cm-content");
  await expect(cells).toHaveCount(2);

  await cells.nth(0).click();
  await page.keyboard.press("End");
  await page.keyboard.type("11");

  await cells.nth(1).click(); // blurs the first, committing it, before this one is edited
  await page.keyboard.press("End");
  await page.keyboard.type("22");

  await page.locator("body").click({ position: { x: 5, y: 5 } }); // blur the second

  const finalSource = await getSource(page);
  expect(finalSource).toContain("id: a\n111\n");
  expect(finalSource).toContain("id: b\n222\n");
});

test("delete removes exactly the targeted block", async ({ page }) => {
  await mount(page, "One.\n\nTwo.\n\nThree.\n");
  await page.locator(".dn-block").nth(1).hover();
  await page.locator(".dn-block").nth(1).locator(".dn-block-delete").click();

  const finalSource = await getSource(page);
  expect(finalSource).toBe("One.\n\nThree.\n");
});

test("a fence can be deleted like any other block, not just a prose one", async ({ page }) => {
  // A fence doesn't own a trailing blank line the way a prose block does
  // (blocks.ts), so the blank line between it and "Three." is its own
  // separate block — deleting only the fence correctly leaves that
  // blank-line block behind rather than collapsing the gap. Byte-precise
  // deletion, checked directly rather than assumed: three newlines
  // between "One." and "Three." after this, not two.
  await mount(page, "One.\n\n```python exec\nid: a\n1\n```\n\nThree.\n");
  const fenceBlock = page.locator(".dn-block-fence");
  await fenceBlock.hover();
  await fenceBlock.locator(".dn-block-delete").click();

  const finalSource = await getSource(page);
  expect(finalSource).toBe("One.\n\n\nThree.\n");
});

test("the grip arms a block, and arrow keys reorder it while armed", async ({ page }) => {
  await mount(page, "One.\n\nTwo.\n\nThree.\n");
  const blocks = page.locator(".dn-block");
  const grip = (n: number) => blocks.nth(n).locator(".dn-block-grip");

  await blocks.nth(1).hover();
  await expect(grip(1)).toHaveAttribute("aria-pressed", "false");
  await grip(1).click();
  await expect(grip(1)).toHaveAttribute("aria-pressed", "true");
  await expect(blocks.nth(1)).toHaveClass(/is-armed/);

  await grip(1).press("ArrowUp");
  expect(await getSource(page)).toBe("Two.\n\nOne.\n\nThree.\n");
  // moveBlock re-arms the block at its new position and refocuses its grip.
  await expect(blocks.nth(0)).toHaveClass(/is-armed/);
  await expect(grip(0)).toBeFocused();

  await grip(0).press("ArrowDown");
  expect(await getSource(page)).toBe("One.\n\nTwo.\n\nThree.\n");

  await grip(1).press("Escape");
  await expect(blocks.nth(1)).not.toHaveClass(/is-armed/);
});

test("clicking outside the armed block disarms it", async ({ page }) => {
  await mount(page, "One.\n\nTwo.\n");
  const blocks = page.locator(".dn-block");
  await blocks.nth(0).hover();
  await blocks.nth(0).locator(".dn-block-grip").click();
  await expect(blocks.nth(0)).toHaveClass(/is-armed/);

  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(blocks.nth(0)).not.toHaveClass(/is-armed/);
});

test("dragging an armed block onto another drops it in just before the target", async ({ page }) => {
  await mount(page, "One.\n\nTwo.\n\nThree.\n");
  const blocks = page.locator(".dn-block");
  await blocks.nth(0).hover();
  await blocks.nth(0).locator(".dn-block-grip").click();
  await expect(blocks.nth(0)).toHaveClass(/is-armed/);

  await blocks.nth(0).dragTo(blocks.nth(2));
  expect(await getSource(page)).toBe("Two.\n\nOne.\n\nThree.\n");
});

test("front matter never gets move controls, and nothing can be moved above it", async ({ page }) => {
  // No blank line between the closing "---" and "One." — with one there,
  // extractFrontMatter's own trailing blank line and the gap's own blank
  // line would be two different things, and the gap would parse as its
  // own orphan prose block sitting between front matter and "One."
  // (checked directly; a fence leaves the same kind of orphan behind
  // when it isn't followed immediately by more content — see the delete
  // test above). That would make "One." adjacent to the orphan block,
  // not to front matter, and moving it up would swap two ordinary
  // blocks rather than test the constraint this test is actually for.
  await mount(page, "---\ntitle: A doc\n---\nOne.\n\nTwo.\n");
  const frontMatterBlock = page.locator(".dn-block-frontmatter");
  await expect(frontMatterBlock.locator(".dn-block-toolbar")).toHaveCount(0);

  // "One." can still be armed and dragged, but dropping it onto front
  // matter — or anywhere above it — clamps to right after front matter,
  // per moveBlockTo's own minIndex rule, so nothing actually moves here.
  const firstProse = page.locator(".dn-block-prose", { hasText: "One." });
  await firstProse.hover();
  await firstProse.locator(".dn-block-grip").click();
  await firstProse.dragTo(frontMatterBlock);
  expect(await getSource(page)).toBe("---\ntitle: A doc\n---\nOne.\n\nTwo.\n");
});

test("the add control offers more than a paragraph — a code cell is live and focused as soon as it's added", async ({
  page,
}) => {
  await mount(page, "One.\n\nTwo.\n");
  const gap = page.locator(".dn-add-gap").nth(1);
  await gap.hover();
  await gap.locator(".dn-add-btn").click();
  await gap.locator(".dn-add-menu button", { hasText: "Code cell" }).click();

  const finalSource = await getSource(page);
  expect(finalSource).toContain("```python exec\nid: new-cell-1\n");
  // The new cell is a live editor already focused, not a second click away.
  await page.keyboard.type("42");
  expect(await getSource(page)).toContain("id: new-cell-1\n42\n");
});

test("the add control inserts a new paragraph between the two blocks it sits between", async ({ page }) => {
  await mount(page, "One.\n\nThree.\n");
  const gap = page.locator(".dn-add-gap").nth(1);
  await gap.hover(); // the button is opacity:0/pointer-events:none until its gap is hovered
  await gap.locator(".dn-add-btn").click();
  await gap.locator(".dn-add-menu button", { hasText: "Paragraph" }).click();

  const finalSource = await getSource(page);
  expect(finalSource).toBe("One.\n\nNew paragraph.\n\nThree.\n");
});

test("a real dewlab tutorial round-trips byte for byte through the mounted DOM, untouched", async ({ page }) => {
  const fixturePath = join(HERE, "../../fixtures/dewlab/computational-methods__three-ways-to-make-change.md");
  const original = readFileSync(fixturePath, "utf8");
  await mount(page, original);
  const roundTripped = await getSource(page);
  expect(roundTripped).toBe(original);
});

// A SQL cell's persist restore is pure DOM/localStorage — it never calls
// pyodide-engine.ts (only Run and Reset do), so unlike tests/e2e/pyodide.spec.ts
// this needs no real network and belongs in the suite that runs everywhere.
test.describe("a persisted SQL cell's Restore banner", () => {
  test("appears only for a persist cell with a saved script, and never otherwise", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("dewnote-sql:totals", "SELECT 2;"));

    await mount(page, "```sql cell=totals persist\nSELECT 1;\n```\n");
    await expect(page.locator(".dn-sql-restore")).toBeVisible();

    // A different cell name never sees another cell's saved script.
    await mount(page, "```sql cell=other persist\nSELECT 1;\n```\n");
    await expect(page.locator(".dn-sql-restore")).toBeHidden();

    // No persist flag at all, even with a saved entry sitting there.
    await mount(page, "```sql cell=totals\nSELECT 1;\n```\n");
    await expect(page.locator(".dn-sql-restore")).toBeHidden();
  });

  test("replaces only the fence's body, keeping the opening and closing lines exactly as authored", async ({
    page,
  }) => {
    await page.evaluate(() => localStorage.setItem("dewnote-sql:totals", "SELECT 'saved';"));
    await mount(page, "```sql cell=totals persist\nSELECT 'authored';\n```\n");

    await page.locator(".dn-sql-restore-button").click();
    await expect(page.locator(".dn-sql-restore")).toBeHidden();
    await expect(page.locator(".dn-block-fence .cm-content")).toContainText("SELECT 'saved';");
    await expect(page.locator(".dn-block-fence .cm-content")).not.toContainText("authored");

    // Blurring commits it like any other edit — the info string (and its
    // own persist flag) is untouched, only the SQL script changed.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    expect(await getSource(page)).toBe("```sql cell=totals persist\nSELECT 'saved';\n```\n");
  });
});
