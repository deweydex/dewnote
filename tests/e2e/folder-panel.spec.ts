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

    // getDirectoryHandle/getFileHandle mutate the same `entries` record
    // `entries()` itself iterates — so a file or directory created
    // through one is visible through the other on the very next walk,
    // the same as a real filesystem, letting createFile's own directory-
    // creation-on-demand and the "already exists" check below be
    // exercised for real rather than assumed to work against the fake.
    function fakeDirHandle(name: string, entries: Record<string, unknown>) {
      return {
        kind: "directory",
        name,
        async *entries() {
          for (const [key, value] of Object.entries(entries)) yield [key, value];
        },
        async getDirectoryHandle(childName: string, options?: { create?: boolean }) {
          let child = entries[childName];
          if (!child) {
            if (!options?.create) throw new Error(`"${childName}" not found`);
            child = fakeDirHandle(childName, {});
            entries[childName] = child;
          }
          return child;
        },
        async getFileHandle(childName: string, options?: { create?: boolean }) {
          let child = entries[childName];
          if (!child) {
            if (!options?.create) throw new Error(`"${childName}" not found`);
            child = fakeFileHandle(childName, "");
            entries[childName] = child;
          }
          return child;
        },
      };
    }

    // A real `Object.entries` re-walked on every `entries()` call, not a
    // snapshot taken once — so a file added to it after the folder is
    // first opened is genuinely invisible until the next walk, the same
    // as a real filesystem, letting the Refresh test below simulate a
    // change made outside dewnote between an open and a refresh.
    const contentEntries: Record<string, unknown> = {
      "a-rule.md": fakeFileHandle("a-rule.md", "---\ntitle: A Rule\nslug: a-rule\n---\n\n# A Rule\n\nWhere it lives.\n"),
    };

    const root = fakeDirHandle("tutorials", {
      "README.md": fakeFileHandle("README.md", "# Read Me\n\nTop level.\n"),
      "a-series.order.yaml": fakeFileHandle("a-series.order.yaml", "series: A Series\norder:\n  - a-rule\n"),
      content: fakeDirHandle("content", contentEntries),
    });

    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => root;
    (window as unknown as { __testAddFile(name: string, content: string): void }).__testAddFile = (name, content) => {
      contentEntries[name] = fakeFileHandle(name, content);
    };
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

  await expect(page.locator(".dn-folder-status").first()).toHaveText('2 markdown files, 1 order file, in "tutorials".');
  const items = page.locator(".dn-folder-file");
  await expect(items).toHaveCount(3);

  await page.locator(".dn-folder-search").fill("content");
  await expect(page.locator(".dn-folder-file")).toHaveCount(1);
  await expect(page.locator(".dn-folder-file")).toHaveText("content/a-rule.md");
});

// Step 4's own follow-up, raised alongside the series view: there is no
// browser API that watches a local folder for changes, so seeing what
// changed outside dewnote means asking for it — Refresh re-walks the
// already-open folder without reopening the OS picker.
test("Refresh re-scans the open folder, picking up a file added outside dewnote, without reopening the picker", async ({ page }) => {
  await page.locator(".dn-folder-toggle").click();
  await expect(page.locator(".dn-folder-refresh")).toBeDisabled();

  await page.locator(".dn-folder-open").click();
  await expect(page.locator(".dn-folder-file")).toHaveCount(3);
  await expect(page.locator(".dn-folder-refresh")).toBeEnabled();

  await page.evaluate(() => {
    (window as unknown as { __testAddFile(name: string, content: string): void }).__testAddFile(
      "new-page.md",
      "# New Page\n\nAdded after opening.\n",
    );
  });

  // Not visible yet — the folder was only walked once, on open.
  await expect(page.locator(".dn-folder-file")).toHaveCount(3);

  await page.locator(".dn-folder-refresh").click();
  await expect(page.locator(".dn-folder-status").first()).toHaveText('3 markdown files, 1 order file, in "tutorials".');
  await expect(page.locator(".dn-folder-file")).toHaveCount(4);
  await expect(page.locator(".dn-folder-file", { hasText: "new-page.md" })).toBeVisible();
});

