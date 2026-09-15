// A prose block's own keyboard shortcut for the "+" menu (buildSlashMenu,
// app.ts) — typing "/" turns the block itself into a menu, rather than
// reaching for the mouse. Touches no Pyodide worker, so belongs in the
// suite that runs everywhere, same as surface.spec.ts.

import { blockMenuItem, pointAt } from "./block-controls.ts";
import { test as base, expect, type Page } from "@playwright/test";
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

async function mount(page: Page, source: string) {
  await page.evaluate((src) => (window as any).__dewnote.mount(src), source);
}

async function getSource(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__dewnote.getSource());
}

/** Opens a fresh, empty paragraph the same way a reader actually would —
 * through the "+" menu, not by hand-clearing an existing block's own
 * text — so the block keeps its own trailing blank line exactly the way
 * NEW_BLOCK_SPEC.paragraph leaves it. Returns the block's own live
 * CodeMirror content host, already focused with "New paragraph."
 * selected (insertAfter's own tail), ready to type over. */
async function freshParagraph(page: Page) {
  await pointAt(page, 0);
  await page.locator(".dn-add-btn").click();
  await blockMenuItem(page, ".dn-add-menu", "Paragraph").click();
  return page.locator(".dn-block-prose .dn-block-source .cm-content").first();
}

test.beforeEach(async ({ page }) => {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
  await mount(page, "One.\n\nTwo.\n");
});

/** The labels the slash menu is showing, in the order it draws them. */
function slashLabels(page: Page) {
  return page.locator(".dn-slash-menu .dn-block-menu-label");
}

test("typing '/' then a letter opens the menu, filtered to matching kinds", async ({ page }) => {
  await freshParagraph(page);
  await page.keyboard.type("/c");
  await expect(page.locator(".dn-slash-menu")).toHaveClass(/is-open/);
  // Code cell by its label, Hint by its "clue", Practice problem by the
  // letter sitting in the middle of it — the three tiers at once, and
  // Code cell selected because a label that starts with the query beats
  // both of the others.
  await expect(slashLabels(page)).toHaveText(["Code cell", "Hint", "Practice problem"]);
  await expect(page.locator(".dn-slash-menu .dn-block-menu-item.is-selected .dn-block-menu-label")).toHaveText("Code cell");
});

test("'/' alone offers everything the \"+\" button does, bar the paragraph it is already in", async ({ page }) => {
  // The two menus used to disagree: the "+" button offered six kinds,
  // this one offered three, and two more were shown only on a page
  // whose front matter said practice_for. One list now, grouped, and
  // the only kind missing here is the one that would do nothing —
  // a block you can type "/" into is already a paragraph.
  await freshParagraph(page);
  await page.keyboard.type("/");
  await expect(slashLabels(page)).toHaveText(["Link", "Image", "Code cell", "Math", "Hint", "Answer", "Practice problem"]);
  await expect(page.locator(".dn-slash-menu .dn-block-menu-group")).toHaveText(["Write", "Run", "Teach"]);
});

test("search reaches a kind by a word that is not in its label", async ({ page }) => {
  // "python" is not the label "Code cell" and "solution" is not
  // "Answer". A reader who knows the thing by another name types that
  // name; the menu's own keywords are what let it answer.
  await freshParagraph(page);
  await page.keyboard.type("/py");
  await expect(slashLabels(page)).toHaveText(["Code cell"]);

  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("/sol");
  await expect(slashLabels(page)).toHaveText(["Answer"]);
});

test("the best match is selected even when its group draws it last", async ({ page }) => {
  // "a" starts Answer's label and sits in the middle of Image, Math and
  // Practice problem. Ranked, Answer is first; drawn, it is third,
  // because the results go back into their groups and Write comes
  // before Teach. Both are on purpose: the eye finds a kind where it
  // always sits, and Enter still takes what the ranking chose.
  await freshParagraph(page);
  await page.keyboard.type("/a");
  await expect(slashLabels(page)).toHaveText(["Image", "Math", "Answer", "Practice problem"]);
  await expect(page.locator(".dn-slash-menu .dn-block-menu-item.is-selected .dn-block-menu-label")).toHaveText("Answer");

  await page.keyboard.press("Enter");
  expect(await getSource(page)).toContain('<details class="dl-answer">');
});

test("confirming with a mouse click replaces the block in place, not after it", async ({ page }) => {
  await freshParagraph(page);
  await page.keyboard.type("/c");
  await blockMenuItem(page, ".dn-slash-menu", "Code cell").click();

  const source = await getSource(page);
  expect(source).toContain("```python exec\nid: new-cell-1\n");
  expect(source).not.toContain("New paragraph.");
  // Replaced, not inserted after: still exactly the two original prose
  // blocks' worth of content plus the one new fence, nothing left over.
  expect(source).toContain("One.");
  expect(source).toContain("Two.");
  await expect(page.locator(".dn-block-fence")).toHaveCount(1);
});

test("confirming with Enter uses the item the arrow keys landed on, not always the first", async ({ page }) => {
  await freshParagraph(page);
  // "figure" on Image, "formula" on Math, "fold" on both Hint and
  // Answer — four kinds, none of whose labels start with the letter.
  await page.keyboard.type("/f");
  await expect(slashLabels(page)).toHaveText(["Image", "Math", "Hint", "Answer"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".dn-slash-menu .dn-block-menu-item.is-selected .dn-block-menu-label")).toHaveText("Answer");
  await page.keyboard.press("Enter");

  const source = await getSource(page);
  expect(source).toContain('<details class="dl-answer">');
  await expect(page.locator(".dn-block-fold")).toHaveCount(1);
});

test("the new block's own live editor is focused immediately, cursor ready to type", async ({ page }) => {
  await freshParagraph(page);
  await page.keyboard.type("/c");
  await page.keyboard.press("Enter");
  await page.keyboard.type("6 * 7");

  expect(await getSource(page)).toContain("id: new-cell-1\n6 * 7\n");
});

test("Escape dismisses the menu, and it stays dismissed through further matching keystrokes", async ({ page }) => {
  await freshParagraph(page);
  await page.keyboard.type("/m");
  await expect(page.locator(".dn-slash-menu")).toHaveClass(/is-open/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".dn-slash-menu")).not.toHaveClass(/is-open/);

  // Still matches "Math" by prefix, but Escape's own dismissal holds
  // until the slash pattern breaks — not just for the one keystroke.
  await page.keyboard.type("a");
  await expect(page.locator(".dn-slash-menu")).not.toHaveClass(/is-open/);

  await page.keyboard.type("th note.");
  await page.locator(".dn-block-prose .dn-block-source .cm-content").first().evaluate((el) => el.blur());
  expect(await getSource(page)).toContain("/math note.");
});

test("text matching no kind closes the menu, and stays as ordinary prose", async ({ page }) => {
  await freshParagraph(page);
  await page.keyboard.type("/xyz");
  await expect(page.locator(".dn-slash-menu")).not.toHaveClass(/is-open/);

  await page.locator(".dn-block-prose .dn-block-source .cm-content").first().evaluate((el) => el.blur());
  const source = await getSource(page);
  expect(source).toContain("/xyz");
  await expect(page.locator(".dn-block-fence")).toHaveCount(0);
});

test("a math block's own raw editor gets no slash menu at all", async ({ page }) => {
  await mount(page, "One.\n\n$$\nx = 1\n$$\n\nTwo.\n");
  await page.locator(".dn-block-math .dn-block-render").click();
  await expect(page.locator(".dn-block-math .dn-block-source")).toBeVisible();
  await expect(page.locator(".dn-slash-menu")).toHaveCount(0);
});
