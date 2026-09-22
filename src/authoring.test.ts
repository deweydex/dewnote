import { describe, expect, test } from "bun:test";
import { checkDocument } from "./checks.ts";
import {
  academicYear,
  idFromTitle,
  newTutorial,
  nextVersion,
  prepareRelease,
  setFrontMatterField,
} from "./authoring.ts";

describe("setFrontMatterField", () => {
  const SOURCE = "---\ntitle: A Page\nstatus: live\nversion: 2026.01.01.1\n---\n\n# A Page\n\nWords.\n";

  test("touches only the field's own line", () => {
    const out = setFrontMatterField(SOURCE, "status", "draft");
    expect(out).toBe("---\ntitle: A Page\nstatus: draft\nversion: 2026.01.01.1\n---\n\n# A Page\n\nWords.\n");
  });

  test("adds a field that is not there yet, keeping the order of the rest", () => {
    expect(setFrontMatterField(SOURCE, "supersedes", "2026.01.01.1")).toContain(
      "version: 2026.01.01.1\nsupersedes: 2026.01.01.1\n---",
    );
  });

  test("quotes a value YAML would otherwise misread", () => {
    expect(setFrontMatterField(SOURCE, "title", "2026: a year")).toContain('title: "2026: a year"');
  });

  test("quotes what PyYAML would read as a boolean, though js-yaml would not", () => {
    // dewlab's build reads front matter with PyYAML, which is YAML 1.1:
    // there `yes`, `no`, `on` and `off` are booleans. The file has to
    // survive both readers.
    for (const word of ["yes", "no", "on", "off", "y", "n"]) {
      expect(setFrontMatterField(SOURCE, "title", word)).toContain(`title: "${word}"`);
    }
  });

  test("leaves a version bare, which looks like a number and is not one", () => {
    expect(setFrontMatterField(SOURCE, "version", "2026.09.20.1")).toContain("version: 2026.09.20.1");
  });

  test("leaves a document with no front matter alone", () => {
    expect(setFrontMatterField("# A\n", "title", "A")).toBe("# A\n");
  });
});

describe("idFromTitle", () => {
  test("is dewlab's own shape: lowercase words joined by hyphens", () => {
    expect(idFromTitle("What a Matrix Does to a Picture")).toBe("what-a-matrix-does-to-a-picture");
  });

  test("drops punctuation and accents rather than carrying them into an address", () => {
    expect(idFromTitle("Ada's Café — Notes!")).toBe("ada-s-cafe-notes");
  });
});

describe("newTutorial", () => {
  const made = newTutorial("Storing and Computing", new Date("2026-09-20T10:00:00"));

  test("the folder and the file share the id, which is what the address is made of", () => {
    expect(made.path).toBe("tutorials/storing-and-computing/storing-and-computing.md");
  });

  test("starts as a draft, so a half-written page is never served", () => {
    expect(made.content).toContain("status: draft");
  });

  test("carries a version, which a release has to have something to count from", () => {
    expect(made.content).toContain("version: 2026.09.20.1");
  });

  test("carries the year dewlab's build requires, as the academic year by default", () => {
    expect(made.content).toContain('year: "2026-2027"');
  });

  test("takes the workspace's own year when given one", () => {
    const given = newTutorial("A", new Date("2026-09-20T10:00:00"), "2025-2026");
    expect(given.content).toContain('year: "2025-2026"');
  });

  test("passes the checker as written, so a new tutorial never breaks the build", () => {
    expect(checkDocument(made.content, { ids: new Set(), path: made.path })).toEqual([]);
  });

  test("opens with its own heading and a cell that runs", () => {
    expect(made.content).toContain("# Storing and Computing");
    expect(made.content).toContain("```python exec");
    expect(made.content).toContain("id: cell-1");
  });
});

describe("nextVersion", () => {
  const today = new Date("2026-09-20T10:00:00");

  test("is the date, counting from one", () => {
    expect(nextVersion([], today)).toBe("2026.09.20.1");
  });

  test("counts a second release on the same day", () => {
    expect(nextVersion(["2026.09.20.1"], today)).toBe("2026.09.20.2");
  });

  test("ignores versions from other days", () => {
    expect(nextVersion(["2026.09.19.7"], today)).toBe("2026.09.20.1");
  });
});

describe("prepareRelease", () => {
  const PATH = "tutorials/grid/grid.md";
  const PUBLISHED = "---\ntitle: Grid\nstatus: live\nversion: 2026.08.01.1\n---\n\n# Grid\n\nOld words.\n";
  const EDITED = "---\ntitle: Grid\nstatus: live\nversion: 2026.08.01.1\n---\n\n# Grid\n\nNew words.\n";
  const today = new Date("2026-09-20T10:00:00");

  test("freezes the published bytes under their own version", () => {
    const made = prepareRelease(PATH, PUBLISHED, EDITED, [], today);
    expect("error" in made).toBe(false);
    if ("error" in made) return;
    expect(made.frozenPath).toBe("tutorials/grid/v2026.08.01.1.md");
    expect(made.frozenContent).toBe(PUBLISHED);
  });

  test("the live file keeps its address, so links and saved work still resolve", () => {
    const made = prepareRelease(PATH, PUBLISHED, EDITED, [], today);
    if ("error" in made) throw new Error(made.error);
    expect(made.livePath).toBe(PATH);
    expect(made.liveContent).toContain("version: 2026.09.20.1");
    expect(made.liveContent).toContain("supersedes: 2026.08.01.1");
    expect(made.liveContent).toContain("New words.");
  });

  test("refuses a file that is not a live tutorial's own", () => {
    const made = prepareRelease("pages/about.md", PUBLISHED, EDITED, [], today);
    expect(made).toEqual({ error: "Only a tutorial's main file, tutorials/<id>/<id>.md, can have versions." });
  });

  test("refuses when nothing changed, rather than making an identical version", () => {
    const made = prepareRelease(PATH, PUBLISHED, PUBLISHED, [], today);
    expect("error" in made).toBe(true);
  });

  test("refuses a draft: there is nothing published to freeze", () => {
    const draft = PUBLISHED.replace("status: live", "status: draft");
    const made = prepareRelease(PATH, draft, EDITED, [], today);
    expect(made).toEqual({ error: "Only a tutorial with `status: live` can be released. A draft needs no versions: save it, and set `status: live` when it is ready." });
  });
});

describe("academicYear", () => {
  test("turns over in September", () => {
    expect(academicYear(new Date("2026-08-31T12:00:00"))).toBe("2025-2026");
    expect(academicYear(new Date("2026-09-01T12:00:00"))).toBe("2026-2027");
  });
});
