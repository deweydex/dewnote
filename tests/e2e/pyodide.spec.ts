// Real Python: Pyodide fetched from jsDelivr and run in the page's
// Worker, with no stub anywhere. Every other cell test holds the
// interpreter out of the way; these are the ones that would notice if it
// stopped working.
//
// They need jsDelivr. Where it cannot be reached (a sandbox with
// restricted network) they skip themselves; CI sets
// DEWNOTE_REQUIRE_PYODIDE=1, which turns an unreachable jsDelivr into a
// failure instead, so the tests cannot quietly stop running there.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/pyodide.js";

/** The first run boots the interpreter, which is a download. */
const BOOT = 120_000;

let reachable = false;

test.beforeAll(async () => {
  try {
    const response = await fetch(PYODIDE, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
    reachable = response.ok;
  } catch {
    reachable = false;
  }
  if (!reachable && process.env["DEWNOTE_REQUIRE_PYODIDE"]) {
    throw new Error(`${PYODIDE} is not reachable, and DEWNOTE_REQUIRE_PYODIDE is set.`);
  }
});

test.beforeEach(() => {
  test.skip(!reachable, "jsDelivr is not reachable from here, so Pyodide cannot load.");
  test.setTimeout(3 * BOOT);
});

/** The shell over a stub store, so cells run through the same path an
 * author's do: the shell's runner, the engine, the Worker. */
async function openCells(page: Page, cells: string[]) {
  await page.goto(BUILT_APP);
  await page.evaluate((body) => (globalThis as any).__dewnote.useStubStore({
    "pages/cells.md": `---\ntitle: Cells\n---\n\n# Cells\n\n${body}`,
  }), cells.join("\n\n") + "\n");
  await page.locator(".dn-wp-input").fill("cells");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-cell-run")).toHaveCount(cells.length);
}

const cell = (id: string, code: string, language = "python") =>
  `\`\`\`${language} exec\nid: ${id}\n${code}\n\`\`\``;

test("a Python cell runs and prints", async ({ page }) => {
  await openCells(page, [cell("sum", "print(2 + 2)")]);
  await page.locator(".dn-cell-run").click();

  const output = page.locator(".dn-cell-output");
  await expect(output).toContainText("4", { timeout: BOOT });
  await expect(output).not.toHaveClass(/is-error/);
});

test("cells share one interpreter, top to bottom", async ({ page }) => {
  await openCells(page, [cell("set", "x = 21"), cell("use", "print(x * 2)")]);

  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("run every cell");
  await page.keyboard.press("Enter");

  await expect(page.locator(".dn-cell-output").last()).toContainText("42", { timeout: BOOT });
});

test("an error is shown as an error, with Python's own message", async ({ page }) => {
  await openCells(page, [cell("boom", "raise ValueError('boom')")]);
  await page.locator(".dn-cell-run").click();

  const output = page.locator(".dn-cell-output");
  await expect(output).toHaveClass(/is-error/, { timeout: BOOT });
  await expect(output).toContainText("ValueError");
});

test("a loop that never ends can be stopped, and Python still works after", async ({ page }) => {
  await openCells(page, [cell("warm", "print('ready')"), cell("loop", "while True:\n    pass")]);
  const runs = page.locator(".dn-cell-run");

  // Boot first, so the loop starts at once rather than after a download.
  await runs.nth(0).click();
  await expect(page.locator(".dn-cell-output").first()).toContainText("ready", { timeout: BOOT });

  await runs.nth(1).click();
  await expect(runs.nth(1)).toHaveText("Stop");
  await runs.nth(1).click();
  await expect(runs.nth(1)).toHaveText("Run again", { timeout: BOOT });

  await runs.nth(0).click();
  await expect(runs.nth(0)).toHaveText("Run again", { timeout: BOOT });
  await expect(page.locator(".dn-cell-output").first()).toContainText("ready", { timeout: BOOT });
});

test("a SQL cell runs against the page's database", async ({ page }) => {
  await openCells(page, [cell("q", "SELECT 1 + 1 AS two;", "sql")]);
  await page.locator(".dn-cell-run").click();

  const output = page.locator(".dn-cell-output");
  await expect(output).toContainText("2", { timeout: BOOT });
  await expect(output).not.toHaveClass(/is-error/);
});
