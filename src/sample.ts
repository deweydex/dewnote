// A workspace with nothing behind it, for trying the editor out.
//
// Every construct dewlab writes is in here once, so opening it is also
// the quickest way to see whether a Milkdown upgrade broke something.
// Edits are kept in memory and go nowhere.

import type { Store, StoreFile } from "./store.ts";

/** A real file beside the document, named the way a tutorial names one,
 * so the sample exercises the path a tutorial actually takes. */
const DIAGRAM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 90" width="240" height="90">
      <rect x="6" y="20" width="60" height="50" rx="6" fill="none" stroke="#1b2a4a" stroke-width="2"/>
      <rect x="90" y="20" width="60" height="50" rx="6" fill="none" stroke="#1b2a4a" stroke-width="2"/>
      <rect x="174" y="20" width="60" height="50" rx="6" fill="#d4692a" opacity="0.2" stroke="#d4692a" stroke-width="2"/>
      <path d="M68 45h20M152 45h20" stroke="#1b2a4a" stroke-width="2"/>
    </svg>`;

const TUTORIAL = `---
title: Everything at Once
year: "2026-2027"
status: live
version: 2026.09.20.1
---

# Everything at Once

**Maths for IT / Sample**

This page has one of everything the editor knows how to hold. Change it,
run it, break it — nothing here is written anywhere.

## Prose

Some *italic*, some **bold**, some \`inline code\`, and a
[link](https://example.com).

> A quotation sits like this.

- A bullet list.
- A second item.
  - And one nested under it.

1. A numbered list.
2. Which counts.

- [ ] A task not yet done.
- [x] One that is.

## Maths

Inline maths reads like $x^2 + 1$ in the middle of a sentence. A block
stands on its own:

$$
\\frac{a}{b} = c
$$

## A table

| Column | What it holds |
| - | - |
| id | A whole number |
| name | Some text |

## An image

![Three boxes, the last one filled](diagram.svg)

## A cell you can run

\`\`\`python exec
id: first-sum
total = 2 + 2
print(total)
\`\`\`

A fence with no \`exec\` is illustrative. It has no Run button:

\`\`\`python
print("nothing happens here")
\`\`\`

---

<details class="dl-hint"><summary>stuck? here are some steps</summary>

1. Read the error from the bottom up.
2. Check the line it names.

</details>
`;

const PRACTICE = `---
title: Everything at Once — Practice
year: "2026-2027"
status: live
version: 2026.09.20.1
practice_for: everything-at-once
---

# Everything at Once — Practice

**1.** Change the numbers in the cell on the tutorial page and run it.

**2.** This link goes nowhere — ⌘K, "Check links", to see it reported:
[a page that does not exist](tutorial:no-such-page).

\`\`\`python exec
id: practice-sum
# your turn
\`\`\`
`;

const COURSE = `id: sample
title: A Sample Course
status: live
contents:
  - title: First Steps
    tutorials:
      - everything-at-once
`;

export const SAMPLE_TUTORIAL = TUTORIAL;

const FILES: Record<string, string> = {
  "tutorials/everything-at-once/everything-at-once.md": TUTORIAL,
  "tutorials/everything-at-once/everything-at-once-practice.md": PRACTICE,
  "courses/sample.yaml": COURSE,
};

export function sampleStore(): Store {
  const held = new Map(Object.entries(FILES));
  const bytes = new Map<string, Uint8Array>([
    ["tutorials/everything-at-once/diagram.svg", new TextEncoder().encode(DIAGRAM_SVG)],
  ]);
  return {
    kind: "folder",
    label: "sample",
    keepsDrafts: false,
    list: async (): Promise<StoreFile[]> =>
      [...held].map(([path, content]) => ({ path, content })),
    read: async (path) => held.get(path) ?? "",
    readBytes: async (path) => (bytes.get(path) as Uint8Array<ArrayBuffer>) ?? null,
    listFolder: async (folder) =>
      [...held.keys(), ...bytes.keys()]
        .filter((path) => path.startsWith(`${folder}/`))
        .map((path) => path.slice(folder.length + 1))
        .filter((name) => !name.includes("/")),
    imagePaths: async () => [...bytes.keys()],
    write: async (path, text) => {
      held.set(path, text);
    },
    writeBytes: async (path, value) => {
      bytes.set(path, value);
    },
  };
}
