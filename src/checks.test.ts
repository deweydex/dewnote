import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { idFromPath } from "./workspace.ts";
import { isImageName } from "./images.ts";
import { checkDocument, checkWorkspace, imagesIn } from "./checks.ts";

// The measurement that matters. dewlab's own build accepts every file in
// the checkout, so any blocking report against one of them is a false
// positive — and a checker that reports nothing on a broken file is
// worth nothing either, so the same real file is broken three ways and
// has to be caught each time. Skips itself when the sibling repository
// is not there, the same discipline courses.test.ts uses.
const DEWLAB = "../dewlab";
/** `staging/` holds an import mid-flight and `site/` is built. */
const SKIPPED = new Set(["site", "staging", "node_modules", ".git"]);
const CHECKED_OUT = existsSync(DEWLAB);

function dewlabPages(): { path: string; content: string }[] {
  const found: { path: string; content: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIPPED.has(name)) continue;
      const at = join(dir, name);
      if (statSync(at).isDirectory()) walk(at);
      else if (name.endsWith(".md")) found.push({ path: relative(DEWLAB, at), content: readFileSync(at, "utf8") });
    }
  };
  walk(DEWLAB);
  return found;
}

/** Every image in the checkout, which is what the image rule needs to
 * tell a renamed file from a sound one. */
function dewlabImages(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIPPED.has(name)) continue;
      const at = join(dir, name);
      if (statSync(at).isDirectory()) walk(at);
      else if (isImageName(name)) found.add(relative(DEWLAB, at));
    }
  };
  walk(DEWLAB);
  return found;
}

describe(`the dewlab checkout: ${DEWLAB}${CHECKED_OUT ? "" : " (not checked out — skipped)"}`, () => {
  test.skipIf(!CHECKED_OUT)("every page the build accepts, the checker accepts too", () => {
    const pages = dewlabPages();
    expect(pages.length).toBeGreaterThan(100);
    const around = {
      ids: new Set(pages.map((page) => idFromPath(page.path))),
      images: dewlabImages(),
    };
    expect(checkWorkspace(pages, around)).toEqual([]);
  });

  // dewlab has a tutorial about alt text whose fence deliberately holds
  // `<img src="does-not-exist.jpg">`, and one about file size quoting
  // `images/hero.jpg`. Both are teaching material inside a fence, and a
  // rule that read fences would call each of them a fault.
  test.skipIf(!CHECKED_OUT)("an image written inside a fence is not a reference", () => {
    const pages = dewlabPages();
    const alt = pages.find((page) => page.path.includes("images-and-alt-text"))!;
    expect(alt.content).toContain("does-not-exist.jpg");
    expect(imagesIn(alt.content).map((image) => image.src)).not.toContain("does-not-exist.jpg");
  });

  test.skipIf(!CHECKED_OUT)("an image whose file is not there is caught", () => {
    const pages = dewlabPages();
    const around = {
      ids: new Set(pages.map((page) => idFromPath(page.path))),
      images: dewlabImages(),
    };
    const withImage = pages.find(
      (page) => page.path.startsWith("tutorials/") && imagesIn(page.content).length > 0,
    );
    // A page with a real image, so the rule is measured against one that
    // resolves before it is measured against one that does not.
    expect(withImage).toBeDefined();
    const path = withImage!.path;
    expect(checkDocument(withImage!.content, { ...around, path })).toEqual([]);

    const renamed = withImage!.content.replace(
      imagesIn(withImage!.content)[0]!.src,
      "renamed-since.png",
    );
    expect(checkDocument(renamed, { ...around, path }).map((problem) => problem.message)).toEqual([
      expect.stringContaining("The image `renamed-since.png`"),
    ]);
  });

  test.skipIf(!CHECKED_OUT)("a real question fence broken three ways is caught each time", () => {
    const tutorial = "tutorials/counting-carefully/counting-carefully.md";
    const pages = dewlabPages();
    const sound = pages.find((page) => page.path === tutorial)!.content;
    const around = { ids: new Set(pages.map((page) => idFromPath(page.path))) };
    expect(checkDocument(sound, around)).toEqual([]);

    const breaks: [string, string, RegExp][] = [
      ["correct: 2", "correct: 9", /names none of the 3 options/],
      ["type: multiple-choice", "type: essay", /`type: essay`/],
      ["id: permutation-or-combination\n", "", /question with no `id:`/],
    ];
    for (const [from, to, expected] of breaks) {
      const broken = sound.replace(from, to);
      expect(broken).not.toBe(sound);
      expect(checkDocument(broken, around).map((problem) => problem.message).join(" | ")).toMatch(expected);
    }
  });
});

describe("tutorial front matter, as dewlab's build checks it", () => {
  const path = "tutorials/grid/grid.md";
  const around = { ids: new Set<string>(), path };
  const page = (front: string) => `---\n${front}\n---\n\n# Grid\n`;
  const messages = (front: string, at = path) =>
    checkDocument(page(front), { ...around, path: at }).map((problem) => `${problem.severity}: ${problem.message}`);

  test("a sound tutorial passes", () => {
    expect(messages('title: Grid\nyear: "2026-2027"\nversion: 2026.09.22.1\nstatus: live')).toEqual([]);
  });

  test("no year and no version both stop the build", () => {
    const found = messages("title: Grid");
    expect(found).toHaveLength(2);
    expect(found.join(" | ")).toContain("blocking: No `year:`");
    expect(found.join(" | ")).toContain("blocking: No `version:`");
  });

  test("an unknown status stops the build; beta does not", () => {
    expect(messages('title: G\nyear: "2026-2027"\nversion: 2026.09.22.1\nstatus: published').join()).toContain("`status: published`");
    expect(messages('title: G\nyear: "2026-2027"\nversion: 2026.09.22.1\nstatus: beta')).toEqual([]);
  });

  test("a retired field stops the build and says where it went", () => {
    expect(messages('title: G\nyear: "2026-2027"\nversion: 2026.09.22.1\nslug: grid').join())
      .toContain("`slug:` no longer belongs in the front matter");
  });

  test("a site page is not held to a tutorial's fields", () => {
    expect(messages("title: About", "pages/about.md")).toEqual([]);
  });
});

