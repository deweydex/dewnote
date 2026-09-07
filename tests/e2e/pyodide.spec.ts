// Runs real Python, in a real browser, through the actual single-file
// build's Worker + Blob-URL + CDN-loaded Pyodide chain — decision 9's
// reasoning applies at full force here: nothing before this test (not
// typecheck, not a unit test stubbing pyodide.code under plain CPython)
// has exercised any of the Worker/Blob-URL/real-Pyodide machinery this
// feature actually depends on. A cold Pyodide boot plus whatever a given
// cell's own imports need (numpy, pandas, matplotlib — loaded on demand
// by loadPackagesFromImports, not eagerly at boot, see worker-source.ts)
// takes real seconds over a real network, hence the generous timeouts.
//
// One test, one page, one cold boot: mounting a second document into an
// already-loaded page (this file's `mount`, same as surface.spec.ts's)
// swaps the DOM but not the running Pyodide worker underneath it, so
// splitting these scenarios into separate tests would just pay for a
// fresh multi-second boot per scenario for no extra coverage.

import { test as base, expect, type Page } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");
const COLD_BOOT_TIMEOUT = 150_000;

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

test("a real exec cell runs in a real browser: output, errors, and shared state", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();

  await test.step("print() and a trailing expression both appear as real Pyodide output", async () => {
    await mount(page, '```python exec\nid: hello\nprint("hello from pyodide")\n1 + 1\n```\n');
    const cell = page.locator(".dn-block-fence");
    await cell.locator(".dn-cell-run").click();
    await expect(cell.locator(".dn-cell-run")).toHaveText("Running…");

    const output = cell.locator(".dn-cell-output");
    await expect(output).toContainText("hello from pyodide", { timeout: COLD_BOOT_TIMEOUT });
    await expect(output.locator(".dn-repr")).toHaveText("2");
    await expect(cell.locator(".dn-cell-run")).toHaveText("Run");
  });

  await test.step("an uncaught exception renders a trimmed traceback, not this app's own plumbing", async () => {
    await mount(page, "```python exec\nid: boom\n1 / 0\n```\n");
    const errorOutput = page.locator(".dn-block-fence .dn-cell-output .dn-error");
    await page.locator(".dn-block-fence .dn-cell-run").click();

    await expect(errorOutput).toContainText("ZeroDivisionError", { timeout: COLD_BOOT_TIMEOUT });
    await expect(errorOutput).toContainText("<cell boom>");
    await expect(errorOutput).not.toContainText("eval_code_async");
  });

  await test.step("two cells share one namespace, like a notebook", async () => {
    await mount(page, "```python exec\nid: setup\ntotal = 40\n```\n\n```python exec\nid: reader\nprint(total + 2)\n```\n");
    const cells = page.locator(".dn-block-fence");
    await cells.nth(0).locator(".dn-cell-run").click();
    await expect(cells.nth(0).locator(".dn-cell-run")).toHaveText("Run");

    await cells.nth(1).locator(".dn-cell-run").click();
    await expect(cells.nth(1).locator(".dn-cell-output")).toContainText("42");
  });
});
