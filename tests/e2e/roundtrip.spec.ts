// The test dewnote stands on.
//
// dewnote saves by re-serialising the document through Milkdown, so every
// construct dewlab and dewstack write has to survive a pass through it.
// Two properties are asserted, and they are not the same:
//
//   * nothing the document says is lost or changed: the first pass may
//     rewrite how the file is written, never what it says;
//   * the pass is idempotent, f(f(x)) == f(x), so a file is normalised at
//     most once and is byte-stable from then on.
//
// The second alone is not enough: a pass that deletes something is
// usually stable afterwards. Until the first was checked properly this
// suite passed while every inline `<br>` was being deleted.
//
// "What it says" is the markdown's parsed tree (structure.ts): headings,
// every fence's info string and whole body, front matter, HTML, tables,
// list numbering and task state, links, images and maths. The one
// rewrite the source gets first is the display-maths canonicalisation
// the editor applies before reading, which changes how a formula is
// written and, by dewlab's own reading, never what it renders.

import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { structureOf } from "./structure.ts";
import { canonicaliseDisplayMath } from "../../src/maths.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");
const FIXTURES = join(HERE, "..", "..", "fixtures");

function corpus(): { dialect: string; name: string; source: string }[] {
  const out: { dialect: string; name: string; source: string }[] = [];
  for (const dialect of readdirSync(FIXTURES)) {
    const dir = join(FIXTURES, dialect);
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;
      out.push({ dialect, name: `${dialect}/${file}`, source: readFileSync(join(dir, file), "utf8") });
    }
  }
  return out;
}

const FILES = corpus();

test.describe("round trip", () => {
  test("the corpus holds every dialect", () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(new Set(FILES.map((file) => file.dialect))).toEqual(new Set(["dewlab", "dewstack", "plain"]));
  });

  for (const { name, source } of FILES) {
    test(`says the same after a save: ${name}`, async ({ page }) => {
      await page.goto(BUILT_APP);
      const once = await page.evaluate(async (md) => {
        await (globalThis as any).__dewnote.open(md);
        return (globalThis as any).__dewnote.markdown() as string;
      }, source);

      expect(structureOf(once)).toEqual(structureOf(canonicaliseDisplayMath(source)));
    });

    test(`is idempotent: ${name}`, async ({ page }) => {
      await page.goto(BUILT_APP);
      const [once, twice] = await page.evaluate(async (md) => {
        const api = (globalThis as any).__dewnote;
        await api.open(md);
        const first = api.markdown() as string;
        await api.open(first);
        return [first, api.markdown() as string];
      }, source);

      // An editor that failed to mount returns "" twice, which is
      // perfectly idempotent.
      expect(once.trim()).not.toBe("");
      expect(twice).toBe(once);
    });
  }
});
