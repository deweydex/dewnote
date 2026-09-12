// Step 4's own "the series view from order.yaml" (src/series.ts,
// src/series-panel.ts) — drives the real built app: seed series data
// and a file index the same way link-picker.spec.ts and
// link-check.spec.ts do, open the rail, and check it groups by module,
// orders each series correctly, and prefers an indexed title over a
// bare slug.

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
  setFileIndex(index: { path: string; title?: string; slug?: string }[]): void;
  setSeries(series: { module: string; slug: string; title: string; order: string[] }[]): void;
};

test.beforeEach(async ({ page }) => {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
});

test("groups series by module, in reading order, preferring an indexed title over the bare slug", async ({ page }) => {
  await page.evaluate(() => {
    const hook = window as unknown as { __dewnote: TestHook };
    hook.__dewnote.setFileIndex([{ path: "tutorials/computational-methods/first-steps/first-steps.md", slug: "first-steps", title: "First Steps" }]);
    hook.__dewnote.setSeries([
      {
        module: "computational-methods",
        slug: "python-fundamentals",
        title: "Python fundamentals",
        order: ["first-steps", "working-with-tables"],
      },
    ]);
  });

  await page.locator(".dn-series-toggle").click();
  await expect(page.locator(".dn-series-module h3")).toHaveText("computational-methods");
  await expect(page.locator(".dn-series-block h4")).toHaveText("Python fundamentals");

  const items = page.locator(".dn-series-list li");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveText("First Steps");
  await expect(items.nth(1)).toHaveText("working-with-tables");
});

test("several series in different modules each get their own section", async ({ page }) => {
  await page.evaluate(() => {
    const hook = window as unknown as { __dewnote: TestHook };
    hook.__dewnote.setSeries([
      { module: "database-methods", slug: "first-database", title: "A table of your own", order: ["a-table-is-a-list-of-rows"] },
      { module: "computational-methods", slug: "python-fundamentals", title: "Python fundamentals", order: ["first-steps"] },
    ]);
  });

  await page.locator(".dn-series-toggle").click();
  const modules = page.locator(".dn-series-module h3");
  await expect(modules).toHaveCount(2);
  // Alphabetical, not insertion order.
  await expect(modules.nth(0)).toHaveText("computational-methods");
  await expect(modules.nth(1)).toHaveText("database-methods");
});

test("with no series data at all, the panel says so instead of showing nothing", async ({ page }) => {
  await page.locator(".dn-series-toggle").click();
  await expect(page.locator(".dn-series-empty")).toBeVisible();
});

test("the command palette can open the series rail too", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-palette-input").fill("Series");
  await page.locator(".dn-palette-item button").first().click();
  await expect(page.locator(".dn-series-panel")).toBeVisible();
});
