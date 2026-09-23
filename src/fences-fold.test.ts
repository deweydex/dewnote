import { describe, expect, test } from "bun:test";
import { foldLine } from "./fences.ts";

describe("foldLine", () => {
  test("reads a hint's opening line", () => {
    expect(foldLine('<details class="dl-hint"><summary>stuck? here are some steps</summary>')).toEqual({
      kind: "open",
      label: "Hint",
      summary: "stuck? here are some steps",
    });
  });

  test("reads an answer's, and names any other fold plainly", () => {
    expect(foldLine('<details class="dl-answer"><summary>answer</summary>')).toMatchObject({ label: "Answer" });
    expect(foldLine("<details><summary>More</summary>")).toMatchObject({ label: "Fold", summary: "More" });
  });

  test("reads the close", () => {
    expect(foldLine("</details>")).toEqual({ kind: "close" });
  });

  test("is not fooled by other HTML", () => {
    expect(foldLine("<br />")).toBeNull();
    expect(foldLine('<p class="dl-bs-sum">x</p>')).toBeNull();
  });
});
