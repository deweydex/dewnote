import { describe, expect, test } from "bun:test";
import { DEFAULT_HINT_AFTER, DEFAULT_HINT_TITLE, describeTrigger, hintIn, parseTrigger } from "./fences.ts";
import { checkDocument } from "./checks.ts";

describe("parseTrigger", () => {
  test("reads each way dewlab's build accepts, into the runtime's keys", () => {
    expect(parseTrigger("5 errors")).toEqual([{ key: "errors", count: 5 }]);
    expect(parseTrigger("3 identical errors and 2 minutes")).toEqual([
      { key: "same-errors", count: 3 },
      { key: "minutes", count: 2 },
    ]);
    expect(parseTrigger("errors:5, unchanged:2")).toEqual([
      { key: "errors", count: 5 },
      { key: "unchanged", count: 2 },
    ]);
    expect(parseTrigger("1 failed check")).toEqual([{ key: "check-fails", count: 1 }]);
  });

  test("refuses what the build refuses, and says why", () => {
    expect(parseTrigger("soon")).toEqual({ error: "`soon` cannot be read. Write it like `5 errors` or `errors:5`." });
    expect("error" in parseTrigger("3 mistakes")).toBe(true);
    expect("error" in parseTrigger("0 errors")).toBe(true);
    expect("error" in parseTrigger("")).toBe(true);
  });
});

describe("describeTrigger", () => {
  test("says it as a reader would, every term being needed", () => {
    expect(describeTrigger([{ key: "errors", count: 1 }])).toBe("after 1 error");
    expect(describeTrigger([{ key: "same-errors", count: 3 }, { key: "minutes", count: 2 }])).toBe(
      "after 3 identical errors and 2 minutes",
    );
  });
});

describe("hintIn", () => {
  test("reads the header lines and fills in dewlab's defaults", () => {
    expect(hintIn("hint", "Look again.")).toEqual({
      cell: null,
      after: DEFAULT_HINT_AFTER,
      title: DEFAULT_HINT_TITLE,
      text: "Look again.",
    });
    expect(hintIn("hint", "for: one\nafter: 2 runs\ntitle: Nearly\n\nLook again.")).toEqual({
      cell: "one",
      after: "2 runs",
      title: "Nearly",
      text: "Look again.",
    });
    expect(hintIn("python", "x")).toBeNull();
  });
});

describe("the checker, on staged hints", () => {
  const page = (body: string) => `---\ntitle: T\n---\n\n${body}`;
  const cell = "```python exec\nid: one\nx = 1\n```";
  const messages = (body: string) => checkDocument(page(body), { ids: new Set() }).map((problem) => problem.message);

  test("a hint under its cell, or naming one, is sound", () => {
    expect(messages(`${cell}\n\n\`\`\`hint\nLook again.\n\`\`\``)).toEqual([]);
    expect(messages(`\`\`\`hint\nfor: one\nLook again.\n\`\`\`\n\n${cell}`)).toEqual([]);
  });

  test("reports what dewlab's build refuses", () => {
    expect(messages("```hint\nLook again.\n```")[0]).toContain("no cell above it and no `for:` line");
    expect(messages(`${cell}\n\n\`\`\`hint\nafter: 2 mistakes\n\nLook.\n\`\`\``)[0]).toContain("`after:` line");
    expect(messages(`${cell}\n\n\`\`\`hint\ntitle: T\n\`\`\``)[0]).toContain("no text");
    expect(messages(`${cell}\n\n\`\`\`hint\nfor: two\nLook.\n\`\`\``)[0]).toContain("`two`, which is not the id of any runnable cell");
  });
});
