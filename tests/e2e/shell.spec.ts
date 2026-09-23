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
    // Written with `*`; the editor writes `-`, so the document is
    // normalised the moment it opens.
    "* One kind.",
    "* Another.",
    "",
    "```python exec",
    "id: first",
    "# a comment, not a heading",
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
  // The file's name, with its whole path on hover.
  await expect(page.locator(".dn-spine-file")).toHaveText("storing-and-computing.md");
  await expect(page.locator(".dn-spine-file")).toHaveAttribute(
    "title",
    "tutorials/storing-and-computing/storing-and-computing.md",
  );
  // Module › Series › Title, read from the course descriptor.
  await expect(page.locator(".dn-spine-breadcrumb")).toContainText("Maths for IT");
  await expect(page.locator(".dn-spine-breadcrumb")).toContainText("First Steps");
});

test("the outline lists the document's own headings", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");
  // Two headings: the title and `## Variables`. The `# a comment` line
  // inside the fence is not one.
  await expect(page.locator(".dn-spine-heading")).toHaveCount(2);
  await expect(page.locator(".dn-spine-heading").nth(1)).toHaveText("Variables");
});

test("an untouched document is not dirty, although it was normalised on the way in", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");
  await expect(page.locator(".dn-spine-state")).toBeDisabled();

  // It was normalised: the file says `*`, the document says `-`. Without
  // this, a fixture that happened to round-trip byte for byte would let
  // the test pass even if "dirty" compared against the raw file.
  await page.keyboard.press("ControlOrMeta+/");
  await expect(page.locator(".dn-source-text")).toHaveValue(/^- One kind\.$/m);
  await page.keyboard.press("Escape");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");
});

test("an edit reaches the store, with the fence's info string intact", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");

  await page.locator(".milkdown p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" And now we keep one.");
  await expect(page.locator(".dn-spine-state")).toHaveText(/^Save \(/);

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
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/plain.md":
      "---\ntitle: Plain\n---\n\n# Plain\n\n```python exec\nid: a\nprint(1)\n```\n\n```python\nprint(2)\n```\n",
  });
  await page.locator(".dn-wp-input").fill("plain");
  await page.keyboard.press("Enter");
  // Two code blocks on screen (Crepe renders each as CodeMirror), and a
  // Run button for only the one marked `exec`. Real runs are in
  // pyodide.spec.ts.
  await expect(page.locator(".milkdown .cm-editor")).toHaveCount(2);
  await expect(page.locator(".dn-cell-run")).toHaveCount(1);
  await expect(page.locator(".dn-cell-run")).toHaveText("Run");
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
  await expect(page.locator(".dn-spine-state")).toHaveText(/^Save \(/);
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");

  // Kept: leave and come back, and the edit is still there.
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("practice");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("everything at once");
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown")).toContainText("Edited.");

  // Goes nowhere: a fresh sample has none of it.
  await page.reload();
  await page.locator('[data-choice="sample"]').click();
  await page.locator(".dn-wp-input").fill("everything");
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown h1")).toHaveText("Everything at Once");
  await expect(page.locator(".milkdown")).not.toContainText("Edited.");
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
      if (at.includes("/user/repos")) {
        return json([
          { name: "dewlab", owner: { login: "deweydex" }, default_branch: "main", permissions: { push: true } },
        ]);
      }
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
  await expect(page.locator('[name="repo"]')).toBeEnabled();
  await page.fill('[name="branch"]', "alt");

  const connect = page.locator('.dn-gate-repo button[type="submit"]');
  // Every label the button shows, recorded as it changes: the count is
  // on screen only between the reads finishing and the gate going away.
  await connect.evaluate((button) => {
    const seen: string[] = [];
    (globalThis as any).__labels = seen;
    new MutationObserver(() => seen.push(button.textContent ?? "")).observe(button, {
      childList: true, characterData: true, subtree: true,
    });
  });
  await connect.click();

  // It says what it is doing rather than sitting silent, and stops
  // taking presses while it does it.
  await expect(connect).not.toHaveText("Connect");
  await expect(connect).toBeDisabled();

  // A second press while it works does nothing at all.
  await connect.click({ force: true });
  await expect(page.locator(".dn-wp-overlay")).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => (globalThis as any).__reads())).toBe(3);

  // And it counted.
  const labels: string[] = await page.evaluate(() => (globalThis as any).__labels);
  expect(labels).toContain("Reading 3 of 3");
});

test("the gate's buttons show a focus ring to the keyboard", async ({ page }) => {
  await page.goto(BUILT_APP);
  // Tab, not .focus(): `:focus-visible` is what a keyboard reader gets.
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement!);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  // dewnote's own ring, not the browser's default `auto` one.
  expect(ring).toEqual({ style: "solid", width: "2px" });
});

test("the repository form fills in a working branch rather than asking for one", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="repo"]').click();
  await expect(page.locator('[name="branch"]')).toHaveValue(/^dewnote\/\d{4}-\d{2}-\d{2}$/);
});

test("an image beside the document is drawn, and the markdown keeps its name", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="sample"]').click();
  await page.locator(".dn-wp-input").fill("everything");
  await page.keyboard.press("Enter");

  const image = page.locator(".milkdown img.image-inline");
  await expect(image).toHaveCount(1);
  // Read from the store and drawn, rather than 404ing on a path the page
  // cannot resolve. Milkdown's own `proxyDomURL` puts the resolved URL
  // on the element; the node keeps the bare name, which
  // constructs.spec.ts asserts against the markdown.
  expect(await image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  expect(await image.evaluate((el: HTMLImageElement) => el.getAttribute("src")?.startsWith("blob:"))).toBe(true);
  await expect(image).toHaveAttribute("alt", "Three boxes, the last one filled");
});

