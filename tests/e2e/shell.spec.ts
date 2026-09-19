// The shell, driven over a store held in memory: does opening a workspace
// actually put a document on screen, does the spine say where it is, and
// does a save reach the store.
//
// These are the questions `archive/tests/e2e/` answered across
// `file-bar.spec.ts`, `folder-panel.spec.ts` and `workspace-palette.spec.ts`,
// when there were three surfaces to ask them of. There is one now.

import { test, expect } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");

const WORKSPACE = {
  "courses/maths.yaml": [
    "id: maths",
    "title: Maths for IT",
    "contents:",
    "  - title: First Steps",
    "    tutorials:",
    "      - storing-and-computing",
  ].join("\n") + "\n",
  "tutorials/storing-and-computing/storing-and-computing.md": [
    "---",
    "title: Storing and Computing",
    "status: live",
    "---",
    "",
    "# Storing and Computing",
    "",
    "Last time we learned to do arithmetic.",
    "",
    "## Variables",
    "",
    "A variable is a name.",
    "",
    "```python exec",
    "id: first",
    "x = 1",
    "```",
    "",
  ].join("\n"),
  "pages/about.md": "---\ntitle: About\n---\n\n# About\n\nA page.\n",
};

async function openWorkspace(page: import("@playwright/test").Page) {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), WORKSPACE);
}

test("the gate is what a session opens on", async ({ page }) => {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-gate")).toBeVisible();
  await expect(page.locator(".dn-gate-choices button")).toHaveCount(2);
});

test("opening a workspace offers the palette, because choosing a document is next", async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator(".dn-wp-overlay")).toBeVisible();
});

test("the palette opens a document, and the spine says where it sits", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");

  await expect(page.locator(".milkdown h1")).toHaveText("Storing and Computing");
  await expect(page.locator(".dn-spine-file")).toContainText("storing-and-computing.md");
  // Module › Series › Title, read from the course descriptor.
  await expect(page.locator(".dn-spine-breadcrumb")).toContainText("Maths for IT");
  await expect(page.locator(".dn-spine-breadcrumb")).toContainText("First Steps");
});

test("the outline lists the document's own headings", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");
  // Two headings: the title and `## Variables`. A `#` inside the fence
  // is not one.
  await expect(page.locator(".dn-spine-heading")).toHaveCount(2);
  await expect(page.locator(".dn-spine-heading").nth(1)).toHaveText("Variables");
});

test("an untouched document is not dirty, although it was normalised on the way in", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");
  await expect(page.locator(".dn-spine-state")).toBeDisabled();
});

test("an edit reaches the store, with the fence's info string intact", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");

  await page.locator(".milkdown p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" And now we keep one.");
  await expect(page.locator(".dn-spine-state")).toHaveText("Save this");

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");

  const written = await page.evaluate(() => (globalThis as any).__dewnoteWrites);
  expect(written).toHaveLength(1);
  expect(written[0].path).toBe("tutorials/storing-and-computing/storing-and-computing.md");
  expect(written[0].text).toContain("And now we keep one.");
  expect(written[0].text).toContain("```python exec");
  expect(written[0].text).toContain("id: first");
  expect(written[0].text).toContain("title: Storing and Computing");
});

test("dewlab's own site pages are documents like any other", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("about");
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown h1")).toHaveText("About");
});
