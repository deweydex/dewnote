import { expect, test, type Page, type Route } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");

async function stubDirectoryPicker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    function file(name: string, content: string) {
      return {
        kind: "file",
        name,
        async getFile() { return { text: async () => content }; },
        async createWritable() { return { async write() {}, async close() {} }; },
      };
    }
    function directory(name: string, children: Record<string, unknown>) {
      return {
        kind: "directory",
        name,
        async *entries() { for (const entry of Object.entries(children)) yield entry; },
      };
    }
    const root = directory("Teaching notes", {
      modules: directory("modules", {
        "foundations.yaml": file("foundations.yaml", "title: Foundations\ncontents:\n- title: First steps\n  tutorials:\n  - a-rule\n"),
      }),
      tutorials: directory("tutorials", {
        "a-rule": directory("a-rule", {
          "a-rule.md": file("a-rule.md", "---\ntitle: A Rule\n---\n\n# A Rule\n"),
        }),
      }),
    });
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => root;
  });
}

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function stubGithub(page: Page, options: { failPush?: boolean } = {}): Promise<void> {
  await page.route("https://api.github.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (/\/git\/ref\/heads\//.test(path)) return json(route, { object: { sha: "branch-sha" } });
    if (method === "PUT" && /\/contents\//.test(path)) {
      if (!options.failPush) return json(route, { content: { sha: "pushed-sha" } });
      // GitHub's own answer when the blob sha no longer matches: someone
      // else changed this file on the branch since it was opened.
      return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "does not match" }) });
    }
    if (/\/git\/trees\//.test(path)) {
      return json(route, { tree: [
        { path: "tutorials/a-rule/a-rule.md", type: "blob", sha: "document-sha" },
        { path: "modules/foundations.yaml", type: "blob", sha: "module-sha" },
      ] });
    }
    if (/\/contents\/modules\/foundations\.yaml$/.test(path)) {
      return json(route, { content: Buffer.from("title: Foundations\ncontents:\n- title: First steps\n  tutorials:\n  - a-rule\n").toString("base64"), sha: "module-sha" });
    }
    if (/\/contents\/tutorials\/a-rule\/a-rule\.md$/.test(path)) {
      return json(route, { content: Buffer.from("---\ntitle: A Rule\n---\n\n# A Rule\n").toString("base64"), sha: "document-sha" });
    }
    throw new Error(`Unexpected GitHub request: ${route.request().method()} ${path}`);
  });
}

test.beforeEach(async ({ page }) => {
  await stubDirectoryPicker(page);
  await page.goto(BUILT_APP);
});

test("starts with one source decision and no editing chrome", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "What are you working on?" })).toBeVisible();
  await expect(page.locator(".dn-source-choice")).toHaveCount(2);
  await expect(page.locator(".dn-spine")).toBeHidden();
  await expect(page.locator(".dn-icon-rail")).toBeHidden();
  await expect(page.locator(".dn-file-action-rail")).toBeHidden();
});

test("a local choice asks for a real document before showing its breadcrumb", async ({ page }) => {
  await page.getByRole("button", { name: /Open a local folder/ }).click();
  await expect(page.locator(".dn-source-gate")).toBeHidden();
  // The header is gone: the spine carries identity and state in the
  // margin the page already had (planning/UI_REVIEW.md §5).
  await expect(page.locator(".dn-workflow-header")).toHaveCount(0);
  await expect(page.locator(".dn-spine")).toBeVisible();
  await expect(page.locator(".dn-spine-context")).toHaveText("Teaching notes");
  // Opening a workspace is not opening a document. Until one of its
  // tutorials is on screen the spine invites a choice rather than
  // naming a place nothing is at.
  await expect(page.locator(".dn-spine-breadcrumb")).toHaveText("Choose a document…");
  // The palette arrives with the workspace, because choosing a document
  // is the next thing to do and it is the one navigator.
  await expect(page.locator(".dn-wp-overlay")).toBeVisible();
  await expect(page.locator(".dn-wp-row-label").first()).toHaveText("A Rule");

  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-wp-overlay")).toBeHidden();
  await expect(page.locator(".dn-spine-file")).toHaveText("tutorials/a-rule/a-rule.md");
  await expect(page.locator(".dn-spine-breadcrumb")).toContainText("Foundations › First steps › A Rule");
  await expect(page.locator(".dn-page h1")).toHaveText("A Rule");
});

test("the first tutorial in a series can be opened from the chooser", async ({ page }) => {
  await page.getByRole("button", { name: /Open a local folder/ }).click();
  await page.keyboard.type("a rule");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-wp-overlay")).toBeHidden();
  await expect(page.locator(".dn-spine-breadcrumb")).toContainText("A Rule");
  await expect(page.locator(".dn-page")).toContainText("A Rule");
});

