// What holds the document: the spine in the margin, the palette on ⌘K,
// the command registry both read, and save.
//
// One overlay and one margin. Everything that appears over the document
// — the palette, the settings — goes through the overlay; everything
// that says where you are goes in the margin.

import { mountEditor, type Document } from "./editor.ts";
import { mountSpine, type Spine } from "./spine.ts";
import { mountWorkspacePalette, type WorkspacePalette } from "./workspace-palette.ts";
import { registerCommands, clearCommands } from "./commands.ts";
import { buildFileIndex, locationOf, type FileIndexEntry } from "./workspace.ts";
import { parseModuleFiles, isModuleFile } from "./modules.ts";
import type { Module } from "./modules.ts";
import { messageOf, type SaveProblem } from "./save-problem.ts";
import { runCell } from "./runtime/pyodide-engine.ts";
import type { CellOutput } from "./cells.ts";
import { assetPathFor, freeAssetName, imageTypeOf } from "./images.ts";
import type { Progress, Store, StoreFile } from "./store.ts";
import { mountSettingsPanel } from "./settings-panel.ts";
import { mountSourceView } from "./source-view.ts";
import { brokenLinks, type BrokenLink } from "./links.ts";
import { exportHtml, titleOf } from "./export-html.ts";
import { fromNotebook, toNotebook, type Notebook } from "./notebook.ts";
import pageCss from "./style.css" with { type: "text" };
import katexCss from "katex/dist/katex.min.css" with { type: "text" };

interface OpenDocument {
  path: string;
  /** The bytes the store gave us, so "is this dirty" is a comparison
   * rather than a flag somebody has to remember to clear. */
  saved: string;
  document: Document;
}

export interface Shell {
  /** Mount a store's contents and offer the palette, which is the next
   * thing to do once a workspace exists. */
  useStore(store: Store, onProgress?: Progress): Promise<void>;
  destroy(): void;
}

/** A name a file system will take, from a document's own title. */
function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "document";
}

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Revoked on the next turn, once the click has been taken up.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A stream's plain text on its way into a panel that holds HTML. The
 * engine sends `markup` for anything it rendered itself; a bare `text`
 * event is stdout, and stdout is not markup. */
function escapeText(text: string): string {
  const holder = document.createElement("pre");
  holder.textContent = text;
  return holder.outerHTML;
}

