import { describe, expect, test } from "bun:test";
import { readsAsMaths } from "./maths.ts";

describe("readsAsMaths", () => {
  test("a formula written tight against its delimiters is maths", () => {
    expect(readsAsMaths("x^2 + 1")).toBe(true);
    expect(readsAsMaths("x")).toBe(true);
  });

  test("a span with whitespace against a delimiter is prose", () => {
    // "it costs $5 and $6" — the span remark-math claims is "5 and ".
    expect(readsAsMaths("5 and ")).toBe(false);
    expect(readsAsMaths(" x")).toBe(false);
  });

  test("an empty span is nothing at all", () => {
    expect(readsAsMaths("")).toBe(false);
  });
});
