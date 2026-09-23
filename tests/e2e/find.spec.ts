// Find and replace in every document, over the stub store. What matches
// and what a replacement writes is tested in find.test.ts; these check
// the panel: results that follow the typing, a result that opens its
// file, and Replace all as one change that reaches the open document.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");

const WORKSPACE = {
  "tutorials/lists/lists.md": "---\ntitle: Lists\n---\n\n# Lists\n\nA list holds values in order.\n",
  "tutorials/loops/loops.md": "---\ntitle: Loops\n---\n\n# Loops\n\nLoop over a list, one value at a time.\n",
  "pages/about.md": "---\ntitle: About\n---\n\n# About\n\nNothing to see.\n",
};

async function openWorkspace(page: Page) {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), WORKSPACE);
  await page.locator(".dn-wp-input").fill("lists");
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown h1")).toHaveText("Lists");
}

test("results follow the typing, and one opens its document", async ({ page }) => {
  await openWorkspace(page);
  await page.keyboard.press("ControlOrMeta+Shift+f");

  const panel = page.locator(".dn-find");
  await expect(panel).toBeVisible();
  await panel.locator(".dn-find-query").fill("a list");
  await expect(panel.locator(".dn-find-summary")).toHaveText("2 matches in 2 documents.");
  await expect(panel.locator(".dn-find-row mark").first()).toHaveText("A list");
  // Nothing typed to replace with, so nothing offered to replace.
  await expect(panel.locator(".dn-find-replace")).toBeHidden();

  await panel.locator(".dn-find-row", { hasText: "tutorials/loops/loops.md · line 7" }).click();
  await expect(page.locator(".dn-spine-file")).toHaveAttribute("title", "tutorials/loops/loops.md");
});

test("Replace all is one change, and the open document shows it", async ({ page }) => {
  await openWorkspace(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("find and replace");
  await page.keyboard.press("Enter");

  const panel = page.locator(".dn-find");
  await panel.locator(".dn-find-query").fill("list");
  await panel.locator(".dn-find-replacement").fill("sequence");
  // "Lists" in both titles and a heading match too, until case counts.
  await expect(panel.locator(".dn-find-replace")).toHaveText("Replace all 4");
  await panel.locator(".dn-find-case input").check();
  await expect(panel.locator(".dn-find-replace")).toHaveText("Replace all 2");
  await panel.locator(".dn-find-replace").click();

  await expect(panel.locator(".dn-find-summary")).toContainText("Replaced 2.");
  const batches = await page.evaluate(() => (globalThis as any).__dewnoteApplied);
  expect(batches).toHaveLength(1);
  expect(batches[0].message).toBe('Replace "list" with "sequence"');
  expect(batches[0].changes.map((change: any) => change.path)).toEqual([
    "tutorials/lists/lists.md",
    "tutorials/loops/loops.md",
  ]);

  await panel.locator("button", { hasText: "Close" }).click();
  await expect(page.locator(".milkdown p").first()).toHaveText("A sequence holds values in order.");
});

test("unsaved edits in the open document are asked about before anything is replaced", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".milkdown p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited.");

  await page.keyboard.press("ControlOrMeta+Shift+f");
  const panel = page.locator(".dn-find");
  await panel.locator(".dn-find-query").fill("list");
  await panel.locator(".dn-find-replacement").fill("sequence");
  await panel.locator(".dn-find-replace").click();

  await page.locator(".dn-ask-choice", { hasText: "Keep editing" }).click();
  expect(await page.evaluate(() => (globalThis as any).__dewnoteApplied)).toHaveLength(0);
  await expect(page.locator(".milkdown p").first()).toContainText("Edited.");
});
