// The entry point, while the rest of planning/REBUILD.md §5 is built.
// Steps 3 and 4 — the store, the shell, the cells — are still in
// archive/src and are ported next.

import "@milkdown/crepe/theme/common/style.css";
import "./style.css";
import { mountEditor, type Document } from "./editor.ts";

const STARTER = `---
title: A new document
---

# A new document

Write here.
`;

const page = document.querySelector<HTMLElement>("#dn-page");

let current: Document | null = null;

if (page) {
  current = await mountEditor(page, { markdown: STARTER });
}

// The Playwright hook the round-trip test drives. It is the whole of the
// test surface for now: open a document, ask for it back.
(globalThis as unknown as Record<string, unknown>).__dewnote = {
  async open(markdown: string): Promise<void> {
    if (!page) return;
    current?.destroy();
    page.replaceChildren();
    current = await mountEditor(page, { markdown });
  },
  markdown: (): string => current?.markdown() ?? "",
  headings: () => current?.headings() ?? [],
};
