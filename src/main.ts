import "katex/dist/katex.min.css";
import "./theme/dewlab-tokens.css";
import "./app.css";
import { mountDocument, type MountedDocument } from "./app.ts";
import { applySettings, loadSettings } from "./settings.ts";
import { mountSettingsPanel } from "./settings-panel.ts";
import { mountFileBar } from "./file-bar.ts";
import { mountRepoPanel } from "./repo-panel.ts";

// Applied before the document mounts, not after, so there is never a
// flash of default texture before a returning reader's own saved
// choice takes effect (decision 7, dewstack's own "FAQ's way").
applySettings(loadSettings());

const STARTER_DOCUMENT = `---
title: Untitled
slug: untitled
---

# Untitled

Start writing. Click this paragraph, or any other, to edit its markdown
source directly; click away to see it rendered again.

\`\`\`python exec
id: first-cell
1 + 1
\`\`\`

<details class="dl-hint"><summary>hint</summary>

This is a hint fold — the same one dewlab and dewstack both use.

</details>
`;

const page = document.querySelector<HTMLDivElement>("#dn-page");
if (!page) throw new Error("index.html is missing #dn-page");

let current: MountedDocument = mountDocument(page, STARTER_DOCUMENT);
mountSettingsPanel();
mountFileBar({
  getSource: () => current.getSource(),
  loadDocument(source, _name) {
    current.destroy();
    current = mountDocument(page, source);
  },
});
mountRepoPanel({
  getSource: () => current.getSource(),
  loadDocument(source, _name) {
    current.destroy();
    current = mountDocument(page, source);
  },
});

// Playwright (tests/e2e/) drives this same built page directly rather than
// a second harness entry point, remounting whatever source a test needs
// through this. Nothing else in the app reads window.__dewnote.
interface DewnoteTestHook {
  mount(source: string): void;
  getSource(): string;
}
(window as unknown as { __dewnote: DewnoteTestHook }).__dewnote = {
  mount(source: string): void {
    current.destroy();
    current = mountDocument(page, source);
  },
  getSource(): string {
    return current.getSource();
  },
};
