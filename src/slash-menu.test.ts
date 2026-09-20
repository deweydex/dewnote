import { describe, expect, test } from "bun:test";
import { idMaker, SNIPPETS } from "./slash-menu.ts";

const snippet = (key: string) =>
  SNIPPETS.find((item) => item.key === key)!.markdown(idMaker([]));

describe("SNIPPETS", () => {
  test("a Python cell is a runnable fence carrying an id", () => {
    const md = snippet("python-cell");
    expect(md).toContain("```python exec");
    expect(md).toContain("id: cell-1");
  });

  test("a SQL cell is the same shape in dewlab's other language", () => {
    const md = snippet("sql-cell");
    expect(md).toContain("```sql exec");
    expect(md).toContain("id: cell-1");
  });

  test("a hint is the fold dewlab's build looks for", () => {
    const md = snippet("hint");
    expect(md).toContain('<details class="dl-hint">');
    expect(md).toContain("<summary>");
  });
});
