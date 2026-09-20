import { describe, expect, test } from "bun:test";
import { cardIn, gapsBalanced, hasGap, questionIn, sitePaneIn, splitHeader } from "./fences.ts";

describe("splitHeader", () => {
  test("reads the header lines and hands back the rest", () => {
    const { header, rest } = splitHeader("id: one\ntype: multiple-choice\n\nWhich?\n", ["id", "type"]);
    expect([...header]).toEqual([["id", "one"], ["type", "multiple-choice"]]);
    expect(rest).toBe("Which?");
  });

  test("stops at a key it was not given, so prose starting `note:` stays prose", () => {
    const { header, rest } = splitHeader("id: one\nnote: this is prose\n", ["id", "type"]);
    expect([...header]).toEqual([["id", "one"]]);
    expect(rest).toBe("note: this is prose");
  });

  test("stops at a key it has already read, the way the build does", () => {
    const { rest } = splitHeader("id: one\nid: the second one is prose\n", ["id"]);
    expect(rest).toBe("id: the second one is prose");
  });
});

describe("sitePaneIn", () => {
  test("reads a pane's id and the editor it belongs to", () => {
    expect(sitePaneIn("html site", "id: states-html\nsite: states\n<button></button>\n")).toEqual({
      id: "states-html",
      site: "states",
      language: "html",
    });
  });

  test("says no to a plain html fence, which is illustrative markup", () => {
    expect(sitePaneIn("html", "<p></p>\n")).toBeNull();
  });

  test("says no to a language that has no live editor", () => {
    expect(sitePaneIn("python site", "print(1)\n")).toBeNull();
  });
});

describe("questionIn", () => {
  const MULTIPLE = [
    "id: which-one",
    "type: multiple-choice",
    "correct: 2",
    "",
    "Which counts this correctly?",
    "",
    "- A permutation.",
    "- A combination.",
  ].join("\n");

  test("the prose above the first bullet is the question, the bullets are the options", () => {
    const question = questionIn("question", MULTIPLE)!;
    expect(question.prompt).toBe("Which counts this correctly?");
    expect(question.options).toEqual(["A permutation.", "A combination."]);
    expect(question.correct).toBe("2");
  });

  test("a blank line between options does not end them", () => {
    const question = questionIn("question", "id: a\ntype: multiple-choice\n\nQ?\n\n- one\n\n- two\n")!;
    expect(question.options).toEqual(["one", "two"]);
  });

  test("says no to any other fence", () => {
    expect(questionIn("python exec", "print(1)")).toBeNull();
  });
});

describe("gaps", () => {
  test("a gap that closes is balanced", () => {
    expect(gapsBalanced("The answer is {four}.")).toBe(true);
  });

  test("an unclosed gap is not", () => {
    expect(gapsBalanced("The answer is {four.")).toBe(false);
  });

  test("a stray closing brace is not", () => {
    expect(gapsBalanced("The answer is four}.")).toBe(false);
  });

  test("a sentence with no gap has none to find", () => {
    expect(hasGap("The answer is four.")).toBe(false);
    expect(hasGap("The answer is {four|five}.")).toBe(true);
  });
});

describe("cardIn", () => {
  test("reads the url and the heading the tile is titled with", () => {
    const card = cardIn("card", "url: features.html\nwide: true\n### What dewlab can do\nThe tools.\n")!;
    expect(card).toEqual({ url: "features.html", heading: "What dewlab can do" });
  });

  test("a body that does not open with a heading has no title", () => {
    expect(cardIn("card", "url: a.html\nJust a sentence.\n")!.heading).toBeNull();
  });
});
