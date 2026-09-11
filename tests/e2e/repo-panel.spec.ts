// The repository rail (src/repo-panel.ts, src/github.ts) — step 5's
// first slice. Drives the real built app with GitHub's REST API stubbed
// via page.route, the same "real browser, no mock DOM" discipline every
// other spec in this folder follows (decision 9), just with the one
// external service this feature actually talks to intercepted rather
// than reached over the network.

import { test as base, expect, type Page, type Route } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");

// A 404 checking whether the working branch already exists
// (ensureBranch's own "does this ref exist" probe) is Chromium's own
// devtools noise for any non-2xx fetch, not an application error — the
// code treats that 404 as a normal, handled outcome (branchSha returns
// null), so it's filtered here rather than silencing console errors
// generally the way the other specs in this folder do not.
const EXPECTED_CONSOLE_NOISE = /Failed to load resource: the server responded with a status of 404/;

const test = base.extend<{ failOnConsoleErrors: void }>({
  failOnConsoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (msg) => {
        if (msg.type() === "error" && !EXPECTED_CONSOLE_NOISE.test(msg.text())) errors.push(msg.text());
      });
      await use();
      expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
});

function toBase64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** Stubs the exact GitHub calls this slice makes, keyed by method + a
 * pattern against the path. Anything unmatched 404s loudly rather than
 * hitting the real network — a route this test doesn't expect is a bug
 * in the test, not something to fall through on. */
async function mockGithub(page: Page, opts: { fileContent: string; fileSha: string }) {
  await page.route("https://api.github.com/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;

    if (method === "GET" && /\/git\/trees\//.test(path)) {
      return fulfillJson(route, 200, {
        tree: [
          { path: "content/tutorials/a-rule.md", type: "blob", sha: "tree-sha-1" },
          { path: "content/tutorials/sub/b-page.md", type: "blob", sha: "tree-sha-2" },
          { path: "assets/logo.png", type: "blob", sha: "tree-sha-3" },
        ],
      });
    }

    if (method === "GET" && /\/contents\//.test(path)) {
      return fulfillJson(route, 200, { content: toBase64(opts.fileContent), sha: opts.fileSha });
    }

    if (method === "GET" && /\/git\/ref\/heads\/dewnote-edits$/.test(path)) {
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }
    if (method === "GET" && /\/git\/ref\/heads\/main$/.test(path)) {
      return fulfillJson(route, 200, { object: { sha: "base-sha" } });
    }
    if (method === "POST" && /\/git\/refs$/.test(path)) {
      return fulfillJson(route, 201, { ref: "refs/heads/dewnote-edits" });
    }

    if (method === "PUT" && /\/contents\//.test(path)) {
      return fulfillJson(route, 200, { content: { sha: "new-sha" } });
    }

    if (method === "POST" && /\/pulls$/.test(path)) {
      return fulfillJson(route, 201, { html_url: "https://github.com/dewlab/dewlab/pull/42", number: 42 });
    }

    throw new Error(`repo-panel.spec.ts: unexpected GitHub call ${method} ${path}`);
  });
}

test.beforeEach(async ({ page }) => {
  // Stubbed before navigation, so anything main.ts fires on load is covered too.
  await mockGithub(page, { fileContent: "# A Rule\n\nWhere it lives.\n", fileSha: "file-sha-1" });
  // window.open would try to pop a real tab; no-op it before any click reaches it.
  await page.addInitScript(() => {
    (window as unknown as { open: () => null }).open = () => null;
  });
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
  await page.locator(".dn-repo-toggle").click();
  await page.locator('.dn-repo-panel input[type="password"]').fill("test-token");
  const ownerRepo = page.locator(".dn-repo-owner-row input");
  await ownerRepo.nth(0).fill("dewlab");
  await ownerRepo.nth(1).fill("dewlab");
});

test("loading a repository lists only its markdown files, and search filters them", async ({ page }) => {
  await page.locator(".dn-repo-load").click();
  await expect(page.locator(".dn-repo-status").first()).toHaveText("2 markdown files.");

  const items = page.locator(".dn-repo-file");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveText("content/tutorials/a-rule.md");
  await expect(items.nth(1)).toHaveText("content/tutorials/sub/b-page.md");

  await page.locator(".dn-repo-search").fill("sub");
  await expect(page.locator(".dn-repo-file")).toHaveCount(1);
  await expect(page.locator(".dn-repo-file")).toHaveText("content/tutorials/sub/b-page.md");
});

test("opening a file renders its real content in the editor", async ({ page }) => {
  await page.locator(".dn-repo-load").click();
  await page.locator(".dn-repo-file", { hasText: "a-rule.md" }).click();

  await expect(page.locator("h1")).toHaveText("A Rule");
  await expect(page.locator(".dn-block-render").filter({ hasText: "Where it lives." })).toBeVisible();
});

test("pushing an edit creates the working branch, commits, and offers a draft PR", async ({ page }) => {
  await page.locator(".dn-repo-load").click();
  await page.locator(".dn-repo-file", { hasText: "a-rule.md" }).click();
  await expect(page.locator("h1")).toHaveText("A Rule");

  await expect(page.locator(".dn-repo-push")).toHaveText("Push to dewnote-edits");
  await page.locator(".dn-repo-push").click();

  const pushStatus = page.locator(".dn-repo-section", { has: page.locator(".dn-repo-push") }).locator(".dn-repo-status");
  await expect(pushStatus).toHaveText("Pushed to dewnote-edits.");
  await expect(page.locator(".dn-repo-pr")).toBeVisible();

  await page.locator(".dn-repo-pr").click();
  await expect(pushStatus).toContainText("https://github.com/dewlab/dewlab/pull/42");
});
