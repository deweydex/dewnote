import { describe, expect, test } from "bun:test";
import { parseModuleFile } from "./modules.ts";
import { addToSeries, placementsOf, removeFromSeries } from "./placement.ts";

const COURSE = [
  "id: maths",
  "title: Maths for IT",
  "status: live",
  "contents:",
  "  - title: First Steps",
  "    tutorials:",
  "      - storing-and-computing",
  "      - grid-of-numbers",
  "  - title: Going Further",
  "    tutorials:",
  "      - multiplying-grids",
  "mixed:",
  "  - a-mixed-practice",
  "",
].join("\n");

const module = parseModuleFile("courses/maths.yaml", COURSE)!;
const first = module.contents[0]!;
const second = module.contents[1]!;

describe("placementsOf", () => {
  test("says which series lists a tutorial", () => {
    expect(placementsOf("grid-of-numbers", [module])).toEqual([
      { courseId: "maths", courseTitle: "Maths for IT", seriesTitle: "First Steps" },
    ]);
  });

  test("a tutorial nothing lists is placed nowhere", () => {
    expect(placementsOf("brand-new", [module])).toEqual([]);
  });
});

describe("addToSeries", () => {
  test("appends to the series' own list, leaving every other line alone", () => {
    const out = addToSeries(COURSE, first, "brand-new");
    expect(typeof out).toBe("string");
    expect(out).toContain("      - grid-of-numbers\n      - brand-new\n  - title: Going Further");
    // Nothing after it moved or changed.
    expect(out).toContain("mixed:\n  - a-mixed-practice");
  });

  test("matches the indent the items around it carry", () => {
    const out = addToSeries(COURSE, second, "brand-new") as string;
    expect(out).toContain("      - multiplying-grids\n      - brand-new\nmixed:");
  });

  test("refuses to list a tutorial twice", () => {
    expect(addToSeries(COURSE, first, "grid-of-numbers")).toEqual({
      error: "grid-of-numbers is already in First Steps.",
    });
  });

  test("the result still parses, and now lists it", () => {
    const out = addToSeries(COURSE, first, "brand-new") as string;
    const again = parseModuleFile("courses/maths.yaml", out)!;
    expect(again.contents[0]!.tutorials).toEqual([
      "storing-and-computing",
      "grid-of-numbers",
      "brand-new",
    ]);
    expect(again.contents[1]!.tutorials).toEqual(["multiplying-grids"]);
  });
});

describe("removeFromSeries", () => {
  test("takes one line out and leaves the rest", () => {
    const out = removeFromSeries(COURSE, first, "grid-of-numbers") as string;
    const again = parseModuleFile("courses/maths.yaml", out)!;
    expect(again.contents[0]!.tutorials).toEqual(["storing-and-computing"]);
    expect(out).toContain("mixed:\n  - a-mixed-practice");
  });

  test("says so when it is not there, rather than removing the wrong line", () => {
    expect(removeFromSeries(COURSE, first, "not-listed")).toEqual({
      error: "not-listed is not listed under First Steps.",
    });
  });
});