test("everything the workspace menu held is reachable from the one key", async ({ page }) => {
  // The menu and the palette used to hold two lists of the same actions
  // under two sets of names. There is one list now (src/commands.ts),
  // and this is the check that nothing fell out of it on the way.
  await page.getByRole("button", { name: /Open a local folder/ }).click();
  await expect(page.locator(".dn-workflow-menu")).toHaveCount(0);
  await expect(page.locator(".dn-wp-overlay")).toBeVisible();

  const labels = await page.locator(".dn-wp-row-label").allTextContents();
  for (const wanted of [
    "Appearance…",
    "Whole-file source",
    "Check tutorial links",
    "Export a standalone HTML page",
    "Export a Jupyter notebook",
    "Import a Jupyter notebook…",
    "Open a Markdown or YAML file…",
    "Browse workspace files…",
    "Change workspace…",
  ]) {
    expect(labels).toContain(wanted);
  }

  // One transient surface at a time still holds: opening a panel from
  // the palette closes the palette first.
  await page.keyboard.type("appearance");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-wp-overlay")).toBeHidden();
  await expect(page.locator(".dn-settings-panel")).toBeVisible();
});

test("GitHub connection discovers modules, then yields to the document workflow", async ({ page }) => {
  await stubGithub(page);
  await page.getByRole("button", { name: /Connect a GitHub repository/ }).click();
  const repository = page.locator(".dn-repo-panel");
  await expect(repository).toBeVisible();
  await repository.locator('input[type="password"]').fill("test-token");
  const ownerRepo = repository.locator(".dn-repo-owner-row input");
  await ownerRepo.nth(0).fill("deweydex");
  await ownerRepo.nth(1).fill("dewlab");
  await repository.locator(".dn-repo-load").click();

  await expect(page.locator(".dn-source-gate")).toBeHidden();
  await expect(repository).toBeHidden();
  // The working branch is chosen before connecting, not discovered
  // afterwards in a panel this shell keeps closed — and the spine says
  // which branch a save will land on, beside the repository's name.
  await expect(page.locator(".dn-spine-context")).toHaveText("deweydex/dewlab · main → dewnote-edits");
  await expect(page.locator(".dn-spine-breadcrumb")).toHaveText("Choose a document…");
  await expect(page.locator(".dn-wp-overlay")).toBeVisible();
  await page.keyboard.type("a rule");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-spine-file")).toHaveText("tutorials/a-rule/a-rule.md");
  await expect(page.locator(".dn-spine-breadcrumb")).toContainText("Foundations › First steps › A Rule");
});

test("a refused push is said out loud rather than left in a closed panel", async ({ page }) => {
  // The repository panel writes every refusal into its own status line,
  // and the progressive shell closes that panel while a document is
  // open. Without a route out, Save could fail in total silence: the
  // push never happened, nothing said so, and the only trace was a
  // dirty marker that stayed lit.
  await stubGithub(page, { failPush: true });
  await page.getByRole("button", { name: /Connect a GitHub repository/ }).click();
  const repository = page.locator(".dn-repo-panel");
  await repository.locator('input[type="password"]').fill("test-token");
  const ownerRepo = repository.locator(".dn-repo-owner-row input");
  await ownerRepo.nth(0).fill("deweydex");
  await ownerRepo.nth(1).fill("dewlab");
  await repository.locator(".dn-repo-load").click();
  await expect(repository).toBeHidden();

  await page.keyboard.type("a rule");
  await page.keyboard.press("Enter");
  await expect(page.locator(".dn-page")).toContainText("A Rule");

  // Edit first: the case worth guarding is a refusal with real work
  // behind it, where saying nothing loses the edit.
  await page.locator(".dn-block-render").first().click();
  await page.keyboard.type("Edited. ");
  // The right margin is empty by design, which makes it the one place a
  // click blurs the block editor without opening another block.
  await page.mouse.click(1180, 600);
  await expect(page.locator(".dn-spine-state")).toHaveText("Save this");

  await page.locator(".dn-spine-state").click();
  const toast = page.locator(".dn-workflow-toast");
  await expect(toast).toBeVisible();
  await expect(toast).toHaveClass(/is-problem/);
  await expect(toast).toContainText("dewnote-edits");
  // The push did not happen, so the document is still unsaved and the
  // spine must keep saying so rather than settling to "Saved" — and it
  // holds the refusal where the work is, not only in a corner notice.
  await expect(page.locator(".dn-spine-state")).toHaveText("Save this");
  await expect(page.locator(".dn-spine-problem")).toContainText("dewnote-edits");

  // A conflict is the one refusal with a choice behind it, and that
  // choice only exists inside the store's own panel.
  await page.locator(".dn-spine-problem-action").click();
  await expect(repository).toBeVisible();
  await expect(page.locator(".dn-repo-conflict")).toBeVisible();
});

test("closing repository setup returns to the source choice", async ({ page }) => {
  await page.getByRole("button", { name: /Connect a GitHub repository/ }).click();
  await page.locator(".dn-repo-close").click();
  await expect(page.getByRole("heading", { name: "What are you working on?" })).toBeVisible();
  await expect(page.locator(".dn-source-choice")).toHaveCount(2);
});
