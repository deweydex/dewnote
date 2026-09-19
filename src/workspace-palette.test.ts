// The palette's pure half: which row Enter takes, and what the preview
// pane reads out of a document. The DOM half (⌘K, arrow keys, the
// overlay) is covered by tests/e2e/workspace-palette.spec.ts against the
// built app, the same split outline-panel.ts and settings-panel.ts use.

import { describe, expect, test } from "bun:test";
import { headingsOf, openingOf, rankRows } from "./workspace-palette.ts";

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
    const { rows } = rankRows(WORKSPACE, "a");
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
    // The eye still finds a tutorial where a tutorial always is.
    expect(rows[0]!.kind).toBe("tutorial");
    expect(rows[0]!.label).toBe("A Pipeline Every Reader Can Follow");
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

describe("openingOf", () => {
  const TUTORIAL = [
    "---",
    "title: Storing and Computing",
    "---",
    "",
    "# Storing and Computing",
    "",
    "**Programming Design Principles / Maths for IT**",
    "",
    "Last time we learned to do arithmetic. But we had a *limitation*:",
    "every result was gone once we had it.",
    "",
    "## Variables",
    "",
    "A variable is a name.",
    "",
  ].join("\n");

  test("skips front matter, the title, and the bold module line", () => {
    expect(openingOf(TUTORIAL)).toBe(
      "Last time we learned to do arithmetic. But we had a limitation: every result was gone once we had it.",
    );
  });

  test("reads inline markdown as the words it stands for", () => {
    expect(openingOf("A [link](x.md) and `code` and **bold**.\n")).toBe("A link and code and bold.");
  });

  test("a document with nothing but headings has no opening, rather than a heading", () => {
    expect(openingOf("# Only\n\n## Headings\n")).toBe("");
  });

  test("a long opening is cut rather than allowed to fill the pane", () => {
    expect(openingOf(`${"word ".repeat(200)}\n`).length).toBe(320);
  });
});

describe("headingsOf", () => {
  test("lists the headings under the title, without their marks", () => {
    expect(headingsOf("# Title\n\n## First **step**\n\n### Deeper\n\n#### Deepest\n")).toEqual([
      "First step",
      "Deeper",
      "Deepest",
    ]);
  });

  test("a `#` inside a fence is a comment, not a heading", () => {
    expect(headingsOf("# Title\n\n```python exec\nid: a\n# not a heading\n```\n\n## Real\n")).toEqual(["Real"]);
  });
});
