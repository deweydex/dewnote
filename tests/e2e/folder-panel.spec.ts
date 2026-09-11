// The folder rail (src/folder-panel.ts, src/folder-store.ts) — the rest
// of step 4. Playwright can't drive the OS's own directory-picker dialog
// the way it can synthesize a dropped File (there's no scriptable
// equivalent of setInputFiles for showDirectoryPicker), so this stubs
// `window.showDirectoryPicker` itself before navigation with a plain JS
// object matching the shape folder-store.ts actually calls: `.name`,
// `.entries()`, and per file a `getFile()`/`createWritable()` pair —
// real interaction with the real built app and the real editor, just
// with the one API neither Playwright nor this sandbox can reach
// stubbed at the boundary, the same principle repo-panel.spec.ts
// applies to GitHub's REST API via page.route.

import { test as base, expect, type Page } from "@playwright/test";
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

/** Installs a fake `showDirectoryPicker` before the app's own module
 * script runs, so `supportsDirectoryPicker()` sees it and the real
 * walk/read/write calls in folder-store.ts run against this fake tree
 * instead of a real filesystem. */
async function stubDirectoryPicker(page: Page) {
  await page.addInitScript(() => {
    const writes: Record<string, string> = {};

    function fakeFileHandle(name: string, content: string) {
      return {
        kind: "file",
        name,
        async getFile() {
          return { text: async () => writes[name] ?? content };
        },
        async createWritable() {
          return {
            async write(next: string) {
              writes[name] = next;
            },
            async close() {},
          };
        },
      };
    }

    function fakeDirHandle(name: string, entries: Record<string, unknown>) {
      return {
        kind: "directory",
        name,
        async *entries() {
          for (const [key, value] of Object.entries(entries)) yield [key, value];
        },
      };
    }

    const root = fakeDirHandle("tutorials", {
      "README.md": fakeFileHandle("README.md", "# Read Me\n\nTop level.\n"),
      content: fakeDirHandle("content", {
        "a-rule.md": fakeFileHandle("a-rule.md", "# A Rule\n\nWhere it lives.\n"),
      }),
    });

    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => root;
  });
}

test.beforeEach(async ({ page }) => {
  await stubDirectoryPicker(page);
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
});

test("the folder toggle is enabled once a directory picker exists", async ({ page }) => {
  await expect(page.locator(".dn-folder-toggle")).toBeEnabled();
});

test("opening a folder lists its markdown files recursively, and search filters them", async ({ page }) => {
  await page.locator(".dn-folder-toggle").click();
  await page.locator(".dn-folder-open").click();

  await expect(page.locator(".dn-folder-status").first()).toHaveText('2 markdown files in "tutorials".');
  const items = page.locator(".dn-folder-file");
  await expect(items).toHaveCount(2);

  await page.locator(".dn-folder-search").fill("content");
  await expect(page.locator(".dn-folder-file")).toHaveCount(1);
  await expect(page.locator(".dn-folder-file")).toHaveText("content/a-rule.md");
});

test("opening a file renders it in the editor and hands Save to the file bar as a real handle", async ({ page }) => {
  await page.locator(".dn-folder-toggle").click();
  await page.locator(".dn-folder-open").click();
  await page.locator(".dn-folder-file", { hasText: "a-rule.md" }).click();

  await expect(page.locator("h1")).toHaveText("A Rule");
  await expect(page.locator(".dn-file-name")).toHaveText("content/a-rule.md");
  // A folder-opened file carries a real writable handle, same as the
  // single-file picker path — "saved", not the handle-less "downloaded".
  await expect(page.locator(".dn-file-status")).toHaveText("saved");

  await page.locator(".dn-block-render").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited via the folder rail.");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(page.locator(".dn-file-status")).toHaveText("unsaved");

  await page.locator(".dn-file-save").click();
  await expect(page.locator(".dn-file-status")).toHaveText("saved");
});
