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
