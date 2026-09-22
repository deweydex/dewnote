import { describe, expect, test } from "bun:test";
import { diffLines, hunks } from "./diff.ts";

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
