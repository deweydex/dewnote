// The workspace palette (src/workspace-palette.ts) — planning/UI_REVIEW.md
// §5's own "a palette that indexed the workspace rather than the rails."
// The ranking and the preview's text are unit-tested in
// src/workspace-palette.test.ts; this drives the real built app for the
// half that needs a browser: the key, the keyboard, the preview pane
// filling from a file the store reads, and a row that opens a document.

import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");

const TUTORIAL = [
  "---",
  "title: Grid of Numbers",
  "---",
  "",
  "# Grid of Numbers",
  "",
  "A matrix is a grid of numbers, and every row is the same length.",
  "",
  "## Reading one",
  "",
  "Rows first, then columns.",
  "",
].join("\n");

const PRACTICE = "---\ntitle: Grid of Numbers — Practice\npractice_for: grid-of-numbers\n---\n\n# Practice\n";
const PAGE = "---\ntitle: About this project\n---\n\n# About this project\n\ndewlab is an open educational project.\n";
const MODULE = "title: Computational Methods\ncontents:\n- title: Matrices\n  tutorials:\n  - grid-of-numbers\n";

/** A folder the app can walk and write back through, built in the page
 * so no real File System Access implementation is needed. Records every
 * write, so a test can check what actually reached disk. */
async function stubFolder(page: Page): Promise<void> {
  await page.addInitScript(
    (data: Record<string, string>) => {
      interface Node { dirs: Map<string, Node>; files: Map<string, string> }
      const root: Node = { dirs: new Map(), files: new Map() };
      (window as unknown as { __written: Record<string, string> }).__written = {};
      for (const [path, content] of Object.entries(data)) {
        const parts = path.split("/");
        let node = root;
        for (const part of parts.slice(0, -1)) {
          if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: new Map() });
          node = node.dirs.get(part)!;
        }
        node.files.set(parts[parts.length - 1]!, content);
      }
      const file = (name: string, node: Node, path: string) => ({
        kind: "file",
        name,
        async getFile() { const text = node.files.get(name)!; return { name, text: async () => text }; },
        async createWritable() {
          return {
            async write(value: string) {
              node.files.set(name, value);
              (window as unknown as { __written: Record<string, string> }).__written[path] = value;
            },
            async close() {},
          };
        },
      });
      function directory(name: string, node: Node, prefix: string): unknown {
        const at = (child: string) => (prefix ? `${prefix}/${child}` : child);
        return {
          kind: "directory",
          name,
          async *entries() {
            for (const [child, sub] of node.dirs) yield [child, directory(child, sub, at(child))];
            for (const child of node.files.keys()) yield [child, file(child, node, at(child))];
          },
          async queryPermission() { return "granted"; },
          async requestPermission() { return "granted"; },
        };
      }
      (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () =>
        directory("dewlab", root, "");
    },
    {
      "courses/computational-methods.yaml": MODULE,
      "tutorials/grid-of-numbers/grid-of-numbers.md": TUTORIAL,
      "tutorials/grid-of-numbers/grid-of-numbers-practice.md": PRACTICE,
      "pages/about.md": PAGE,
    },
  );
}

/** Opens the folder and leaves the palette as it arrives — open, with
 * nothing typed, because choosing a document is the next thing to do. */
async function openWorkspace(page: Page): Promise<void> {
  await page.goto(BUILT_APP);
  await page.getByRole("button", { name: /Open a local folder/ }).click();
  await expect(page.locator(".dn-spine")).toBeVisible();
  await expect(page.locator(".dn-wp-overlay")).toBeVisible();
}

/** The same, then dismissed, for the tests that drive the key itself. */
async function openWorkspaceAndDismiss(page: Page): Promise<void> {
  await openWorkspace(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".dn-wp-overlay")).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await stubFolder(page);
});

test("one key opens it, Escape closes it, and the field takes the focus", async ({ page }) => {
  await openWorkspaceAndDismiss(page);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.locator(".dn-wp-overlay")).toBeVisible();
  await expect(page.locator(".dn-wp-input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".dn-wp-overlay")).toBeHidden();
});

test("it indexes the workspace, not the rails: tutorials, pages, series, then commands", async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator(".dn-wp-section")).toHaveText(["Tutorials", "Pages", "Series", "Do"]);
  await expect(page.locator(".dn-wp-row-label").first()).toHaveText("Grid of Numbers");
  // A practice page says so rather than claiming a position of its own.
  await expect(page.locator(".dn-wp-row", { hasText: "Practice" }).locator(".dn-wp-row-note")).toHaveText("practice");
});

