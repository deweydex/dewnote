// The front-matter form (decision 11): a dewlab or dewstack document's
// front matter gets a per-field form instead of raw YAML, built from
// src/frontmatter-fields.ts's own dialect field lists. This is pure DOM —
// no Pyodide worker involved — so, like surface.spec.ts, it belongs in
// the suite that runs everywhere and drives the real built page rather
// than a mock (decision 9).

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

async function mount(page: Page, source: string) {
  await page.evaluate((src) => (window as any).__dewnote.mount(src), source);
}

async function getSource(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__dewnote.getSource());
}

const DEWLAB_DOC = `---
title: Filtering rows
slug: filter-evening
module: pandas-basics
module_title: Pandas basics
year: "2026"
series: core
version: 2026.09.04.1
packages: [sympy]
---

# Filtering rows

Body text.
`;

const DEWSTACK_DOC = `---
title: A page
slug: a-page
module: web-basics
module_title: Web basics
series: core
version: 2026.09.04.1
---

Body text.
`;

test.beforeEach(async ({ page }) => {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
});

test("clicking a dewlab document's front matter opens a form, not raw YAML", async ({ page }) => {
  await mount(page, DEWLAB_DOC);
  await page.locator(".dn-block-frontmatter .dn-block-render").click();

  const form = page.locator(".dn-frontmatter-form");
  await expect(form).toBeVisible();
  await expect(page.locator(".dn-block-frontmatter .cm-editor")).toHaveCount(0);

  for (const label of ["Title", "Slug", "Module", "Module title", "Year", "Series", "Version"]) {
    await expect(
      form.locator(".dn-frontmatter-row").filter({ has: page.locator(".dn-frontmatter-label", { hasText: new RegExp(`^${label}$`) }) }).locator('input[type="text"]'),
    ).toBeVisible();
  }
  // packages is a list — no row for it, only the raw fallback covers it.
  await expect(form.locator(".dn-frontmatter-row", { hasText: "packages" })).toHaveCount(0);
});

test("editing a required field commits on change, touching only that line", async ({ page }) => {
  await mount(page, DEWLAB_DOC);
  await page.locator(".dn-block-frontmatter .dn-block-render").click();

  const titleInput = page
    .locator(".dn-frontmatter-row")
    .filter({ has: page.locator(".dn-frontmatter-label", { hasText: /^Title$/ }) })
    .locator('input[type="text"]');
  await titleInput.fill("Filtering evening rows");
  await titleInput.blur();

  const source = await getSource(page);
  expect(source).toContain("title: Filtering evening rows\n");
  expect(source).toContain('year: "2026"\n');
  expect(source).toContain("packages: [sympy]\n");
  expect(source).toContain("Body text.\n");
});

test("status starts hidden behind a + button, and adding it shows a live/archived select for dewlab", async ({
  page,
}) => {
  await mount(page, DEWLAB_DOC);
  await page.locator(".dn-block-frontmatter .dn-block-render").click();

  const form = page.locator(".dn-frontmatter-form");
  await expect(form.locator(".dn-frontmatter-row", { hasText: "Status" })).toHaveCount(0);

  await form.locator(".dn-frontmatter-add-field", { hasText: "Status" }).click();
  const statusRow = form.locator(".dn-frontmatter-row", { hasText: "Status" });
  await expect(statusRow).toBeVisible();
  const select = statusRow.locator("select");
  await expect(select).toHaveValue("live");
  await expect(select.locator("option")).toHaveText(["Live", "Archived"]);

  await select.selectOption("archived");
  expect(await getSource(page)).toContain("status: archived\n");
});

test("clearing an optional field removes its line entirely", async ({ page }) => {
  const withStatus = DEWLAB_DOC.replace("packages: [sympy]\n", "packages: [sympy]\nstatus: live\n");
  await mount(page, withStatus);
  await page.locator(".dn-block-frontmatter .dn-block-render").click();

  const statusRow = page.locator(".dn-frontmatter-row", { hasText: "Status" });
  await statusRow.locator(".dn-frontmatter-clear").click();

  expect(await getSource(page)).not.toContain("status:");
  await expect(page.locator(".dn-frontmatter-row", { hasText: "Status" })).toHaveCount(0);
});

test("dewstack's status field offers live/draft, not live/archived", async ({ page }) => {
  await mount(page, DEWSTACK_DOC);
  await page.locator(".dn-block-frontmatter .dn-block-render").click();
  await page.locator(".dn-frontmatter-add-field", { hasText: "Status" }).click();

  const select = page.locator('.dn-frontmatter-row:has-text("Status") select');
  await expect(select.locator("option")).toHaveText(["Live", "Draft"]);
});

test("Edit raw YAML falls back to the plain source editor, and Done returns to the form", async ({ page }) => {
  await mount(page, DEWLAB_DOC);
  await page.locator(".dn-block-frontmatter .dn-block-render").click();

  await page.locator(".dn-frontmatter-raw-toggle").click();
  await expect(page.locator(".dn-frontmatter-form")).toHaveCount(0);
  const rawEditor = page.locator(".dn-block-frontmatter .cm-content");
  await expect(rawEditor).toBeVisible();
  await expect(rawEditor).toContainText("packages: [sympy]");

  // Editing the raw text still commits through the ordinary blur path.
  await rawEditor.click();
  await page.keyboard.press("End");
  await page.keyboard.type("\ncovers: {}");
  await page.locator(".dn-block-frontmatter").blur();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  expect(await getSource(page)).toContain("covers: {}");
});

test("Done collapses the form back to the one-line summary", async ({ page }) => {
  await mount(page, DEWLAB_DOC);
  await page.locator(".dn-block-frontmatter .dn-block-render").click();
  await expect(page.locator(".dn-frontmatter-form")).toBeVisible();

  await page.locator(".dn-frontmatter-done").click();
  await expect(page.locator(".dn-frontmatter-form")).toHaveCount(0);
  await expect(page.locator(".dn-frontmatter-summary")).toBeVisible();
});

test("plain markdown's front matter has no dialect field list, so it opens straight to raw YAML", async ({
  page,
}) => {
  await mount(page, "---\ntitle: A note\ncreated: \"2026-01-01T00:00:00Z\"\n---\n\nBody.\n");
  await page.locator(".dn-block-frontmatter .dn-block-render").click();

  await expect(page.locator(".dn-frontmatter-form")).toHaveCount(0);
  await expect(page.locator(".dn-block-frontmatter .cm-content")).toContainText("created:");
});
