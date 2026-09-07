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

test("the add control inserts a new paragraph between the two blocks it sits between", async ({ page }) => {
  await mount(page, "One.\n\nThree.\n");
  const gap = page.locator(".dn-add-gap").nth(1);
  await gap.hover(); // the button is opacity:0/pointer-events:none until its gap is hovered
  await gap.locator(".dn-add-btn").click();

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
