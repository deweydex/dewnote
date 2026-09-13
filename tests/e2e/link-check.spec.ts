// Step 5's "link checking against real slugs" (src/link-check.ts) —
// drives the real built app: seed a file index the same way
// link-picker.spec.ts does, mount a document with both a real and a
// broken tutorial: link, and check the report names only the broken one.

import { test as base, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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

type TestHook = {
  mount(source: string): void;
  setFileIndex(index: { path: string; title?: string; slug?: string; module?: string; series?: string }[]): void;
};

test.beforeEach(async ({ page }) => {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
});

test("reports a tutorial: link whose slug isn't in the index, and clears once fixed", async ({ page }) => {
  await page.evaluate(() => {
    const hook = window as unknown as { __dewnote: TestHook };
    hook.__dewnote.setFileIndex([{ path: "tutorials/data/filtering/filtering.md", slug: "filtering", title: "Filtering" }]);
    hook.__dewnote.mount("See [filtering](tutorial:filtering) and [sorting](tutorial:sorting).\n");
  });

  await page.locator(".dn-linkcheck-toggle").click();
  await page.locator(".dn-linkcheck-run").click();

  const report = page.locator(".dn-linkcheck-report li");
  await expect(report).toHaveCount(1);
  await expect(report).toContainText("sorting");
  await expect(report).toContainText("tutorial:sorting");
});

test("with every link resolving, the report says so instead of listing nothing silently", async ({ page }) => {
  await page.evaluate(() => {
    const hook = window as unknown as { __dewnote: TestHook };
    hook.__dewnote.setFileIndex([{ path: "tutorials/data/filtering/filtering.md", slug: "filtering", title: "Filtering" }]);
    hook.__dewnote.mount("See [filtering](tutorial:filtering) for more.\n");
  });

  await page.locator(".dn-linkcheck-toggle").click();
  await page.locator(".dn-linkcheck-run").click();

  await expect(page.locator(".dn-linkcheck-report li")).toHaveText("No broken links found.");
});

test("checks module: and series: links too, against distinct values in the index, not just tutorial: slugs", async ({ page }) => {
  await page.evaluate(() => {
    const hook = window as unknown as { __dewnote: TestHook };
    hook.__dewnote.setFileIndex([
      { path: "tutorials/a.md", slug: "filtering", module: "computational-methods", series: "core" },
    ]);
    hook.__dewnote.mount(
      "See the [module](module:computational-methods), the [series](series:core), and [a typo'd module](module:computationl-methods).\n",
    );
  });

  await page.locator(".dn-linkcheck-toggle").click();
  await page.locator(".dn-linkcheck-run").click();

  const report = page.locator(".dn-linkcheck-report li");
  await expect(report).toHaveCount(1);
  await expect(report).toContainText("a typo'd module");
  await expect(report).toContainText("module:computationl-methods");
});

test("the command palette can open the link checker too", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-palette-input").fill("Check links");
  await page.locator(".dn-palette-item button").first().click();
  await expect(page.locator(".dn-linkcheck-panel")).toBeVisible();
});
