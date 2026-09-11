import { describe, expect, test } from "bun:test";
import { fromBase64, toBase64 } from "./github.ts";

describe("toBase64/fromBase64", () => {
  test("round-trips plain ASCII", () => {
    const text = "# A Rule\n\nWhere it lives.\n";
    expect(fromBase64(toBase64(text))).toBe(text);
  });

  test("round-trips real Unicode — an em dash, a µ, a checkmark", () => {
    const text = "A tutorial — with µs and ✓, not just ASCII.\n";
    expect(fromBase64(toBase64(text))).toBe(text);
  });

  test("round-trips an empty string", () => {
    expect(fromBase64(toBase64(""))).toBe("");
  });

  test("fromBase64 tolerates GitHub's own newline-wrapped base64", () => {
    const text = "line one\nline two\n";
    const wrapped = toBase64(text).replace(/(.{4})/g, "$1\n");
    expect(fromBase64(wrapped)).toBe(text);
  });
});