test("a pasted image is written beside the document and named in the markdown", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="sample"]').click();
  await page.locator(".dn-wp-input").fill("everything");
  await page.keyboard.press("Enter");

  await page.locator(".milkdown p").first().click();
  // A one-pixel PNG, pasted the way a browser delivers one.
  await page.evaluate(async () => {
    const png = Uint8Array.from(atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    ), (c) => c.charCodeAt(0));
    const file = new File([png], "sketch.png", { type: "image/png" });
    const data = new DataTransfer();
    data.items.add(file);
    const target = document.querySelector(".milkdown .ProseMirror")!;
    target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });

  // Named after the file and written beside the document — not inlined
  // as base64, which would be a file nobody can open or replace.
  const images = page.locator(".milkdown img.image-inline");
  await expect(images).toHaveCount(2);
  expect(
    await images.nth(1).evaluate((el: HTMLImageElement) => el.getAttribute("src")?.startsWith("blob:")),
  ).toBe(true);
  // The markdown names the file, and nothing is inlined.
  await page.keyboard.press("ControlOrMeta+/");
  const source = page.locator(".dn-source-text");
  await expect(source).toHaveValue(/!\[[^\]]*\]\(sketch\.png\)/);
  await expect(source).not.toHaveValue(/data:image/);
});

test("Check every document reports a fault in a file nobody has open, and opens it", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="sample"]').click();
  await page.locator(".dn-wp-input").fill("check every document");
  await page.keyboard.press("Enter");

  const report = page.locator(".dn-report");
  await expect(report).toBeVisible();
  const broken = report.locator(".dn-report-row", { hasText: "no-such-page" });
  await expect(broken).toHaveCount(1);
  // It says which file and which line, so the report reads against the
  // workspace rather than against whatever happens to be open.
  await expect(broken.locator(".dn-report-where")).toContainText("everything-at-once-practice.md");

  // And takes you there.
  await broken.click();
  await expect(report).toBeHidden();
  await expect(page.locator(".milkdown h1")).toContainText("Practice");
});

test("a sound workspace says so rather than showing an empty list", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "tutorials/a/a.md": "---\ntitle: A\nyear: \"2026-2027\"\nversion: 2026.09.22.1\n---\n\n# A\n\nNo links here.\n",
    // A README is not a page, and is not scolded for having no header.
    "README.md": "# dewlab\n",
  });
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("check every document");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-report h2")).toHaveText("No problems found in the workspace.");
});

test("a document saves as one HTML file, with its stylesheet and image inside it", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="sample"]').click();
  await page.locator(".dn-wp-input").fill("everything");
  await page.keyboard.press("Enter");

  const download = page.waitForEvent("download");
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("download as html");
  await page.keyboard.press("Enter");

  const file = await download;
  expect(file.suggestedFilename()).toBe("everything-at-once.html");

  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const html = Buffer.concat(chunks).toString("utf8");

  // One file: nothing to fetch, nothing to lose.
  expect(html).not.toContain("<link");
  expect(html).toContain("<title>Everything at Once</title>");
  expect(html).toContain("<style>");
  // The image is inside it, not named beside it.
  expect(html).toContain("src=\"data:image/svg+xml;base64,");
  expect(html).not.toContain('src="diagram.svg"');
  // Maths is typeset, and KaTeX's stylesheet came with it.
  expect(html).toContain("katex");
  // A cell is a labelled code block; its output is not in the document.
  expect(html).toContain("print(total)");
  // Front matter is not something a reader sees.
  expect(html).not.toContain("status: live");
});

test("a document saves as a notebook whose cells keep their own text", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="sample"]').click();
  await page.locator(".dn-wp-input").fill("everything");
  await page.keyboard.press("Enter");

  const download = page.waitForEvent("download");
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("download as a jupyter");
  await page.keyboard.press("Enter");

  const file = await download;
  expect(file.suggestedFilename()).toBe("everything-at-once.ipynb");

  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const notebook = JSON.parse(Buffer.concat(chunks).toString("utf8"));

  expect(notebook.nbformat).toBe(4);
  expect(notebook.nbformat_minor).toBe(5);
  // The runnable cell is a code cell and keeps its own id.
  const cell = notebook.cells.find((c: { id: string }) => c.id === "first-sum");
  expect(cell.cell_type).toBe("code");
  expect(cell.source).toContain("print(total)");
  // And every cell carries the bytes it came from, which is what makes
  // importing it back lossless.
  for (const each of notebook.cells) expect(typeof each.metadata.dewnote.raw).toBe("string");
});

test("the slash menu offers dewlab's own blocks, and inserts one with a free id", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/one.md": "---\ntitle: One\n---\n\n# One\n\nWords.\n\n```python exec\nid: cell-1\nprint(1)\n```\n",
  });
  await page.locator(".dn-wp-input").fill("one");
  await page.keyboard.press("Enter");

  await page.locator(".milkdown p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");

  const menu = page.locator(".milkdown-slash-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("Python cell");
  await expect(menu).toContainText("SQL cell");
  await expect(menu).toContainText("Hint");

  await page.keyboard.type("py");
  await expect(menu).not.toContainText("Heading 1");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-spine-state")).toHaveText(/^Save \(/);
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");

  const written = await page.evaluate(() => (globalThis as any).__dewnoteWrites.at(-1).text as string);
  // A new cell, with an id nobody is using — an id is the key somebody's
  // saved work lives under.
  expect(written).toContain("```python exec");
  expect(written).toContain("id: cell-2");
  expect(written).toContain("id: cell-1");
  // And the `/py` the author typed is gone, not left in the prose.
  expect(written).not.toContain("/py");
});

