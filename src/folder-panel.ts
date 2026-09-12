// The rest of step 4's own "done when" line: a module folder from
// dewlab opened and worked on for an afternoon — Chrome/Edge only, per
// decision 5, with the toggle itself disabled and saying so where the
// picker doesn't exist (Safari, on any Apple platform). Search and
// open here; Save and the dirty indicator are the file bar's own,
// unchanged, since an opened folder file is exactly the single-file
// case #18 already built — a name, content, and a real writable handle.

import { chooseFolder, listMarkdownFiles, listOrderFiles, readFile, supportsDirectoryPicker, type FolderFile } from "./folder-store.ts";
import type { FileBar } from "./file-bar.ts";
import { buildFileIndex, type FileIndexEntry } from "./file-index.ts";
import { parseSeriesFiles, type Series } from "./series.ts";

export interface FolderPanel {
  destroy(): void;
}

function textInput(placeholder: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.spellcheck = false;
  return input;
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

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "dn-folder-toggle";
  toggle.setAttribute("aria-label", "Folder");
  toggle.setAttribute("aria-expanded", "false");
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
  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "dn-folder-open";
  openButton.textContent = "Open folder…";
  openSection.appendChild(openButton);

  const status = document.createElement("p");
  status.className = "dn-folder-hint dn-folder-status";
  openSection.appendChild(status);
  panel.appendChild(openSection);

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

  openButton.addEventListener("click", async () => {
    const root = await chooseFolder();
    if (!root) return;
    folderName = root.name;
    openButton.textContent = `Open folder… (${folderName})`;
    status.textContent = "Reading folder…";
    try {
      // Listed and read separately (folder-store.ts's own two functions,
      // one walk each), but merged into one browsable/searchable list:
      // an `.order.yaml` file is a plain text file like any other, and
      // opening one hands it to the same editor and Save path every
      // other file already gets — the whole-file source view (Cmd+/)
      // shows its raw YAML untouched by any markdown rendering, which is
      // exactly what hand-editing a reading order (inserting a slug,
      // reordering two lines) actually wants, with no new UI needed.
      const [markdownFiles, orderFiles] = await Promise.all([listMarkdownFiles(root), listOrderFiles(root)]);
      files = [...markdownFiles, ...orderFiles];
      status.textContent = `${markdownFiles.length} markdown file${markdownFiles.length === 1 ? "" : "s"}, ${orderFiles.length} order file${orderFiles.length === 1 ? "" : "s"}, in "${folderName}".`;
      renderFiles();
      await refreshIndex(markdownFiles);
      await refreshSeries(orderFiles);
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  document.body.append(toggle, panel);
  renderFiles();

  return {
    destroy() {
      toggle.remove();
      panel.remove();
    },
  };
}
