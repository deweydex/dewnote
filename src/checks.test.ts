import { describe, expect, test } from "bun:test";
import { checkDocument } from "./checks.ts";

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
