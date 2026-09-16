import { expect, test } from "@playwright/test";

const BUILT_APP = new URL("../../dist/index.html", import.meta.url).href;

test.beforeEach(async ({ page }) => {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
});

test("right-side bubbles open, switch, and close one drawer", async ({ page }) => {
  await expect(page.locator(".dn-outline-panel")).toBeHidden();
  await page.locator(".dn-settings-toggle").click();
  await expect(page.locator(".dn-settings-panel")).toBeVisible();
  await expect(page.locator(".dn-outline-panel")).toBeHidden();
  await expect(page.locator(".dn-settings-toggle")).toHaveAttribute("aria-selected", "true");

  await page.locator(".dn-outline-toggle").click();
  await expect(page.locator(".dn-settings-panel")).toBeHidden();
  await expect(page.locator(".dn-outline-panel")).toBeVisible();

  await page.locator(".dn-outline-toggle").click();
  await expect(page.locator(".dn-outline-panel")).toBeHidden();
  await expect(page.locator(".dn-outline-toggle")).toHaveAttribute("aria-selected", "false");
});

test("legacy GitHub and Source surfaces use the same right-side drawer position", async ({ page }) => {
  const cases = [
    [".dn-repo-toggle", ".dn-repo-panel"],
    [".dn-source-toggle", ".dn-source-overlay"],
    [".dn-series-toggle", ".dn-series-panel"],
    [".dn-settings-toggle", ".dn-settings-panel"],
  ] as const;

  for (const [toggle, panel] of cases) {
    await page.locator(toggle).click();
    const drawer = page.locator(panel);
    await expect(drawer).toBeVisible();
    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThan(page.viewportSize()!.width / 2);
  }
});

test("the sidebar divider advertises horizontal resizing and responds to the keyboard", async ({ page }) => {
  const divider = page.locator(".dn-inspector-resizer");
  await expect(divider).toBeHidden();
  await page.locator(".dn-outline-toggle").click();
  await expect(divider).toBeVisible();
  await expect(divider).toHaveAttribute("role", "separator");
  await expect(divider).toHaveAttribute("aria-orientation", "vertical");
  await expect(divider).toHaveAttribute("title", "Drag to resize sidebar");
  const grip = divider.locator(".dn-inspector-resizer-grip");
  const restingOpacity = Number(await grip.evaluate((node) => getComputedStyle(node).opacity));
  expect(restingOpacity).toBeLessThan(0.5);
  await divider.hover();
  await expect.poll(async () => Number(await grip.evaluate((node) => getComputedStyle(node).opacity))).toBeGreaterThan(0.9);
  const before = await page.locator(".dn-outline-panel").evaluate((node) => node.getBoundingClientRect().width);
  await divider.focus();
  await page.keyboard.press("ArrowLeft");
  const after = await page.locator(".dn-outline-panel").evaluate((node) => node.getBoundingClientRect().width);
  expect(after).toBeGreaterThan(before);
  await expect(grip).toHaveText("•••");
  await page.locator(".dn-outline-toggle").click();
  await expect(divider).toBeHidden();
});

test("Import and Export are bottom-right bubbles with selector drawers", async ({ page }) => {
  const rail = page.locator(".dn-file-action-rail");
  await expect(rail).toBeVisible();
  await expect(rail.locator("button")).toHaveCount(2);
  await expect(page.locator(".dn-file-bar")).toHaveText("Untitled");

  await page.locator(".dn-file-import-menu-toggle").click();
  await expect(page.locator(".dn-import-panel")).toBeVisible();
  await expect(page.locator(".dn-import-panel button")).toContainText(["×", "Markdown file…", "Jupyter notebook…"]);

  await page.locator(".dn-file-export-menu-toggle").click();
  await expect(page.locator(".dn-import-panel")).toBeHidden();
  await expect(page.locator(".dn-export-panel")).toBeVisible();
  await expect(page.locator(".dn-export-panel button")).toContainText([
    "×",
    "Markdown file",
    "Standalone HTML",
    "Jupyter notebook",
  ]);
});
