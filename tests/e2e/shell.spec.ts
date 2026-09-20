// The shell, driven over a store held in memory: does opening a workspace
// actually put a document on screen, does the spine say where it is, and
// does a save reach the store.
//
// These are the questions `archive/tests/e2e/` answered across
// `file-bar.spec.ts`, `folder-panel.spec.ts` and `workspace-palette.spec.ts`,
// when there were three surfaces to ask them of. There is one now.

import { test, expect } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");

const WORKSPACE = {
  "courses/maths.yaml": [
    "id: maths",
    "title: Maths for IT",
    "contents:",
    "  - title: First Steps",
    "    tutorials:",
    "      - storing-and-computing",
  ].join("\n") + "\n",
  "tutorials/storing-and-computing/storing-and-computing.md": [
    "---",
    "title: Storing and Computing",
    "status: live",
    "---",
    "",
    "# Storing and Computing",
    "",
    "Last time we learned to do arithmetic.",
    "",
    "## Variables",
    "",
    "A variable is a name.",
    "",
    "```python exec",
    "id: first",
    "x = 1",
    "```",
    "",
  ].join("\n"),
  "pages/about.md": "---\ntitle: About\n---\n\n# About\n\nA page.\n",
};

async function openWorkspace(page: import("@playwright/test").Page) {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), WORKSPACE);
}

test("the gate is what a session opens on", async ({ page }) => {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-gate")).toBeVisible();
  await expect(page.locator(".dn-gate-choices button")).toHaveCount(2);
});

test("opening a workspace offers the palette, because choosing a document is next", async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator(".dn-wp-overlay")).toBeVisible();
});

test("the palette opens a document, and the spine says where it sits", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");

  await expect(page.locator(".milkdown h1")).toHaveText("Storing and Computing");
  await expect(page.locator(".dn-spine-file")).toContainText("storing-and-computing.md");
  // Module › Series › Title, read from the course descriptor.
  await expect(page.locator(".dn-spine-breadcrumb")).toContainText("Maths for IT");
  await expect(page.locator(".dn-spine-breadcrumb")).toContainText("First Steps");
});

test("the outline lists the document's own headings", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");
  // Two headings: the title and `## Variables`. A `#` inside the fence
  // is not one.
  await expect(page.locator(".dn-spine-heading")).toHaveCount(2);
  await expect(page.locator(".dn-spine-heading").nth(1)).toHaveText("Variables");
});

test("an untouched document is not dirty, although it was normalised on the way in", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");
  await expect(page.locator(".dn-spine-state")).toBeDisabled();
});

test("an edit reaches the store, with the fence's info string intact", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");

  await page.locator(".milkdown p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" And now we keep one.");
  await expect(page.locator(".dn-spine-state")).toHaveText("Save this");

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");

  const written = await page.evaluate(() => (globalThis as any).__dewnoteWrites);
  expect(written).toHaveLength(1);
  expect(written[0].path).toBe("tutorials/storing-and-computing/storing-and-computing.md");
  expect(written[0].text).toContain("And now we keep one.");
  expect(written[0].text).toContain("```python exec");
  expect(written[0].text).toContain("id: first");
  expect(written[0].text).toContain("title: Storing and Computing");
});

test("dewlab's own site pages are documents like any other", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("about");
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown h1")).toHaveText("About");
});

test("a runnable cell offers Run; an illustrative fence does not", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");

  // One `python exec` fence in the fixture, and no plain one.
  await expect(page.locator(".dn-cell-run")).toHaveCount(1);
  await expect(page.locator(".dn-cell-run")).toHaveText("Run");

  // Pyodide itself is not reachable from this sandbox, so what is
  // checked here is the affordance, not the interpreter —
  // tests/e2e/pyodide.spec.ts is where a real run belongs.
});

test("an illustrative fence has no Run button", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/plain.md": "---\ntitle: Plain\n---\n\n# Plain\n\n```python\nprint(1)\n```\n",
  });
  await page.locator(".dn-wp-input").fill("plain");
  await page.keyboard.press("Enter");
  // Crepe renders a code block as a CodeMirror instance, not a `pre`.
  await expect(page.locator(".milkdown .cm-editor")).toHaveCount(1);
  await expect(page.locator(".dn-cell-run")).toHaveCount(0);
});

test("every appearance setting is reachable from the palette, and moving the measure moves the page", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("appearance");
  await page.keyboard.press("Enter");

  const panel = page.locator(".dn-settings");
  await expect(panel).toBeVisible();
  // Eleven settings, the same eleven the original had minus the sidebar
  // control, which has no sidebar left to describe.
  await expect(panel.locator(".dn-settings-row")).toHaveCount(11);

  const before = await page.locator(".dn-page").evaluate((el) => el.getBoundingClientRect().width);
  const measure = panel.locator(".dn-settings-row", { hasText: "Line width" }).locator("input");
  await measure.fill("48");
  await measure.dispatchEvent("input");
  const after = await page.locator(".dn-page").evaluate((el) => el.getBoundingClientRect().width);
  expect(after).toBeGreaterThan(before);

  await panel.locator(".dn-settings-reset").click();
  const reset = await page.locator(".dn-page").evaluate((el) => el.getBoundingClientRect().width);
  expect(reset).toBe(before);
});

