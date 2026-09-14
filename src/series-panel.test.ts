// The pure part of the placement rail — which indexed tutorials count as
// "on no course". The DOM half (grouping by course, opening a listed
// tutorial, naming an id with no file) is covered against the built app
// in tests/e2e/series-panel.spec.ts, the same split outline-panel.ts
// uses. Unlike that one, this imports the real function rather than
// restating it: a test that re-implements what it checks proves nothing
// about the code that ships.

import { describe, expect, test } from "bun:test";
import type { FileIndexEntry } from "./file-index.ts";
import { tutorialsOnNoCourse } from "./series-panel.ts";

describe("tutorialsOnNoCourse", () => {
  test("an indexed tutorial no course lists", () => {
    const index: FileIndexEntry[] = [
      { path: "tutorials/listed/listed.md", id: "listed", title: "Listed", courses: ["a"] },
      { path: "tutorials/loose/loose.md", id: "loose", title: "Loose", courses: [] },
    ];
    expect(tutorialsOnNoCourse(index).map((e) => e.id)).toEqual(["loose"]);
  });

  test("an entry never cross-referenced is not reported", () => {
    // `courses` undefined means no course files were read at all — a
    // folder with no courses/ directory shouldn't report every tutorial
    // in it as unplaced.
    const index: FileIndexEntry[] = [
      { path: "tutorials/loose/loose.md", id: "loose", title: "Loose" },
    ];
    expect(tutorialsOnNoCourse(index)).toEqual([]);
  });

  test("a file outside tutorials/ is not a tutorial to place", () => {
    const index: FileIndexEntry[] = [
      { path: "notes.md", id: "notes", title: "Notes", courses: [] },
      { path: "pages/about.md", id: "about", title: "About", courses: [] },
    ];
    expect(tutorialsOnNoCourse(index)).toEqual([]);
  });

  test("a tutorial with several files reports once, as the file the build would serve", () => {
    // A frozen release carries its folder's id, so both files are "on no
    // course" — but they are one page, and the live one is the one to
    // show and open.
    const index: FileIndexEntry[] = [
      {
        path: "tutorials/first-steps/v2026.01.01.1.md",
        id: "first-steps",
        title: "Old title",
        status: "archived",
        version: "2026.01.01.1",
        courses: [],
      },
      {
        path: "tutorials/first-steps/first-steps.md",
        id: "first-steps",
        title: "First Steps",
        status: "live",
        version: "2026.06.01.1",
        courses: [],
      },
    ];
    const found = tutorialsOnNoCourse(index);
    expect(found).toHaveLength(1);
    expect(found[0]!.title).toBe("First Steps");
    expect(found[0]!.path).toBe("tutorials/first-steps/first-steps.md");
  });

  test("a practice page is its own tutorial to place", () => {
    // `<id>-practice.md` has an id of its own (build.py's id_of), so a
    // practice page no course lists is its own line, not folded into the
    // tutorial it belongs to.
    const index: FileIndexEntry[] = [
      {
        path: "tutorials/first-steps/first-steps.md",
        id: "first-steps",
        title: "First Steps",
        courses: ["a"],
      },
      {
        path: "tutorials/first-steps/first-steps-practice.md",
        id: "first-steps-practice",
        title: "First Steps — Practice",
        courses: [],
      },
    ];
    expect(tutorialsOnNoCourse(index).map((e) => e.id)).toEqual(["first-steps-practice"]);
  });
});
