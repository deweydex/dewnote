import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isCourseFile,
  parseCourseFile,
  parseCourseFiles,
  parseCourseIndex,
} from "./courses.ts";

// dewlab's own shape, copied from a real course file rather than
// invented: a folded `card:` whose continuation line is indented prose,
// a single-quoted `description:` carrying blank lines, then `contents:`.
// The two prose fields are here specifically so the range assertions
// prove a writer would never touch them.
const COURSE = `title: Programming and Design Principles
code: 5N2927 · QQI Level 5
status: beta
card: This is the programming half of the integrated course, on its own. It runs
  from a first cell to reusable tools, then a project built in a team.
description: 'This module is Programming and Design Principles (5N2927) on its own,
  without the maths.


  Two series carry it.'
contents:
- title: Programming Foundations
  tutorials:
  - first-steps
  - storing-and-computing
- title: Working in a Team
  tutorials:
  - critique-and-reflection
  - the-team-project
`;

describe("isCourseFile", () => {
  test("a course file directly inside courses/", () => {
    expect(isCourseFile("courses/web-authoring.yaml")).toBe(true);
    expect(isCourseFile("some/checkout/courses/web-authoring.yaml")).toBe(true);
  });

  test("index.yaml and redirects.yaml are not courses", () => {
    expect(isCourseFile("courses/index.yaml")).toBe(false);
    expect(isCourseFile("courses/redirects.yaml")).toBe(false);
  });

  test("anything else", () => {
    expect(isCourseFile("courses/web-authoring.md")).toBe(false);
    expect(isCourseFile("tutorials/first-steps/first-steps.md")).toBe(false);
    // A yaml file one level deeper isn't a course file.
    expect(isCourseFile("courses/old/web-authoring.yaml")).toBe(false);
  });
});

describe("parseCourseIndex", () => {
  test("reads the order list", () => {
    expect(parseCourseIndex("order:\n- one\n- two\n")).toEqual(["one", "two"]);
  });

  test("empty for anything unreadable, rather than throwing", () => {
    expect(parseCourseIndex("order: [\n")).toEqual([]);
    expect(parseCourseIndex("something-else: true\n")).toEqual([]);
    expect(parseCourseIndex("")).toEqual([]);
  });
});

