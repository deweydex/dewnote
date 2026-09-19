// The one pure function in editor.ts, which is also the one place a
// document is rewritten before Milkdown reads it. Everything else in that
// module needs a browser and is covered by tests/e2e/roundtrip.spec.ts
// against the real corpus.

import { describe, expect, test } from "bun:test";
import { canonicaliseDisplayMath } from "./editor.ts";

describe("canonicaliseDisplayMath", () => {
  test("leaves a canonical block alone", () => {
    const written = "$$\na = 1\n$$\n";
    expect(canonicaliseDisplayMath(written)).toBe(written);
  });

  test("rescues a block whose delimiters share a line with its content", () => {
    // The form Crepe destroys: it returns `$$$\nb = 2$$\n$$$`, losing the
    // first line. dewlab's multiplying-grids practice page is written
    // this way.
    expect(canonicaliseDisplayMath("$$a = 1\nb = 2$$\n")).toBe("$$\na = 1\nb = 2\n$$\n");
  });

  test("opens out a block written on one line", () => {
    // Left as one line it parses as *inline* maths and comes back as
    // `$x = 1$`, which renders at a different size.
    expect(canonicaliseDisplayMath("$$x = 1$$\n")).toBe("$$\nx = 1\n$$\n");
  });

  test("takes two one-line blocks that sit on consecutive lines", () => {
    // These share a paragraph, which is what made them invisible to a
    // fix that worked one paragraph at a time.
    expect(canonicaliseDisplayMath("$$x + y = 10$$\n$$2x - y = 5$$\n")).toBe(
      "$$\nx + y = 10\n$$\n$$\n2x - y = 5\n$$\n",
    );
  });

  test("leaves inline maths alone", () => {
    const written = "The value $x$ and also $y$.\n";
    expect(canonicaliseDisplayMath(written)).toBe(written);
  });

  test("leaves a `$$` span that shares its line with prose alone", () => {
    const written = "Given $$x = 1$$ we continue.\n";
    expect(canonicaliseDisplayMath(written)).toBe(written);
  });

  test("never touches a fence, where `$$` is code", () => {
    const written = "```python exec\nid: a\nprint(\"$$x$$\")\n```\n";
    expect(canonicaliseDisplayMath(written)).toBe(written);
  });

  test("is idempotent", () => {
    const once = canonicaliseDisplayMath("$$x = 1$$\n");
    expect(canonicaliseDisplayMath(once)).toBe(once);
  });
});
