// The practice-page blocks (PEDAGOGICAL_STYLE_GUIDE §6) — the problem,
// its stepped hint, and the answer behind a fold beside it.
//
// dewlab styles exactly two folds: `check_folds` accepts `dl-hint` and
// `dl-answer` and fails the build on anything else. This editor could
// write the first and not the second, so an answer — the whole point of
// a practice page — could not be inserted at all. What is checked here is
// the markdown that lands, because that markdown is what dewlab's build
// reads.

import { test as base, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { openAddMenu, pointAt } from "./block-controls.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");

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

const TUTORIAL = ["---", "title: First Steps", "year: 2026", "version: 2026.09.15.1", "---", "", "Words.", ""].join("\n");
const PRACTICE = [
  "---",
  "title: First Steps — Practice",
  "year: 2026",
  "version: 2026.09.15.1",
  "practice_for: first-steps",
  "---",
  "",
  "Words.",
  "",
].join("\n");

async function mount(page: Page, source: string) {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
  await page.evaluate((s) => (window as unknown as { __dewnote: { mount(x: string): void } }).__dewnote.mount(s), source);
}

async function getSource(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __dewnote: { getSource(): string } }).__dewnote.getSource());
}

async function menuLabels(page: Page, blockIndex: number): Promise<string[]> {
  await openAddMenu(page, blockIndex);
  return page.locator(".dn-add-menu button").allInnerTexts();
}

test("a tutorial's add menu doesn't offer them, and a practice page's does", async ({ page }) => {
  // Six items is already a long menu, and an answer fold on a tutorial
  // page is an invitation to write something §6 says belongs beside the
  // problem on the practice page.
  await mount(page, TUTORIAL);
  expect(await menuLabels(page, 1)).toEqual(["Paragraph", "Code cell", "Math", "Hint", "Image", "Link"]);

  await mount(page, PRACTICE);
  expect(await menuLabels(page, 1)).toEqual([
    "Paragraph",
    "Code cell",
    "Math",
    "Hint",
    "Image",
    "Link",
    "Practice problem",
    "Answer",
  ]);
});

test("adding practice_for mid-edit is enough — the menu follows the document", async ({ page }) => {
  // The menu is filled when it opens rather than at mount, so a document
  // that becomes a practice page while being written doesn't have to be
  // reopened to get the blocks for it.
  await mount(page, TUTORIAL);
  expect(await menuLabels(page, 1)).not.toContain("Answer");
  await page.keyboard.press("Escape");

  await page.evaluate(() => {
    const hook = window as unknown as { __dewnote: { getSource(): string; mount(s: string): void } };
    hook.__dewnote.mount(hook.__dewnote.getSource().replace("year: 2026", "year: 2026\npractice_for: first-steps"));
  });
  expect(await menuLabels(page, 1)).toContain("Answer");
});

test("a practice problem lands as the whole §6 form, in order", async ({ page }) => {
  await mount(page, PRACTICE);
  await openAddMenu(page, 1);
  await page.locator(".dn-add-menu button", { hasText: "Practice problem" }).click();

  const source = await getSource(page);
  // The problem, then the hint, then the answer — "two folds, opened in
  // order, so a stuck student gets a route rather than the answer".
  const problem = source.indexOf("The problem, written as a question.");
  const hint = source.indexOf('class="dl-hint"');
  const answer = source.indexOf('class="dl-answer"');
  expect(problem).toBeGreaterThan(-1);
  expect(problem).toBeLessThan(hint);
  expect(hint).toBeLessThan(answer);

  // The two prompts §6 says matter as much as the steps, so an author
  // deletes them deliberately rather than having to remember them.
  expect(source).toContain("**Think about:**");
  expect(source).toContain("**Try this next:**");
  expect(source).toContain("<summary>stuck? here are some steps</summary>");
});

test("both folds carry a class dewlab styles, which is what its build checks", async ({ page }) => {
  await mount(page, PRACTICE);
  await openAddMenu(page, 1);
  await page.locator(".dn-add-menu button", { hasText: "Practice problem" }).click();

  const source = await getSource(page);
  // check_folds: "a fold names no style ... use class="dl-hint" for
  // steps or class="dl-answer" for an answer". Every <details> written
  // here has to satisfy it or the page stops building.
  const details = [...source.matchAll(/<details[^>]*>/g)].map((m) => m[0]);
  expect(details.length).toBe(2);
  for (const tag of details) {
    expect(tag, `${tag} names a fold dewlab styles`).toMatch(/class="dl-(hint|answer)"/);
  }
});

test("an answer on its own, for a problem that already exists", async ({ page }) => {
  await mount(page, PRACTICE);
  await openAddMenu(page, 1);
  await page.locator(".dn-add-menu button", { hasText: "Answer" }).click();

  const source = await getSource(page);
  expect(source).toContain('<details class="dl-answer"><summary>answer</summary>');
  expect(source).toContain("The answer, with the working.");
  expect(source).not.toContain("dl-hint");
});

test("the slash menu offers them on a practice page too", async ({ page }) => {
  await mount(page, PRACTICE);
  // A fresh paragraph, then "/" — the slash menu only offers itself to a
  // block that is nothing else yet.
  await pointAt(page, 1);
  await page.locator(".dn-add-btn").click();
  await page.locator(".dn-add-menu button", { hasText: "Paragraph" }).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("/pr");

  const items = page.locator(".dn-slash-menu button");
  await expect(items).toHaveCount(1);
  await expect(items).toHaveText("Practice problem");
});
