import { describe, expect, test } from "bun:test";
import { widthFromPointer } from "./panel-resize.ts";

describe("widthFromPointer", () => {
  test("a right-edge handle (left-docked panel) reads the pointer's own distance from the left edge", () => {
    // 320px at a 16px root is 20rem — a left-docked panel this wide, with
    // its handle on its own right edge, tracks the pointer directly.
    expect(widthFromPointer(320, 1280, "right", 16)).toBe(20);
  });

  test("a left-edge handle (right-docked panel) reads the distance from the viewport's right edge instead", () => {
    // The same 320px gap, but measured from the far side: a pointer at
    // x=960 in a 1280px viewport leaves 320px to the right of it.
    expect(widthFromPointer(960, 1280, "left", 16)).toBe(20);
  });

  test("clamps to the same range a saved value would be clamped to", () => {
    expect(widthFromPointer(0, 1280, "right", 16)).toBe(16);
    expect(widthFromPointer(1280, 1280, "right", 16)).toBe(32);
  });

  test("a larger root font size (browser zoom, or an accessibility override) still converts to the same rem width", () => {
    // 640px at a 32px root is still 20rem, not 40 — the px/rem conversion
    // has to use the actual root size, not a hardcoded 16.
    expect(widthFromPointer(640, 1280, "right", 32)).toBe(20);
  });
});
