import "katex/dist/katex.min.css";
import "./theme/dewlab-tokens.css";
import "./app.css";
import { getFileIndex, mountDocument, setFileIndex, type MountedDocument } from "./app.ts";
import { applySettings, loadSettings } from "./settings.ts";
import { mountSettingsPanel } from "./settings-panel.ts";
import { mountFileBar } from "./file-bar.ts";
import { mountRepoPanel } from "./repo-panel.ts";
import { mountFolderPanel } from "./folder-panel.ts";
import { mountDialectPanel } from "./dialect-panel.ts";
import { mountOutlinePanel } from "./outline-panel.ts";
import { mountSourceView } from "./source-view.ts";
import { mountLinkCheckPanel } from "./link-check.ts";
import { mountSeriesPanel } from "./series-panel.ts";
import { mountCommandPalette } from "./command-palette.ts";

// Applied before the document mounts, not after, so there is never a
// flash of default texture before a returning reader's own saved
// choice takes effect (decision 7, dewstack's own "FAQ's way").
applySettings(loadSettings());

// dewlab, not plain markdown: dewnote's own default texture is already
// dewlab's (§5.3), and a first-time reader who never sets year: or
// module_title: never sees the per-field form (decision 11) or any
// other dialect-aware polish gated on a real dialect — the very things
// most worth showing in a first five minutes (decision 29's own note).
// A reader who wants plain markdown instead is one click away: the
// dialect-convert panel (⇄) already converts a dewlab document down to
// plain, dropping these fields rather than asking anyone to type a
// blank set by hand.
const STARTER_DOCUMENT = `---
title: Untitled
slug: untitled
module: getting-started
module_title: "Getting Started"
year: "2026"
series: first-notebook
version: 1
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
const fileBar = mountFileBar({
  getSource: () => current.getSource(),
  loadDocument(source, _name) {
    current.destroy();
    current = mountDocument(page, source);
  },
});
const seriesPanel = mountSeriesPanel(getFileIndex);
mountFolderPanel(fileBar, setFileIndex, seriesPanel.setSeries);
mountRepoPanel({
  getSource: () => current.getSource(),
  loadDocument(source, _name) {
    current.destroy();
    current = mountDocument(page, source);
  },
  onIndexChange: setFileIndex,
  onSeriesChange: seriesPanel.setSeries,
});
mountDialectPanel({
  getSource: () => current.getSource(),
  loadDocument(source, _name) {
    current.destroy();
    current = mountDocument(page, source);
  },
});
mountOutlinePanel({ getSource: () => current.getSource() });
mountSourceView({
  getSource: () => current.getSource(),
  loadDocument(source, _name) {
    current.destroy();
    current = mountDocument(page, source);
  },
});
mountLinkCheckPanel({ getSource: () => current.getSource(), getFileIndex });
mountCommandPalette();

// Playwright (tests/e2e/) drives this same built page directly rather than
// a second harness entry point, remounting whatever source a test needs
// through this. Nothing else in the app reads window.__dewnote.
interface DewnoteTestHook {
  mount(source: string): void;
  getSource(): string;
  setFileIndex(index: Parameters<typeof setFileIndex>[0]): void;
  setSeries(series: Parameters<typeof seriesPanel.setSeries>[0]): void;
}
(window as unknown as { __dewnote: DewnoteTestHook }).__dewnote = {
  mount(source: string): void {
    current.destroy();
    current = mountDocument(page, source);
  },
  getSource(): string {
    return current.getSource();
  },
  setFileIndex,
  setSeries: seriesPanel.setSeries,
};
