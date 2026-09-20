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

/** The first `cell-N` nobody is using. */
export function freeCellId(used: readonly string[]): string {
  const taken = new Set(used);
  for (let at = 1; ; at += 1) {
    const candidate = `cell-${at}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface SnippetItem {
  key: string;
  label: string;
  icon: string;
  markdown(id: string): string;
}

/** A play button, for something that runs. */
const RUN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
const DATABASE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><ellipse cx="12" cy="6" rx="7" ry="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const HINT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2Zm-2 18h4v1a2 2 0 1 1-4 0v-1Z"/></svg>';

export const SNIPPETS: SnippetItem[] = [
  {
    key: "python-cell",
    label: "Python cell",
    icon: RUN_ICON,
    markdown: (id) => `\`\`\`python exec\nid: ${id}\n\n\`\`\``,
  },
  {
    key: "sql-cell",
    label: "SQL cell",
    icon: DATABASE_ICON,
    markdown: (id) => `\`\`\`sql exec\nid: ${id}\n\n\`\`\``,
  },
  {
    key: "hint",
    label: "Hint",
    icon: HINT_ICON,
    markdown: () =>
      '<details class="dl-hint"><summary>stuck? here are some steps</summary>\n\nFirst step.\n\n</details>',
  },
];
