// Step 8's link picker (src/link-picker.ts, backed by src/file-index.ts) —
// plan §6's own note that it "has the same multi-file dependency as the
// front-matter picker." Drives the real built app: seed a file index
// through the same window.__dewnote test hook other specs use to mount a
// document, open the picker from the add menu, and check both the
// indexed-entry path and the custom-link fallback.

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
  getSource(): string;
  setFileIndex(index: { path: string; title?: string; slug?: string }[]): void;
};

async function mount(page: import("@playwright/test").Page, source: string) {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
  await page.evaluate((src) => (window as unknown as { __dewnote: TestHook }).__dewnote.mount(src), source);
}

async function getSource(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __dewnote: TestHook }).__dewnote.getSource());
}

async function openLinkPicker(page: import("@playwright/test").Page, gapIndex: number) {
  const gap = page.locator(".dn-add-gap").nth(gapIndex);
  await gap.hover();
  await gap.locator(".dn-add-btn").click();
  await gap.locator(".dn-add-menu button", { hasText: "Link" }).click();
}

test("picking an indexed entry inserts a tutorial: link built from its slug", async ({ page }) => {
  await mount(page, "One.\n\nTwo.\n");
  await page.evaluate(() => {
    (window as unknown as { __dewnote: TestHook }).__dewnote.setFileIndex([
      { path: "tutorials/filter-evening.md", title: "Filtering evening readings", slug: "filter-evening" },
      { path: "tutorials/no-slug.md", title: "Has no slug" },
    ]);
  });

  await openLinkPicker(page, 1);
  await expect(page.locator(".dn-link-item button")).toHaveCount(2);

  await page.locator(".dn-link-search").fill("filtering");
  await expect(page.locator(".dn-link-item button")).toHaveCount(1);
  await page.locator(".dn-link-item button", { hasText: "Filtering evening readings" }).click();

  const source = await getSource(page);
  expect(source).toContain("[Filtering evening readings](tutorial:filter-evening)");
  expect(source.indexOf("One.")).toBeLessThan(source.indexOf("[Filtering"));
  expect(source.indexOf("[Filtering")).toBeLessThan(source.indexOf("Two."));
});

test("an indexed entry with no slug falls back to its path", async ({ page }) => {
  await mount(page, "One.\n");
  await page.evaluate(() => {
    (window as unknown as { __dewnote: TestHook }).__dewnote.setFileIndex([{ path: "tutorials/no-slug.md", title: "Has no slug" }]);
  });

  await openLinkPicker(page, 0);
  await page.locator(".dn-link-item button", { hasText: "Has no slug" }).click();

  const source = await getSource(page);
  expect(source).toContain("[Has no slug](tutorials/no-slug.md)");
});

test("with no index yet, a custom link can still be inserted directly", async ({ page }) => {
  await mount(page, "One.\n");

  await openLinkPicker(page, 0);
  await expect(page.locator(".dn-link-item")).toHaveCount(0);
  await expect(page.locator(".dn-link-hint")).toContainText("No indexed tutorials yet");

  await page.locator(".dn-link-text").fill("dewlab");
  await page.locator(".dn-link-url").fill("https://dewlab.example/");
  await page.locator(".dn-link-insert").click();

  const source = await getSource(page);
  expect(source).toContain("[dewlab](https://dewlab.example/)");
});

test("module and series values from the index are offered alongside tutorials, each badged", async ({ page }) => {
  await mount(page, "One.\n\nTwo.\n");
  await page.evaluate(() => {
    (
      window as unknown as {
        __dewnote: TestHook & { setFileIndex(index: { path: string; title?: string; slug?: string; module?: string; series?: string }[]): void };
      }
    ).__dewnote.setFileIndex([
      { path: "tutorials/a.md", title: "Filtering", slug: "filtering", module: "computational-methods", series: "core" },
      { path: "tutorials/b.md", title: "Grouping", slug: "grouping", module: "computational-methods", series: "advanced" },
    ]);
  });

  await openLinkPicker(page, 1);
  // Two tutorials, one module (shared by both), two series.
  await expect(page.locator(".dn-link-item button")).toHaveCount(5);

  const moduleItem = page.locator(".dn-link-item button", { hasText: "computational-methods" });
  await expect(moduleItem.locator(".dn-link-item-kind")).toHaveText("Module");
  await expect(page.locator(".dn-link-item button", { hasText: "Filtering" }).locator(".dn-link-item-kind")).toHaveCount(0);

  await page.locator(".dn-link-search").fill("computational");
  await expect(page.locator(".dn-link-item button")).toHaveCount(1);
  await moduleItem.click();

  const source = await getSource(page);
  expect(source).toContain("[computational-methods](module:computational-methods)");
});

test("search is case-insensitive and matches a series name shared by several tutorials, not just a title", async ({ page }) => {
  await mount(page, "One.\n");
  await page.evaluate(() => {
    (
      window as unknown as {
        __dewnote: TestHook & { setFileIndex(index: { path: string; title?: string; slug?: string; module?: string; series?: string }[]): void };
      }
    ).__dewnote.setFileIndex([
      { path: "tutorials/a.md", title: "Filtering Rows", slug: "filtering", module: "computational-methods", series: "core" },
      { path: "tutorials/b.md", title: "Web Basics", slug: "web-basics", module: "web-authoring", series: "core" },
    ]);
  });

  await openLinkPicker(page, 0);
  // Two tutorials, two modules, and one series — both tutorials share
  // "core", so it appears exactly once, not twice.
  await expect(page.locator(".dn-link-item button")).toHaveCount(5);

  // Uppercase query, matches the lowercase "core" series exactly once —
  // not the two tutorials that merely belong to it.
  await page.locator(".dn-link-search").fill("CORE");
  await expect(page.locator(".dn-link-item button")).toHaveCount(1);
  await expect(page.locator(".dn-link-item-kind")).toHaveText("Series");

  // A tutorial's own title still matches too, same as before this
  // picker also had modules and series to search.
  await page.locator(".dn-link-search").fill("Filtering");
  await expect(page.locator(".dn-link-item button")).toHaveCount(1);
  await expect(page.locator(".dn-link-item button")).toHaveText("Filtering Rows");
});

test("Escape cancels the picker without inserting anything", async ({ page }) => {
  await mount(page, "One.\n");
  await openLinkPicker(page, 0);
  await expect(page.locator(".dn-link-overlay")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".dn-link-overlay")).toHaveCount(0);
  expect(await getSource(page)).toBe("One.\n");
});