test("a setting survives a reload, because it is the reader's and not the session's", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("appearance");
  await page.keyboard.press("Enter");
  await page.locator(".dn-settings-row", { hasText: "Theme" }).locator("select").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("the sample workspace opens from the gate, with everything in it", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="sample"]').click();

  // The palette opens on a new workspace; take the tutorial.
  await page.locator(".dn-wp-input").fill("everything");
  await page.keyboard.press("Enter");

  await expect(page.locator(".milkdown h1")).toHaveText("Everything at Once");
  await expect(page.locator(".dn-spine-breadcrumb")).toContainText("A Sample Course");

  // One of everything, rendered rather than shown as markup.
  await expect(page.locator(".milkdown .katex")).not.toHaveCount(0);
  await expect(page.locator(".milkdown table")).not.toHaveCount(0);
  await expect(page.locator(".milkdown img:not(.ProseMirror-separator)")).toHaveCount(1);
  await expect(page.locator(".milkdown blockquote")).toHaveCount(1);
  await expect(page.locator(".milkdown .milkdown-icon.label")).not.toHaveCount(0);

  // Crepe mounts a code block when it scrolls into view, so the cells at
  // the bottom of a long document are placeholders until they are
  // reached. Scroll before asking about them.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator(".milkdown .cm-editor")).not.toHaveCount(0);
  await expect(page.locator(".dn-cell-run")).toHaveCount(1);
});

test("an edit to the sample is kept, and goes nowhere", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="sample"]').click();
  await page.locator(".dn-wp-input").fill("everything");
  await page.keyboard.press("Enter");

  await page.locator(".milkdown p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited.");
  await expect(page.locator(".dn-spine-state")).toHaveText("Save this");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");
});

test("Connect counts the files as they arrive, and ignores a second press", async ({ page }) => {
  await page.goto(BUILT_APP);

  // A stand-in GitHub: a tree of three files, each read slowly enough
  // that the label can be observed counting.
  await page.evaluate(() => {
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    let reads = 0;
    (globalThis as any).__reads = () => reads;
    globalThis.fetch = (async (url: string) => {
      const at = String(url);
      if (at.includes("/git/ref/heads/")) return json({ object: { sha: "sha" } });
      if (at.includes("/git/trees/")) {
        return json({
          truncated: false,
          tree: ["one", "two", "three"].map((name) => ({
            path: `pages/${name}.md`,
            type: "blob",
            sha: name,
          })),
        });
      }
      if (at.includes("/contents/")) {
        reads += 1;
        await new Promise((r) => setTimeout(r, 150));
        return json({ sha: "blob", encoding: "base64", content: btoa("---\ntitle: A Page\n---\n\n# A Page\n") });
      }
      return json({}, 404);
    }) as typeof fetch;
  });

  await page.locator('[data-choice="repo"]').click();
  await page.fill('[name="token"]', "token");
  await page.fill('[name="owner"]', "deweydex");
  await page.fill('[name="repo"]', "dewlab");
  await page.fill('[name="branch"]', "alt");

  const connect = page.locator('.dn-gate-repo button[type="submit"]');
  await connect.click();

  // It says what it is doing rather than sitting silent, and stops
  // taking presses while it does it.
  await expect(connect).not.toHaveText("Connect");
  await expect(connect).toBeDisabled();

  // A second press while it works does nothing at all.
  await connect.click({ force: true });
  await expect(page.locator(".dn-wp-overlay")).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => (globalThis as any).__reads())).toBe(3);
});

test("the gate's buttons show they were pressed", async ({ page }) => {
  await page.goto(BUILT_APP);
  const sample = page.locator('[data-choice="sample"]');
  // A focus ring is the part a keyboard reader depends on.
  await sample.focus();
  const outline = await sample.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
});

test("the repository form fills in a working branch rather than asking for one", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="repo"]').click();
  await expect(page.locator('[name="branch"]')).toHaveValue(/^dewnote\/\d{4}-\d{2}-\d{2}$/);
  await expect(page.locator('[name="base"]')).toHaveValue("main");
});

test("a working branch equal to the base is refused, with the reason", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="repo"]').click();
  await page.fill('[name="token"]', "token");
  await page.fill('[name="owner"]', "deweydex");
  await page.fill('[name="repo"]', "dewlab");
  await page.fill('[name="branch"]', "main");
  await page.locator('.dn-gate-repo button[type="submit"]').click();

  await expect(page.locator(".dn-gate-problem")).toContainText("different from the base branch");
  // And it is still usable rather than stuck mid-press.
  await expect(page.locator('.dn-gate-repo button[type="submit"]')).toBeEnabled();
});
