// The rest of step 4's own "done when" line: a module folder from
// dewlab opened and worked on for an afternoon — Chrome/Edge only, per
// decision 5, with the toggle itself disabled and saying so where the
// picker doesn't exist (Safari, on any Apple platform). Search and
// open here; Save and the dirty indicator are the file bar's own,
// unchanged, since an opened folder file is exactly the single-file
// case #18 already built — a name, content, and a real writable handle.

import { chooseFolder, createFile, listMarkdownFiles, listOrderFiles, readFile, supportsDirectoryPicker, type FolderFile } from "./folder-store.ts";
import type { FileBar } from "./file-bar.ts";
import { buildFileIndex, type FileIndexEntry } from "./file-index.ts";
import { parseSeriesFiles, type Series } from "./series.ts";
import { createFile as createActiveFile, setActiveStore } from "./active-store.ts";
import { iconRail } from "./icon-rail.ts";

export interface FolderPanel {
  destroy(): void;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function textInput(placeholder: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.spellcheck = false;
  return input;
}

/** dewlab's own `version` form (DIALECTS.md §1: `2026.09.04.1`) —
 * today's date plus a `.1` release counter, since a freshly created
 * tutorial has no prior release to be the second of. Computed at create
 * time rather than once at mount, so a panel left open overnight still
 * stamps the day it's actually used on. */
function todayVersion(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}.1`;
}

/** Mounted once, independently of any particular document. Takes the
 * file bar itself, not a `{getSource, loadDocument}` host — opening a
 * folder file is adopting it into the file bar's own Save/dirty
 * machinery, not a second way of driving the editor. `onIndexChange`,
 * when given, is handed plan §5.10's own front-matter index every time
 * it's (re)built — main.ts wires it to app.ts's setFileIndex so the link
 * picker (link-picker.ts) has something to search once a folder is
 * open. `onSeriesChange`, when given, is handed series.ts's own read of
 * every `.order.yaml` file in the folder the same way, for
 * series-panel.ts. */
export function mountFolderPanel(
  fileBar: FileBar,
  onIndexChange?: (index: FileIndexEntry[]) => void,
  onSeriesChange?: (series: Series[]) => void,
): FolderPanel {
  let files: FolderFile[] = [];
  let folderName = "";
  /** The directory handle from the last successful `chooseFolder()` —
   * kept so `refreshButton` can re-walk the same folder without making
   * the reader click through the OS picker again. There is no live
   * filesystem-watch API a browser can call to notice a change on its
   * own (unlike a GitHub repository, where "Load repository" already
   * doubles as its own refresh, since it re-reads whatever the form
   * fields already say rather than reopening any picker), so a manual
   * re-scan is the whole mechanism — closed until asked, the same as
   * every other action here. */
  let currentRoot: FileSystemDirectoryHandle | null = null;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "dn-folder-toggle";
  toggle.setAttribute("aria-label", "Folder");
  toggle.setAttribute("aria-expanded", "false");
  toggle.title = "Folder";
  toggle.textContent = "▤";

  const supported = supportsDirectoryPicker();
  if (!supported) {
    toggle.disabled = true;
    toggle.title = "Opening a real folder needs Chrome or Edge — Safari has no directory picker (decision 5).";
  }

  const panel = document.createElement("div");
  panel.className = "dn-folder-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", "Folder");
  panel.hidden = true;
  toggle.setAttribute("aria-controls", (panel.id = "dn-folder-panel"));

  toggle.addEventListener("click", () => {
    if (!supported) return;
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });

  const header = document.createElement("div");
  header.className = "dn-folder-header";
  const heading = document.createElement("h2");
  heading.textContent = "Folder";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "dn-folder-close";
  closeButton.setAttribute("aria-label", "Close folder panel");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  });
  header.append(heading, closeButton);
  panel.appendChild(header);

  const openSection = document.createElement("section");
  openSection.className = "dn-folder-section";
  const openRow = document.createElement("div");
  openRow.className = "dn-folder-open-row";
  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "dn-folder-open";
  openButton.textContent = "Open folder…";
  openRow.appendChild(openButton);

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "dn-folder-refresh";
  refreshButton.textContent = "Refresh";
  refreshButton.disabled = true;
  refreshButton.title = "Re-scan the open folder for changes made outside dewnote.";
  openRow.appendChild(refreshButton);
  openSection.appendChild(openRow);

  const status = document.createElement("p");
  status.className = "dn-folder-hint dn-folder-status";
  openSection.appendChild(status);
  panel.appendChild(openSection);

  // "New tutorial" — the other named item on step 4's own line, next to
  // series-panel.ts's "New series". DIALECTS.md §1's real layout is
  // `tutorials/<module>/<slug>/<slug>.md`, so the module field is the
  // same "leave blank if the open folder already is one module's own
  // directory" case series creation already has — but here module is a
  // *required* front-matter field (build.py rejects a tutorial without
  // one), and it must equal the file's own parent folder, so a blank
  // field doesn't mean "no module": it means "use the folder that's
  // already open," and `folderName` fills that in. `version` isn't a
  // form field at all — DIALECTS.md's own `2026.09.04.1` form is a
  // release date no reader would type by hand for a brand-new file, so
  // `todayVersion()` stamps today's date with a fresh `.1` instead, the
  // only sane default for something that has no prior release to be the
  // second of. Written through `active-store.ts`'s own generic
  // `createFile`, not `folder-store.ts` directly, for the same reason
  // series-panel.ts does: this has no separate knowledge of which store
  // is actually open, and folder-panel.ts's own registered handler
  // (above) already re-runs `loadFromRoot` afterward.
  const tutorialSection = document.createElement("section");
  tutorialSection.className = "dn-folder-section dn-folder-create";
  const tutorialHeading = document.createElement("h3");
  tutorialHeading.className = "dn-folder-create-heading";
  tutorialHeading.textContent = "New tutorial";
  tutorialSection.appendChild(tutorialHeading);

  const tutorialModuleInput = textInput("Module (leave blank if already inside one)");
  tutorialModuleInput.className = "dn-folder-create-field";
  const tutorialSlugInput = textInput("tutorial-slug");
  tutorialSlugInput.className = "dn-folder-create-field";
  const tutorialTitleInput = textInput("Title");
  tutorialTitleInput.className = "dn-folder-create-field";
  const tutorialModuleTitleInput = textInput("Module title (e.g. Getting Started)");
  tutorialModuleTitleInput.className = "dn-folder-create-field";
  const tutorialSeriesInput = textInput("Series slug (matches a .order.yaml)");
  tutorialSeriesInput.className = "dn-folder-create-field";
  const tutorialYearInput = textInput("Year");
  tutorialYearInput.className = "dn-folder-create-field";
  tutorialYearInput.value = String(new Date().getFullYear());
  tutorialSection.append(
    tutorialModuleInput,
    tutorialSlugInput,
    tutorialTitleInput,
    tutorialModuleTitleInput,
    tutorialSeriesInput,
    tutorialYearInput,
  );

  const tutorialCreateButton = document.createElement("button");
  tutorialCreateButton.type = "button";
  tutorialCreateButton.className = "dn-folder-create-button";
  tutorialCreateButton.textContent = "Create";
  tutorialCreateButton.disabled = true;
  tutorialCreateButton.title = "Open a folder first.";
  tutorialSection.appendChild(tutorialCreateButton);

  const tutorialStatus = document.createElement("p");
  tutorialStatus.className = "dn-folder-create-status";
  tutorialSection.appendChild(tutorialStatus);
  panel.appendChild(tutorialSection);

  tutorialCreateButton.addEventListener("click", async () => {
    const module = tutorialModuleInput.value.trim();
    const slug = tutorialSlugInput.value.trim();
    const title = tutorialTitleInput.value.trim();
    const moduleTitle = tutorialModuleTitleInput.value.trim();
    const series = tutorialSeriesInput.value.trim();
    const year = tutorialYearInput.value.trim();
    if (!SLUG_RE.test(slug)) {
      tutorialStatus.textContent = "Tutorial slug must be lowercase letters, digits, and hyphens.";
      return;
    }
    if (!title || !moduleTitle || !series || !year) {
      tutorialStatus.textContent = "Title, module title, series, and year are all required.";
      return;
    }
    const effectiveModule = module || folderName;
    const path = module ? `${module}/${slug}/${slug}.md` : `${slug}/${slug}.md`;
    const content = `---
title: ${title}
slug: ${slug}
module: ${effectiveModule}
module_title: ${moduleTitle}
year: "${year}"
series: ${series}
version: ${todayVersion()}
---

# ${title}

Start writing.

\`\`\`python exec
id: ${slug}-first-cell
1 + 1
\`\`\`
`;
    tutorialCreateButton.disabled = true;
    tutorialStatus.textContent = "Creating…";
    try {
      await createActiveFile(path, content);
      tutorialStatus.textContent = `Created ${path}.`;
      tutorialModuleInput.value = "";
      tutorialSlugInput.value = "";
      tutorialTitleInput.value = "";
      tutorialModuleTitleInput.value = "";
      tutorialSeriesInput.value = "";
    } catch (err) {
      tutorialStatus.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      tutorialCreateButton.disabled = false;
    }
  });

  const searchSection = document.createElement("section");
  searchSection.className = "dn-folder-section";
  const searchInput = textInput("Search files…");
  searchInput.className = "dn-folder-search";
  searchSection.appendChild(searchInput);

  const fileList = document.createElement("ul");
  fileList.className = "dn-folder-files";
  searchSection.appendChild(fileList);
  panel.appendChild(searchSection);

  function renderFiles() {
    const query = searchInput.value.trim().toLowerCase();
    const matches = query ? files.filter((f) => f.path.toLowerCase().includes(query)) : files;
    fileList.replaceChildren();
    for (const file of matches.slice(0, 300)) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dn-folder-file";
      button.textContent = file.path;
      button.addEventListener("click", () => openFolderFile(file));
      item.appendChild(button);
      fileList.appendChild(item);
    }
    if (files.length > 0 && matches.length === 0) {
      const empty = document.createElement("li");
      empty.className = "dn-folder-empty";
      empty.textContent = "No files match.";
      fileList.appendChild(empty);
    }
  }
  searchInput.addEventListener("input", renderFiles);

  async function openFolderFile(file: FolderFile) {
    status.textContent = `Opening ${file.path}…`;
    try {
      const content = await readFile(file.handle);
      fileBar.open({ name: file.path, content, handle: file.handle });
      status.textContent = `Opened ${file.path}.`;
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : String(err);
    }
  }

  /** §5.10's own "this is a real cost, not a free improvement" — every
   * markdown file's content is read once, right here, so the index has
   * something to search before the reader ever opens one of them. Errors
   * reading an individual file (permissions, a file removed mid-scan)
   * just leave that one file out of the index rather than failing the
   * whole folder open — the file list itself (already built) still
   * works regardless. Takes `markdownFiles` explicitly rather than
   * reading the shared `files` — that list also carries `.order.yaml`
   * files now (the click handler's own comment explains why), and an order
   * file has no front matter worth indexing at all, so reading its
   * content again here would only ever produce a bare `{path}` entry. */
  async function refreshIndex(markdownFiles: FolderFile[]) {
    if (!onIndexChange) return;
    const entries = await Promise.all(
      markdownFiles.map(async (file) => {
        try {
          return { path: file.path, content: await readFile(file.handle) };
        } catch {
          return null;
        }
      }),
    );
    onIndexChange(buildFileIndex(entries.filter((e): e is { path: string; content: string } => e !== null)));
  }

  /** Mirrors refreshIndex's own shape, over the `.order.yaml` files
   * `openButton`'s own click handler already listed — order files are
   * typically few, so no attempt is made to fold this into the same pass
   * as `refreshIndex`. */
  async function refreshSeries(orderFiles: FolderFile[]) {
    if (!onSeriesChange) return;
    const entries = await Promise.all(
      orderFiles.map(async (file) => {
        try {
          return { path: file.path, content: await readFile(file.handle) };
        } catch {
          return null;
        }
      }),
    );
    onSeriesChange(parseSeriesFiles(entries.filter((e): e is { path: string; content: string } => e !== null)));
  }

  /** The whole "read this folder and rebuild everything" pass, shared by
   * `openButton` (against a freshly chosen folder) and `refreshButton`
   * (against `currentRoot`, already held) — the same work either way,
   * just with or without a new `chooseFolder()` in front of it. Listed
   * and read separately (folder-store.ts's own two functions, one walk
   * each), but merged into one browsable/searchable list: an
   * `.order.yaml` file is a plain text file like any other, and opening
   * one hands it to the same editor and Save path every other file
   * already gets — the whole-file source view (Cmd+/) shows its raw
   * YAML untouched by any markdown rendering, which is exactly what
   * hand-editing a reading order (inserting a slug, reordering two
   * lines) actually wants, with no new UI needed. */
  async function loadFromRoot(root: FileSystemDirectoryHandle, name: string, verb: "Reading" | "Refreshing") {
    status.textContent = `${verb} folder…`;
    try {
      const [markdownFiles, orderFiles] = await Promise.all([listMarkdownFiles(root), listOrderFiles(root)]);
      files = [...markdownFiles, ...orderFiles];
      status.textContent = `${markdownFiles.length} markdown file${markdownFiles.length === 1 ? "" : "s"}, ${orderFiles.length} order file${orderFiles.length === 1 ? "" : "s"}, in "${name}".`;
      renderFiles();
      await refreshIndex(markdownFiles);
      await refreshSeries(orderFiles);
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : String(err);
    }
  }

  openButton.addEventListener("click", async () => {
    const root = await chooseFolder();
    if (!root) return;
    currentRoot = root;
    folderName = root.name;
    openButton.textContent = `Open folder… (${folderName})`;
    refreshButton.disabled = false;
    tutorialCreateButton.disabled = false;
    tutorialCreateButton.title = "";
    // active-store.ts's own "open this path" hook — registered once a
    // folder is actually open, not at mount time (nothing to open yet),
    // and closing over the live `files` binding rather than a snapshot,
    // so a later Refresh's own reassignment is seen without registering
    // again. Reuses openFolderFile itself rather than a second "open a
    // file" implementation — a click here is exactly a click on this
    // same file in `fileList`. `createFile` re-runs the whole
    // `loadFromRoot` pass afterward rather than splicing the one new
    // file into `files` by hand — simpler, and correct even when the
    // new file landed in a module folder that didn't exist a moment ago
    // (a fresh directory `loadFromRoot`'s own walk needs to see).
    setActiveStore({
      async openPath(path) {
        const file = files.find((f) => f.path === path);
        if (!file) return false;
        await openFolderFile(file);
        return true;
      },
      async createFile(path, content) {
        await createFile(root, path, content);
        await loadFromRoot(root, folderName, "Refreshing");
      },
    });
    await loadFromRoot(root, folderName, "Reading");
  });

  refreshButton.addEventListener("click", () => {
    if (currentRoot) void loadFromRoot(currentRoot, folderName, "Refreshing");
  });

  iconRail().appendChild(toggle);
  document.body.appendChild(panel);
  renderFiles();

  return {
    destroy() {
      toggle.remove();
      panel.remove();
    },
  };
}
