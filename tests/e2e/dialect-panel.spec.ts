// Step 6's third slice (src/dialect-convert.ts, src/dialect-panel.ts) —
// DIALECTS.md §5's conversion table, reachable without a terminal. Drives
// the real built app: convert a dewlab exec cell (with a hint) to
// dewstack, and check both that the document actually changed and that
// the report names the one thing that didn't map.

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

test.beforeEach(async ({ page }) => {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __dewnote: { mount(source: string): void } }).__dewnote.mount(
      "```python exec\nid: filter-evening\nhint: try readings on its own first\nreadings\n```\n",
    );
  });
  await expect(page.locator(".dn-block-fence .cm-content")).toContainText("readings");
});

test("converting dewlab to dewstack rewrites the fence and reports the dropped hint", async ({ page }) => {
  await page.locator(".dn-dialect-toggle").click();
  // Defaults are already dewlab -> dewstack.
  await page.locator(".dn-dialect-convert").click();

  await expect(page.locator(".dn-block-fence .cm-content")).toContainText("readings");
  await expect(page.locator(".dn-block-fence .cm-content")).not.toContainText("id:");

  const source = await page.evaluate(() => (window as unknown as { __dewnote: { getSource(): string } }).__dewnote.getSource());
  expect(source).toContain("py cell=filter-evening");
  expect(source).not.toContain("python exec");

  const report = page.locator(".dn-dialect-report li");
  await expect(report).toHaveCount(1);
  await expect(report).toContainText("hint: has no home in dewstack");
});

test("converting a dewstack site=name pair to dewlab gives each pane its own id, and the result groups into one live preview", async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { __dewnote: { mount(source: string): void } }).__dewnote.mount(
      "```html site=widget\n<div id=\"x\">hi</div>\n```\n\n```css site=widget\n#x{color:red}\n```\n",
    );
  });

  await page.locator(".dn-dialect-toggle").click();
  await page.locator(".dn-dialect-panel select").first().selectOption("dewstack");
  await page.locator(".dn-dialect-panel select").nth(1).selectOption("dewlab");
  await page.locator(".dn-dialect-convert").click();

  const source = await page.evaluate(() => (window as unknown as { __dewnote: { getSource(): string } }).__dewnote.getSource());
  expect(source).toContain("id: widget-html\nsite: widget");
  expect(source).toContain("id: widget-css\nsite: widget");

  // The converted panes still group into exactly one live preview, the
  // same as if they had been authored in dewlab's own grammar directly.
  await expect(page.locator(".dn-site-preview")).toHaveCount(1);
  const frame = page.frameLocator(".dn-site-frame");
  await expect(frame.locator("#x")).toHaveText("hi");
  await expect(frame.locator("#x")).toHaveCSS("color", "rgb(255, 0, 0)");
});