test("the slash menu writes a hint as the fold dewlab's build looks for", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/one.md": "---\ntitle: One\n---\n\n# One\n\nWords.\n",
  });
  await page.locator(".dn-wp-input").fill("one");
  await page.keyboard.press("Enter");

  await page.locator(".milkdown p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/hint");
  // The menu opens a tick after the slash; Enter before that inserts a
  // newline and leaves "/hint" sitting in the prose.
  const menu = page.locator(".milkdown-slash-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("Hint");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-spine-state")).toHaveText(/^Save \(/);
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");

  const written = await page.evaluate(() => (globalThis as any).__dewnoteWrites.at(-1).text as string);
  expect(written).toContain('<details class="dl-hint">');
  expect(written).toContain("<summary>");
});

test("⌘/ shows the whole file, front matter and all", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/one.md": "---\ntitle: One\nstatus: live\n---\n\n# One\n\nWords.\n",
  });
  await page.locator(".dn-wp-input").fill("one");
  await page.keyboard.press("Enter");

  await page.keyboard.press("ControlOrMeta+/");
  const source = page.locator(".dn-source");
  await expect(source).toBeVisible();
  // The one place front matter is visible, which is the point of it.
  await expect(source.locator(".dn-source-text")).toHaveValue(/status: live/);
  await expect(source.locator(".dn-source-text")).toHaveValue(/# One/);

  await page.keyboard.press("Escape");
  await expect(source).toBeHidden();
});

test("an edit in the source view reaches the document, and is not saved until you save", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/one.md": "---\ntitle: One\n---\n\n# One\n\nWords.\n",
  });
  await page.locator(".dn-wp-input").fill("one");
  await page.keyboard.press("Enter");

  await page.keyboard.press("ControlOrMeta+/");
  await page.locator(".dn-source-text").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("---\ntitle: One\n---\n\n# Renamed\n\nQuite different.\n");
  await page.locator(".dn-source-keep").click();

  await expect(page.locator(".dn-source")).toBeHidden();
  await expect(page.locator(".milkdown h1")).toHaveText("Renamed");

  // Nothing written yet.
  expect(await page.evaluate(() => (globalThis as any).__dewnoteWrites.length)).toBe(0);
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");
  const written = await page.evaluate(() => (globalThis as any).__dewnoteWrites.at(-1).text as string);
  expect(written).toContain("# Renamed");
});

test("leaving the source view keeps the document as it was", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/one.md": "---\ntitle: One\n---\n\n# One\n\nWords.\n",
  });
  await page.locator(".dn-wp-input").fill("one");
  await page.keyboard.press("Enter");

  await page.keyboard.press("ControlOrMeta+/");
  await page.locator(".dn-source-text").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("# Thrown away\n");
  await page.keyboard.press("Escape");

  await expect(page.locator(".milkdown h1")).toHaveText("One");
});

test("a new tutorial is written, opened, and starts as a draft", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/one.md": "---\ntitle: One\n---\n\n# One\n",
  });
  await page.locator(".dn-wp-input").fill("new tutorial");
  await page.keyboard.press("Enter");

  const ask = page.locator(".dn-ask");
  await expect(ask).toBeVisible();
  await ask.locator("input").fill("Storing and Computing");
  await ask.locator(".dn-ask-go").click();

  // Written at dewlab's own address, and opened.
  await expect(page.locator(".milkdown h1")).toHaveText("Storing and Computing");
  await expect(page.locator(".dn-spine-file")).toHaveAttribute(
    "title",
    "tutorials/storing-and-computing/storing-and-computing.md",
  );

  const written = await page.evaluate(() => (globalThis as any).__dewnoteWrites.at(-1));
  expect(written.path).toBe("tutorials/storing-and-computing/storing-and-computing.md");
  // A draft: a half-written page should never be served.
  expect(written.text).toContain("status: draft");
  expect(written.text).toContain("```python exec");
});

test("a release freezes what is published and dates what is open", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "tutorials/grid/grid.md":
      "---\ntitle: Grid\nstatus: live\nversion: 2026.08.01.1\n---\n\n# Grid\n\nOld words.\n",
  });
  await page.locator(".dn-wp-input").fill("grid");
  await page.keyboard.press("Enter");

  await page.locator(".milkdown p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" And new ones.");

  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("new version");
  await page.keyboard.press("Enter");

  const ask = page.locator(".dn-ask");
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("v2026.08.01.1.md");
  await ask.locator(".dn-ask-go").click();

  const writes = await page.evaluate(() => (globalThis as any).__dewnoteWrites);
  const frozen = writes.find((w: { path: string }) => w.path === "tutorials/grid/v2026.08.01.1.md");
  const live = writes.find((w: { path: string }) => w.path === "tutorials/grid/grid.md");

  // The old bytes, exactly as they were.
  expect(frozen.text).toContain("Old words.");
  expect(frozen.text).not.toContain("And new ones.");
  // The live file keeps its address and says what it supersedes.
  expect(live.text).toContain("And new ones.");
  expect(live.text).toContain("supersedes: 2026.08.01.1");
});

test("a release after saving still freezes the version the folder opened with", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "tutorials/grid/grid.md":
      "---\ntitle: Grid\nstatus: live\nversion: 2026.08.01.1\n---\n\n# Grid\n\nOld words.\n",
  });
  await page.locator(".dn-wp-input").fill("grid");
  await page.keyboard.press("Enter");

  await page.locator(".milkdown p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Half the edits.");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");
  await page.keyboard.type(" The rest.");

  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("new version");
  await page.keyboard.press("Enter");
  await page.locator(".dn-ask .dn-ask-go").click();

  const writes = await page.evaluate(() => (globalThis as any).__dewnoteWrites);
  const frozen = writes.find((w: { path: string }) => w.path === "tutorials/grid/v2026.08.01.1.md");
  const live = writes.findLast((w: { path: string }) => w.path === "tutorials/grid/grid.md");
  // The old version, as opened, with none of the edits saved on the way.
  expect(frozen.text).toContain("Old words.");
  expect(frozen.text).not.toContain("Half the edits.");
  expect(live.text).toContain("Half the edits. The rest.");
});

