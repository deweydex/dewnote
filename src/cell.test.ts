import { describe, expect, test } from "bun:test";
import { parseDocument } from "./blocks.ts";
import { isRunnableFence, parseCellSource, parseCellSourceFromFenceText } from "./cell.ts";

function fenceBlock(source: string) {
  const doc = parseDocument(source);
  const block = doc.blocks.find((b) => b.kind === "fence");
  if (!block) throw new Error("no fence block in fixture");
  return block;
}

describe("parseCellSource", () => {
  test("reads an id and hint header off the fence body", () => {
    const block = fenceBlock("```python exec\nid: totals\nhint: sum the list\nprint(sum(xs))\n```\n");
    expect(parseCellSource(block)).toEqual({ id: "totals", hint: "sum the list", code: "print(sum(xs))" });
  });

  test("works with just an id, no hint", () => {
    const block = fenceBlock("```python exec\nid: totals\nprint(1)\n```\n");
    expect(parseCellSource(block)).toEqual({ id: "totals", hint: null, code: "print(1)" });
  });

  test("is fine with no header lines at all", () => {
    const block = fenceBlock("```python exec\nprint(1)\n```\n");
    expect(parseCellSource(block)).toEqual({ id: null, hint: null, code: "print(1)" });
  });

  test("keeps multi-line code intact, headers and all", () => {
    const block = fenceBlock("```python exec\nid: c\nx = 1\ny = 2\nprint(x + y)\n```\n");
    expect(parseCellSource(block).code).toBe("x = 1\ny = 2\nprint(x + y)");
  });

  test("does not treat a code line that merely contains a colon as a header", () => {
    const block = fenceBlock("```python exec\nid: c\nd = {'a': 1}\n```\n");
    expect(parseCellSource(block)).toEqual({ id: "c", hint: null, code: "d = {'a': 1}" });
  });

  test("stops reading headers at the first non-header line, even if a later line looks like one", () => {
    const block = fenceBlock("```python exec\nid: c\nprint('id: not a header')\n```\n");
    expect(parseCellSource(block)).toEqual({ id: "c", hint: null, code: "print('id: not a header')" });
  });
});

describe("parseCellSourceFromFenceText", () => {
  test("agrees with parseCellSource on the same text", () => {
    const text = "```python exec\nid: totals\nhint: sum the list\nprint(sum(xs))\n```\n";
    expect(parseCellSourceFromFenceText(text)).toEqual(parseCellSource(fenceBlock(text)));
  });

  test("reads a live editor's un-committed text directly, no trailing newline required", () => {
    expect(parseCellSourceFromFenceText("```python exec\nid: c\nprint(1)\n```")).toEqual({
      id: "c",
      hint: null,
      code: "print(1)",
    });
  });
});

describe("isRunnableFence", () => {
  test("is true when exec is one of the info string's tokens", () => {
    expect(isRunnableFence("python exec")).toBe(true);
    expect(isRunnableFence("exec")).toBe(true);
    expect(isRunnableFence("python exec id=c")).toBe(true);
  });

  test("is false for a plain illustrative fence", () => {
    expect(isRunnableFence("python")).toBe(false);
    expect(isRunnableFence("")).toBe(false);
  });

  test("does not match exec as a substring of another token", () => {
    expect(isRunnableFence("nonexec")).toBe(false);
    expect(isRunnableFence("execute")).toBe(false);
  });
});
