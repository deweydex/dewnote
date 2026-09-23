// What the `/` menu offers beyond the general-purpose blocks.
//
// Crepe's own menu has paragraph, headings, quote, divider, the three
// lists, image, code, table and maths. None of those is what a dewlab
// tutorial is made of: a runnable cell with an `id:`, and a fold holding
// a hint. Those are what an author reaches for, so they go first.
//
// Each item inserts markdown rather than building nodes, so what the
// menu writes is exactly what the file format says.

export interface CellIdSource {
  /** Every `id:` already in the document, so a new cell gets one that is
   * free. An id is the key a reader's saved work lives under, so two
   * cells sharing one is a real fault rather than an untidiness. */
  usedIds(): string[];
}

/** The first `<stem>-N` nobody is using. */
export function freeId(used: readonly string[], stem: string): string {
  const taken = new Set(used);
  for (let at = 1; ; at += 1) {
    const candidate = `${stem}-${at}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Hands out free ids and remembers the ones it gave, so a snippet that
 * writes three blocks at once does not name two of them the same. */
export function idMaker(used: readonly string[]): (stem: string) => string {
  const taken = [...used];
  return (stem: string) => {
    const id = freeId(taken, stem);
    taken.push(id);
    return id;
  };
}

export interface SnippetItem {
  key: string;
  label: string;
  icon: string;
  /** `free("cell")` hands back an id nothing is using, and will not
   * hand the same one back twice. */
  markdown(free: (stem: string) => string): string;
}

/** A play button, for something that runs. */
const RUN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
const DATABASE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><ellipse cx="12" cy="6" rx="7" ry="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const HINT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2Zm-2 18h4v1a2 2 0 1 1-4 0v-1Z"/></svg>';
/** A ticked box, for something a reader answers. */
const QUESTION_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="m7.5 12 3 3 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** A browser window, for the live HTML/CSS/JS editor. */
const SITE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9h18" stroke="currentColor" stroke-width="2"/><circle cx="6.5" cy="6.5" r=".9" fill="currentColor"/></svg>';

export const SNIPPETS: SnippetItem[] = [
  {
    key: "python-cell",
    label: "Python cell",
    icon: RUN_ICON,
    markdown: (free) => `\`\`\`python exec\nid: ${free("cell")}\n\n\`\`\``,
  },
  {
    key: "sql-cell",
    label: "SQL cell",
    icon: DATABASE_ICON,
    markdown: (free) => `\`\`\`sql exec\nid: ${free("cell")}\n\n\`\`\``,
  },
  {
    key: "multiple-choice",
    label: "Multiple choice",
    icon: QUESTION_ICON,
    // `correct:` counts from 1, in the order the options are written.
    markdown: (free) =>
      [
        "```question",
        `id: ${free("question")}`,
        "type: multiple-choice",
        "correct: 1",
        "",
        "What is the question?",
        "",
        "- The right answer.",
        "- A wrong one.",
        "```",
      ].join("\n"),
  },
  {
    key: "fill-in-the-blank",
    label: "Fill in the blank",
    icon: QUESTION_ICON,
    // Each `{…}` is a gap. A gap with a `|` in it is a dropdown, and the
    // first item is the expected answer either way.
    markdown: (free) =>
      [
        "```question",
        `id: ${free("question")}`,
        "type: fill-in-the-blank",
        "",
        "A sentence with a {gap} in it.",
        "```",
      ].join("\n"),
  },
  {
    key: "site",
    label: "Web page",
    icon: SITE_ICON,
    // Three panes sharing one `site:` become one editor with a tab each.
    markdown: (free) => {
      const site = free("site");
      return [
        "```html site",
        `id: ${free("pane")}`,
        `site: ${site}`,
        "<p>Hello.</p>",
        "```",
        "",
        "```css site",
        `id: ${free("pane")}`,
        `site: ${site}`,
        "p { color: rebeccapurple; }",
        "```",
        "",
        "```js site",
        `id: ${free("pane")}`,
        `site: ${site}`,
        "document.querySelector(\"p\").textContent = \"Hello from JavaScript.\";",
        "```",
      ].join("\n");
    },
  },
  {
    key: "app",
    label: "Page that reads the database",
    icon: DATABASE_ICON,
    // An app's script reads the tables the page's SQL cells made, through
    // dlQuery, and runs only when Run is pressed.
    markdown: (free) => {
      const app = free("app");
      return [
        "```html app",
        `id: ${free("pane")}`,
        `app: ${app}`,
        "<ul class=\"rows\"></ul>",
        "```",
        "",
        "```js app",
        `id: ${free("pane")}`,
        `app: ${app}`,
        "const rows = await dlQuery(\"select name from sqlite_master where type = 'table'\");",
        "root.querySelector(\".rows\").innerHTML = rows.map((row) => `<li>${row.name}</li>`).join(\"\");",
        "```",
      ].join("\n");
    },
  },
  {
    key: "hint",
    label: "Hint",
    icon: HINT_ICON,
    markdown: () =>
      '<details class="dl-hint"><summary>stuck? here are some steps</summary>\n\nFirst step.\n\n</details>',
  },
  {
    // Belongs to the cell above it, which is where the menu is usually
    // opened: just under the cell it helps with.
    key: "staged-hint",
    label: "Staged hint",
    icon: HINT_ICON,
    markdown: () => "```hint\nafter: 3 errors\ntitle: Stuck? Try this\n\nWhat to look at first.\n```",
  },
];