test("a repository release freezes the copy on the base branch", async ({ page }) => {
  await page.goto(BUILT_APP);
  const onBranch =
    "---\ntitle: Grid\nstatus: live\nversion: 2026.08.01.1\n---\n\n# Grid\n\nSaved on the branch.\n";
  const onBase =
    "---\ntitle: Grid\nstatus: live\nversion: 2026.08.01.1\n---\n\n# Grid\n\nWhat readers see.\n";
  await page.evaluate(
    ([branch, base]) =>
      (globalThis as any).__dewnote.useStubStore(
        { "tutorials/grid/grid.md": branch }, false, [], { "tutorials/grid/grid.md": base },
      ),
    [onBranch, onBase],
  );
  await page.locator(".dn-wp-input").fill("grid");
  await page.keyboard.press("Enter");

  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("new version");
  await page.keyboard.press("Enter");
  await page.locator(".dn-ask .dn-ask-go").click();

  const writes = await page.evaluate(() => (globalThis as any).__dewnoteWrites);
  const frozen = writes.find((w: { path: string }) => w.path === "tutorials/grid/v2026.08.01.1.md");
  expect(frozen.text).toContain("What readers see.");
  const live = writes.find((w: { path: string }) => w.path === "tutorials/grid/grid.md");
  expect(live.text).toContain("Saved on the branch.");
  expect(live.text).toContain("supersedes: 2026.08.01.1");
});

test("a tutorial not yet on the base branch cannot be released, and says why", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(
    (text) =>
      (globalThis as any).__dewnote.useStubStore({ "tutorials/grid/grid.md": text }, false, [], {}),
    "---\ntitle: Grid\nstatus: live\nversion: 2026.08.01.1\n---\n\n# Grid\n\nNew.\n",
  );
  await page.locator(".dn-wp-input").fill("grid");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("new version");
  await page.keyboard.press("Enter");

  await expect(page.locator(".dn-spine-problem")).toContainText("not on the main branch yet");
  expect(await page.evaluate(() => (globalThis as any).__dewnoteWrites)).toHaveLength(0);
});

test("a tutorial on no course can be placed in a series, and shows a breadcrumb after", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "courses/maths.yaml":
      "id: maths\ntitle: Maths for IT\ncontents:\n  - title: First Steps\n    tutorials:\n      - grid-of-numbers\n",
    "tutorials/grid-of-numbers/grid-of-numbers.md": "---\ntitle: Grid\n---\n\n# Grid\n",
    "tutorials/brand-new/brand-new.md": "---\ntitle: Brand New\n---\n\n# Brand New\n",
  });
  await page.locator(".dn-wp-input").fill("brand new");
  await page.keyboard.press("Enter");

  // On no course: the spine has a filename but no course to name.
  await expect(page.locator(".dn-spine-breadcrumb")).not.toContainText("Maths for IT");

  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("add to a series");
  await page.keyboard.press("Enter");

  const ask = page.locator(".dn-ask-choices");
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("It is not in any series yet");
  await ask.locator(".dn-ask-choice", { hasText: "First Steps" }).click();

  // The course file gained one line, and nothing else moved.
  const written = await page.evaluate(() => (globalThis as any).__dewnoteWrites.at(-1));
  expect(written.path).toBe("courses/maths.yaml");
  expect(written.text).toContain("      - grid-of-numbers\n      - brand-new\n");

  // And the spine now knows where the tutorial sits.
  await expect(page.locator(".dn-spine-breadcrumb")).toContainText("Maths for IT");
  await expect(page.locator(".dn-spine-breadcrumb")).toContainText("First Steps");
});

test("Remove from a series takes a tutorial out of one it is in", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "courses/maths.yaml":
      "id: maths\ntitle: Maths for IT\ncontents:\n  - title: First Steps\n    tutorials:\n      - grid-of-numbers\n",
    "tutorials/grid-of-numbers/grid-of-numbers.md": "---\ntitle: Grid\n---\n\n# Grid\n",
  });
  await page.locator(".dn-wp-input").fill("grid");
  await page.keyboard.press("Enter");

  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("remove from a series");
  await page.keyboard.press("Enter");

  const ask = page.locator(".dn-ask-choices");
  await expect(ask).toContainText("Remove this tutorial from a series");
  await ask.locator(".dn-ask-choice", { hasText: "First Steps" }).click();

  const written = await page.evaluate(() => (globalThis as any).__dewnoteWrites.at(-1));
  expect(written.text).not.toContain("grid-of-numbers");
  expect(written.text).toContain("title: First Steps");
});

test("Check this document names a cell with no id and an id used twice", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/one.md": [
      "---", "title: One", "---", "",
      "# One", "",
      "```python exec", "print(1)", "```", "",
      "```python exec", "id: twice", "print(2)", "```", "",
      "```python exec", "id: twice", "print(3)", "```", "",
      "[x](tutorial:nowhere)", "",
    ].join("\n"),
  });
  await page.locator(".dn-wp-input").fill("one");
  await page.keyboard.press("Enter");

  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("check this document");
  await page.keyboard.press("Enter");

  const report = page.locator(".dn-report");
  await expect(report).toBeVisible();
  await expect(report).toContainText("no `id:`");
  await expect(report).toContainText("share the id `twice`");
  await expect(report).toContainText("tutorial:nowhere");
  // Every one of these is a fault the build or a reader would hit.
  await expect(report.locator(".dn-report-row.is-blocking")).toHaveCount(3);
});

