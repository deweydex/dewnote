import "katex/dist/katex.min.css";
import "./theme/dewlab-tokens.css";
import "./brand.css";
import "./app.css";
import { getFileIndex, mountDocument, setFileIndex, type MountedDocument } from "./app.ts";
import { applySettings, loadSettings } from "./settings.ts";
import { mountSettingsPanel } from "./settings-panel.ts";
import { mountFileBar, type FileBarState } from "./file-bar.ts";
import { mountRepoPanel, type RepoPanel } from "./repo-panel.ts";
import { mountFolderPanel, type FolderPanel } from "./folder-panel.ts";
import { mountOutlinePanel } from "./outline-panel.ts";
import { mountSourceView } from "./source-view.ts";
import { mountLinkCheckPanel } from "./link-check.ts";
import { mountSeriesPanel } from "./series-panel.ts";
import { mountWorkspacePalette, type WorkspacePalette } from "./workspace-palette.ts";
import { mountSpine, type Spine } from "./spine.ts";
import { registerCommands } from "./commands.ts";
import type { Module } from "./modules.ts";
import { canWriteFiles, openPath, readTextFile } from "./active-store.ts";
import { todayVersion } from "./dialect.ts";
import { activeDockContains, closeDockPanels, groupDockPanels, iconRail } from "./icon-rail.ts";
import { mountWorkspaceNav } from "./workspace-nav.ts";
import { mountWorkflowShell, type WorkflowShell } from "./workflow-shell.ts";

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
const legacyShell = new URLSearchParams(window.location.search).has("legacy");
let workflow: WorkflowShell | null = null;
let spine: Spine | null = null;
let palette: WorkspacePalette | null = null;
let modules: Module[] = [];
let latestFileState: FileBarState | null = null;
const workspaceNav = mountWorkspaceNav({
  progressive: !legacyShell,
  onLocationChange: (location) => {
    workflow?.setLocation(location);
    spine?.setLocation({ module: location.module, series: location.series, page: location.page });
  },
  onNavigate: () => workflow?.closeTransient(),
});

/** Every path that swaps the mounted document runs through here, so the
 * spine's outline is never one document behind what is on screen. A
 * `const` rather than a declaration: a hoisted function could be called
 * before `page`'s own null check, which is exactly what the narrowing
 * is there to prevent. */
