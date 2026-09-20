import { describe, expect, test } from "bun:test";
import { checkDocument, checkWorkspace } from "./checks.ts";

const KNOWN = new Set(["grid-of-numbers"]);
const SOUND = [
  "---",
  "title: A Page",
  "version: 2026.09.20.1",
  "---",
  "",
  "# A Page",
  "",
  "See [the grid](tutorial:grid-of-numbers).",
  "",
  "```python exec",
  "id: first",
  "print(1)",
  "```",
  "",
].join("\n");

describe("checkDocument", () => {
  test("a sound document has nothing to say", () => {
    expect(checkDocument(SOUND, KNOWN)).toEqual([]);
  });

  test("a runnable cell with no id cannot hold anybody's work", () => {
    const source = SOUND.replace("id: first\n", "");
    const found = checkDocument(source, KNOWN);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("no `id:`");
    expect(found[0]!.severity).toBe("blocking");
  });

  test("two cells sharing an id share a reader's work as well", () => {
    const source = `${SOUND}\n\`\`\`python exec\nid: first\nprint(2)\n\`\`\`\n`;
    const found = checkDocument(source, KNOWN);
    expect(found.map((problem) => problem.message)).toEqual([
      expect.stringContaining("share the id `first`"),
    ]);
  });

  test("an illustrative fence needs no id, because nothing runs in it", () => {
    const source = `${SOUND}\n\`\`\`python\nprint(2)\n\`\`\`\n`;
    expect(checkDocument(source, KNOWN)).toEqual([]);
  });

  test("a link to nothing is named, with the words it reads as", () => {
    const source = SOUND.replace("tutorial:grid-of-numbers", "tutorial:nowhere");
    const found = checkDocument(source, KNOWN);
    expect(found[0]!.message).toContain("tutorial:nowhere");
    expect(found[0]!.message).toContain("the grid");
  });

  test("a document with no front matter has no title to show", () => {
    const found = checkDocument("# A Page\n\nWords.\n", KNOWN);
    expect(found[0]!.message).toContain("No front matter");
  });

  test("a missing title is blocking; the build has nothing to call the page", () => {
    const found = checkDocument("---\nstatus: live\n---\n\n# A\n", KNOWN);
    expect(found[0]!.message).toContain("No `title:`");
  });

  test("a version that is not a date and a counter is worth fixing, not blocking", () => {
    const source = SOUND.replace("2026.09.20.1", "draft-two");
    const found = checkDocument(source, KNOWN);
    expect(found[0]!.severity).toBe("worth fixing");
  });

  test("problems are in the order they appear in the file", () => {
    const source = [
      "---", "title: A", "---", "",
      "```python exec", "print(1)", "```", "",
      "[x](tutorial:nowhere)", "",
    ].join("\n");
    const found = checkDocument(source, KNOWN);
    expect(found.map((problem) => problem.line)).toEqual([...found.map((p) => p.line)].sort((a, b) => a! - b!));
  });
});

describe("checkWorkspace", () => {
  const sound = (id: string) =>
    ["---", `title: ${id}`, "---", "", "Some prose.", ""].join("\n");

  test("reports a fault in a file that is not the one you have open", () => {
    const found = checkWorkspace(
      [
        { path: "tutorials/a/a.md", content: sound("A") },
        { path: "tutorials/b/b.md", content: `${sound("B")}\n[x](tutorial:nowhere)\n` },
      ],
      KNOWN,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.path).toBe("tutorials/b/b.md");
  });

  test("names the file on every problem, so a row can be opened", () => {
    const found = checkWorkspace([{ path: "tutorials/a/a.md", content: "No header here.\n" }], KNOWN);
    expect(found.map((problem) => problem.path)).toEqual(["tutorials/a/a.md"]);
    expect(found[0]!.message).toMatch(/front matter/);
  });

  test("sorts by file, then by line, which is the order they are read in", () => {
    const found = checkWorkspace(
      [
        { path: "tutorials/z/z.md", content: `${sound("Z")}\n[x](tutorial:nowhere)\n` },
        { path: "tutorials/a/a.md", content: `${sound("A")}\n[x](tutorial:nowhere)\n` },
      ],
      KNOWN,
    );
    expect(found.map((problem) => problem.path)).toEqual(["tutorials/a/a.md", "tutorials/z/z.md"]);
  });

  test("a README is not a page and is not scolded for having no front matter", () => {
    expect(checkWorkspace([{ path: "README.md", content: "# dewlab\n" }], KNOWN)).toEqual([]);
  });

  test("a course descriptor is not prose and is not checked", () => {
    expect(checkWorkspace([{ path: "courses/maths.yaml", content: "[x](tutorial:nope)\n" }], KNOWN)).toEqual([]);
  });

  test("a file under tutorials/ with no front matter is a page, and the gap is the fault", () => {
    const found = checkWorkspace([{ path: "tutorials/a/a.md", content: "Prose.\n" }], KNOWN);
    expect(found.map((problem) => problem.severity)).toEqual(["blocking"]);
  });
});