describe("parseCourseFile", () => {
  test("reads the course, its series and their tutorials in order", () => {
    const course = parseCourseFile("courses/programming-design-principles.yaml", COURSE)!;
    expect(course.id).toBe("programming-design-principles");
    expect(course.title).toBe("Programming and Design Principles");
    expect(course.status).toBe("beta");
    expect(course.contents.map((series) => series.title)).toEqual([
      "Programming Foundations",
      "Working in a Team",
    ]);
    expect(course.contents[0]!.tutorials).toEqual(["first-steps", "storing-and-computing"]);
    expect(course.contents[1]!.tutorials).toEqual(["critique-and-reflection", "the-team-project"]);
  });

  test("each series' range covers exactly its own item lines", () => {
    const course = parseCourseFile("courses/x.yaml", COURSE)!;
    const lines = COURSE.split("\n");

    const first = course.contents[0]!.tutorialsRange!;
    expect(lines.slice(first.start, first.end)).toEqual([
      "  - first-steps",
      "  - storing-and-computing",
    ]);

    const second = course.contents[1]!.tutorialsRange!;
    expect(lines.slice(second.start, second.end)).toEqual([
      "  - critique-and-reflection",
      "  - the-team-project",
    ]);

    // The ranges never reach the prose above them, which is the whole
    // point of scanning for them rather than re-dumping the file.
    expect(lines.slice(0, first.start).join("\n")).toContain("card: This is the programming half");
    expect(lines.slice(0, first.start).join("\n")).toContain("Two series carry it.");
  });

  test("the indent is the one the items actually carry", () => {
    const course = parseCourseFile("courses/x.yaml", COURSE)!;
    expect(course.contents[0]!.indent).toBe("  ");
  });

  test("a series with an empty block list gets an empty range where its first item would go", () => {
    const source = `title: A course
contents:
- title: Nothing yet
  tutorials:
- title: Something
  tutorials:
  - one
`;
    const course = parseCourseFile("courses/x.yaml", source)!;
    const empty = course.contents[0]!;
    expect(empty.tutorials).toEqual([]);
    // Line 3 is `  tutorials:`; an item would go on line 4, so that's
    // where an empty range sits — splicing at the key's own line would
    // put the item above the key it belongs to.
    expect(empty.tutorialsRange).toEqual({ start: 4, end: 4 });
    expect(empty.indent).toBe("  ");
    expect(course.contents[1]!.tutorials).toEqual(["one"]);
  });

  test("a flow list parses but offers no range to write into", () => {
    const source = `title: A course
contents:
- title: Inline
  tutorials: [one, two]
`;
    const course = parseCourseFile("courses/x.yaml", source)!;
    expect(course.contents[0]!.tutorials).toEqual(["one", "two"]);
    expect(course.contents[0]!.tutorialsRange).toBeNull();
  });

  test("null for a file that isn't a course, or one it can't read", () => {
    expect(parseCourseFile("courses/index.yaml", "order:\n- one\n")).toBeNull();
    expect(parseCourseFile("courses/x.yaml", "title: [\n")).toBeNull();
    // No title is the one thing dewlab's read_course fails outright on.
    expect(parseCourseFile("courses/x.yaml", "contents: []\n")).toBeNull();
  });

  test("a course with a title but no contents key at all is read, not refused", () => {
    // read_course maps a missing or empty `contents:` to [] rather than
    // failing, so this file builds. Refusing it here meant dewnote
    // wouldn't show a course dewlab is perfectly happy with — and it is
    // the exact state a course is in before its first series.
    const course = parseCourseFile("courses/x.yaml", "title: A course\n");
    expect(course).not.toBeNull();
    expect(course!.title).toBe("A course");
    expect(course!.contents).toEqual([]);
    // Nothing to append to, though: no `contents:` key means no block.
    expect(course!.contentsRange).toBeNull();
  });
});

