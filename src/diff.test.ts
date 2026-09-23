import { describe, expect, test } from "bun:test";
import { diffLines, hunks, mergeLines } from "./diff.ts";

const kinds = (theirs: string, mine: string) =>
  diffLines(theirs, mine).map((line) => `${line.kind[0]}:${line.text}`);

describe("diffLines", () => {
  test("identical text is all the same", () => {
    expect(kinds("a\nb", "a\nb")).toEqual(["s:a", "s:b"]);
  });

  test("a changed line is theirs then mine", () => {
    expect(kinds("a\nold\nc", "a\nnew\nc")).toEqual(["s:a", "t:old", "m:new", "s:c"]);
  });

  test("an added and a removed line", () => {
    expect(kinds("a\nb\nc", "a\nc\nd")).toEqual(["s:a", "t:b", "s:c", "m:d"]);
  });

  test("keeps every line of both versions, in order", () => {
    const theirs = "one\ntwo\nthree\nfour\nfive";
    const mine = "zero\none\nthree\nfour and a bit\nfive\nsix";
    const lines = diffLines(theirs, mine);
    expect(lines.filter((l) => l.kind !== "mine").map((l) => l.text).join("\n")).toBe(theirs);
    expect(lines.filter((l) => l.kind !== "theirs").map((l) => l.text).join("\n")).toBe(mine);
  });
});

describe("hunks", () => {
  test("no changes, no hunks", () => {
    expect(hunks(diffLines("a\nb", "a\nb"))).toEqual([]);
  });

  test("two distant changes are two hunks, with context and line numbers", () => {
    const base = Array.from({ length: 20 }, (_, at) => `line ${at + 1}`);
    const mine = [...base];
    mine[2] = "changed 3";
    mine[16] = "changed 17";
    const found = hunks(diffLines(base.join("\n"), mine.join("\n")), 1);
    expect(found).toHaveLength(2);
    expect(found[0]!.line).toBe(2);
    expect(found[0]!.lines.map((l) => l.kind)).toEqual(["same", "theirs", "mine", "same"]);
    expect(found[1]!.line).toBe(16);
  });

  test("changes whose context touches become one hunk", () => {
    const found = hunks(diffLines("a\nb\nc\nd\ne", "a\nB\nc\nD\ne"), 1);
    expect(found).toHaveLength(1);
  });
});

describe("mergeLines", () => {
  const base = "# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n";

  test("changes to different paragraphs are both kept", () => {
    const theirs = base.replace("First paragraph.", "First, edited elsewhere.");
    const mine = base.replace("Third paragraph.", "Third, edited here.");
    expect(mergeLines(base, theirs, mine)).toBe(
      "# Title\n\nFirst, edited elsewhere.\n\nSecond paragraph.\n\nThird, edited here.\n",
    );
  });

  test("lines added on both sides, in different places, are all kept", () => {
    const theirs = base.replace("# Title\n", "# Title\n\nAn opening line.\n");
    const mine = `${base}\nA closing line.\n`;
    expect(mergeLines(base, theirs, mine)).toBe(
      "# Title\n\nAn opening line.\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nA closing line.\n",
    );
  });

  test("the same change made on both sides is kept once", () => {
    const both = base.replace("Second", "2nd");
    expect(mergeLines(base, both, both)).toBe(both);
  });

  test("one side deleting a paragraph the other left alone deletes it", () => {
    const theirs = base.replace("First paragraph.\n\n", "");
    const mine = base.replace("Third paragraph.", "Third, edited here.");
    expect(mergeLines(base, theirs, mine)).toBe("# Title\n\nSecond paragraph.\n\nThird, edited here.\n");
  });

  test("changes on touching lines are refused, as git refuses them", () => {
    const theirs = base.replace("Second paragraph.\n\n", "");
    const mine = base.replace("Third paragraph.", "Third, edited here.");
    expect(mergeLines(base, theirs, mine)).toBeNull();
  });

  test("both sides changing the same line differently is refused, not guessed", () => {
    expect(mergeLines(base, base.replace("Second", "Theirs"), base.replace("Second", "Mine"))).toBeNull();
  });

  test("an edit on one side and a deletion of the same line on the other is refused", () => {
    expect(mergeLines(base, base.replace("Second paragraph.\n\n", ""), base.replace("Second", "Mine"))).toBeNull();
  });
});
