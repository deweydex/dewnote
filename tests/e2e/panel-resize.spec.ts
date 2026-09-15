// The drag handle every side panel shares (src/panel-resize.ts) — one
// --dn-panel-width a drag on any panel writes, read back by all seven,
// and the same --dl-font-size the "Text size" setting already reaches on
// the document now reaching a panel's own type too (src/app.css's shared
// side-panel rule).

import { test as base, expect, type Page } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

async function rootStyle(page: Page, property: string): Promise<string> {
  return page.evaluate((prop) => document.documentElement.style.getPropertyValue(prop), property);
}

test.beforeEach(async ({ page }) => {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
});

test("dragging the repository panel's own handle widens it, and the width survives a reload", async ({ page }) => {
  await page.locator(".dn-repo-toggle").click();
  const panel = page.locator(".dn-repo-panel");
  await expect(panel).toBeVisible();
  const before = (await panel.boundingBox())!;

  const handle = page.locator(".dn-panel-resize-right");
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.width + 120, handleBox.y + handleBox.height / 2);
  await page.mouse.up();

  const after = (await panel.boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width + 80);
  expect(await rootStyle(page, "--dn-panel-width")).not.toBe("");

  await page.reload();
  await expect(page.locator(".dn-block").first()).toBeVisible();
  await page.locator(".dn-repo-toggle").click();
  const reopened = (await page.locator(".dn-repo-panel").boundingBox())!;
  expect(reopened.width).toBeCloseTo(after.width, 0);
});

test("widening one panel widens the next one opened too, since they share one width", async ({ page }) => {
  await page.locator(".dn-repo-toggle").click();
  const repoPanel = page.locator(".dn-repo-panel");
  const before = (await repoPanel.boundingBox())!;
  const handle = page.locator(".dn-panel-resize-right");
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.width + 150, handleBox.y + handleBox.height / 2);
  await page.mouse.up();
  const widened = (await repoPanel.boundingBox())!.width;

  await page.locator(".dn-settings-toggle").click();
  const settingsWidth = (await page.locator(".dn-settings-panel").boundingBox())!.width;
  expect(settingsWidth).toBeCloseTo(widened, 0);
});

test("a drag never pushes the width past the panel's own min or max", async ({ page }) => {
  await page.locator(".dn-repo-toggle").click();
  const handle = page.locator(".dn-panel-resize-right");

  const firstBox = (await handle.boundingBox())!;
  await page.mouse.move(firstBox.x, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(0, firstBox.y + firstBox.height / 2);
  await page.mouse.up();
  expect(await rootStyle(page, "--dn-panel-width")).toBe("16rem");

  // The handle moved with the panel it just narrowed — a fresh box, not
  // the stale one from before that drag.
  const secondBox = (await handle.boundingBox())!;
  await page.mouse.move(secondBox.x, secondBox.y + secondBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(4000, secondBox.y + secondBox.height / 2);
  await page.mouse.up();
  expect(await rootStyle(page, "--dn-panel-width")).toBe("32rem");
});

test("the handle widens or narrows with the arrow keys, for a reader who won't drag", async ({ page }) => {
  await page.locator(".dn-repo-toggle").click();
  const handle = page.locator(".dn-panel-resize-right");
  await handle.focus();
  const before = (await page.locator(".dn-repo-panel").boundingBox())!.width;
  await handle.press("ArrowRight");
  const wider = (await page.locator(".dn-repo-panel").boundingBox())!.width;
  expect(wider).toBeGreaterThan(before);
  await handle.press("ArrowLeft");
  await handle.press("ArrowLeft");
  const narrower = (await page.locator(".dn-repo-panel").boundingBox())!.width;
  expect(narrower).toBeLessThan(wider);
});

test("the Settings panel's own Text size slider reaches every side panel's type, not only the document's", async ({ page }) => {
  await page.locator(".dn-settings-toggle").click();
  const panel = page.locator(".dn-settings-panel");
  const before = await panel.evaluate((el) => getComputedStyle(el).fontSize);

  const textSize = page.locator('.dn-settings-row:has-text("Text size") input[type="range"]');
  await textSize.fill("24");
  await textSize.dispatchEvent("input");

  const after = await panel.evaluate((el) => getComputedStyle(el).fontSize);
  expect(parseFloat(after)).toBeGreaterThan(parseFloat(before));
});

test("Reset to defaults in Settings puts the shared panel width back too", async ({ page }) => {
  await page.locator(".dn-repo-toggle").click();
  const handle = page.locator(".dn-panel-resize-right");
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(600, handleBox.y + handleBox.height / 2);
  await page.mouse.up();
  expect(await rootStyle(page, "--dn-panel-width")).not.toBe("");

  await page.locator(".dn-settings-toggle").click();
  await page.locator(".dn-settings-reset").click();
  expect(await rootStyle(page, "--dn-panel-width")).toBe("");
});
