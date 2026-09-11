// The rest of step 4's own "done when" line: a module folder from
// dewlab opened and worked on for an afternoon — Chrome/Edge only, per
// decision 5, with the toggle itself disabled and saying so where the
// picker doesn't exist (Safari, on any Apple platform). Search and
// open here; Save and the dirty indicator are the file bar's own,
// unchanged, since an opened folder file is exactly the single-file
// case #18 already built — a name, content, and a real writable handle.

import { chooseFolder, listMarkdownFiles, readFile, supportsDirectoryPicker, type FolderFile } from "./folder-store.ts";
import type { FileBar } from "./file-bar.ts";

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
 * machinery, not a second way of driving the editor. */
export function mountFolderPanel(fileBar: FileBar): FolderPanel {
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

  openButton.addEventListener("click", async () => {
    const root = await chooseFolder();
    if (!root) return;
    folderName = root.name;
    openButton.textContent = `Open folder… (${folderName})`;
    status.textContent = "Reading folder…";
    try {
      files = await listMarkdownFiles(root);
      status.textContent = `${files.length} markdown file${files.length === 1 ? "" : "s"} in "${folderName}".`;
      renderFiles();
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
