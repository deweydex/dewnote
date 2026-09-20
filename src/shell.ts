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
import { canStop, requestStop, restartInterpreter, runCell } from "./runtime/pyodide-engine.ts";
import type { CellOutput } from "./cells.ts";
import { assetPathFor, freeAssetName, imageTypeOf } from "./images.ts";
import type { Progress, Store, StoreFile } from "./store.ts";
import { mountSettingsPanel } from "./settings-panel.ts";
import { mountSourceView } from "./source-view.ts";
import { mountAsk } from "./ask.ts";
import { newTutorial, prepareRelease } from "./authoring.ts";
import { addToSeries, placementsOf, removeFromSeries } from "./placement.ts";
import { checkDocument, checkWorkspace, type Problem } from "./checks.ts";
import { distinctValues } from "./workspace.ts";
import { exportHtml, titleOf } from "./export-html.ts";
import { fromNotebook, toNotebook, type Notebook } from "./notebook.ts";
// The reading half, not the editor's: an exported page is plain
// markdown markup, and `style.css` describes the editor. The tokens go
// with it, because a `var(--dl-*)` with nothing behind it is how an
// exported page ends up in the browser's default serif.
import { tokensCss } from "./theme/tokens.ts";
import readingCss from "./theme/reading.css" with { type: "text" };

