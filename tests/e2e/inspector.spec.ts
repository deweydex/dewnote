import { expect, test } from "@playwright/test";

const BUILT_APP = new URL("../../dist/index.html", import.meta.url).href;

test.beforeEach(async ({ page }) => {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
});

test("the right inspector is always open and rail buttons switch it like tabs", async ({ page }) => {
  await expect(page.locator(".dn-outline-panel")).toBeVisible();
  await expect(page.locator(".dn-outline-toggle")).toHaveAttribute("aria-selected", "true");

  await page.locator(".dn-settings-toggle").click();
  await expect(page.locator(".dn-settings-panel")).toBeVisible();
  await expect(page.locator(".dn-outline-panel")).toBeHidden();
  await expect(page.locator(".dn-settings-toggle")).toHaveAttribute("aria-selected", "true");
});

test("the sidebar divider advertises horizontal resizing and responds to the keyboard", async ({ page }) => {
  const divider = page.locator(".dn-inspector-resizer");
  await expect(divider).toBeVisible();
  await expect(divider).toHaveAttribute("role", "separator");
  await expect(divider).toHaveAttribute("aria-orientation", "vertical");
  const before = await page.locator(".dn-outline-panel").evaluate((node) => node.getBoundingClientRect().width);
  await divider.focus();
  await page.keyboard.press("ArrowLeft");
  const after = await page.locator(".dn-outline-panel").evaluate((node) => node.getBoundingClientRect().width);
  expect(after).toBeGreaterThan(before);
  await expect(divider.locator(".dn-inspector-resizer-grip")).toHaveText("•••");
});
