import "katex/dist/katex.min.css";
import "./theme/dewlab-tokens.css";
import "./brand.css";
import "./app.css";
import { getFileIndex, mountDocument, setFileIndex, type MountedDocument } from "./app.ts";
import { applySettings, loadSettings } from "./settings.ts";
import { mountSettingsPanel } from "./settings-panel.ts";
import { mountFileBar } from "./file-bar.ts";
import { mountRepoPanel } from "./repo-panel.ts";
import { mountFolderPanel } from "./folder-panel.ts";
import { mountOutlinePanel } from "./outline-panel.ts";
import { mountSourceView } from "./source-view.ts";
import { mountLinkCheckPanel } from "./link-check.ts";
import { mountSeriesPanel } from "./series-panel.ts";
import { mountCommandPalette } from "./command-palette.ts";
import { todayVersion } from "./dialect.ts";
import { groupDockPanels, iconRail } from "./icon-rail.ts";
import { mountWorkspaceNav } from "./workspace-nav.ts";

// Applied before the document mounts, not after, so there is never a
// flash of default texture before a returning reader's own saved
// choice takes effect.
applySettings(loadSettings());

// dewlab, not plain markdown: dewnote's own default texture is already
// dewlab's (§5.3), and a first-time reader who never sets year: or
// module_title: never sees the per-field form (decision 11) or any
// other dialect-aware polish gated on a real dialect — the very things
// most worth showing in a first five minutes (decision 29's own note).
// Decision 31: the starter models a real dialect rather than plain
// markdown, and the dialect is dewlab — so a first-time reader meets the
// per-field form rather than the raw-YAML caption plain markdown gets.
//
// Which fields, though, is dewlab's to say, and dewlab's answer changed:
// `slug`, `module`, `module_title` and `series` went when placement moved
// into `modules/*.yaml` (decision 36). They survived here after the form
// stopped showing them, which made them worse than visible-and-wrong —
// every document started from this one carried four fields nobody could
// see and dewlab's build ignores. `version` is dewlab's own dated form
// now too (`2026.09.14.1`), stamped when the editor loads rather than
// frozen at whatever day this string was last edited.
const STARTER_DOCUMENT = `---
title: Untitled
year: "${new Date().getFullYear()}"
version: ${todayVersion()}
---

# Untitled

Start writing. Click this paragraph, or any other, to edit its markdown
source directly; click away to see it rendered again.

\`\`\`python exec
id: first-cell
1 + 1
\`\`\`

<details class="dl-hint"><summary>hint</summary>

This is a hint fold — the same one dewlab uses.

</details>
`;

const page = document.querySelector<HTMLDivElement>("#dn-page");
if (!page) throw new Error("index.html is missing #dn-page");

let current: MountedDocument = mountDocument(page, STARTER_DOCUMENT);
const workspaceNav = mountWorkspaceNav();
let session: "local" | "github" | null = null;

function chooseSession(next: "local" | "github"): void {
  if (session && session !== next) return;
  session = next;
  const folder = document.querySelector<HTMLButtonElement>(".dn-folder-toggle");
  const repository = document.querySelector<HTMLButtonElement>(".dn-repo-toggle");
  if (folder) {
    folder.disabled = next === "github";
    if (folder.disabled) folder.title = "This session is connected to GitHub. Reload to choose a local workspace instead.";
  }
  if (repository) {
    repository.disabled = next === "local";
    if (repository.disabled) repository.title = "This is a local session. Reload to connect a GitHub repository instead.";
  }
  document.body.dataset["workspaceSession"] = next;
}

mountSettingsPanel();
const fileBar = mountFileBar({
  getSource: () => current.getSource(),
  loadDocument(source, name) {
    current.destroy();
    current = mountDocument(page, source);
    workspaceNav.setCurrentPath(name);
  },
  onLocalOpen: () => {
    if (session === "github") {
      window.alert("This session is connected to GitHub. Reload Dewnote to start a separate local session.");
      return false;
    }
    chooseSession("local");
    return true;
  },
});
const seriesPanel = mountSeriesPanel(getFileIndex);
const updateIndex = (index: Parameters<typeof setFileIndex>[0]) => {
  setFileIndex(index);
  workspaceNav.setIndex(index);
};
const updateModules = (modules: Parameters<typeof seriesPanel.setModules>[0]) => {
  seriesPanel.setModules(modules);
  workspaceNav.setModules(modules);
};
mountFolderPanel(fileBar, updateIndex, updateModules, () => chooseSession("local"));
mountRepoPanel({
  getSource: () => current.getSource(),
  loadDocument(source, name) {
    current.destroy();
    current = mountDocument(page, source);
    workspaceNav.setCurrentPath(name);
  },
  onIndexChange: updateIndex,
  onModulesChange: updateModules,
  onSessionOpen: () => chooseSession("github"),
  onDocumentOpen: (path) => workspaceNav.setCurrentPath(path),
  onOrganizeModules: () => document.querySelector<HTMLButtonElement>(".dn-series-toggle")?.click(),
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

// Four purposeful rail launchers instead of seven peer circles. Workspace is
// where content comes from and where its module structure is managed;
// Review holds non-editing views over the current document. Source and
// Settings remain direct because each is a distinct, frequently used
// mode rather than a choice among related tools.
const workspaceToggle = groupDockPanels("Workspace", "▤", "dn-workspace-toggle", [
  { selector: ".dn-folder-toggle", description: "Start a local session from a Dewlab folder." },
  { selector: ".dn-repo-toggle", description: "Start a repository session with module navigation and publishing." },
]);
const reviewToggle = groupDockPanels("Review", "✓", "dn-review-toggle", [
  { selector: ".dn-outline-toggle", description: "Navigate the headings in the current document." },
  { selector: ".dn-linkcheck-toggle", description: "Check tutorial links against the open workspace." },
]);
const rail = iconRail();
rail.prepend(reviewToggle);
rail.prepend(workspaceToggle);
const sourceToggle = rail.querySelector(".dn-source-toggle");
const settingsToggle = rail.querySelector(".dn-settings-toggle");
if (sourceToggle) rail.appendChild(sourceToggle);
if (settingsToggle) rail.appendChild(settingsToggle);
// Module organisation is entered from the active repository rather than
// presented as a third kind of workspace. The real toggle remains as the
// dock controller used by the repository's “Arrange” action.
const legacyModulesToggle = document.querySelector<HTMLButtonElement>(".dn-series-toggle");
if (legacyModulesToggle) {
  legacyModulesToggle.hidden = true;
  // It remains a private dock controller for “Arrange modules and
  // series”, but it is no longer a fifth rail item in the UI or the
  // accessibility tree.
  document.body.appendChild(legacyModulesToggle);
}
mountCommandPalette();

// Playwright (tests/e2e/) drives this same built page directly rather than
// a second harness entry point, remounting whatever source a test needs
// through this. Nothing else in the app reads window.__dewnote.
interface DewnoteTestHook {
  mount(source: string): void;
  getSource(): string;
  setFileIndex(index: Parameters<typeof setFileIndex>[0]): void;
  setModules(modules: Parameters<typeof seriesPanel.setModules>[0]): void;
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
  setModules: seriesPanel.setModules,
};