const remount = (source: string): void => {
  current.destroy();
  current = mountDocument(page, source);
  spine?.refreshOutline();
};
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
let repoPanel: RepoPanel | null = null;
const fileBar = mountFileBar({
  getSource: () => current.getSource(),
  loadDocument(source, name) {
    remount(source);
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
  onExternalSave: () => repoPanel?.pushCurrent() ?? false,
  onStateChange: (state) => {
    latestFileState = state;
    workflow?.setFileState(state);
    spine?.setFile({ name: state.name, dirty: state.dirty });
  },
});
const seriesPanel = mountSeriesPanel(getFileIndex);
const updateIndex = (index: Parameters<typeof setFileIndex>[0]) => {
  setFileIndex(index);
  workspaceNav.setIndex(index);
};
const updateModules = (next: Module[]) => {
  modules = next;
  seriesPanel.setModules(next);
  workspaceNav.setModules(next);
};
let folderPanel: FolderPanel | null = null;
folderPanel = mountFolderPanel(fileBar, updateIndex, updateModules, (name) => {
  chooseSession("local");
  workflow?.setSession("local", name, "Local folder");
  spine?.setWorkspace({ label: name, detail: "" });
  spine?.show();
  offerTheWorkspace();
});
repoPanel = mountRepoPanel({
  getSource: () => current.getSource(),
  loadDocument(source, name) {
    remount(source);
    workspaceNav.setCurrentPath(name);
    fileBar.openExternal(name);
  },
  onIndexChange: updateIndex,
  onModulesChange: updateModules,
  onSessionOpen: (context) => {
    chooseSession("github");
    if (!legacyShell) repoPanel?.hide();
    workflow?.setRepoContext(context);
    workflow?.setSession("github", context.label, `${context.base} → ${context.branch}`);
    spine?.setWorkspace({ label: context.label, detail: `${context.base} \u2192 ${context.branch}` });
    spine?.show();
    offerTheWorkspace();
  },
  onChooserClose: () => {
    if (!session) workflow?.cancelSourceChoice();
  },
  onDocumentOpen: (path) => {
    workspaceNav.setCurrentPath(path);
    fileBar.openExternal(path);
  },
  onDocumentSaved: () => {
    fileBar.markSaved();
    workflow?.documentSaved();
    spine?.setProblem(null);
  },
  onBranchChange: (path) => workflow?.noteBranchChange(path),
  onContextChange: (context) => {
    workflow?.setRepoContext(context);
    spine?.setWorkspace({ label: context.label, detail: `${context.base} \u2192 ${context.branch}` });
  },
  // A refused push used to land only in the repository panel's own
  // status line, which the progressive shell keeps closed — so Save
  // could fail in complete silence. The shell shows it now; the panel
  // still says the same thing for anyone who has it open.
  onProblem: (problem) => {
    workflow?.reportProblem(problem);
    spine?.setProblem({
      message: problem.message,
      ...(problem.conflict ? { action: { label: "Show both", run: () => repoPanel?.reveal("conflict") } } : {}),
    });
  },
  onOpenSource: () => document.querySelector<HTMLButtonElement>(".dn-source-toggle")?.click(),
  onOrganizeModules: () => document.querySelector<HTMLButtonElement>(".dn-series-toggle")?.click(),
});
mountOutlinePanel({ getSource: () => current.getSource() });
mountSourceView({
  getSource: () => current.getSource(),
  loadDocument(source, _name) {
    remount(source);
  },
});
mountLinkCheckPanel({ getSource: () => current.getSource(), getFileIndex });

// Four purposeful rail launchers instead of seven peer circles. Workspace is
// where content comes from and where its module structure is managed;
// Review holds non-editing views over the current document. Source and
// Settings remain direct because each is a distinct, frequently used
// mode rather than a choice among related tools.
if (legacyShell) {
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
}
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

const clickToggle = (selector: string) => document.querySelector<HTMLButtonElement>(selector)?.click();

/** A workspace has just opened and no document in it has. The palette is
 * the one navigator now, so it is what arrives — rather than the three
 * dependent `<select>` elements, which stay mounted as the thing that
 * works out module › series › page for whatever is open (the spine's own
 * breadcrumb) and no longer draw a surface of their own. */
function offerTheWorkspace(): void {
  // Only in the progressive shell. The legacy shell's rails are its own
  // navigator, and a palette opening over them on arrival would be a
  // second one nobody asked for.
  if (legacyShell) return;
  palette?.open();
}

if (!legacyShell) {
  workflow = mountWorkflowShell({
    chooseLocal: () => folderPanel?.choose() ?? Promise.resolve(false),
    chooseGithub: () => repoPanel?.showChooser(),
    saveCurrent: () => fileBar.saveCurrent(),
    openPullRequest: () => repoPanel?.openPullRequest() ?? Promise.resolve(null),
    revealStore: (reason) => repoPanel?.reveal(reason),
    closePanels: closeDockPanels,
    panelContains: activeDockContains,
    resetWorkspace: () => {
      // The shell has already asked whether dirty work may be discarded.
      // Clear the unload guard so the same decision is not asked twice.
      fileBar.markSaved();
      window.location.reload();
    },
  });
  if (latestFileState) workflow.setFileState(latestFileState);
}
// The spine and the palette: planning/UI_REVIEW.md §5, made real. The
// spine is the header's replacement — identity, location and save state
// as a caption in the margin the page already had. The palette is the
// third question the header used to answer with a breadcrumb pill.
if (!legacyShell) {
  spine = mountSpine({
    getSource: () => current.getSource(),
    openPalette: () => palette?.open(),
    save: () => fileBar.saveCurrent(),
  });
}

// The palette is the app's, not one shell's: it replaced
// `command-palette.ts`, which was always mounted, and every command in
// it works the same whichever chrome is on screen.
palette = mountWorkspacePalette({
  getIndex: getFileIndex,
  getModules: () => modules,
  openPath,
  // Only a store that can read a file without opening it can fill the
  // preview pane. A folder can; a repository would spend a real API
  // call per highlighted row, so it does not offer one and the pane
  // shows what the index already knows.
  readPath: async (path) => (canWriteFiles() ? readTextFile(path).catch(() => null) : null),
});
registerCommands([
  { id: "appearance", label: "Appearance\u2026", section: "Appearance", keywords: ["settings", "theme", "dark", "font", "size", "measure", "margins", "tint", "line height"], detail: "Theme, typeface, text size, measure, margins, cell tint, and where Python loads from.", run: () => clickToggle(".dn-settings-toggle") },
  { id: "source", label: "Whole-file source", section: "Document", keywords: ["markdown", "raw", "yaml", "cmd+/"], detail: "The whole file in one editor, front matter and fence markers included.", run: () => clickToggle(".dn-source-toggle") },
  { id: "links", label: "Check tutorial links", section: "Document", keywords: ["tutorial:", "broken", "slug"], detail: "Reads every tutorial: link here and reports any whose slug is not in this workspace.", run: () => clickToggle(".dn-linkcheck-toggle") },
  { id: "export-html", label: "Export a standalone HTML page", section: "Document", keywords: ["share", "send", "web"], detail: "The rendered document with its stylesheet inlined. Nothing to run.", run: () => fileBar.exportHtml() },
  { id: "export-ipynb", label: "Export a Jupyter notebook", section: "Document", keywords: ["ipynb", "jupyter"], detail: "Exec cells become real code cells; the original fence text rides along so the trip back is lossless.", run: () => fileBar.exportNotebook() },
  { id: "import-ipynb", label: "Import a Jupyter notebook\u2026", section: "Document", keywords: ["ipynb", "jupyter", "open"], detail: "Opens a .ipynb as a new markdown document.", run: () => { void fileBar.importNotebook(); } },
  { id: "open-file", label: "Open a Markdown or YAML file\u2026", section: "Workspace", keywords: ["device", "disk"], detail: "One file from this device, outside whatever workspace is open.", run: () => { void fileBar.openDeviceFile(); } },
  { id: "browse", label: "Browse workspace files\u2026", section: "Workspace", keywords: ["all files", "paths", "assets", "order.yaml"], detail: "The full file list, for assets, descriptors and anything the index does not carry.", run: () => { if (session === "github") repoPanel?.showChooser(); else clickToggle(".dn-folder-toggle"); } },
  { id: "modules", label: "Arrange modules and series", section: "Workspace", keywords: ["reorder", "order", "curriculum", "course"], detail: "Move a tutorial within a series, or add one.", available: () => modules.length > 0, run: () => clickToggle(".dn-series-toggle") },
  { id: "change-workspace", label: "Change workspace\u2026", section: "Workspace", keywords: ["folder", "repository", "switch"], detail: "Start again from the source choice.", available: () => session !== null, run: () => workflow?.requestReset() },
  { id: "new-version", label: "Save as a new version\u2026", section: "Publish", keywords: ["release", "freeze", "version"], detail: "Freeze the committed release and push this as the new live version.", available: () => repoPanel?.canPushNewVersion() ?? false, run: () => { void repoPanel?.pushNewVersion(); } },
  { id: "review", label: "Review repository changes", section: "Publish", keywords: ["publish", "pull request", "pr", "branch", "commit"], detail: "Everything changed on the working branch, and the way to a pull request.", available: () => workflow?.hasBranchChanges() ?? false, run: () => workflow?.openReview() },
]);

// Playwright (tests/e2e/) drives this same built page directly rather than
// a second harness entry point, remounting whatever source a test needs
// through this. Nothing else in the app reads window.__dewnote.
interface DewnoteTestHook {
  mount(source: string): void;
  getSource(): string;
  setFileIndex(index: Parameters<typeof setFileIndex>[0]): void;
  setModules(modules: Module[]): void;
}
(window as unknown as { __dewnote: DewnoteTestHook }).__dewnote = {
  mount(source: string): void {
    remount(source);
  },
  getSource(): string {
    return current.getSource();
  },
  // The same two functions a real open goes through, not the one
  // consumer each used to reach: a test that sets an index or a set of
  // modules should leave every reader of them agreeing, which is the
  // whole point of there being one place to set them.
  setFileIndex: updateIndex,
  setModules: updateModules,
};
