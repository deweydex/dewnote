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

test("a runnable cell offers Run; an illustrative fence does not", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");

  // One `python exec` fence in the fixture, and no plain one.
  await expect(page.locator(".dn-cell-run")).toHaveCount(1);
  await expect(page.locator(".dn-cell-run")).toHaveText("Run");

  // Pyodide itself is not reachable from this sandbox, so what is
  // checked here is the affordance, not the interpreter —
  // tests/e2e/pyodide.spec.ts is where a real run belongs.
});

test("an illustrative fence has no Run button", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/plain.md": "---\ntitle: Plain\n---\n\n# Plain\n\n```python\nprint(1)\n```\n",
  });
  await page.locator(".dn-wp-input").fill("plain");
  await page.keyboard.press("Enter");
  // Crepe renders a code block as a CodeMirror instance, not a `pre`.
  await expect(page.locator(".milkdown .cm-editor")).toHaveCount(1);
  await expect(page.locator(".dn-cell-run")).toHaveCount(0);
});

test("every appearance setting is reachable from the palette, and moving the measure moves the page", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("appearance");
  await page.keyboard.press("Enter");

  const panel = page.locator(".dn-settings");
  await expect(panel).toBeVisible();
  // Eleven settings, the same eleven the original had minus the sidebar
  // control, which has no sidebar left to describe.
  await expect(panel.locator(".dn-settings-row")).toHaveCount(11);

  const before = await page.locator(".dn-page").evaluate((el) => el.getBoundingClientRect().width);
  const measure = panel.locator(".dn-settings-row", { hasText: "Line width" }).locator("input");
  await measure.fill("48");
  await measure.dispatchEvent("input");
  const after = await page.locator(".dn-page").evaluate((el) => el.getBoundingClientRect().width);
  expect(after).toBeGreaterThan(before);

  await panel.locator(".dn-settings-reset").click();
  const reset = await page.locator(".dn-page").evaluate((el) => el.getBoundingClientRect().width);
  expect(reset).toBe(before);
});

test("a setting survives a reload, because it is the reader's and not the session's", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("appearance");
  await page.keyboard.press("Enter");
  await page.locator(".dn-settings-row", { hasText: "Theme" }).locator("select").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
