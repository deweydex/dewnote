// The test the rebuild stands on.
//
// dewnote now saves by re-serialising the document (REBUILD.md §4), so
// every construct dewlab and dewstack write has to survive a pass through
// Milkdown. Two properties are asserted, and they are not the same:
//
//   * nothing structural is lost — fence info strings, cell ids, headings
//     and raw-HTML folds come back exactly as they went in;
//   * the pass is idempotent — f(f(x)) == f(x) — so a file is normalised
//     at most once and is byte-stable from then on.
//
// The second is what makes the first tolerable. A file that differs on
// the first pass differs in formatting only, once, and can be reviewed as
// a formatting commit. A file that differed on every pass would churn.

import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILT_APP = "file://" + resolve(HERE, "../../dist/index.html");
const FIXTURES = join(HERE, "..", "..", "fixtures");

function corpus(): { name: string; source: string }[] {
  const out: { name: string; source: string }[] = [];
  for (const dialect of readdirSync(FIXTURES)) {
    const dir = join(FIXTURES, dialect);
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;
      out.push({ name: `${dialect}/${file}`, source: readFileSync(join(dir, file), "utf8") });
    }
  }
  return out;
}

const FILES = corpus();

/** A fence's whole info string, opening fences only. */
const fences = (s: string) =>
  [...s.matchAll(/^```(.*)$/gm)].map((m) => m[1]).filter((_, i) => i % 2 === 0);
const cellIds = (s: string) => [...s.matchAll(/^id:\s*(\S+)/gm)].map((m) => m[1]);
const headings = (s: string) => [...s.matchAll(/^(#{1,6})\s+(.*)$/gm)].map((m) => m[0]);
const folds = (s: string) => (s.match(/<details/g) ?? []).length;
// Delimiter pairs, not `$$` at a line start: dewlab sometimes opens a
// block with content on the same line, and the pass normalises that to
// the three-line form without losing a block.
const mathBlocks = (s: string) => (s.match(/\$\$/g) ?? []).length;

test.describe("round trip", () => {
  test("the corpus is not empty", () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  for (const { name, source } of FILES) {
    test(`keeps everything structural: ${name}`, async ({ page }) => {
      await page.goto(BUILT_APP);
      const once = await page.evaluate(async (md) => {
        await (globalThis as any).__dewnote.open(md);
        return (globalThis as any).__dewnote.markdown() as string;
      }, source);

      expect(fences(once), "fence info strings").toEqual(fences(source));
      expect(cellIds(once), "cell ids").toEqual(cellIds(source));
      expect(headings(once), "headings").toEqual(headings(source));
      expect(folds(once), "<details> folds").toBe(folds(source));
      expect(mathBlocks(once), "display maths blocks").toBe(mathBlocks(source));
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

      expect(twice).toBe(once);
    });
  }
});