const pageCss = `${tokensCss}\n${readingCss}`;
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
  /** Every image in the workspace, read once when it opens. The editor
   * never opens an image, so `list()` never sees one — and without this
   * an image whose file was renamed looks exactly like one that is
   * fine. Anything dewnote writes is added as it is written. */
  let images = new Set<string>();
  let modules: Module[] = [];
  let open: OpenDocument | null = null;

  const isDirty = (): boolean => open !== null && open.document.markdown() !== open.saved;

  // ── the spine ──────────────────────────────────────────────────────

  const spine: Spine = mountSpine({
    getHeadings: () => open?.document.headings() ?? [],
    openPalette: () => palette.open(),
    save: () => saveNow(),
    showProblems: () => checkThisDocument(),
  });

  function refreshSpine(): void {
    if (!open) return;
    spine.setFile({ name: open.path, dirty: isDirty() });
    const where = locationOf(open.path, index, modules);
    spine.setLocation(where ?? { module: "", series: "", page: "" });
    spine.refreshOutline();
    refreshHealth();
  }

  /** The count in the margin lags the typing on purpose. A fault found a
   * moment after you write it is as useful as one found instantly, and
   * serialising the whole document on every keystroke is not. */
  let healthTimer: ReturnType<typeof setTimeout> | undefined;
  function refreshHealth(): void {
    clearTimeout(healthTimer);
    healthTimer = setTimeout(() => {
      if (!open) return spine.setHealth({ total: 0, blocking: 0 });
      const found = problemsInOpenDocument();
      spine.setHealth({
        total: found.length,
        blocking: found.filter((problem) => problem.severity === "blocking").length,
      });
    }, 400);
  }

  // ── the palette ────────────────────────────────────────────────────

  const settings = mountSettingsPanel();

  /** Appearance is in the palette, and this is the same panel in one
   * press rather than two. Hidden until a workspace is open, because
   * the gate is the only thing to look at before that. */
  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "dn-gear";
  gear.hidden = true;
  gear.setAttribute("aria-label", "Appearance");
  gear.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'd="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6' +
    'M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6L17 17M7 7L5.4 5.4"/></svg>';
  gear.addEventListener("click", () => settings.open());
  document.body.appendChild(gear);
  const sourceView = mountSourceView();
  const asker = mountAsk();

  /** A new tutorial, written and opened. A draft, because a half-written
   * page should never be served. */
  async function createTutorial(): Promise<void> {
    if (!store) return;
    const title = await asker.ask("What is the tutorial called?", {
      label: "Its title becomes the address, so it is worth getting right.",
      confirm: "Make it",
    });
    if (!title) return;
    const made = newTutorial(title);
    if (files.has(made.path)) {
      spine.setProblem({ message: `There is already a tutorial at ${made.path}.` });
      return;
    }
    try {
      await store.write(made.path, made.content, `Add ${made.path}`);
    } catch (error) {
      spine.setProblem({ message: messageOf(error) });
      return;
    }
    files.set(made.path, made.content);
    reindex();
    await openPath(made.path);
  }

  /** Which series lists the open tutorial, and putting it in one.
   *
   * A tutorial dewnote has just written is on no course at all, so it
   * has no breadcrumb and appears in no series — which is where making
   * one stops being useful. */
  async function placeTutorial(): Promise<void> {
    if (!store || !open) return;
    const id = index.find((entry) => entry.path === open!.path)?.id;
    if (!id) {
      spine.setProblem({ message: "This file has no id, so no course can list it." });
      return;
    }

    const already = placementsOf(id, modules);
    const choices = modules.flatMap((module) =>
      module.contents.map((series) => ({
        value: `${module.id}\u0000${series.title}`,
        label: `${module.title ?? module.id} › ${series.title}`,
        note: series.tutorials.includes(id)
          ? "already here — choosing it takes it out"
          : `${series.tutorials.length} tutorial${series.tutorials.length === 1 ? "" : "s"}`,
      })),
    );

    const picked = await asker.choose(
      "Which series should list this tutorial?",
      choices,
      already.length === 0
        ? "It is on no course yet, so it has no breadcrumb and appears in no series."
        : `Now on ${already.map((where) => `${where.courseTitle} › ${where.seriesTitle}`).join(", ")}.`,
    );
    if (!picked) return;

    const [courseId, seriesTitle] = picked.split("\u0000") as [string, string];
    const module = modules.find((each) => each.id === courseId);
    const series = module?.contents.find((each) => each.title === seriesTitle);
    if (!module || !series) return;

    const content = files.get(module.path);
    if (content === undefined) return;

    const changed = series.tutorials.includes(id)
      ? removeFromSeries(content, series, id)
      : addToSeries(content, series, id);
    if (typeof changed !== "string") {
      spine.setProblem({ message: changed.error });
      return;
    }

    try {
      await store.write(module.path, changed, `Place ${id} in ${series.title}`);
    } catch (error) {
      spine.setProblem({ message: messageOf(error) });
      return;
    }
    files.set(module.path, changed);
    reindex();
    refreshSpine();
  }

  /** dewlab's two-file release: the bytes on the branch are frozen under
   * their own version, and what is open keeps the address readers have. */
  async function releaseVersion(): Promise<void> {
    if (!store || !open) return;
    const published = files.get(open.path);
    if (published === undefined) return;
    const versions = index
      .filter((entry) => entry.path.startsWith(open!.path.split("/").slice(0, -1).join("/")))
      .map((entry) => entry.version);
    const made = prepareRelease(open.path, published, open.document.markdown(), versions);
    if ("error" in made) {
      spine.setProblem({ message: made.error });
      return;
    }
    const going = await asker.ask(`Publish this as ${made.nextVersion}?`, {
      label: `${made.previousVersion} is kept at ${made.frozenPath}, so a reader's saved work still resolves.`,
      value: made.nextVersion,
      confirm: "Publish it",
    });
    if (!going) return;
    try {
      await store.write(made.frozenPath, made.frozenContent, `Freeze ${made.previousVersion}`);
      await store.write(made.livePath, made.liveContent, `Release ${made.nextVersion}`);
    } catch (error) {
      spine.setProblem({ message: messageOf(error) });
      return;
    }
    files.set(made.frozenPath, made.frozenContent);
    files.set(made.livePath, made.liveContent);
    reindex();
    await openPath(made.livePath);
  }

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
      stopCell: () => requestStop(),
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

  /** The same page, in a tab, without writing a file. What an author
   * wants before publishing is to read the thing, not to keep a copy of
   * it — and a blob URL in a new tab is a page, with its stylesheet,
   * its typeset maths and its images already inside it.
   *
   * A cell's output is not in it. Output lives in the tab that ran the
   * cell, which is this one. */
  async function previewPage(): Promise<void> {
    if (!open) return;
    const html = await exportHtml(open.document.markdown(), {
      css: pageCss,
      katexCss,
      resolveImage: (src) => asDataUri(open!.path, src),
    });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    // Long enough for the tab to have loaded it; the tab keeps its own
    // copy from there.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
      stopCell: () => requestStop(),
    });
    open = { path, saved, document: document_ };
    refreshSpine();
  }

  /** What is wrong with the open document: a cell with no id, two cells
   * sharing one, a link to nothing, front matter the build needs. Every
   * one of them is a fault a reader or the build would hit. */
  /** What the checker needs to know about everything that is not the
   * document in front of it. */
  function around(): { ids: Set<string>; images: Set<string> } {
    return { ids: new Set(distinctValues(index, "id")), images };
  }

  function problemsInOpenDocument(): Problem[] {
    return open
      ? checkDocument(open.document.markdown(), { ...around(), path: open.path })
      : [];
  }

  function checkThisDocument(): void {
    if (!open) return;
    reportProblems(problemsInOpenDocument(), "this document");
  }

  /** Every cell, in order, one at a time — one interpreter, and a
   * tutorial's cells usually depend on the ones above them. */
  async function runEveryCell(): Promise<void> {
    if (!open) return;
    for (const id of open.document.cellIds()) {
      await open.document.runCell(id);
    }
  }

  /** A pull request is the moment the work leaves. Anything blocking in
   * the workspace stops the build once it is merged, so it is said here
   * — but not enforced: opening a pull request on work that is not
   * finished is a reasonable thing to do, and a reviewer is the point of
   * one. */
  async function publish(open: () => Promise<string>): Promise<void> {
    const all = [...files].map(([path, content]) => ({ path, content }));
    const blocking = checkWorkspace(all, around())
      .filter((problem) => problem.severity === "blocking");

    if (blocking.length > 0) {
      const going = await asker.choose(
        `${blocking.length} thing${blocking.length === 1 ? "" : "s"} in this workspace would stop the build.`,
        [
          { value: "look", label: "Show me", note: "The same report Check every page opens." },
          { value: "go", label: "Open the pull request anyway", note: "A reviewer is the point of one." },
        ],
        blocking[0]!.message,
      );
      if (going === null) return;
      if (going === "look") {
        checkWholeWorkspace();
        return;
      }
    }
    window.open(await open(), "_blank", "noopener");
  }

  /** Every page in the workspace, not only the one that is open — a
   * fault is found on the day somebody opens the page it is written on,
   * which is too late. */
  function checkWholeWorkspace(): void {
    const all = [...files].map(([path, content]) => ({ path, content }));
    reportProblems(checkWorkspace(all, around()), "the workspace");
  }

  const reportOverlay = document.createElement("dialog");
  reportOverlay.className = "dn-overlay dn-report-overlay";
  // Escape, the focus trap and the background going inert are the
  // dialog's own. Clicking away is the one thing it does not give.
  reportOverlay.addEventListener("click", (event) => {
    if (event.target === reportOverlay) reportOverlay.close();
  });
  document.body.appendChild(reportOverlay);

  /** One overlay for both checks. A row names the file when the report
   * spans more than one, and clicking it opens that file at the line. */
  function reportProblems(found: Problem[], scope: "this document" | "the workspace"): void {
    const box = document.createElement("div");
    box.className = "dn-panel dn-report";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", `What is wrong with ${scope}`);

    const blocking = found.filter((problem) => problem.severity === "blocking").length;

    const heading = document.createElement("h2");
    heading.textContent = found.length === 0
      ? `Nothing to fix in ${scope}.`
      : `${found.length} thing${found.length === 1 ? "" : "s"} to fix`;
    box.appendChild(heading);

    if (blocking > 0) {
      const note = document.createElement("p");
      note.textContent =
        blocking === found.length
          ? `${blocking === 1 ? "It" : "Every one of them"} would stop the build.`
          : `${blocking} of them would stop the build.`;
      box.appendChild(note);
    }

    for (const problem of found) {
      const row = document.createElement(problem.path ? "button" : "div");
      row.className = `dn-report-row is-${problem.severity === "blocking" ? "blocking" : "minor"}`;

      const what = document.createElement("span");
      what.className = "dn-report-what";
      what.textContent = problem.message;
      row.appendChild(what);

      const at = [problem.path, problem.line === undefined ? null : `line ${problem.line}`]
        .filter(Boolean)
        .join(" · ");
      if (at) {
        const where = document.createElement("span");
        where.className = "dn-report-where";
        where.textContent = at;
        row.appendChild(where);
      }

      if (row instanceof HTMLButtonElement) {
        row.type = "button";
        const path = problem.path!;
        row.addEventListener("click", () => {
          reportOverlay.close();
          void openPath(path);
        });
      }
      box.appendChild(row);
    }

    reportOverlay.replaceChildren(box);
    reportOverlay.showModal();
    (box.querySelector<HTMLElement>("button") ?? box).focus();
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
    const at = assetPathFor(documentPath, name);
    await store.writeBytes(at, bytes);
    // So the checker does not call an image it has just written missing.
    images.add(at);
    drawn.set(at, URL.createObjectURL(new Blob([bytes as BlobPart], { type: file.type || imageTypeOf(name) })));
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
      images = new Set(await next.imagePaths().catch(() => []));
      reindex();
      spine.setWorkspace({
        label: next.kind === "folder" ? next.label : next.label.split(" · ")[0] ?? next.label,
        detail: next.kind === "repo" ? (next.label.split(" · ")[1] ?? "") : "",
      });
      spine.show();
      gear.hidden = false;
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
          id: "stop",
          label: "Stop whatever is running",
          section: "Document",
          keywords: ["interrupt", "halt", "cancel", "loop", "hang"],
          detail: "Interrupts the interpreter without losing what it has in memory.",
          available: () => canStop(),
          run: () => requestStop(),
        },
        {
          id: "restart",
          label: "Restart the interpreter",
          section: "Document",
          keywords: ["reset", "pyodide", "python", "clear", "fresh"],
          detail: "Throws away every variable and starts again.",
          available: () => canStop(),
          run: () => restartInterpreter(),
        },
        {
          id: "new-tutorial",
          label: "New tutorial…",
          section: "Workspace",
          keywords: ["create", "add", "write", "start"],
          detail: "A draft, with its folder, its front matter and a cell.",
          run: () => void createTutorial(),
        },
        {
          id: "place",
          label: "Place this tutorial…",
          section: "Workspace",
          keywords: ["course", "series", "module", "move", "contents"],
          detail: "Which series lists it. Choosing one it is already in takes it out.",
          available: () => open !== null,
          run: () => void placeTutorial(),
        },
        {
          id: "release",
          label: "Publish as a new version…",
          section: "Publish",
          keywords: ["release", "freeze", "version", "supersedes"],
          detail: "Freezes what is published and dates what is open.",
          // Only a tutorial's own live file has versions to count.
          available: () => open !== null && /^tutorials\/([^/]+)\/\1\.md$/.test(open.path),
          run: () => void releaseVersion(),
        },
        {
          id: "preview",
          label: "Preview this page",
          section: "Document",
          keywords: ["read", "look", "reader", "html", "how it looks"],
          detail: "Opens it in a tab, the way a reader meets it.",
          available: () => open !== null,
          run: () => void previewPage(),
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
          id: "check-document",
          label: "Check this document",
          section: "Document",
          keywords: ["problems", "validate", "ids", "duplicate", "lint"],
          detail: "Cells with no id, ids used twice, links to nothing.",
          available: () => open !== null,
          run: () => checkThisDocument(),
        },
        {
          id: "run-all",
          label: "Run every cell",
          section: "Document",
          keywords: ["execute", "all", "check", "top to bottom"],
          detail: "In order, one at a time, the way a reader meets them.",
          available: () => open !== null && open.document.cellIds().length > 0,
          run: () => void runEveryCell(),
        },
        {
          id: "check-workspace",
          label: "Check every page",
          section: "Workspace",
          keywords: ["broken", "links", "ids", "front matter", "build"],
          detail: "Every page in the workspace, not only the one that is open.",
          run: () => checkWholeWorkspace(),
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
              run: () => void publish(next.publish!),
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
      gear.remove();
      settings.destroy();
      sourceView.destroy();
      asker.destroy();
      reportOverlay.remove();
      spine.destroy();
      clearCommands();
    },
  };
}
