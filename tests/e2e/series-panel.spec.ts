// The placement view (src/courses.ts, src/series-panel.ts) — drives the
// real built app: seed course data and a file index the same way
// link-picker.spec.ts and link-check.spec.ts do, open the rail, and check
// it groups by course then series, keeps each course file's own order,
// prefers an indexed title over a bare id, and names both halves of a
// placement that doesn't line up.

import { test as base, expect } from "@playwright/test";
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

type IndexEntry = {
  path: string;
  id?: string;
  title?: string;
  status?: string;
  version?: string;
  courses?: string[];
};
type CourseSeed = {
  id: string;
  path: string;
  title: string;
  contents: { title: string; tutorials: string[]; tutorialsRange: null; indent: string }[];
};
type TestHook = {
  setFileIndex(index: IndexEntry[]): void;
  setCourses(courses: CourseSeed[]): void;
};

test.beforeEach(async ({ page }) => {
  await page.goto(BUILT_APP);
  await expect(page.locator(".dn-block").first()).toBeVisible();
});

test("groups by course then series, in the course file's own order, preferring an indexed title over the bare id", async ({ page }) => {
  await page.evaluate(() => {
    const hook = window as unknown as { __dewnote: TestHook };
    hook.__dewnote.setFileIndex([
      {
        path: "tutorials/first-steps/first-steps.md",
        id: "first-steps",
        title: "First Steps",
        courses: ["computational-methods"],
      },
    ]);
    hook.__dewnote.setCourses([
      {
        id: "computational-methods",
        path: "courses/computational-methods.yaml",
        title: "Computational Methods",
        contents: [
          {
            title: "Python fundamentals",
            tutorials: ["first-steps", "working-with-tables"],
            tutorialsRange: null,
            indent: "  ",
          },
        ],
      },
    ]);
  });

  await page.locator(".dn-series-toggle").click();
  await expect(page.locator(".dn-series-module h3")).toHaveText("Computational Methods");
  await expect(page.locator(".dn-series-block h4")).toHaveText("Python fundamentals");

  const items = page.locator(".dn-series-list li");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveText("First Steps");
  // A course listing an id with no file behind it — dewlab's own build
  // stops on this, so the panel names it rather than showing a bare id.
  await expect(items.nth(1)).toHaveText("working-with-tables — no file");
});

test("with several versions of one tutorial indexed, the list shows the live one's title", async ({ page }) => {
  await page.evaluate(() => {
    const hook = window as unknown as { __dewnote: TestHook };
    // A frozen release carries the id of the folder it sits in, the same
    // as the live file beside it — so an id is still several files.
    hook.__dewnote.setFileIndex([
      {
        path: "tutorials/filtering/v2026.01.01.1.md",
        id: "filtering",
        title: "Filtering (old draft title)",
        status: "archived",
        version: "2026.01.01.1",
        courses: ["data"],
      },
      {
        path: "tutorials/filtering/filtering.md",
        id: "filtering",
        title: "Filtering",
        status: "live",
        version: "2026.06.01.1",
        courses: ["data"],
      },
    ]);
    hook.__dewnote.setCourses([
      {
        id: "data",
        path: "courses/data.yaml",
        title: "Data",
        contents: [
          { title: "A series", tutorials: ["filtering"], tutorialsRange: null, indent: "  " },
        ],
      },
    ]);
  });

  await page.locator(".dn-series-toggle").click();
  await expect(page.locator(".dn-series-list li")).toHaveText("Filtering");
});

test("several courses each get their own section, in index.yaml's order rather than alphabetically", async ({ page }) => {
  await page.evaluate(() => {
    const hook = window as unknown as { __dewnote: TestHook };
    hook.__dewnote.setCourses([
      {
        id: "web-authoring",
        path: "courses/web-authoring.yaml",
        title: "Web Authoring",
        contents: [
          { title: "First site", tutorials: ["a-form"], tutorialsRange: null, indent: "  " },
        ],
      },
      {
        id: "computational-methods",
        path: "courses/computational-methods.yaml",
        title: "Computational Methods",
        contents: [
          { title: "Python fundamentals", tutorials: ["first-steps"], tutorialsRange: null, indent: "  " },
        ],
      },
    ]);
  });

  await page.locator(".dn-series-toggle").click();
  const courses = page.locator(".dn-series-module h3");
  await expect(courses).toHaveCount(2);
  // The order courses.ts handed over, which is index.yaml's — a course's
  // place in the list is a real decision, not something to re-sort.
  await expect(courses.nth(0)).toHaveText("Web Authoring");
  await expect(courses.nth(1)).toHaveText("Computational Methods");
});

test("a tutorial no course lists is shown under its own heading, not treated as an error", async ({ page }) => {
  await page.evaluate(() => {
    const hook = window as unknown as { __dewnote: TestHook };
    hook.__dewnote.setFileIndex([
      {
        path: "tutorials/listed/listed.md",
        id: "listed",
        title: "Listed",
        courses: ["a-course"],
      },
      // Published but on no course — a real, buildable state in dewlab.
      { path: "tutorials/loose/loose.md", id: "loose", title: "Loose", courses: [] },
    ]);
    hook.__dewnote.setCourses([
      {
        id: "a-course",
        path: "courses/a-course.yaml",
        title: "A Course",
        contents: [
          { title: "A series", tutorials: ["listed"], tutorialsRange: null, indent: "  " },
        ],
      },
    ]);
  });

  await page.locator(".dn-series-toggle").click();
  const unlisted = page.locator(".dn-series-unlisted");
  await expect(unlisted.locator("h3")).toHaveText("On no course");
  await expect(unlisted.locator(".dn-series-list li")).toHaveText("Loose");
});

test("without course files read at all, nothing is reported as unlisted", async ({ page }) => {
  await page.evaluate(() => {
    const hook = window as unknown as { __dewnote: TestHook };
    // No `courses` key: never cross-referenced, which is not the same as
    // being on no course. A folder with no courses/ directory shouldn't
    // report every tutorial in it.
    hook.__dewnote.setFileIndex([
      { path: "tutorials/loose/loose.md", id: "loose", title: "Loose" },
    ]);
    hook.__dewnote.setCourses([]);
  });

  await page.locator(".dn-series-toggle").click();
  await expect(page.locator(".dn-series-unlisted")).toHaveCount(0);
  await expect(page.locator(".dn-series-empty")).toBeVisible();
});

test("with no course data at all, the panel says so instead of showing nothing", async ({ page }) => {
  await page.locator(".dn-series-toggle").click();
  await expect(page.locator(".dn-series-empty")).toBeVisible();
});

test("the command palette can open the courses rail too", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator(".dn-palette-input").fill("Courses");
  await page.locator(".dn-palette-item button").first().click();
  await expect(page.locator(".dn-series-panel")).toBeVisible();
});
