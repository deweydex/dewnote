import { describe, expect, test } from "bun:test";
import {
  applyToFiles,
  planDeleteFile,
  planDeleteTutorial,
  planMove,
  planRename,
  type Change,
  type Plan,
  type Refusal,
} from "./rename.ts";

const page = (fields: string, body = "Words.\n") => `---\n${fields}\n---\n\n${body}`;

function workspace(): Map<string, string> {
  return new Map([
    ["tutorials/old-name/old-name.md", page("title: Old\nstatus: live", "See [the practice](tutorial:old-name-practice).\n")],
    ["tutorials/old-name/old-name-practice.md", page("title: Practice\nstatus: live\npractice_for: old-name")],
    ["tutorials/other/other.md", page("title: Other\nstatus: live", "Read [old](tutorial:old-name#top) and [older](tutorial:old-name-extra).\n")],
    ["tutorials/mixed/mixed.md", page("title: Mixed\npractice_across: [other, old-name]")],
    ["tutorials/why/why.md", page("title: Why\ncontext_for:\n  - other\n  - old-name")],
    ["courses/one.yaml", "title: One\ncontents:\n- title: old-name\n  tutorials:\n  - other\n  - old-name\n"],
    ["courses/redirects.yaml", "# old -> new\ntutorials/m/old.html: tutorials/old-name.html\n"],
  ]);
}

const FOLDER = ["old-name.md", "old-name-practice.md", "old-name.glossary.yaml", "diagram.svg", "v2026.01.01.1.md"];

function plan(result: Plan | Refusal): Plan {
  if ("error" in result) throw new Error(result.error);
  return result;
}

function after(files: Map<string, string>, changes: Change[]): Map<string, string> {
  const copy = new Map(files);
  applyToFiles(copy, changes);
  return copy;
}

describe("planRename", () => {
  const files = workspace();
  const { changes, summary } = plan(planRename({ files, folderNames: FOLDER, from: "old-name", to: "new-name" }));
  const result = after(files, changes);

  test("moves the whole folder, renaming only the names made from the id", () => {
    const moves = changes.flatMap((change) => (change.kind === "move" ? [[change.from, change.to]] : []));
    expect(moves).toEqual([
      ["tutorials/old-name/old-name.glossary.yaml", "tutorials/new-name/new-name.glossary.yaml"],
      ["tutorials/old-name/diagram.svg", "tutorials/new-name/diagram.svg"],
      ["tutorials/old-name/v2026.01.01.1.md", "tutorials/new-name/v2026.01.01.1.md"],
    ]);
    expect(result.has("tutorials/new-name/new-name.md")).toBe(true);
    expect(result.has("tutorials/new-name/new-name-practice.md")).toBe(true);
    expect([...result.keys()].some((path) => path.startsWith("tutorials/old-name/"))).toBe(false);
  });

  test("rewrites links to the tutorial and its practice page, and nothing that merely starts the same", () => {
    expect(result.get("tutorials/other/other.md")).toContain("(tutorial:new-name#top)");
    expect(result.get("tutorials/other/other.md")).toContain("(tutorial:old-name-extra)");
    expect(result.get("tutorials/new-name/new-name.md")).toContain("(tutorial:new-name-practice)");
  });

  test("rewrites practice_for, practice_across and context_for", () => {
    expect(result.get("tutorials/new-name/new-name-practice.md")).toContain("practice_for: new-name\n");
    expect(result.get("tutorials/mixed/mixed.md")).toContain("practice_across: [other, new-name]");
    expect(result.get("tutorials/why/why.md")).toContain("context_for:\n  - other\n  - new-name\n");
  });

  test("rewrites course lists, but not a series title spelled like the id", () => {
    expect(result.get("courses/one.yaml")).toBe("title: One\ncontents:\n- title: old-name\n  tutorials:\n  - other\n  - new-name\n");
  });

  test("sends both old addresses on, and re-points an older redirect at the new address", () => {
    expect(result.get("courses/redirects.yaml")).toBe(
      "# old -> new\n" +
        "tutorials/m/old.html: tutorials/new-name.html\n" +
        "tutorials/old-name.html: tutorials/new-name.html\n" +
        "tutorials/old-name-practice.html: tutorials/new-name-practice.html\n",
    );
  });

  test("says what it will change", () => {
    expect(summary).toEqual([
      "Moves tutorials/old-name/ to tutorials/new-name/ (5 files).",
      "Updates 1 course list.",
      "Updates links or references in 3 other pages.",
      "Sends the old addresses on to the new, in courses/redirects.yaml.",
    ]);
  });

  test("a draft was never served, so it gets no redirect", () => {
    const drafts = new Map(files);
    drafts.set("tutorials/old-name/old-name.md", page("title: Old\nstatus: draft"));
    drafts.set("tutorials/old-name/old-name-practice.md", page("title: P\nstatus: draft\npractice_for: old-name"));
    const out = after(drafts, plan(planRename({ files: drafts, folderNames: FOLDER, from: "old-name", to: "new-name" })).changes);
    expect(out.get("courses/redirects.yaml")).not.toContain("tutorials/old-name.html:");
  });

  test("renaming back drops the redirect that would now come from a real page", () => {
    const back = new Map(result);
    const out = after(back, plan(planRename({ files: back, folderNames: FOLDER.map((name) => name.replace("old-name", "new-name")), from: "new-name", to: "old-name" })).changes);
    expect(out.get("courses/redirects.yaml")).not.toMatch(/^tutorials\/old-name\.html:/m);
    expect(out.get("courses/redirects.yaml")).toContain("tutorials/m/old.html: tutorials/old-name.html");
    expect(out.get("courses/redirects.yaml")).toContain("tutorials/new-name.html: tutorials/old-name.html");
  });

  test("creates redirects.yaml beside the courses when there is none", () => {
    const bare = new Map(files);
    bare.delete("courses/redirects.yaml");
    const out = after(bare, plan(planRename({ files: bare, folderNames: FOLDER, from: "old-name", to: "new-name" })).changes);
    expect(out.get("courses/redirects.yaml")).toContain("tutorials/old-name.html: tutorials/new-name.html\n");
  });

  test("refuses an id dewlab would not accept, and one already taken", () => {
    for (const to of ["New Name", "new--name", "-new", "new-name-practice"]) {
      expect("error" in planRename({ files, folderNames: FOLDER, from: "old-name", to })).toBe(true);
    }
    expect(planRename({ files, folderNames: FOLDER, from: "old-name", to: "other" })).toEqual({
      error: "There is already a folder called tutorials/other.",
    });
  });
});