test("a sound document says there is nothing to fix", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/one.md": "---\ntitle: One\n---\n\n# One\n\n```python exec\nid: first\nprint(1)\n```\n",
  });
  await page.locator(".dn-wp-input").fill("one");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("check this document");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-report h2")).toHaveText("No problems found in this document.");
});

test("the slash menu writes a question the build would accept", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/one.md": "---\ntitle: One\n---\n\n# One\n\nWords.\n",
  });
  await page.locator(".dn-wp-input").fill("one");
  await page.keyboard.press("Enter");

  await page.locator(".milkdown p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/multiple");
  // Clicked rather than entered: Enter takes whichever item the menu has
  // highlighted, and this test is about what one named item writes.
  await page.locator(".milkdown-slash-menu li", { hasText: "Multiple choice" }).first().click();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");

  const written = await page.evaluate(() => (globalThis as any).__dewnoteWrites.at(-1).text as string);
  expect(written).toContain("```question");
  expect(written).toContain("type: multiple-choice");
  expect(written).toContain("correct: 1");
  expect(written).not.toContain("/multiple");

  // And what it wrote is sound by the checker's own rules — the same
  // ones the build enforces.
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("check this document");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-report h2")).toHaveText("No problems found in this document.");
});

test("the slash menu writes three site panes under one name, each with its own id", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/one.md": "---\ntitle: One\n---\n\n# One\n\nWords.\n",
  });
  await page.locator(".dn-wp-input").fill("one");
  await page.keyboard.press("Enter");

  await page.locator(".milkdown p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/web");
  await page.locator(".milkdown-slash-menu li", { hasText: "Web page" }).first().click();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");

  const written = await page.evaluate(() => (globalThis as any).__dewnoteWrites.at(-1).text as string);
  for (const fence of ["```html site", "```css site", "```js site"]) {
    expect(written).toContain(fence);
  }
  // One `site:` groups them into one editor; three ids keep their saved
  // work apart.
  const sites = [...written.matchAll(/^site: (.+)$/gm)].map((match) => match[1]);
  expect(new Set(sites).size).toBe(1);
  expect(new Set([...written.matchAll(/^id: (.+)$/gm)].map((match) => match[1])).size).toBe(3);
});

test("the margin counts what is wrong, and the count opens the report", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "pages/one.md": [
      "---", "title: One", "---", "",
      "# One", "",
      "```python exec", "print(1)", "```", "",
    ].join("\n"),
  });
  await page.locator(".dn-wp-input").fill("one");
  await page.keyboard.press("Enter");

  // A cell with no id, found without anybody asking for it.
  const health = page.locator(".dn-spine-health");
  await expect(health).toHaveText("1 problem");
  await expect(health).toHaveClass(/is-blocking/);

  await health.click();
  await expect(page.locator(".dn-report")).toBeVisible();
  await expect(page.locator(".dn-report")).toContainText("no `id:`");
  await page.keyboard.press("Escape");

  // And it follows the document: give the cell an id and the line goes.
  await page.locator(".milkdown .cm-content").first().click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.type("id: first\n");
  await expect(health).toBeHidden();
});

test("opening a pull request says what would stop the build, and still lets you", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(
    (files) => (globalThis as any).__dewnote.useStubStore(files, true),
    {
      "tutorials/a/a.md": "---\ntitle: A\nyear: \"2026-2027\"\nversion: 2026.09.22.1\n---\n\n# A\n\nSound.\n",
      // A file nobody has open, with a cell that cannot save anybody's work.
      "tutorials/b/b.md": "---\ntitle: B\nyear: \"2026-2027\"\nversion: 2026.09.22.1\n---\n\n# B\n\n```python exec\nprint(1)\n```\n",
    },
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("pull request");
  await page.keyboard.press("Enter");

  const ask = page.locator(".dn-ask-overlay");
  await expect(ask).toContainText("1 problem in this workspace would stop the site building");
  expect(await page.evaluate(() => (globalThis as any).__dewnotePublished)).toBe(false);

  // Show the problems leads to the same report the command opens.
  await ask.getByText("Show the problems").click();
  await expect(page.locator(".dn-report")).toContainText("no `id:`");
  await expect(page.locator(".dn-report-where")).toContainText("tutorials/b/b.md");
  await page.keyboard.press("Escape");

  // And it is a warning, not a gate: a reviewer is the point of a pull
  // request, so unfinished work can still reach one.
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("pull request");
  await page.keyboard.press("Enter");
  await ask.getByText("Open the pull request anyway").click();
  await expect
    .poll(() => page.evaluate(() => (globalThis as any).__dewnotePublished))
    .toBe(true);
});

test("a sound workspace opens a pull request with nothing in the way", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(
    (files) => (globalThis as any).__dewnote.useStubStore(files, true),
    { "tutorials/a/a.md": "---\ntitle: A\nyear: \"2026-2027\"\nversion: 2026.09.22.1\n---\n\n# A\n\nSound.\n" },
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("pull request");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-ask-overlay")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => (globalThis as any).__dewnotePublished))
    .toBe(true);
});

