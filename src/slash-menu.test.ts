import { describe, expect, test } from "bun:test";
import { freeCellId, SNIPPETS } from "./slash-menu.ts";

describe("freeCellId", () => {
  test("starts at one", () => {
    expect(freeCellId([])).toBe("cell-1");
  });

  test("skips what is taken, because an id is a key somebody's work lives under", () => {
    expect(freeCellId(["cell-1", "cell-2"])).toBe("cell-3");
  });

  test("ignores ids that are not of this shape", () => {
    expect(freeCellId(["first-sum", "totals"])).toBe("cell-1");
  });
});

describe("SNIPPETS", () => {
  test("a Python cell is a runnable fence carrying an id", () => {
    const md = SNIPPETS.find((item) => item.key === "python-cell")!.markdown("cell-1");
    expect(md).toContain("```python exec");
    expect(md).toContain("id: cell-1");
  });

  test("a SQL cell is the same shape in dewlab's other language", () => {
    const md = SNIPPETS.find((item) => item.key === "sql-cell")!.markdown("cell-2");
    expect(md).toContain("```sql exec");
    expect(md).toContain("id: cell-2");
  });

  test("a hint is the fold dewlab's build looks for", () => {
    const md = SNIPPETS.find((item) => item.key === "hint")!.markdown("cell-1");
    expect(md).toContain('<details class="dl-hint">');
    expect(md).toContain("<summary>");
  });
});