describe("parseCourseFiles", () => {
  const files = [
    { path: "courses/b.yaml", content: "title: B\ncontents: []\n" },
    { path: "courses/a.yaml", content: "title: A\ncontents: []\n" },
    { path: "courses/index.yaml", content: "order:\n- a\n- b\n" },
    { path: "tutorials/x/x.md", content: "# not a course\n" },
  ];

  test("keeps only real course files", () => {
    expect(parseCourseFiles(files).map((course) => course.id).sort()).toEqual(["a", "b"]);
  });

  test("orders by index.yaml, with unlisted courses after the listed ones", () => {
    const withExtra = [...files, { path: "courses/c.yaml", content: "title: C\ncontents: []\n" }];
    expect(parseCourseFiles(withExtra, ["b", "a"]).map((course) => course.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});

// The real thing, when dewlab is checked out beside this repo — the same
// discipline full-corpus.test.ts uses, and the reason this module was
// read against real files rather than a description of them. Skips
// itself when the sibling isn't there.
const DEWLAB_COURSES = "../dewlab/courses";

describe(`real course files: ${DEWLAB_COURSES}${existsSync(DEWLAB_COURSES) ? "" : " (not checked out — skipped)"}`, () => {
  test.skipIf(!existsSync(DEWLAB_COURSES))(
    "every course file parses, and every series offers a writable range",
    () => {
      const files = readdirSync(DEWLAB_COURSES)
        .filter((name) => name.endsWith(".yaml"))
        .map((name) => ({
          path: `courses/${name}`,
          content: readFileSync(join(DEWLAB_COURSES, name), "utf8"),
        }));
      const indexFile = files.find((file) => file.path === "courses/index.yaml");
      const courses = parseCourseFiles(files, indexFile ? parseCourseIndex(indexFile.content) : []);

      expect(courses.length).toBeGreaterThan(0);
      for (const course of courses) {
        expect(course.contents.length).toBeGreaterThan(0);
        for (const series of course.contents) {
          // Every series dewlab's own migration wrote is in the block
          // form, so every one of them is writable. A null here would
          // mean the scan and js-yaml disagree about a real file.
          expect({
            course: course.id,
            series: series.title,
            range: series.tutorialsRange,
          }).toMatchObject({ range: { start: expect.any(Number), end: expect.any(Number) } });
        }
      }
    },
  );

  test.skipIf(!existsSync(DEWLAB_COURSES))(
    "each range holds exactly the ids parsed for it",
    () => {
      for (const name of readdirSync(DEWLAB_COURSES).filter((one) => one.endsWith(".yaml"))) {
        const content = readFileSync(join(DEWLAB_COURSES, name), "utf8");
        const course = parseCourseFile(`courses/${name}`, content);
        if (!course) continue;
        const lines = content.split("\n");
        for (const series of course.contents) {
          const range = series.tutorialsRange!;
          expect(lines.slice(range.start, range.end)).toEqual(
            series.tutorials.map((id) => `${series.indent}- ${id}`),
          );
        }
      }
    },
  );
});

describe("scanContentsBlock, through parseCourseFile", () => {
  const withMixed = [
    "title: OOP",
    "card: Classes and objects.",
    "contents:",
    "- title: Programming with objects",
    "  tutorials:",
    "  - objects-and-classes",
    "  - one-class-many-methods",
    "mixed:",
    "- mixed-programming-with-objects",
    "",
  ].join("\n");

  test("the block ends where the next top-level key begins, not at the end of the file", () => {
    // Two of dewlab's six real course files carry `mixed:` after
    // `contents:`, so the block genuinely ends mid-file. Appending past
    // it would write a series into the mixed list.
    const course = parseCourseFile("courses/oop.yaml", withMixed)!;
    expect(course.contentsRange).toEqual({ start: 3, end: 7 });
    expect(withMixed.split("\n")[7]).toBe("mixed:");
  });

  test("the entry and inner indents are read, not assumed", () => {
    const course = parseCourseFile("courses/oop.yaml", withMixed)!;
    // The dash sits at column 0 in every real course file, with the
    // `tutorials:` under it indented two.
    expect(course.entryIndent).toBe("");
    expect(course.innerIndent).toBe("  ");
  });

  test("a course whose entries are indented keeps that indent", () => {
    const indented = ["title: A", "contents:", "  - title: One", "    tutorials:", "    - a", ""].join("\n");
    const course = parseCourseFile("courses/a.yaml", indented)!;
    expect(course.entryIndent).toBe("  ");
    expect(course.innerIndent).toBe("  ");
  });

  test("extra spaces after the dash widen the inner indent, because YAML says they do", () => {
    // A mapping under `-` starts at the column after the dash and its
    // spaces, and every later key has to line up with it — so this is
    // measured off the dash rather than assumed to be two.
    const wide = ["title: A", "contents:", "-   title: One", "    tutorials:", "    - a", ""].join("\n");
    const course = parseCourseFile("courses/a.yaml", wide)!;
    expect(course.entryIndent).toBe("");
    expect(course.innerIndent).toBe("    ");
  });

  test("a course with no series yet offers an empty range where the first one goes", () => {
    const empty = ["title: A", "contents:", ""].join("\n");
    const course = parseCourseFile("courses/a.yaml", empty)!;
    expect(course.contents).toEqual([]);
    expect(course.contentsRange).toEqual({ start: 2, end: 2 });
  });

  test("a flow contents list offers no range to append to", () => {
    const flow = ["title: A", "contents: []", ""].join("\n");
    const course = parseCourseFile("courses/a.yaml", flow)!;
    expect(course.contentsRange).toBeNull();
  });
});
