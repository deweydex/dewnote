// The splice itself, and the three things a reader does with it. The
// property that matters most in every one of these is what *didn't*
// change: a course file's prose is student-facing text on dewlab's front
// page, and the whole reason courses.ts records line ranges is that a
// round trip through a YAML dumper would refold and requote it.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCourseFile, type Course } from "./courses.ts";
import { addTutorial, idsListedBy, moveTutorial, removeTutorial, writeCourseFile } from "./course-writer.ts";

/** A course file shaped like dewlab's real ones: a folded `card:`, a
 * `description:` that runs over two lines, and series whose items carry
 * the same indent as their own key. */
const COURSE = [
  "title: Computational Methods",
  "code: 5N0554 · QQI Level 5",
  "status: beta",
  "card: We work through matrices, simulation, algorithms and debugging, in Python.",
  "description: This module is Computational Methods and Problem Solving (5N0554).",
  "  We work through matrices, simulation, algorithms and debugging, in Python.",
  "contents:",
  "- title: Python fundamentals",
  "  tutorials:",
  "  - first-steps-cm",
  "  - working-with-tables",
  "- title: Matrices",
  "  tutorials:",
  "  - grid-of-numbers",
  "  - multiplying-grids",
  "  - undoing-it",
  "",
].join("\n");

function course(content = COURSE): Course {
  const parsed = parseCourseFile("courses/computational-methods.yaml", content);
  if (!parsed) throw new Error("fixture no longer parses");
  return parsed;
}

function expectOk(result: { ok: boolean } & Record<string, unknown>): string {
  expect(result.ok, `refused: ${String(result["reason"] ?? "")}`).toBe(true);
  return result["content"] as string;
}

/** Everything in the file except the lines under a `tutorials:` key —
 * the bytes a write is supposed to leave alone. */
function prose(content: string): string[] {
  const lines = content.split("\n");
  const kept: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (/^\s*tutorials\s*:\s*$/.test(line)) {
      inList = true;
      kept.push(line);
      continue;
    }
    if (inList) {
      if (/^\s*-\s+\S+\s*$/.test(line)) continue;
      inList = false;
    }
    kept.push(line);
  }
  return kept;
}

