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
// is not there, the same discipline modules.test.ts uses.
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
      expect.stringContaining("`renamed-since.png` is not a file here"),
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
