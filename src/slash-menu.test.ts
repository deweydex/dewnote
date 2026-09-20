import { describe, expect, test } from "bun:test";
import { freeId, idMaker, SNIPPETS } from "./slash-menu.ts";
import { checkDocument } from "./checks.ts";

const snippet = (key: string, used: string[] = []) =>
  SNIPPETS.find((item) => item.key === key)!.markdown(idMaker(used));

describe("freeId", () => {
  test("starts at one", () => {
    expect(freeId([], "cell")).toBe("cell-1");
  });

  test("skips what is taken, because an id is a key somebody's work lives under", () => {
    expect(freeId(["cell-1", "cell-2"], "cell")).toBe("cell-3");
  });

  test("ignores ids that are not of this shape", () => {
    expect(freeId(["first-sum", "totals"], "cell")).toBe("cell-1");
  });
});

describe("idMaker", () => {
  test("never hands the same id back twice, so one snippet can write three blocks", () => {
    const free = idMaker(["cell-1"]);
    expect([free("cell"), free("cell"), free("cell")]).toEqual(["cell-2", "cell-3", "cell-4"]);
  });

  test("counts each stem on its own", () => {
    const free = idMaker(["cell-1"]);
    expect([free("cell"), free("question")]).toEqual(["cell-2", "question-1"]);
  });
});

describe("SNIPPETS", () => {
  test("a Python cell is a runnable fence carrying an id", () => {
    const md = snippet("python-cell");
    expect(md).toContain("```python exec");
    expect(md).toContain("id: cell-1");
  });

  test("a SQL cell is the same shape in dewlab's other language", () => {
    const md = snippet("sql-cell", ["cell-1"]);
    expect(md).toContain("```sql exec");
    expect(md).toContain("id: cell-2");
  });

  test("a hint is the fold dewlab's build looks for", () => {
    const md = snippet("hint");
    expect(md).toContain('<details class="dl-hint">');
    expect(md).toContain("<summary>");
  });

  test("a web page is three panes under one site name, with an id each", () => {
    const md = snippet("site");
    expect(md).toContain("```html site");
    expect(md).toContain("```css site");
    expect(md).toContain("```js site");
    expect([...md.matchAll(/^site: (.+)$/gm)].map((m) => m[1])).toEqual(["site-1", "site-1", "site-1"]);
    const ids = [...md.matchAll(/^id: (.+)$/gm)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(3);
  });

  // The checker is the same one the author runs. A snippet that fails it
  // would put a fault in the document the moment it is inserted.
  test.each(SNIPPETS.map((item) => item.key))("what `%s` writes passes the checker", (key) => {
    const page = ["---", "title: A Page", "---", "", snippet(key), ""].join("\n");
    expect(checkDocument(page, new Set())).toEqual([]);
  });
});