test("Preview opens the page in a tab, with its stylesheet and maths inside it", async ({ page, context }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    "tutorials/a/a.md": [
      "---", "title: A Page", "---", "",
      "# A Page", "",
      "Some prose, and $x^2$ in it.", "",
    ].join("\n"),
  });
  await page.locator(".dn-wp-input").fill("a page");
  await page.keyboard.press("Enter");

  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("preview");
  const opened = context.waitForEvent("page");
  await page.keyboard.press("Enter");

  const tab = await opened;
  await tab.waitForLoadState();
  await expect(tab.locator("h1")).toHaveText("A Page");
  await expect(tab.locator(".katex").first()).toBeVisible();

  // The stylesheet reaches it and applies: the export once inlined the
  // literal string "[object Object]", and a page with no tokens reads in
  // the browser's default serif at full width. Headings are dewlab's
  // navy only if the reading stylesheet and the tokens both arrived.
  expect(await tab.evaluate(() => getComputedStyle(document.querySelector("h1")!).color))
    .toBe("rgb(27, 42, 74)");
  expect(await tab.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Georgia");
});

test("an image whose file is not there is counted in the margin and named in the report", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate(
    ([files, images]) =>
      (globalThis as any).__dewnote.useStubStore(files, false, images),
    [
      {
        "tutorials/a/a.md": [
          "---", "title: A", 'year: "2026-2027"', "version: 2026.09.22.1", "---", "",
          "# A", "",
          "![A diagram that is there](diagram.svg)", "",
          "![One that is not](gone.png)", "",
        ].join("\n"),
      },
      ["tutorials/a/diagram.svg"],
    ] as const,
  );
  await page.locator(".dn-wp-input").fill("a.md");
  await page.keyboard.press("Enter");

  await expect(page.locator(".dn-spine-health")).toHaveText("1 problem");
  await page.locator(".dn-spine-health").click();
  const report = page.locator(".dn-report");
  await expect(report).toContainText("The image `gone.png`");
  // The one that resolves is not mentioned.
  await expect(report).not.toContainText("diagram.svg");
});

test("a paragraph and a list item are the same size, and follow the setting", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="sample"]').click();
  await page.locator(".dn-wp-input").fill("everything");
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown p").first()).toBeVisible();

  // Crepe pins paragraphs at 16px and leaves list items alone, so these
  // two disagreeing is the symptom, and the size slider moving one of
  // them is the consequence.
  const sizes = () =>
    page.evaluate(() => ({
      paragraph: getComputedStyle(document.querySelector(".milkdown .ProseMirror p")!).fontSize,
      item: getComputedStyle(document.querySelector(".milkdown .ProseMirror li")!).fontSize,
    }));

  const before = await sizes();
  expect(before.item).toBe(before.paragraph);

  // Through the Appearance panel, the way an author changes it.
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("appearance");
  await page.keyboard.press("Enter");
  await page.locator(".dn-settings-row", { hasText: "Text size" }).locator("input").fill("24");
  await page.keyboard.press("Escape");

  expect(await sizes()).toEqual({ paragraph: "24px", item: "24px" });
});

test("the palette says its prompt once", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="sample"]').click();
  const box = page.locator(".dn-wp-box");
  await expect(box).toBeVisible();
  // A screen reader hears the prompt as the field's name; the eye sees
  // it once, as the placeholder. A `display: none` label would take the
  // name away, and a visible one would say the prompt twice.
  await expect(page.getByRole("textbox", { name: "Find a tutorial, a series, or something to do" }))
    .toBeVisible();
  const label = await box.locator("label").boundingBox();
  expect(label!.width * label!.height).toBeLessThanOrEqual(1);
});

test("the caret is drawn", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="sample"]').click();
  await page.locator(".dn-wp-input").fill("everything");
  await page.keyboard.press("Enter");
  await page.locator(".milkdown p").first().click();

  // Crepe turns on ProseMirror's virtual cursor, which hides the native
  // caret and draws its own from `--crepe-color-outline`. With Crepe's
  // colour contract unanswered that variable was empty, the border
  // declaration invalid, and there was no cursor of either kind.
  const cursor = page.locator(".prosemirror-virtual-cursor");
  await expect(cursor).toBeVisible();
  expect(
    await cursor.evaluate((el) => {
      const style = getComputedStyle(el);
      return style.borderLeftWidth !== "0px" && style.borderLeftColor !== "rgba(0, 0, 0, 0)";
    }),
  ).toBe(true);
});

test("Appearance opens from the corner as well as the palette", async ({ page }) => {
  await page.goto(BUILT_APP);
  // Nothing to set until there is something to look at.
  await expect(page.locator(".dn-gear")).toBeHidden();

  await page.locator('[data-choice="sample"]').click();
  await page.locator(".dn-wp-input").fill("everything");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-gear")).toBeVisible();

  await page.locator(".dn-gear").click();
  await expect(page.locator(".dn-settings")).toBeVisible();
});

test("the gate asks where the files are before it asks for a token", async ({ page }) => {
  await page.goto(BUILT_APP);
  // `display` on a class beats the browser's own `[hidden]`, so the
  // attribute alone does not hide this — the form was sitting open with
  // its token field on show.
  const form = page.locator(".dn-gate-repo");
  await expect(form).toBeHidden();

  await page.locator('[data-choice="repo"]').click();
  await expect(form).toBeVisible();
  await expect(page.locator('.dn-gate-repo [name="branch"]')).not.toHaveValue("");
});

