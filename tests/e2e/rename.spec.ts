// Renaming, moving and deleting, driven through the palette over the
// stub store. What each plan changes is tested in rename.test.ts; these
// check that the shell asks, applies the plan as one change, and ends
// up showing the right thing.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");

const WORKSPACE = {
  "courses/maths.yaml":
    "id: maths\ntitle: Maths for IT\ncontents:\n  - title: First Steps\n    tutorials:\n      - grid-of-numbers\n      - other\n",
  "tutorials/grid-of-numbers/grid-of-numbers.md":
    "---\ntitle: Counting Grids\nstatus: live\n---\n\n# Counting Grids\n\n![A grid](grid.svg)\n",
  "tutorials/grid-of-numbers/grid-of-numbers-practice.md":
    "---\ntitle: Practice\nstatus: live\npractice_for: grid-of-numbers\n---\n\n# Practice\n",
  "tutorials/other/other.md":
    "---\ntitle: Other\nstatus: live\n---\n\n# Other\n\nSee [grids](tutorial:grid-of-numbers).\n",
  "tutorials/scratch/scratch.md": "---\ntitle: Scratch\nstatus: draft\n---\n\n# Scratch\n",
  "pages/about.md": "---\ntitle: About\n---\n\n# About\n\nA page.\n",
};

async function open(page: Page, query: string) {
  await page.goto(BUILT_APP);
  await page.evaluate(
    (files) => (globalThis as any).__dewnote.useStubStore(files, false, ["tutorials/grid-of-numbers/grid.svg"]),
    WORKSPACE,
  );
  await page.locator(".dn-wp-input").fill(query);
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown")).toBeVisible();
}

async function command(page: Page, name: string) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill(name);
  await page.keyboard.press("Enter");
}

const applied = (page: Page) => page.evaluate(() => (globalThis as any).__dewnoteApplied);

test("renaming a tutorial suggests an id from its title, says what will change, and opens it at its new path", async ({ page }) => {
  await open(page, "counting grids");
  await command(page, "rename this tutorial");

  const input = page.locator(".dn-ask input");
  await expect(input).toHaveValue("counting-grids");
  await page.locator(".dn-ask .dn-ask-go").click();

  const confirm = page.locator(".dn-ask-choices");
  await expect(confirm).toContainText("Rename grid-of-numbers to counting-grids");
  await expect(confirm).toContainText("Moves tutorials/grid-of-numbers/ to tutorials/counting-grids/ (3 files).");
  await expect(confirm).toContainText("Readers' saved answers are kept under the old id");
  await confirm.locator(".dn-ask-choice", { hasText: "Rename" }).first().click();

  await expect(page.locator(".dn-spine-file")).toContainText("counting-grids.md");
  const batches = await applied(page);
  expect(batches).toHaveLength(1);
  expect(batches[0].message).toBe("Rename grid-of-numbers to counting-grids");
  const paths = batches[0].changes.map((change: any) => change.path ?? change.to);
  expect(paths).toContain("courses/maths.yaml");
  expect(paths).toContain("tutorials/other/other.md");
  expect(paths).toContain("courses/redirects.yaml");
  expect(paths).toContain("tutorials/counting-grids/grid.svg");

  // The palette finds it under the new path, and nothing under the old.
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("grid-of-numbers");
  await expect(page.locator(".dn-wp-list")).not.toContainText("tutorials/grid-of-numbers/");
});

test("keeping the old id changes nothing", async ({ page }) => {
  await open(page, "counting grids");
  await command(page, "rename this tutorial");
  await page.locator(".dn-ask .dn-ask-go").click();
  await page.locator(".dn-ask-choice", { hasText: "Keep the old id" }).click();
  expect(await applied(page)).toHaveLength(0);
  await expect(page.locator(".dn-spine-file")).toContainText("grid-of-numbers.md");
});

test("a tutorial another page links to cannot be deleted, and the refusal names the page", async ({ page }) => {
  await open(page, "counting grids");
  await command(page, "delete this tutorial");
  await expect(page.locator(".dn-spine-problem")).toContainText("tutorials/other/other.md links to it");
  expect(await applied(page)).toHaveLength(0);
});

test("deleting a draft takes out its folder and its course line, and leaves no document open", async ({ page }) => {
  await open(page, "scratch");
  await command(page, "delete this tutorial");
  const confirm = page.locator(".dn-ask-choices");
  await expect(confirm).toContainText("Delete the tutorial scratch");
  await expect(confirm).not.toContainText("It is published");
  await confirm.locator(".dn-ask-choice", { hasText: "Delete" }).click();

  await expect(page.locator(".dn-empty")).toContainText("No document open");
  const [batch] = await applied(page);
  expect(batch.changes).toEqual([{ kind: "remove", path: "tutorials/scratch/scratch.md" }]);
});

test("a page outside tutorials/ moves to a new path", async ({ page }) => {
  await open(page, "about");
  await command(page, "move or rename this file");
  const input = page.locator(".dn-ask input");
  await expect(input).toHaveValue("pages/about.md");
  await input.fill("pages/team/about-us.md");
  await page.locator(".dn-ask .dn-ask-go").click();

  await expect(page.locator(".dn-spine-file")).toContainText("about-us.md");
  const [batch] = await applied(page);
  expect(batch.changes.map((change: any) => change.kind)).toEqual(["write", "remove"]);
});