describe("planDeleteTutorial", () => {
  test("refuses while anything points at it, and says what", () => {
    const refused = planDeleteTutorial({ files: workspace(), folderNames: FOLDER, id: "old-name" });
    expect("error" in refused && refused.error).toContain("tutorials/other/other.md links to it");
    expect("error" in refused && refused.error).toContain("tutorials/mixed/mixed.md names it in practice_across:");
    expect("error" in refused && refused.error).toContain("tutorials/why/why.md names it in context_for:");
    expect("error" in refused && refused.error).toContain("courses/redirects.yaml sends 1 old address to it");
  });

  test("removes the folder and the tutorial's course lines, once nothing points at it", () => {
    const files = new Map([
      ["tutorials/gone/gone.md", page("title: Gone", "[self](tutorial:gone-practice)")],
      ["tutorials/gone/gone-practice.md", page("title: P\npractice_for: gone")],
      ["courses/one.yaml", "title: One\ncontents:\n- title: A\n  tutorials:\n  - gone\n  - kept\nmixed: [gone, kept]\n"],
    ]);
    const { changes } = plan(planDeleteTutorial({ files, folderNames: ["gone.md", "gone-practice.md", "a.svg"], id: "gone" }));
    expect(changes.filter((change) => change.kind === "remove").map((change) => (change as { path: string }).path)).toEqual([
      "tutorials/gone/gone.md", "tutorials/gone/gone-practice.md", "tutorials/gone/a.svg",
    ]);
    expect(after(files, changes).get("courses/one.yaml")).toBe(
      "title: One\ncontents:\n- title: A\n  tutorials:\n  - kept\nmixed: [kept]\n",
    );
  });
});

describe("planDeleteFile", () => {
  test("takes a practice page's glossary with it", () => {
    const files = new Map([["tutorials/a/a-practice.md", page("title: P\npractice_for: a")]]);
    const { changes } = plan(planDeleteFile(files, ["a.md", "a-practice.md", "a-practice.glossary.yaml"], "tutorials/a/a-practice.md"));
    expect(changes).toEqual([
      { kind: "remove", path: "tutorials/a/a-practice.md" },
      { kind: "remove", path: "tutorials/a/a-practice.glossary.yaml" },
    ]);
  });

  test("refuses a practice page something links to", () => {
    const files = new Map([
      ["tutorials/a/a-practice.md", page("title: P")],
      ["tutorials/b/b.md", page("title: B", "[go](tutorial:a-practice)")],
    ]);
    expect("error" in planDeleteFile(files, [], "tutorials/a/a-practice.md")).toBe(true);
  });

  test("sends a tutorial's own file to the tutorial command", () => {
    expect("error" in planDeleteFile(new Map(), [], "tutorials/a/a.md")).toBe(true);
  });
});

describe("planMove", () => {
  const files = new Map([["notes/a.md", "A\n"], ["notes/b.md", "B\n"]]);

  test("moves a page outside tutorials/", () => {
    expect(plan(planMove(files, "notes/a.md", "archive/a.md")).changes).toEqual([
      { kind: "write", path: "archive/a.md", text: "A\n" },
      { kind: "remove", path: "notes/a.md" },
    ]);
  });

  test("refuses a taken path, a path out of the workspace, and a path in tutorials/", () => {
    for (const to of ["notes/b.md", "../a.md", "notes/a.txt", "tutorials/a/a.md"]) {
      expect("error" in planMove(files, "notes/a.md", to)).toBe(true);
    }
  });
});