describe("a fence at the very end of a file", () => {
  test("is read whole when the file has no final newline", () => {
    const source = [
      "---", "title: Q", "---", "", "# Q", "",
      "```question", "id: q", "type: multiple-choice", "correct: 2", "", "Which?", "", "- One.", "- Two.", "```",
    ].join("\n");
    expect(checkDocument(source, { ids: new Set() })).toEqual([]);
  });
});

describe("each rule fires on what it is for", () => {
  const path = "tutorials/t/t.md";
  const front = '---\ntitle: T\nyear: "2026-2027"\nversion: 2026.09.22.1\n---\n\n# T\n\n';
  const found = (body: string, ids: string[] = []) =>
    checkDocument(front + body, { ids: new Set(ids), path, images: new Set() });

  // Each case: a document broken one way, the words its problem must
  // contain, and whether it stops the build.
  const cases: [string, string, RegExp, "blocking" | "worth fixing"][] = [
    ["a cell with no id", "```python exec\nprint(1)\n```\n", /runnable cell with no `id:`/, "blocking"],
    ["a pane with no id", "```html site\nsite: s\n<p>x</p>\n```\n", /web page pane with no `id:`/, "blocking"],
    ["a question with no id", "```question\ntype: fill-in-the-blank\n\nA {gap}.\n```\n", /question with no `id:`/, "blocking"],
    [
      "one id shared by a cell and a question",
      "```python exec\nid: same\nx = 1\n```\n\n```question\nid: same\ntype: fill-in-the-blank\n\nA {gap}.\n```\n",
      /share the id `same`/,
      "blocking",
    ],
    ["a pane with no site", "```css site\nid: p\np { color: red; }\n```\n", /no `site:` line/, "blocking"],
    ["a question with no type", "```question\nid: q\n\nA {gap}.\n```\n", /no `type:` line/, "blocking"],
    ["a gap that never closes", "```question\nid: q\ntype: fill-in-the-blank\n\nA {gap.\n```\n", /never closes/, "blocking"],
    ["a fill-in with no gap", "```question\nid: q\ntype: fill-in-the-blank\n\nNo gap.\n```\n", /with no gap/, "blocking"],
    ["a card with no url", "```card\n## A card\n\nWords.\n```\n", /card with no `url:`/, "blocking"],
    ["a card with no heading", "```card\nurl: /x\n\nWords.\n```\n", /does not start with a heading/, "blocking"],
    ["a link to no tutorial", "See [this](tutorial:nowhere).\n", /`tutorial:nowhere`/, "blocking"],
    ["an image that is not there", "![A picture](missing.png)\n", /`missing\.png`/, "blocking"],
  ];

  for (const [name, body, message, severity] of cases) {
    test(name, () => {
      const problems = found(body);
      const match = problems.find((problem) => message.test(problem.message));
      expect(match, problems.map((problem) => problem.message).join(" | ")).toBeDefined();
      expect(match!.severity).toBe(severity);
    });
  }

  test("a link to a tutorial that exists is fine", () => {
    expect(found("See [this](tutorial:somewhere).\n", ["somewhere"])).toEqual([]);
  });

  test("a problem names the line it is on", () => {
    const problems = found("Prose.\n\n```python exec\nprint(1)\n```\n");
    // Front matter (5 lines), a blank, the heading, a blank, prose, a
    // blank: the fence opens on line 11.
    expect(problems.map((problem) => problem.line)).toEqual([11]);
  });

  test("a bad version is worth fixing on a site page, and stops a tutorial", () => {
    const page = checkDocument("---\ntitle: About\nversion: soon\n---\n", { ids: new Set(), path: "pages/about.md" });
    expect(page.map((problem) => problem.severity)).toEqual(["worth fixing"]);
    const tutorial = checkDocument('---\ntitle: T\nyear: "2026-2027"\nversion: soon\n---\n', { ids: new Set(), path });
    expect(tutorial.map((problem) => problem.severity)).toEqual(["blocking"]);
  });

  test("every retired front-matter field is caught", () => {
    for (const field of ["order", "slug", "module", "module_title", "series"]) {
      const source = `---\ntitle: T\nyear: "2026-2027"\nversion: 2026.09.22.1\n${field}: x\n---\n`;
      expect(checkDocument(source, { ids: new Set(), path }).map((problem) => problem.message).join())
        .toContain(`\`${field}:\``);
    }
  });
});

describe("checkWorkspace", () => {
  test("a README at the top is not a page; one in a tutorial's folder is, as dewlab's build loads it", () => {
    const problems = checkWorkspace(
      [
        { path: "README.md", content: "# dewlab\n" },
        { path: "tutorials/t/README.md", content: "Notes, no front matter.\n" },
      ],
      { ids: new Set() },
    );
    expect([...new Set(problems.map((problem) => problem.path))]).toEqual(["tutorials/t/README.md"]);
  });
});