test("the gate asks for a token and derives the rest", async ({ page }) => {
  // A token says who you are, not which repository you mean — so the
  // repository is still named, but from what the token reaches rather
  // than by typing it, and its owner and default branch come with it.
  await page.route("**/api.github.com/user/repos**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { name: "dewlab", owner: { login: "deweydex" }, default_branch: "trunk", permissions: { push: true } },
        { name: "notes", owner: { login: "someone" }, default_branch: "main", permissions: { push: true } },
        { name: "read-only", owner: { login: "x" }, default_branch: "main", permissions: { push: false } },
      ]),
    }),
  );
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="repo"]').click();

  const repo = page.locator('.dn-gate-repo [name="repo"]');
  await expect(repo).toBeDisabled();
  // Owner and base branch are not asked for at all any more.
  await expect(page.locator('.dn-gate-repo [name="owner"]')).toHaveCount(0);
  await expect(page.locator('.dn-gate-repo [name="base"]')).toHaveCount(0);

  await page.locator('.dn-gate-repo [name="token"]').fill("ghp_pretend");
  await expect(repo).toBeEnabled();
  await expect(repo.locator("option")).toHaveText(["deweydex/dewlab", "someone/notes"]);

  // Refusing to write to the repository's own default branch, which is
  // read from the repository rather than assumed to be `main`.
  await page.locator('.dn-gate-repo [name="branch"]').fill("trunk");
  await page.locator('.dn-gate-repo button[type="submit"]').click();
  await expect(page.locator(".dn-gate-problem")).toContainText("other than trunk");
  // And it is still usable rather than stuck mid-press.
  await expect(page.locator('.dn-gate-repo button[type="submit"]')).toBeEnabled();
});

test("an open panel keeps the document behind it out of reach", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="sample"]').click();
  await page.locator(".dn-wp-input").fill("everything");
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown p").first()).toBeVisible();

  await page.locator(".dn-gear").click();
  await expect(page.locator(".dn-settings")).toBeVisible();

  // Every panel is a `<dialog>` opened with `showModal()`, so the page
  // behind it is inert. Before that it was a div with a high z-index:
  // Tab walked out of the panel into the editor, and a screen reader
  // read straight through it.
  expect(
    await page.evaluate(() => {
      const editor = document.querySelector<HTMLElement>(".milkdown .ProseMirror")!;
      editor.focus();
      return document.activeElement === editor;
    }),
  ).toBe(false);

  // Escape is the dialog's own, with no key handler of ours behind it.
  await page.keyboard.press("Escape");
  await expect(page.locator(".dn-settings")).toBeHidden();
});

test("an empty block says how to reach the rest", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.locator('[data-choice="sample"]').click();
  await page.locator(".dn-wp-input").fill("everything");
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown p").first()).toBeVisible();

  await page.locator(".milkdown p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");

  // Crepe's own is "Please enter…", which is nobody's voice and teaches
  // nothing. An empty block is the one place the editor can say how to
  // reach everything a tutorial is made of.
  await expect(page.locator(".milkdown [data-placeholder]").first())
    .toHaveAttribute("data-placeholder", "Type / for a cell, a question or a hint");
});

async function editStoring(page: import("@playwright/test").Page) {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");
  await page.locator(".milkdown p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Unsaved words.");
  await expect(page.locator(".dn-spine-state")).toHaveText(/^Save \(/);
}

async function openAbout(page: import("@playwright/test").Page) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("about");
  await page.keyboard.press("Enter");
}

test("opening another document with unsaved changes asks first, and Keep editing keeps them", async ({ page }) => {
  await editStoring(page);
  await openAbout(page);

  await expect(page.locator(".dn-ask h2")).toHaveText("You have unsaved changes");
  await page.getByRole("button", { name: /Keep editing/ }).click();

  await expect(page.locator(".milkdown h1")).toHaveText("Storing and Computing");
  await expect(page.locator(".milkdown")).toContainText("Unsaved words.");
  await expect(page.locator(".dn-spine-state")).toHaveText(/^Save \(/);
});

test("Escape on the unsaved-changes question is the same as Keep editing", async ({ page }) => {
  await editStoring(page);
  await openAbout(page);
  await expect(page.locator(".dn-ask h2")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.locator(".dn-ask")).toBeHidden();
  await expect(page.locator(".milkdown h1")).toHaveText("Storing and Computing");
  await expect(page.locator(".milkdown")).toContainText("Unsaved words.");
  await expect(page.locator(".dn-spine-state")).toHaveText(/^Save \(/);
});

test("Discard changes opens the other document and writes nothing", async ({ page }) => {
  await editStoring(page);
  await openAbout(page);
  await page.getByRole("button", { name: /Discard changes/ }).click();

  await expect(page.locator(".milkdown h1")).toHaveText("About");
  const written = await page.evaluate(() => (globalThis as any).__dewnoteWrites);
  expect(written).toHaveLength(0);
});

test("Save and continue writes the changes, then opens the other document", async ({ page }) => {
  await editStoring(page);
  await openAbout(page);
  await page.getByRole("button", { name: /Save and continue/ }).click();

  await expect(page.locator(".milkdown h1")).toHaveText("About");
  const written = await page.evaluate(() => (globalThis as any).__dewnoteWrites);
  expect(written).toHaveLength(1);
  expect(written[0].text).toContain("Unsaved words.");
});

test("a document with no changes opens another without asking", async ({ page }) => {
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");
  await openAbout(page);
  await expect(page.locator(".milkdown h1")).toHaveText("About");
  await expect(page.locator(".dn-ask")).toHaveCount(0);
});

async function conflictOnSave(page: import("@playwright/test").Page) {
  await editStoring(page);
  await page.evaluate(() => {
    (globalThis as any).__dewnoteConflict = {
      path: "tutorials/storing-and-computing/storing-and-computing.md",
      theirs: "---\ntitle: Storing and Computing\nstatus: live\n---\n\n# Storing and Computing\n\nSomeone else's words.\n",
    };
  });
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".dn-conflict")).toBeVisible();
}

test("a save conflict shows what differs between the two versions", async ({ page }) => {
  await conflictOnSave(page);
  const dialog = page.locator(".dn-conflict");
  await expect(dialog.locator(".dn-conflict-theirs", { hasText: "Someone else's words." })).toHaveCount(1);
  await expect(dialog.locator(".dn-conflict-mine", { hasText: "Unsaved words." })).toHaveCount(1);
});