export function mountShell(page: HTMLElement): Shell {
  let store: Store | null = null;
  let files = new Map<string, string>();
  let index: FileIndexEntry[] = [];
  let modules: Module[] = [];
  let open: OpenDocument | null = null;

  const isDirty = (): boolean => open !== null && open.document.markdown() !== open.saved;

  // ── the spine ──────────────────────────────────────────────────────

  const spine: Spine = mountSpine({
    getHeadings: () => open?.document.headings() ?? [],
    openPalette: () => palette.open(),
    save: () => saveNow(),
  });

  function refreshSpine(): void {
    if (!open) return;
    spine.setFile({ name: open.path, dirty: isDirty() });
    const where = locationOf(open.path, index, modules);
    spine.setLocation(where ?? { module: "", series: "", page: "" });
    spine.refreshOutline();
  }

  // ── the palette ────────────────────────────────────────────────────

  const settings = mountSettingsPanel();
  const sourceView = mountSourceView();

  /** The file as text. Keeping it remounts the editor over the new
   * bytes; nothing is written until ⌘S, as everywhere else. */
  function showSource(): void {
    if (!open) return;
    if (sourceView.isOpen()) {
      sourceView.close();
      return;
    }
    sourceView.open(open.document.markdown(), (next) => void remount(next));
  }

  const palette: WorkspacePalette = mountWorkspacePalette({
    getIndex: () => index,
    getModules: () => modules,
    openPath: (path) => openPath(path),
    readPath: async (path) => files.get(path) ?? (store ? await store.read(path) : null),
  });

  // ── opening and saving ─────────────────────────────────────────────

  async function openPath(path: string): Promise<boolean> {
    if (!store) return false;
    const source = files.get(path) ?? (await store.read(path).catch(() => null));
    if (source === null || source === undefined) return false;

    open?.document.destroy();
    page.replaceChildren();
    const document_ = await mountEditor(page, {
      markdown: source,
      onChange: () => refreshSpine(),
      runCell: runOneCell,
      resolveImage: (src) => resolveImage(path, src),
      saveImage: (file) => saveImage(path, file),
    });
    // `saved` is what the editor made of the file, not the file — a
    // document is normalised on the way in (editor.ts), and comparing
    // against the bytes on disk would show every file as dirty the
    // moment it opened.
    open = { path, saved: document_.markdown(), document: document_ };
    spine.setProblem(null);
    refreshSpine();
    return true;
  }

  /** The open document as one HTML file: the stylesheet and, where the
   * page renders maths, KaTeX's own, both inlined, and every image the
   * document owns turned into a data URI. Something to send to somebody
   * who does not have dewlab. */
  async function saveAsHtml(): Promise<void> {
    if (!open) return;
    const source = open.document.markdown();
    const html = await exportHtml(source, {
      css: pageCss,
      katexCss,
      resolveImage: (src) => asDataUri(open!.path, src),
    });
    download(`${slugOf(titleOf(source))}.html`, html, "text/html");
  }

  /** The open document as an nbformat 4.5 notebook. Every cell keeps
   * its own exact text, so importing one back is the same bytes. */
  function saveAsNotebook(): void {
    if (!open) return;
    const source = open.document.markdown();
    download(
      `${slugOf(titleOf(source))}.ipynb`,
      `${JSON.stringify(toNotebook(source), null, 1)}\n`,
      "application/x-ipynb+json",
    );
  }

  /** A notebook, opened as the document. Replaces what is on screen
   * rather than writing anything: saving is still ⌘S, and still the
   * author's decision. */
  function openNotebook(): void {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".ipynb,application/json";
    picker.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!file || !open) return;
      try {
        const notebook = JSON.parse(await file.text()) as Notebook;
        remount(fromNotebook(notebook));
      } catch (error) {
        spine.setProblem({ message: `That is not a notebook dewnote can read: ${messageOf(error)}` });
      }
    });
    picker.click();
  }

  /** Replace the open document's text, keeping its path — an import
   * lands in the file you have open, and is not saved until you say so. */
  async function remount(markdown: string): Promise<void> {
    if (!open) return;
    const path = open.path;
    const saved = open.saved;
    open.document.destroy();
    page.replaceChildren();
    const document_ = await mountEditor(page, {
      markdown,
      onChange: () => refreshSpine(),
      runCell: runOneCell,
      resolveImage: (src) => resolveImage(path, src),
      saveImage: (file) => saveImage(path, file),
    });
    open = { path, saved, document: document_ };
    refreshSpine();
  }

  /** Every `tutorial:` link in the workspace that names nothing. Shown
   * in the overlay rather than reported per document: a broken link is
   * found on the day somebody opens the page it is written on, which is
   * too late. */
  function showBrokenLinks(): void {
    const found = brokenLinks(
      [...files].map(([path, content]) => ({ path, content })),
      index,
    );
    report(found);
  }

  const reportOverlay = document.createElement("div");
  reportOverlay.className = "dn-report-overlay";
  reportOverlay.hidden = true;
  reportOverlay.addEventListener("click", (event) => {
    if (event.target === reportOverlay) reportOverlay.hidden = true;
  });
  document.body.appendChild(reportOverlay);

  function report(found: BrokenLink[]): void {
    const box = document.createElement("div");
    box.className = "dn-report";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Broken links");

    const heading = document.createElement("h2");
    heading.textContent = found.length === 0
      ? "Every link resolves."
      : `${found.length} link${found.length === 1 ? "" : "s"} name nothing`;
    box.appendChild(heading);

    if (found.length > 0) {
      const note = document.createElement("p");
      note.textContent = "`tutorial:` is the only scheme the build resolves. Click a row to open the file.";
      box.appendChild(note);
    }

    for (const link of found) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "dn-report-row";
      const where = document.createElement("span");
      where.className = "dn-report-where";
      where.textContent = `${link.path}:${link.line}`;
      const what = document.createElement("span");
      what.className = "dn-report-what";
      what.textContent = link.text ? `${link.text} → ${link.target}` : link.target;
      row.append(what, where);
      row.addEventListener("click", () => {
        reportOverlay.hidden = true;
        void openPath(link.path);
      });
      box.appendChild(row);
    }

    reportOverlay.replaceChildren(box);
    reportOverlay.hidden = false;
    box.querySelector<HTMLElement>("button")?.focus();
  }

  /** The bytes behind a `src` the document owns, as a URL a browser can
   * draw. Cached for the life of the document, since the same diagram
   * often appears more than once. */
  const drawn = new Map<string, string>();

  async function resolveImage(documentPath: string, src: string): Promise<string | null> {
    if (!store) return null;
    const at = assetPathFor(documentPath, src);
    const already = drawn.get(at);
    if (already) return already;
    const bytes = await store.readBytes(at).catch(() => null);
    if (!bytes) return null;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: imageTypeOf(at) }));
    drawn.set(at, url);
    return url;
  }

  /** The bytes behind a `src`, as a data URI — what an exported file
   * needs, since a blob URL means nothing outside this tab. */
  async function asDataUri(documentPath: string, src: string): Promise<string | null> {
    if (!store) return null;
    const bytes = await store.readBytes(assetPathFor(documentPath, src)).catch(() => null);
    if (!bytes) return null;
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${imageTypeOf(src) || "application/octet-stream"};base64,${btoa(binary)}`;
  }

  /** A pasted image, written beside the document. The name is the file's
   * own where that is free, so a folder stays readable. */
  async function saveImage(documentPath: string, file: File): Promise<string> {
    if (!store) throw new Error("no workspace is open");
    const folder = documentPath.split("/").slice(0, -1).join("/");
    const taken = await store.listFolder(folder);
    const name = freeAssetName(taken, file.name || "image.png");
    const bytes = new Uint8Array(await file.arrayBuffer());
    await store.writeBytes(assetPathFor(documentPath, name), bytes);
    drawn.set(assetPathFor(documentPath, name), URL.createObjectURL(new Blob([bytes as BlobPart], { type: file.type || imageTypeOf(name) })));
    return name;
  }

  /** One cell, run in the worker. Streams arrive as they are produced
   * and are concatenated; the engine's own `run-cell` reply says whether
   * it ended well. The interpreter boots on the first Run and stays up,
   * which is why nothing here is started when a document opens. */
  async function runOneCell(request: { id: string; code: string; sql: boolean }): Promise<CellOutput> {
    let markup = "";
    const result = await runCell(
      request.id,
      request.code,
      (event) => {
        if (event.kind === "clear") markup = "";
        else markup += event.markup || escapeText(event.text);
      },
      { sql: request.sql },
    );
    return { ok: result.ok, markup };
  }

  async function saveNow(): Promise<boolean> {
    if (!store || !open || !isDirty()) return false;
    const text = open.document.markdown();
    try {
      await store.write(open.path, text, `Edit ${open.path}`);
    } catch (error) {
      const problem: SaveProblem =
        typeof error === "object" && error !== null && "conflict" in error
          ? (error as SaveProblem)
          : { message: messageOf(error), conflict: false };
      // It holds until it is resolved. A refused save that looks like a
      // successful one is the worst failure this app can have, because
      // the next thing an author does is close the tab.
      spine.setProblem({ message: problem.message });
      return false;
    }
    open.saved = text;
    files.set(open.path, text);
    reindex();
    refreshSpine();
    return true;
  }

  function reindex(): void {
    const all: StoreFile[] = [...files].map(([path, content]) => ({ path, content }));
    modules = parseModuleFiles(all.filter((file) => isModuleFile(file.path)));
    index = buildFileIndex(
      all.filter((file) => file.path.endsWith(".md")),
      modules,
    );
  }

  // ── keys ───────────────────────────────────────────────────────────

  function onKeyDown(event: KeyboardEvent): void {
    const meta = event.metaKey || event.ctrlKey;
    if (event.key === "Escape" && !reportOverlay.hidden) {
      reportOverlay.hidden = true;
      return;
    }
    if (meta && event.key === "/") {
      event.preventDefault();
      showSource();
      return;
    }
    if (meta && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveNow();
    }
  }
  window.addEventListener("keydown", onKeyDown);

  return {
    async useStore(next, onProgress) {
      store = next;
      const listed = await next.list(onProgress);
      files = new Map(listed.map((file) => [file.path, file.content]));
      reindex();
      spine.setWorkspace({
        label: next.kind === "folder" ? next.label : next.label.split(" · ")[0] ?? next.label,
        detail: next.kind === "repo" ? (next.label.split(" · ")[1] ?? "") : "",
      });
      spine.show();
      registerCommands([
        {
          id: "appearance",
          label: "Appearance…",
          section: "Appearance",
          keywords: ["settings", "theme", "dark", "font", "size", "width"],
          detail: "Theme, type, measure, spacing.",
          run: () => settings.open(),
        },
        {
          id: "source",
          label: "Show the whole file",
          section: "Document",
          keywords: ["source", "markdown", "raw", "text", "front matter"],
          detail: "⌘/ — front matter, fence markers and all.",
          available: () => open !== null,
          run: () => showSource(),
        },
        {
          id: "export-html",
          label: "Save as an HTML page",
          section: "Publish",
          keywords: ["export", "html", "send", "share", "download"],
          detail: "One file: the document, its stylesheet and its images.",
          available: () => open !== null,
          run: () => void saveAsHtml(),
        },
        {
          id: "export-ipynb",
          label: "Save as a Jupyter notebook",
          section: "Publish",
          keywords: ["export", "ipynb", "jupyter", "notebook", "download"],
          detail: "Every cell keeps its text, so importing it back is the same file.",
          available: () => open !== null,
          run: () => saveAsNotebook(),
        },
        {
          id: "import-ipynb",
          label: "Open a Jupyter notebook…",
          section: "Document",
          keywords: ["import", "ipynb", "jupyter", "notebook"],
          detail: "Replaces what is on screen. Nothing is saved until you save it.",
          available: () => open !== null,
          run: () => openNotebook(),
        },
        {
          id: "check-links",
          label: "Check links",
          section: "Workspace",
          keywords: ["broken", "dead", "tutorial:", "slug"],
          detail: "Every tutorial: link in the workspace that names nothing.",
          run: () => showBrokenLinks(),
        },
        {
          id: "save",
          label: "Save this document",
          section: "Document",
          keywords: ["write", "commit"],
          available: () => isDirty(),
          run: () => void saveNow(),
        },
        ...(next.publish
          ? [{
              id: "publish",
              label: "Open a pull request…",
              section: "Publish" as const,
              keywords: ["pr", "github", "review"],
              run: async () => {
                const url = await next.publish!();
                window.open(url, "_blank", "noopener");
              },
            }]
          : []),
      ]);
      // Choosing a document is the next thing to do.
      palette.open();
    },

    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      open?.document.destroy();
      palette.destroy();
      settings.destroy();
      sourceView.destroy();
      reportOverlay.remove();
      spine.destroy();
      clearCommands();
    },
  };
}
