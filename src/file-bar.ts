// The quiet file bar — step 4's first slice, and the thing main.ts never
// actually had: until this, dewnote could only edit an in-memory starter
// document, with no way in or out except the Playwright test hook. This
// mounts a filename control (Open, current name, Save) the same way
// settings-panel.ts mounts its own gear icon: quiet, fixed, always there,
// never boxed. Dropping a file anywhere on the page opens it, matching
// the plan's "single-file build that opens a dropped file" line for step
// 2 that nothing before this actually delivered.

import { downloadAsFile, openDroppedItem, openFile, saveDocument, suggestedFilename, type OpenedDocument } from "./store.ts";
import { buildStandaloneHtmlPage, collectPageCss } from "./export-html.ts";

export interface FileBarHost {
  /** The mounted document's current source, live-editor content included. */
  getSource(): string;
  /** Tears down the current mount and mounts `source` in its place. */
  loadDocument(source: string, name: string): void;
}

export interface FileBar {
  destroy(): void;
}

function isMarkdownDrag(event: DragEvent): boolean {
  return Boolean(event.dataTransfer?.types.includes("Files"));
}

/** Mounted once, independently of any particular document — like the
 * settings panel, this outlives `main.ts`'s own `mountDocument` calls. */
export function mountFileBar(host: FileBarHost): FileBar {
  let opened: OpenedDocument | null = null;
  let dirty = false;

  const bar = document.createElement("div");
  bar.className = "dn-file-bar";

  const nameLabel = document.createElement("span");
  nameLabel.className = "dn-file-name";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "dn-file-open";
  openButton.textContent = "Open";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "dn-file-save";
  saveButton.textContent = "Save";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.className = "dn-file-export";
  exportButton.textContent = "Export HTML";
  exportButton.title = "Downloads a standalone HTML page — the rendered document, no editor, nothing to run.";

  const status = document.createElement("span");
  status.className = "dn-file-status";

  bar.append(nameLabel, openButton, saveButton, exportButton, status);
  document.body.appendChild(bar);

  function render() {
    nameLabel.textContent = opened ? opened.name : "Untitled";
    status.textContent = dirty ? "unsaved" : opened ? (opened.handle ? "saved" : "downloaded") : "";
    document.title = `${opened ? opened.name : "Untitled"}${dirty ? " •" : ""} — dewnote`;
  }

  function markDirty() {
    dirty = true;
    render();
  }

  async function open(next: OpenedDocument | null) {
    if (!next) return;
    opened = next;
    dirty = false;
    host.loadDocument(next.content, next.name);
    render();
  }

  async function save() {
    const content = host.getSource();
    const current = opened ?? { name: suggestedFilename(content), content, handle: null };
    saveButton.disabled = true;
    try {
      opened = await saveDocument(current, content);
      dirty = false;
      render();
    } finally {
      saveButton.disabled = false;
    }
  }

  openButton.addEventListener("click", () => {
    openFile().then(open);
  });
  saveButton.addEventListener("click", () => {
    save();
  });
  exportButton.addEventListener("click", () => {
    const content = host.getSource();
    const html = buildStandaloneHtmlPage(content, collectPageCss());
    const baseName = (opened?.name ?? suggestedFilename(content)).replace(/\.md$/i, "");
    downloadAsFile(`${baseName}.html`, html, "text/html");
  });

  function onKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      save();
    }
  }
  document.addEventListener("keydown", onKeydown);

  // Any edit that reaches a block's commit changes the document's source;
  // there is no change event to listen for, so this polls at a human
  // interaction cadence rather than wiring a callback through every one
  // of app.ts's own commit paths for a status label that only needs to be
  // roughly right.
  let lastSeen = host.getSource();
  const dirtyCheck = window.setInterval(() => {
    const current = host.getSource();
    if (current !== lastSeen) {
      lastSeen = current;
      if (!dirty) markDirty();
    }
  }, 500);

  function onDragOver(event: DragEvent) {
    if (!isMarkdownDrag(event)) return;
    event.preventDefault();
    bar.classList.add("is-drag-target");
  }
  function onDragLeave() {
    bar.classList.remove("is-drag-target");
  }
  async function onDrop(event: DragEvent) {
    if (!isMarkdownDrag(event)) return;
    event.preventDefault();
    bar.classList.remove("is-drag-target");
    const item = event.dataTransfer?.items[0];
    if (!item) return;
    open(await openDroppedItem(item));
  }
  document.addEventListener("dragover", onDragOver);
  document.addEventListener("dragleave", onDragLeave);
  document.addEventListener("drop", onDrop);

  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  render();

  return {
    destroy() {
      window.clearInterval(dirtyCheck);
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
      bar.remove();
    },
  };
}