describe("writeCourseFile", () => {
  test("a reordered series rewrites its own lines and nothing else", () => {
    const one = course();
    const written = expectOk(writeCourseFile(COURSE, [{ series: one.contents[1]!, tutorials: ["undoing-it", "grid-of-numbers", "multiplying-grids"] }]));

    expect(course(written).contents[1]!.tutorials).toEqual(["undoing-it", "grid-of-numbers", "multiplying-grids"]);
    // The folded card, the two-line description and the other series all
    // come back byte for byte.
    expect(prose(written)).toEqual(prose(COURSE));
    expect(course(written).contents[0]!.tutorials).toEqual(["first-steps-cm", "working-with-tables"]);
  });

  test("two series in one file are both written, and neither shifts the other", () => {
    const one = course();
    // The first series grows by one line and the second shrinks by two,
    // so a top-down splice would write the second one into the wrong
    // place entirely.
    const written = expectOk(
      writeCourseFile(COURSE, [
        { series: one.contents[0]!, tutorials: ["first-steps-cm", "working-with-tables", "a-third"] },
        { series: one.contents[1]!, tutorials: ["undoing-it"] },
      ]),
    );

    const after = course(written);
    expect(after.contents[0]!.tutorials).toEqual(["first-steps-cm", "working-with-tables", "a-third"]);
    expect(after.contents[1]!.tutorials).toEqual(["undoing-it"]);
    expect(prose(written)).toEqual(prose(COURSE));
  });

  test("emptying a series leaves a bare tutorials: key, which reads back as an empty series", () => {
    // dewlab's own read_course() maps a `tutorials:` with nothing under
    // it to [], so removing the last tutorial from a series is a real
    // state rather than a file that stops building.
    const one = course();
    const written = expectOk(writeCourseFile(COURSE, [{ series: one.contents[1]!, tutorials: [] }]));

    expect(written).toContain("- title: Matrices\n  tutorials:\n");
    const after = course(written);
    expect(after.contents[1]!.tutorials).toEqual([]);
    // And the now-empty range can be written into again.
    const refilled = expectOk(writeCourseFile(written, [{ series: after.contents[1]!, tutorials: ["back-again"] }]));
    expect(course(refilled).contents[1]!.tutorials).toEqual(["back-again"]);
  });

  test("writing no edits at all returns the file untouched", () => {
    expect(expectOk(writeCourseFile(COURSE, []))).toBe(COURSE);
  });

  test("a series with no writable range is refused, and nothing is written", () => {
    const flow = COURSE.replace("  tutorials:\n  - grid-of-numbers\n  - multiplying-grids\n  - undoing-it\n", "  tutorials: [grid-of-numbers, undoing-it]\n");
    const one = course(flow);
    expect(one.contents[1]!.tutorialsRange).toBeNull();

    const result = writeCourseFile(flow, [{ series: one.contents[1]!, tutorials: ["undoing-it"] }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("Matrices");
  });

  test("two edits to the same series are refused rather than applied twice", () => {
    const one = course();
    const result = writeCourseFile(COURSE, [
      { series: one.contents[0]!, tutorials: ["a"] },
      { series: one.contents[0]!, tutorials: ["b"] },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe("moveTutorial", () => {
  test("within a series, an index is read against the list with the tutorial already taken out", () => {
    // "working-with-tables" is at 1 of 2; dragging it to the front is
    // index 0, and the list it lands in is the one-item list left behind.
    const written = expectOk(moveTutorial(course(), COURSE, { series: 0, index: 1 }, { series: 0, index: 0 }));
    expect(course(written).contents[0]!.tutorials).toEqual(["working-with-tables", "first-steps-cm"]);
  });

  test("dragging the middle of three to the end lands it last, not second", () => {
    const written = expectOk(moveTutorial(course(), COURSE, { series: 1, index: 1 }, { series: 1, index: 2 }));
    expect(course(written).contents[1]!.tutorials).toEqual(["grid-of-numbers", "undoing-it", "multiplying-grids"]);
  });

  test("a drag into a sibling series takes it out of one and puts it in the other, in one write", () => {
    const written = expectOk(moveTutorial(course(), COURSE, { series: 1, index: 0 }, { series: 0, index: 1 }));
    const after = course(written);
    expect(after.contents[0]!.tutorials).toEqual(["first-steps-cm", "grid-of-numbers", "working-with-tables"]);
    expect(after.contents[1]!.tutorials).toEqual(["multiplying-grids", "undoing-it"]);
    expect(prose(written)).toEqual(prose(COURSE));
  });

  test("dropping past the end of a series lands at the end rather than refusing", () => {
    const written = expectOk(moveTutorial(course(), COURSE, { series: 1, index: 0 }, { series: 0, index: 99 }));
    expect(course(written).contents[0]!.tutorials).toEqual(["first-steps-cm", "working-with-tables", "grid-of-numbers"]);
  });

  test("a stale index — the course changed underneath — is refused, not written at a guess", () => {
    const result = moveTutorial(course(), COURSE, { series: 1, index: 7 }, { series: 1, index: 0 });
    expect(result.ok).toBe(false);
    const gone = moveTutorial(course(), COURSE, { series: 9, index: 0 }, { series: 0, index: 0 });
    expect(gone.ok).toBe(false);
  });
});

describe("addTutorial", () => {
  test("adds at a position, or at the end when none is given", () => {
    const atEnd = expectOk(addTutorial(course(), COURSE, 0, "new-one"));
    expect(course(atEnd).contents[0]!.tutorials).toEqual(["first-steps-cm", "working-with-tables", "new-one"]);

    const atFront = expectOk(addTutorial(course(), COURSE, 0, "new-one", 0));
    expect(course(atFront).contents[0]!.tutorials).toEqual(["new-one", "first-steps-cm", "working-with-tables"]);
  });

  test("an id the course already lists elsewhere is refused, and the reason names where it sits", () => {
    // dewlab's read_course() fails the build on this — "A tutorial sits
    // in one place on a course" — so writing it would hand somebody a
    // file that no longer builds.
    const result = addTutorial(course(), COURSE, 0, "undoing-it");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Matrices");
      expect(result.reason).toContain("undoing-it");
    }
  });

  test("adding to an empty series works, since its range is a real empty range", () => {
    const emptied = expectOk(writeCourseFile(COURSE, [{ series: course().contents[1]!, tutorials: [] }]));
    const written = expectOk(addTutorial(course(emptied), emptied, 1, "first-one"));
    expect(course(written).contents[1]!.tutorials).toEqual(["first-one"]);
  });
});

describe("removeTutorial", () => {
  test("unlists one tutorial and leaves the rest in order", () => {
    const written = expectOk(removeTutorial(course(), COURSE, 1, "multiplying-grids"));
    expect(course(written).contents[1]!.tutorials).toEqual(["grid-of-numbers", "undoing-it"]);
    expect(prose(written)).toEqual(prose(COURSE));
  });

  test("removing the only tutorial leaves the series, not a hole in the file", () => {
    const one = expectOk(removeTutorial(course(), COURSE, 0, "first-steps-cm"));
    const two = expectOk(removeTutorial(course(one), one, 0, "working-with-tables"));
    const after = course(two);
    expect(after.contents).toHaveLength(2);
    expect(after.contents[0]!.title).toBe("Python fundamentals");
    expect(after.contents[0]!.tutorials).toEqual([]);
  });

  test("an id the series doesn't list is refused", () => {
    const result = removeTutorial(course(), COURSE, 0, "undoing-it");
    expect(result.ok).toBe(false);
  });
});

describe("idsListedBy", () => {
  test("every id on the course, across its series", () => {
    expect([...idsListedBy(course())].sort()).toEqual(["first-steps-cm", "grid-of-numbers", "multiplying-grids", "undoing-it", "working-with-tables"]);
  });
});

// The same property against dewlab's real course files, which is where
// the folded scalars and the wrapped single-quoted prose actually live.
// Skipped when there's no sibling checkout, the same shape courses.test.ts
// and full-corpus.test.ts both use — the directory is read inside each
// test body rather than in the describe callback, which bun evaluates
// even for a describe every test in it is skipped in.
const DEWLAB_COURSES = "../dewlab/courses";
const havePath = () => existsSync(DEWLAB_COURSES);

function courseFilesOnDisk(): { path: string; content: string }[] {
  return readdirSync(DEWLAB_COURSES)
    .filter((name) => name.endsWith(".yaml") && name !== "index.yaml" && name !== "redirects.yaml")
    .map((name) => ({ path: `courses/${name}`, content: readFileSync(join(DEWLAB_COURSES, name), "utf-8") }));
}

describe(`real course files: ${DEWLAB_COURSES}${havePath() ? "" : " (not checked out — skipped)"}`, () => {
  test.skipIf(!havePath())("reversing every series in a real course rewrites only the id lines", () => {
    const files = courseFilesOnDisk();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const parsed = parseCourseFile(file.path, file.content);
      expect(parsed, file.path).not.toBeNull();
      const edits = parsed!.contents.map((series) => ({ series, tutorials: [...series.tutorials].reverse() }));
      const written = expectOk(writeCourseFile(file.content, edits));

      // Same number of lines, same everything that isn't an id.
      expect(written.split("\n"), file.path).toHaveLength(file.content.split("\n").length);
      expect(prose(written), file.path).toEqual(prose(file.content));

      const after = parseCourseFile(file.path, written);
      expect(after, file.path).not.toBeNull();
      for (const [at, series] of parsed!.contents.entries()) {
        expect(after!.contents[at]!.tutorials, `${file.path} — ${series.title}`).toEqual([...series.tutorials].reverse());
      }
    }
  });

  test.skipIf(!havePath())("reversing twice is the file it started as, byte for byte", () => {
    const files = courseFilesOnDisk();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const reversed = (content: string) =>
        expectOk(writeCourseFile(content, parseCourseFile(file.path, content)!.contents.map((series) => ({ series, tutorials: [...series.tutorials].reverse() }))));
      expect(reversed(reversed(file.content)), file.path).toBe(file.content);
    }
  });
});