describe("checkDocument: dewlab's other fences", () => {
  const page = (...blocks: string[]) =>
    ["---", "title: A Page", "---", "", ...blocks, ""].join("\n");

  const question = (...lines: string[]) => ["```question", ...lines, "```"].join("\n");

  test("a question with no type cannot be answered", () => {
    const found = checkDocument(page(question("id: q1", "", "Which?")), KNOWN);
    expect(found.map((problem) => problem.message)).toEqual([
      expect.stringContaining("no `type:`"),
    ]);
  });

  test("a type the build does not know is named back", () => {
    const found = checkDocument(page(question("id: q1", "type: essay", "", "Why?")), KNOWN);
    expect(found[0]!.message).toContain("`type: essay`");
  });

  test("a multiple-choice question with one option has nothing to choose between", () => {
    const found = checkDocument(
      page(question("id: q1", "type: multiple-choice", "correct: 1", "", "Which?", "", "- only one")),
      KNOWN,
    );
    expect(found.map((problem) => problem.message)).toEqual([
      expect.stringContaining("fewer than two options"),
    ]);
  });

  test("`correct:` past the end of the options names nothing", () => {
    const found = checkDocument(
      page(question("id: q1", "type: multiple-choice", "correct: 3", "", "Which?", "", "- a", "- b")),
      KNOWN,
    );
    expect(found[0]!.message).toContain("`correct: 3` names none of the 2 options");
  });

  test("a multiple-choice question with no `correct:` is unmarkable", () => {
    const found = checkDocument(
      page(question("id: q1", "type: multiple-choice", "", "Which?", "", "- a", "- b")),
      KNOWN,
    );
    expect(found[0]!.message).toContain("no `correct:`");
  });

  test("a well-formed multiple-choice question is left alone", () => {
    const found = checkDocument(
      page(question("id: q1", "type: multiple-choice", "correct: 2", "", "Which?", "", "- a", "- b")),
      KNOWN,
    );
    expect(found).toEqual([]);
  });

  test("a fill-in-the-blank question with no gap has nothing to fill in", () => {
    const found = checkDocument(
      page(question("id: q1", "type: fill-in-the-blank", "", "A sentence with no gap.")),
      KNOWN,
    );
    expect(found[0]!.message).toContain("no `{…}` gap");
  });

  test("a gap that never closes is the fault, not the missing gap", () => {
    const found = checkDocument(
      page(question("id: q1", "type: fill-in-the-blank", "", "The answer is {four.")),
      KNOWN,
    );
    expect(found.map((problem) => problem.message)).toEqual([
      expect.stringContaining("never closes"),
    ]);
  });

  test("a question and a cell cannot share an id — both key the same saved work", () => {
    const found = checkDocument(
      page(
        "```python exec",
        "id: shared",
        "print(1)",
        "```",
        "",
        question("id: shared", "type: fill-in-the-blank", "", "It is {four}."),
      ),
      KNOWN,
    );
    expect(found.map((problem) => problem.message)).toEqual([
      expect.stringContaining("share the id `shared`"),
    ]);
  });

  test("a site pane needs an id and the editor it belongs to", () => {
    const found = checkDocument(page("```html site", "<p></p>", "```"), KNOWN);
    expect(found.map((problem) => problem.message)).toEqual([
      expect.stringContaining("no `id:`"),
      expect.stringContaining("no `site:`"),
    ]);
  });

  test("a card goes somewhere and says something", () => {
    const found = checkDocument(page("```card", "Just a sentence.", "```"), KNOWN);
    expect(found.map((problem) => problem.message)).toEqual([
      expect.stringContaining("no `url:`"),
      expect.stringContaining("does not open with a heading"),
    ]);
  });

  test("a well-formed card is left alone", () => {
    const found = checkDocument(
      page("```card", "url: features.html", "### What dewlab can do", "The tools.", "```"),
      KNOWN,
    );
    expect(found).toEqual([]);
  });

  test("an illustrative fence is not a cell and is not checked", () => {
    expect(checkDocument(page("```python", "print(1)", "```"), KNOWN)).toEqual([]);
  });
});
