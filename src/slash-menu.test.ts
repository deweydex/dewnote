import { describe, expect, test } from "bun:test";
import { idMaker, SNIPPETS } from "./slash-menu.ts";

const snippet = (key: string) =>
  SNIPPETS.find((item) => item.key === key)!.markdown(idMaker([]));

describe("SNIPPETS", () => {
  test("a Python cell is a runnable fence carrying an id", () => {
    const written = snippet("python-cell");
    expect(written).toContain("```python exec");
    expect(written).toContain("id: cell-1");
  });

  test("a SQL cell is the same shape in dewlab's other language", () => {
    const written = snippet("sql-cell");
    expect(written).toContain("```sql exec");
    expect(written).toContain("id: cell-1");
  });

  test("a hint is the fold dewlab's build looks for", () => {
    const written = snippet("hint");
    expect(written).toContain('<details class="dl-hint">');
    expect(written).toContain("<summary>");
  });
});

describe("every snippet", () => {
  test("goes into a new tutorial as something the checker accepts, with ids nobody is using", async () => {
    const { newTutorial } = await import("./authoring.ts");
    const { checkDocument } = await import("./checks.ts");
    const made = newTutorial("A Page", new Date("2026-09-22T12:00:00"));
    // The new tutorial already holds `cell-1`, and every snippet is
    // inserted with the ids used so far, the way the editor does it.
    let document = made.content;
    for (const item of SNIPPETS) {
      const used = [...document.matchAll(/^id:\s*(\S+)/gm)].map((match) => match[1]!);
      document += `\n${item.markdown(idMaker(used))}\n`;
    }
    expect(checkDocument(document, { ids: new Set(), path: made.path })).toEqual([]);
  });
});