test("Keep mine after a conflict saves your version over the other", async ({ page }) => {
  await conflictOnSave(page);
  await page.getByRole("button", { name: "Keep mine" }).click();

  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");
  const written = await page.evaluate(() => (globalThis as any).__dewnoteWrites);
  expect(written).toHaveLength(1);
  expect(written[0].text).toContain("Unsaved words.");
  expect(written[0].text).not.toContain("Someone else's words.");
});

test("Keep the saved version after a conflict discards yours and shows theirs", async ({ page }) => {
  await conflictOnSave(page);
  await page.getByRole("button", { name: "Keep the saved version" }).click();

  await expect(page.locator(".milkdown")).toContainText("Someone else's words.");
  await expect(page.locator(".milkdown")).not.toContainText("Unsaved words.");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");
  expect(await page.evaluate(() => (globalThis as any).__dewnoteWrites)).toHaveLength(0);
});

test("Cancel after a conflict keeps your changes unsaved, and says so", async ({ page }) => {
  await conflictOnSave(page);
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.locator(".milkdown")).toContainText("Unsaved words.");
  await expect(page.locator(".dn-spine-state")).toHaveText(/^Save \(/);
  await expect(page.locator(".dn-spine-problem")).toContainText("Not saved");
});

/** The kept copies in IndexedDB, by key. Only call it once the app has
 * opened the database itself: opening it first from here would create
 * it with no store in it. */
async function keptCopies(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => new Promise<string[]>((resolve) => {
    const request = indexedDB.open("dewnote");
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("drafts")) return resolve([]);
      const keys = db.transaction("drafts").objectStore("drafts").getAllKeys();
      keys.onsuccess = () => resolve(keys.result.map(String));
    };
    request.onerror = () => resolve(["could not open"]);
  }));
}

async function editThenLoseTheTab(page: import("@playwright/test").Page) {
  // The browser's own "leave site?" prompt, which an author closing a
  // crashed or reloaded tab would answer yes to.
  page.on("dialog", (dialog) => void dialog.accept());
  await editStoring(page);
  // The copy is taken a moment after typing stops.
  await page.waitForTimeout(1_500);
  await page.reload();
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");
}

test("unsaved changes survive a lost tab, and are offered back", async ({ page }) => {
  await editThenLoseTheTab(page);
  const ask = page.locator(".dn-ask");
  await expect(ask).toContainText("Restore unsaved changes?");
  await page.getByRole("button", { name: /Restore my changes/ }).click();

  await expect(page.locator(".milkdown")).toContainText("Unsaved words.");
  // Restored, not saved: the author still decides.
  await expect(page.locator(".dn-spine-state")).toHaveText(/^Save \(/);
});

test("a kept copy can be discarded, and is not offered again", async ({ page }) => {
  await editThenLoseTheTab(page);
  await page.getByRole("button", { name: /Discard them/ }).click();
  await expect(page.locator(".milkdown")).not.toContainText("Unsaved words.");
  await expect.poll(() => keptCopies(page)).toEqual([]);

  await openAbout(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown h1")).toHaveText("Storing and Computing");
  await expect(page.locator(".dn-ask")).toHaveCount(0);
});

test("saving drops the kept copy", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await editStoring(page);
  await page.waitForTimeout(1_500);
  expect(await keptCopies(page)).toHaveLength(1);
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator(".dn-spine-state")).toHaveText("Saved");
  await expect.poll(() => keptCopies(page)).toEqual([]);
  await page.reload();
  await openWorkspace(page);
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown h1")).toHaveText("Storing and Computing");
  await expect(page.locator(".dn-ask")).toHaveCount(0);
});

test("courses come in the order courses/index.yaml gives them", async ({ page }) => {
  await page.goto(BUILT_APP);
  await page.evaluate((files) => (globalThis as any).__dewnote.useStubStore(files), {
    // Alphabetically "Algebra" would come first; the index says otherwise.
    "courses/index.yaml": "order:\n  - zoology\n  - algebra\n",
    "courses/algebra.yaml": "id: algebra\ntitle: Algebra\ncontents:\n  - title: Algebra Series\n    tutorials: []\n",
    "courses/zoology.yaml": "id: zoology\ntitle: Zoology\ncontents:\n  - title: Zoology Series\n    tutorials: []\n",
    "tutorials/a/a.md": '---\ntitle: A\nyear: "2026-2027"\nversion: 2026.09.22.1\n---\n\n# A\n',
  });
  await page.locator(".dn-wp-input").fill("series");
  const series = page.locator(".dn-wp-row", { hasText: "Series" }).locator(".dn-wp-row-label");
  await expect(series).toHaveText(["Zoology Series", "Algebra Series"]);
});

test("with no document open, the page says what to do, and remembers what was open", async ({ page }) => {
  await openWorkspace(page);
  await page.keyboard.press("Escape");

  const empty = page.locator(".dn-empty");
  await expect(empty.locator("h1")).toHaveText("No document open");
  // Nothing opened yet, so nothing to list.
  await expect(empty.locator(".dn-empty-recent")).toHaveCount(0);

  await empty.getByRole("button", { name: /Open a document/ }).click();
  await expect(page.locator(".dn-wp-overlay")).toBeVisible();
  await page.locator(".dn-wp-input").fill("storing");
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown h1")).toHaveText("Storing and Computing");
  await expect(page.locator(".dn-empty")).toHaveCount(0);

  // Next time, it is listed, and one click opens it.
  await openWorkspace(page);
  await page.keyboard.press("Escape");
  const recent = page.locator(".dn-empty-recent button");
  await expect(recent).toHaveCount(1);
  await expect(recent).toContainText("Storing and Computing");
  await recent.click();
  await expect(page.locator(".milkdown h1")).toHaveText("Storing and Computing");
});
