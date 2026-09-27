import { describe, expect, test } from "bun:test";
import { documentPath, folderForNew, suggestName } from "./documents.ts";

describe("suggestName", () => {
  const drafts = ["11-reading-copy.md", "12-revised.md", "20-inertia.md", "22-for-josh.md", "README.md", "notes.txt"];

  test("in a folder of numbered drafts, a new file starts at the next number", () => {
    expect(suggestName(drafts)).toBe("23-");
  });

  test("and a copy keeps its name under the next number", () => {
    expect(suggestName(drafts, "22-for-josh.md")).toBe("23-for-josh");
  });

  test("a file with no number is copied as itself with -copy", () => {
    expect(suggestName(drafts, "README.md")).toBe("README-copy");
  });

  test("a folder without numbers offers nothing for a new file", () => {
    expect(suggestName(["README.md", "ideas.md"])).toBe("");
  });

  test("only markdown files count", () => {
    expect(suggestName(["99-scan.pdf", "3-notes.md"])).toBe("4-");
  });
});

describe("folderForNew", () => {
  test("is the open document's folder", () => {
    expect(folderForNew("welcome-paper/22-for-josh.md")).toBe("welcome-paper");
    expect(folderForNew("22-for-josh.md")).toBe("");
  });

  test("is the top of the workspace beside a tutorial, whose folder dewlab builds page by page", () => {
    expect(folderForNew("tutorials/grid/grid.md")).toBe("");
  });

  test("is the top of the workspace with nothing open", () => {
    expect(folderForNew(null)).toBe("");
  });
});

describe("documentPath", () => {
  const existing = new Set(["papers/22-for-josh.md"]);

  test("adds .md, whether or not it was typed", () => {
    expect(documentPath("papers", "23-final", existing)).toEqual({ path: "papers/23-final.md" });
    expect(documentPath("papers", " 23-final.md ", existing)).toEqual({ path: "papers/23-final.md" });
    expect(documentPath("", "notes", existing)).toEqual({ path: "notes.md" });
  });

  test("refuses a name that is taken, empty, only a number's dash, hidden, or a path", () => {
    expect(documentPath("papers", "22-for-josh", existing)).toEqual({ error: "Not created: there is already a document at papers/22-for-josh.md." });
    expect("error" in documentPath("papers", "  ", existing)).toBe(true);
    expect("error" in documentPath("papers", "-", existing)).toBe(true);
    expect("error" in documentPath("papers", ".secret", existing)).toBe(true);
    expect("error" in documentPath("papers", "drafts/23", existing)).toBe(true);
  });
});
