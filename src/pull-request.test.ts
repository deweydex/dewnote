import { describe, expect, test } from "bun:test";
import { describeChanges, suggestTitle, titleFrom, type BranchChange } from "./pull-request.ts";

const titles: Record<string, string> = {
  "tutorials/lists/lists.md": "Lists",
  "tutorials/lists/lists-practice.md": "Lists — Practice",
  "pages/about.md": "About",
};
const titleOf = (path: string) => titles[path] ?? path;

describe("suggestTitle", () => {
  test("one document is named, with what happened to it", () => {
    expect(suggestTitle([{ path: "pages/about.md", status: "modified" }], titleOf)).toBe('Edit "About"');
    expect(suggestTitle([{ path: "tutorials/lists/lists.md", status: "added" }], titleOf)).toBe('Add "Lists"');
  });

  test("a tutorial leads, whatever order the branch lists things in", () => {
    const changes: BranchChange[] = [
      { path: "tutorials/lists/lists-practice.md", status: "modified" },
      { path: "courses/one.yaml", status: "modified" },
      { path: "tutorials/lists/lists.md", status: "modified" },
      { path: "pages/about.md", status: "modified" },
    ];
    expect(suggestTitle(changes, titleOf)).toBe('Edit "Lists" and 2 other documents');
  });

  test("mixed kinds of change are a change", () => {
    expect(suggestTitle([
      { path: "tutorials/lists/lists.md", status: "added" },
      { path: "pages/about.md", status: "modified" },
    ], titleOf)).toBe('Change "Lists" and 1 other document');
  });

  test("with no documents, says what the files are", () => {
    expect(suggestTitle([{ path: "courses/one.yaml", status: "modified" }], titleOf)).toBe("Update course lists");
  });
});

describe("describeChanges", () => {
  test("groups by what happened, documents by title, and says how to merge", () => {
    const body = describeChanges([
      { path: "tutorials/lists/lists.md", status: "renamed", previous: "tutorials/old/old.md" },
      { path: "pages/about.md", status: "modified" },
      { path: "tutorials/lists/a.svg", status: "added" },
    ], titleOf);
    expect(body).toBe([
      "Made in dewnote.",
      "",
      "**Edited**",
      "",
      "- About: `pages/about.md`",
      "",
      "**Moved**",
      "",
      "- Lists: `tutorials/lists/lists.md` (was `tutorials/old/old.md`)",
      "",
      "**Other files**",
      "",
      "- `tutorials/lists/a.svg` (added)",
      "",
      "Every save in dewnote is its own commit. **Squash and merge** keeps these as one commit, named by this pull request's title.",
    ].join("\n"));
  });
});

describe("titleFrom", () => {
  test("the front matter's title, or the file's name", () => {
    expect(titleFrom("a/b.md", "---\ntitle: B\n---\n")).toBe("B");
    expect(titleFrom("a/b.md", undefined)).toBe("b");
  });
});