// Step 4's own follow-up, raised alongside the series view: an
// .order.yaml file is now just another file in the browsable list —
// opening one hands it to the same editor and Save path every markdown
// file already gets, so hand-editing a reading order needs no UI this
// repo doesn't already have.
test("an .order.yaml file opens and saves through the ordinary file bar, same as any markdown file", async ({ page }) => {
  await page.locator(".dn-folder-toggle").click();
  await page.locator(".dn-folder-open").click();
  await page.locator(".dn-folder-file", { hasText: "a-series.order.yaml" }).click();

  await expect(page.locator(".dn-file-name")).toHaveText("a-series.order.yaml");
  await expect(page.locator(".dn-file-status")).toHaveText("saved");

  await page.keyboard.press("ControlOrMeta+/");
  const editor = page.locator(".dn-source-editor .cm-content");
  await expect(editor).toContainText("series: A Series");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n  - a-new-tutorial");
  await page.locator(".dn-source-close").click();

  await expect(page.locator(".dn-file-status")).toHaveText("unsaved");
  await page.locator(".dn-file-save").click();
  await expect(page.locator(".dn-file-status")).toHaveText("saved");
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

// file-index.ts's own side: opening a folder builds the front-matter
// index (plan §5.10) that link-picker.ts searches — checked here through
// the link picker itself, since that's the only observable consumer, not
// by reaching into folder-panel.ts's internals.
test("opening a folder builds the file index the link picker searches", async ({ page }) => {
  await page.locator(".dn-folder-toggle").click();
  await page.locator(".dn-folder-open").click();
  await expect(page.locator(".dn-folder-file")).toHaveCount(3);
  await page.locator(".dn-folder-close").click();

  const gap = page.locator(".dn-add-gap").first();
  await gap.hover();
  await gap.locator(".dn-add-btn").click();
  await gap.locator(".dn-add-menu button", { hasText: "Link" }).click();

  const items = page.locator(".dn-link-item button");
  await expect(items).toHaveCount(2);
  await expect(items).toContainText(["README.md", "A Rule"]);
});

// active-store.ts's own "open this path" hook, exercised through the
// series panel — a series listing a real, indexed slug is a real
// clickable button there, opening the exact file this folder already
// has, the same as clicking it directly in this rail's own file list.
test("the series panel can open a listed tutorial by clicking it", async ({ page }) => {
  await page.locator(".dn-folder-toggle").click();
  await page.locator(".dn-folder-open").click();
  await expect(page.locator(".dn-folder-file")).toHaveCount(3);
  await page.locator(".dn-folder-close").click();

  await page.locator(".dn-series-toggle").click();
  await expect(page.locator(".dn-series-module h3")).toHaveText("(no module)");
  const link = page.locator(".dn-series-link", { hasText: "A Rule" });
  await expect(link).toBeVisible();
  await link.click();

  await expect(page.locator("h1")).toHaveText("A Rule");
  await expect(page.locator(".dn-block-render").filter({ hasText: "Where it lives." })).toBeVisible();
});

// active-store.ts's own createFile, exercised through the series
// panel's "New series" form — a real write through folder-store.ts's
// own createFile, creating a genuinely new file (and, when a module is
// given, a genuinely new directory) rather than editing one that
// already exists.
test("the series panel can create a new series, which then appears in the series list", async ({ page }) => {
  await page.locator(".dn-folder-toggle").click();
  await page.locator(".dn-folder-open").click();
  await page.locator(".dn-folder-close").click();

  await page.locator(".dn-series-toggle").click();
  await page.locator(".dn-series-create-field[placeholder^='Module']").fill("a-new-module");
  await page.locator(".dn-series-create-field[placeholder='series-slug']").fill("a-new-series");
  await page.locator(".dn-series-create-field[placeholder='Series title']").fill("A New Series");
  await page.locator(".dn-series-create-button").click();

  await expect(page.locator(".dn-series-create-status")).toHaveText("Created a-new-module/a-new-series.order.yaml.");
  await expect(page.locator(".dn-series-block h4", { hasText: "A New Series" })).toBeVisible();

  // The fields clear on success, ready for the next one.
  await expect(page.locator(".dn-series-create-field[placeholder^='Module']")).toHaveValue("");
});

test("creating a series with a slug already in use reports the real error, rather than silently overwriting it", async ({ page }) => {
  await page.locator(".dn-folder-toggle").click();
  await page.locator(".dn-folder-open").click();
  await page.locator(".dn-folder-close").click();

  await page.locator(".dn-series-toggle").click();
  await page.locator(".dn-series-create-field[placeholder='series-slug']").fill("a-series");
  await page.locator(".dn-series-create-field[placeholder='Series title']").fill("Duplicate");
  await page.locator(".dn-series-create-button").click();

  await expect(page.locator(".dn-series-create-status")).toHaveText('"a-series.order.yaml" already exists.');
});

// active-store.ts's own createFile again, this time through the folder
// rail's own "New tutorial" form — the other named item on step 4's own
// line, alongside "New series" above. Writes a real file at DIALECTS.md
// §1's own layout (`<module>/<slug>/<slug>.md`) with dewlab's required
// front matter fields filled in, then re-runs the folder's own load pass
// so the new file is immediately visible and openable, same as any file
// already there.
test("the folder rail can create a new tutorial from a template, which then appears in the file list and opens", async ({
  page,
}) => {
  await page.locator(".dn-folder-toggle").click();
  await expect(page.locator(".dn-folder-create-button")).toBeDisabled();

  await page.locator(".dn-folder-open").click();
  await expect(page.locator(".dn-folder-create-button")).toBeEnabled();

  await page.locator(".dn-folder-create-field[placeholder='Module (leave blank if already inside one)']").fill("a-module");
  await page.locator(".dn-folder-create-field[placeholder='tutorial-slug']").fill("a-tutorial");
  await page.locator(".dn-folder-create-field[placeholder='Title']").fill("A Tutorial");
  await page.locator(".dn-folder-create-field[placeholder='Module title (e.g. Getting Started)']").fill("A Module");
  await page.locator(".dn-folder-create-field[placeholder='Series slug (matches a .order.yaml)']").fill("a-series");
  await page.locator(".dn-folder-create-button").click();

  await expect(page.locator(".dn-folder-create-status")).toHaveText("Created a-module/a-tutorial/a-tutorial.md.");
  // Fields clear on success, ready for the next one — the year field is
  // left alone (defaulted, not cleared) since it's still the right value.
  await expect(page.locator(".dn-folder-create-field[placeholder='tutorial-slug']")).toHaveValue("");

  const item = page.locator(".dn-folder-file", { hasText: "a-module/a-tutorial/a-tutorial.md" });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.locator("h1")).toHaveText("A Tutorial");
});

test("creating a tutorial at a path that already exists reports the real error, rather than silently overwriting it", async ({
  page,
}) => {
  await page.locator(".dn-folder-toggle").click();
  await page.locator(".dn-folder-open").click();

  await page.locator(".dn-folder-create-field[placeholder='tutorial-slug']").fill("a-rule");
  await page.locator(".dn-folder-create-field[placeholder='Title']").fill("A Rule");
  await page.locator(".dn-folder-create-field[placeholder='Module title (e.g. Getting Started)']").fill("Content");
  await page.locator(".dn-folder-create-field[placeholder='Series slug (matches a .order.yaml)']").fill("a-series");
  // Left blank: the module field means "use the already-open folder's
  // own name" here — that folder is "tutorials", not "content", so this
  // deliberately doesn't collide with the existing content/a-rule.md.
  // A genuine collision needs the same module/slug twice.
  await page.locator(".dn-folder-create-button").click();
  await expect(page.locator(".dn-folder-create-status")).toHaveText("Created a-rule/a-rule.md.");

  await page.locator(".dn-folder-create-field[placeholder='tutorial-slug']").fill("a-rule");
  await page.locator(".dn-folder-create-field[placeholder='Title']").fill("A Rule Again");
  await page.locator(".dn-folder-create-field[placeholder='Module title (e.g. Getting Started)']").fill("Content");
  await page.locator(".dn-folder-create-field[placeholder='Series slug (matches a .order.yaml)']").fill("a-series");
  await page.locator(".dn-folder-create-button").click();

  await expect(page.locator(".dn-folder-create-status")).toHaveText('"a-rule/a-rule.md" already exists.');
});