test("the preview says what a row is before Enter commits to it", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("grid of numbers");
  const preview = page.locator(".dn-wp-preview");
  await expect(preview.locator(".dn-wp-preview-title")).toHaveText("Grid of Numbers");
  await expect(preview.locator(".dn-wp-preview-kicker").first()).toHaveText(
    "tutorials/grid-of-numbers/grid-of-numbers.md",
  );
  // The opening sentence, read out of the file rather than the index,
  // with its markdown read as the words it stands for.
  await expect(preview.locator(".dn-wp-preview-body")).toHaveText(
    "A matrix is a grid of numbers, and every row is the same length.",
  );
  await expect(preview.locator(".dn-wp-preview-item")).toHaveText(["Reading one"]);
});

test("Enter opens the highlighted document", async ({ page }) => {
  await openWorkspace(page);
  await page.keyboard.type("grid of numbers");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-wp-overlay")).toBeHidden();
  await expect(page.locator(".dn-page h1")).toHaveText("Grid of Numbers");
  await expect(page.locator(".dn-spine-file")).toHaveText("tutorials/grid-of-numbers/grid-of-numbers.md");
});

test("the arrow keys move the highlight, and the preview follows", async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator(".dn-wp-row.is-active .dn-wp-row-label")).toHaveText("Grid of Numbers");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".dn-wp-row.is-active .dn-wp-row-label")).toHaveText("Grid of Numbers — Practice");
  await expect(page.locator(".dn-wp-preview-title")).toHaveText("Grid of Numbers — Practice");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(".dn-wp-row.is-active .dn-wp-row-label")).toHaveText("Grid of Numbers");
});

test("Enter takes the best match anywhere, not the first section's best", async ({ page }) => {
  // Typing a command's name must run the command even though the
  // Tutorials section is drawn first and may hold a coincidental match.
  await openWorkspace(page);
  await page.keyboard.type("appearance");
  await expect(page.locator(".dn-wp-row.is-active .dn-wp-row-label")).toHaveText("Appearance…");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-wp-overlay")).toBeHidden();
  await expect(page.locator(".dn-settings-panel")).toBeVisible();
});

test("every reader setting is still reachable, and moving one moves the spine with the page", async ({ page }) => {
  await openWorkspace(page);
  await page.keyboard.type("appearance");
  await page.keyboard.press("Enter");
  const settings = page.locator(".dn-settings-panel");
  await expect(settings).toBeVisible();
  for (const label of ["Theme", "Body font", "Text size", "Line width", "Line height", "Margins", "Tinted cells"]) {
    await expect(settings).toContainText(label);
  }
  // The spine lives in the gutter, so a wider measure has to narrow it —
  // the layout is measured from the page rather than declared in CSS
  // precisely so a reader setting can move it.
  const widthOf = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--dn-spine-width").trim());
  const before = await widthOf();
  await settings.locator('input[type="range"]').nth(1).evaluate((input: HTMLInputElement) => {
    input.value = input.max;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(widthOf).not.toBe(before);
});

test("a dewlab site page opens and saves back byte for byte apart from the edit", async ({ page }) => {
  await openWorkspace(page);
  await page.keyboard.type("about this project");
  await expect(page.locator(".dn-wp-row.is-active .dn-wp-row-note")).toHaveText("site page");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-spine-file")).toHaveText("pages/about.md");

  await page.locator(".dn-block-render").filter({ hasText: "open educational project" }).click();
  await page.keyboard.type("EDITED. ");
  // The right margin is empty by design, which makes it the one place a
  // click blurs the block editor without opening another block.
  await page.mouse.click(1200, 600);
  await expect(page.locator(".dn-spine-state")).toHaveText("Save this");

  await page.locator(".dn-spine-state").click();
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");
  const written = await page.evaluate(() => (window as unknown as { __written: Record<string, string> }).__written);
  expect(Object.keys(written)).toEqual(["pages/about.md"]);
  expect(written["pages/about.md"]).toContain("EDITED.");
  expect(written["pages/about.md"]!.replace("EDITED. ", "")).toBe(PAGE);
});

test("a query nothing matches says so rather than showing everything", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("zzzzz");
  await expect(page.locator(".dn-wp-row")).toHaveCount(0);
  await expect(page.locator(".dn-wp-empty")).toContainText("zzzzz");
});
