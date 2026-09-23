// The palette's pure half: which row Enter takes, and what the preview
// pane reads out of a document. The DOM half (⌘K, arrow keys, the
// overlay) is covered by tests/e2e/workspace-palette.spec.ts against the
// built app, the same split outline-panel.ts and settings-panel.ts use.

import { describe, expect, test } from "bun:test";
import { rankRows } from "./workspace-palette.ts";

type Row = Parameters<typeof rankRows>[0][number];

function row(kind: "tutorial" | "series" | "command", label: string, keywords?: string[]): Row {
  return { kind, label, ...(keywords ? { keywords } : {}), run() {} };
}

const WORKSPACE: Row[] = [
  // Its letters contain a-p-p-e-a-r in order, which is what made the
  // bug below reachable at all.
  row("tutorial", "A Pipeline Every Reader Can Follow"),
  row("tutorial", "Storing and Computing"),
  row("tutorial", "Grid of Numbers"),
  row("series", "Matrices"),
  row("command", "Appearance…", ["settings", "theme", "dark", "font"]),
  row("command", "Export a Jupyter notebook", ["ipynb"]),
];

describe("rankRows", () => {
  test("sections keep their fixed order whatever the query", () => {
    // An empty query is the case where every kind is present at once,
    // which is what makes it the one that proves the order.
    // Shuffled, commands first, so the order has to come from grouping
    // by kind and not from the order the rows arrived in.
    const shuffled = [WORKSPACE[4]!, WORKSPACE[3]!, WORKSPACE[0]!, WORKSPACE[5]!, WORKSPACE[1]!, WORKSPACE[2]!];
    const { rows } = rankRows(shuffled, "");
    const kinds = [...new Set(rows.map((item) => item.kind))];
    expect(kinds).toEqual(["tutorial", "series", "command"]);
  });

  test("Enter takes the best match anywhere, not the first section's best", () => {
    // The bug this exists for: "appear" is a subsequence of a real
    // tutorial title too, and with one number doing both jobs the
    // highlight sat on that tutorial and Enter opened it instead of the
    // appearance settings.
    const { rows, best } = rankRows(WORKSPACE, "appear");
    expect(rows[best]!.label).toBe("Appearance…");
  });

  test("a section that only matched by coincidence is left out of its own turn", () => {
    // "appear" is a subsequence of that tutorial's title, and the
    // Tutorials section is drawn first — but a scattered match well
    // below the best one is noise, so the section simply does not
    // appear for this query rather than leading with a wrong answer.
    const { rows } = rankRows(WORKSPACE, "appear");
    expect(rows.map((item) => item.kind)).toEqual(["command"]);
  });

  test("a keyword nobody can see still wins the highlight", () => {
    const { rows, best } = rankRows(WORKSPACE, "ipynb");
    expect(rows[best]!.label).toBe("Export a Jupyter notebook");
  });

  test("an empty query leaves the workspace in its own order, highlighting the first row", () => {
    const { rows, best } = rankRows(WORKSPACE, "");
    expect(best).toBe(0);
    expect(rows.map((item) => item.label)).toEqual(WORKSPACE.map((item) => item.label));
  });

  test("a query nothing matches leaves nothing, rather than everything", () => {
    expect(rankRows(WORKSPACE, "zzzz").rows).toEqual([]);
  });

  test("a title typed almost in full beats a coincidence in another title", () => {
    const { rows, best } = rankRows(WORKSPACE, "storing and comp");
    expect(rows[best]!.label).toBe("Storing and Computing");
  });
});

describe("the relevance bar", () => {
  const CORPUS: Row[] = [
    row("tutorial", "What a Matrix Does to a Picture"),
    row("tutorial", "A Model That Corrects Itself"),
    row("tutorial", "Making Sense of Data — Practice"),
    row("tutorial", "A Grid of Numbers"),
    row("tutorial", "Multiplying Grids"),
  ];

  test("once something matches properly, the scattered near-misses are dropped", () => {
    // Every one of these contains m-a-t-r-i if you take the letters far
    // enough apart. Only the one a reader means should be offered.
    expect(rankRows(CORPUS, "matri").rows.map((item) => item.label)).toEqual([
      "What a Matrix Does to a Picture",
    ]);
  });

  test("a word sitting inside a title still counts as a proper match", () => {
    // Greedy scanning takes the g in "Multiplying" and scatters the
    // rest; scoring the whole query as one run finds the real word.
    expect(rankRows(CORPUS, "grid").rows.map((item) => item.label)).toEqual([
      "A Grid of Numbers",
      "Multiplying Grids",
    ]);
  });

  test("an empty query has no bar, because nothing is being asked for", () => {
    expect(rankRows(CORPUS, "").rows).toHaveLength(CORPUS.length);
  });
});

describe("keywords against labels", () => {
  const CORPUS: Row[] = [
    row("tutorial", "What a Matrix Does to a Picture", ["tutorials/what-a-matrix-does-to-a-picture/what-a-matrix-does-to-a-picture.md"]),
    row("series", "Matrices", ["Computational Methods", "computational-methods"]),
    row("series", "Programming Foundations", ["Programming and Maths, Integrated", "mit-pdp-maths-prog-integration"]),
    row("series", "Capstone Project", ["Programming and Maths, Integrated", "mit-pdp-maths-prog-integration"]),
  ];

  test("a slug does not drag in every row that shares it", () => {
    // Every hyphen in a slug reads as a word start, so before the
    // discount "matri" pulled in every series of that course.
    expect(rankRows(CORPUS, "matri").rows.map((item) => item.label)).toEqual([
      "What a Matrix Does to a Picture",
      "Matrices",
    ]);
  });

  test("a keyword still finds a row nothing visible would have found", () => {
    const { rows } = rankRows(CORPUS, "computational");
    expect(rows.map((item) => item.label)).toEqual(["Matrices"]);
  });
});
