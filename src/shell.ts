// What holds the document: the spine in the margin, the palette on ⌘K,
// the command registry both read, and opening and saving.
//
// The shell owns the workspace's state (the store, every file's text,
// the index, the open document) and what changes it together: opening,
// saving, conflicts, drafts. Everything else an author can do is a flow
// in its own module (authoring-flows.ts, file-flows.ts,
// export-flows.ts, github-flows.ts), which works through the
// `ShellContext` this lends it, and is named in shell-commands.ts.

import { mountEditor } from "./editor.ts";
import { mountSpine, type Spine } from "./spine.ts";
import { mountWorkspacePalette, type WorkspacePalette } from "./workspace-palette.ts";
import { registerCommands, clearCommands } from "./commands.ts";
import { buildFileIndex, locationOf, type FileIndexEntry } from "./workspace.ts";
import { parseCourseFiles, parseCourseIndex, isCourseFile } from "./courses.ts";
import type { Course } from "./courses.ts";
import { messageOf, type SaveProblem } from "./save-problem.ts";
import { editorHelp, requestStop, runCell } from "./runtime/pyodide-engine.ts";
import type { CellOutput } from "./cells.ts";
import { assetPathFor, freeAssetName, imageTypeOf } from "./images.ts";
import type { Progress, Store, StoreFile } from "./store.ts";
import { mountSettingsPanel } from "./settings-panel.ts";
import { mountSourceView } from "./source-view.ts";
import { mountAsk } from "./ask.ts";
import { mountConflict } from "./conflict.ts";
import { mountReport } from "./report.ts";
import { mergeLines } from "./diff.ts";
import { draftFor, dropDraft, keepDraft } from "./drafts.ts";
import { checkDocument, checkWorkspace, type Problem } from "./checks.ts";
import { distinctValues } from "./workspace.ts";
import { shortcut } from "./keys.ts";
import type { OpenDocument, ShellContext } from "./shell-context.ts";
import { authoringFlows } from "./authoring-flows.ts";
import { fileFlows } from "./file-flows.ts";
import { exportFlows } from "./export-flows.ts";
import { githubFlows } from "./github-flows.ts";
import { shellCommands } from "./shell-commands.ts";

export interface Shell {
  /** Mount a store's contents and offer the palette, which is the next
   * thing to do once a workspace exists. */
  useStore(store: Store, onProgress?: Progress): Promise<void>;
  destroy(): void;
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
  let courses: Course[] = [];
  let open: OpenDocument | null = null;
  /** Every file as the workspace opened with it. For a store with no
   * published copy of its own (a folder), this is the published version
   * a release freezes: the last save is not, since an author may save
   * half-way through the edits a release is for. */
  let opened = new Map<string, string>();

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
    const where = locationOf(open.path, index, courses);
    spine.setLocation(where ?? { course: "", series: "", page: "" });
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
  const conflict = mountConflict();
  const report = mountReport((path) => void openPath(path));

  const ctx: ShellContext = {
    store: () => store,
    files: () => files,
    opened: () => opened,
    images: () => images,
    index: () => index,
    courses: () => courses,
    open: () => open,
    isDirty,
    spine,
    asker,
    readyToLeave,
    openPath,
    showPath,
    saveNow,
    remount,
    closeDocument,
    reindex,
    refreshSpine,
    dropDraftOf: (path) => dropDraft(draftKey(path)),
    followMoves,
    around,
    checkWholeWorkspace,
    asDataUri,
    reload() {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.location.reload();
    },
  };
  const authoring = authoringFlows(ctx);
  const fileChanges = fileFlows(ctx);
  const exports = exportFlows(ctx);
  const github = githubFlows(ctx);

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
    getCourses: () => courses,
    openPath: (path) => openPath(path),
    hasDocument: () => open !== null,
    readPath: async (path) => files.get(path) ?? (store ? await store.read(path) : null),
  });

  // ── opening and saving ─────────────────────────────────────────────

  /** Before the open document is replaced by anything else: an author
   * with unsaved changes is asked, and nothing is thrown away without a
   * yes. False means stay where you are. */
  async function readyToLeave(): Promise<boolean> {
    if (!open || !isDirty()) return true;
    const answer = await asker.choose(
      "You have unsaved changes",
      [
        {
          value: "save",
          label: "Save and continue",
          note: store?.kind === "repo" ? "Commits them to the working branch first." : "Writes them to the file first.",
        },
        { value: "discard", label: "Discard changes", note: "They cannot be recovered." },
        { value: "stay", label: "Keep editing", note: "Go back to the document." },
      ],
      `${open.path} has changes that are not saved.`,
    );
    if (answer === "save") return saveNow();
    if (answer === "discard") void dropDraft(draftKey(open.path));
    return answer === "discard";
  }

  // ── the empty page ──────────────────────────────────────────────

  /** The documents last opened in this workspace, newest first, kept in
   * this browser. A convenience only: storage that refuses is no list. */
  const RECENT = 6;
  function recentKey(): string {
    return `dewnote:recent:${store?.kind}:${store?.label}`;
  }
  function recentPaths(): string[] {
    try {
      const saved = JSON.parse(localStorage.getItem(recentKey()) ?? "[]");
      return Array.isArray(saved) ? saved.filter((path): path is string => typeof path === "string" && files.has(path)) : [];
    } catch {
      return [];
    }
  }
  function rememberOpened(path: string): void {
    try {
      const list = [path, ...recentPaths().filter((each) => each !== path)].slice(0, RECENT);
      localStorage.setItem(recentKey(), JSON.stringify(list));
    } catch {
      // A private window, or storage turned off: no list, no harm.
    }
  }

  /** The recent list, following files that moved. */
  function followMoves(moves: ReadonlyMap<string, string>): void {
    if (moves.size === 0) return;
    try {
      const recent = JSON.parse(localStorage.getItem(recentKey()) ?? "[]") as unknown;
      if (Array.isArray(recent)) {
        localStorage.setItem(recentKey(), JSON.stringify(recent.map((path) => moves.get(path) ?? path)));
      }
    } catch {
      // A convenience; storage that refuses loses nothing.
    }
  }


  /** What the page shows before any document is open: the ways forward,
   * rather than a blank page after Esc. Replaced by the first document. */
  function showEmptyPage(): void {
    const box = document.createElement("div");
    box.className = "dn-empty";

    const heading = document.createElement("h1");
    heading.textContent = "No document open";
    const note = document.createElement("p");
    note.textContent = `Open a tutorial or a page from the workspace, or start a new tutorial.`;

    const actions = document.createElement("div");
    actions.className = "dn-empty-actions";
    const find = document.createElement("button");
    find.type = "button";
    find.className = "dn-empty-primary";
    find.textContent = `Open a document (${shortcut("K")})`;
    find.addEventListener("click", () => palette.open());
    const create = document.createElement("button");
    create.type = "button";
    create.textContent = "New tutorial…";
    create.addEventListener("click", () => void authoring.createTutorial());
    actions.append(find, create);
    box.append(heading, note, actions);

    const recent = recentPaths();
    if (recent.length > 0) {
      const title = document.createElement("h2");
      title.textContent = "Opened recently";
      const list = document.createElement("ul");
      list.className = "dn-empty-recent";
      for (const path of recent) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        const entry = index.find((each) => each.path === path);
        const name = document.createElement("span");
        name.textContent = entry?.title ?? path;
        const where = document.createElement("span");
        where.className = "dn-empty-path";
        where.textContent = path;
        button.append(name, where);
        button.addEventListener("click", () => void openPath(path));
        item.appendChild(button);
        list.appendChild(item);
      }
      box.append(title, list);
    }
    page.replaceChildren(box);
  }

  function closeDocument(): void {
    clearTimeout(draftTimer);
    open?.document.destroy();
    open = null;
    spine.setFile(null);
    spine.setLocation({ course: "", series: "", page: "" });
    spine.refreshOutline();
    refreshHealth();
    showEmptyPage();
  }


  // ── drafts ─────────────────────────────────────────────────────────

  /** One copy per file per workspace. */
  function draftKey(path: string): string {
    return `${store?.kind}:${store?.label}:${path}`;
  }

  const keepsDrafts = (): boolean => store !== null && store.keepsDrafts !== false;

  /** Every edit refreshes the margin at once and the kept copy a moment
   * later: a copy a second old is as good as a current one after a
   * crash, and serialising the document on every keystroke is not. */
  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  function onEdit(): void {
    refreshSpine();
    if (!keepsDrafts()) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      if (!open) return;
      const key = draftKey(open.path);
      if (isDirty()) void keepDraft(key, open.document.markdown());
      else void dropDraft(key);
    }, 800);
  }

  /** A copy left behind by a session that ended without saving. Offered
   * rather than applied: the file may have been saved elsewhere since,
   * and only the author knows which they want. */
  async function offerDraft(path: string): Promise<void> {
    if (!keepsDrafts() || !open || open.path !== path) return;
    const draft = await draftFor(draftKey(path));
    if (!draft || draft.text === open.saved) return;
    const when = new Date(draft.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    const answer = await asker.choose(
      "Restore unsaved changes?",
      [
        { value: "restore", label: "Restore my changes", note: "They open unsaved; save them when you are ready." },
        { value: "discard", label: "Discard them", note: "Open the file as it was last saved." },
      ],
      `You changed ${path} on ${when} and did not save. dewnote kept a copy in this browser.`,
    );
    if (answer === "restore" && open?.path === path) await remount(draft.text);
    else if (answer === "discard") await dropDraft(draftKey(path));
  }

  /** Opens a file in place of the open one, asking first if that would
   * lose unsaved changes. */
  async function openPath(path: string): Promise<boolean> {
    if (!(await readyToLeave())) return false;
    return showPath(path);
  }

  /** Opens a file with no question asked — for callers that have
   * already written what the open document held. */
  async function showPath(path: string): Promise<boolean> {
    if (!store) return false;
    const source = files.get(path) ?? (await store.read(path).catch(() => null));
    if (source === null || source === undefined) return false;

    clearTimeout(draftTimer);
    open?.document.destroy();
    page.replaceChildren();
    const document_ = await mountEditor(page, {
      markdown: source,
      onChange: () => onEdit(),
      runCell: runOneCell,
      askPython: editorHelp,
      resolveImage: (src) => resolveImage(path, src),
      saveImage: (file) => saveImage(path, file),
      stopCell: () => requestStop(),
    });
    // `saved` is what the editor made of the file, not the file — a
    // document is normalised on the way in (editor.ts), and comparing
    // against the bytes on disk would show every file as dirty the
    // moment it opened.
    open = { path, saved: document_.markdown(), document: document_ };
    rememberOpened(path);
    spine.setProblem(null);
    refreshSpine();
    // Not awaited: the document is open and usable now, and whoever
    // opened it (the palette, which closes once this returns) should not
    // wait on a storage lookup to finish.
    void offerDraft(path);
    return true;
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
      onChange: () => onEdit(),
      runCell: runOneCell,
      askPython: editorHelp,
      resolveImage: (src) => resolveImage(path, src),
      saveImage: (file) => saveImage(path, file),
      stopCell: () => requestStop(),
    });
    open = { path, saved, document: document_ };
    refreshSpine();
  }

  /** What the checker needs to know about everything that is not the
   * document in front of it. */
  function around(): { ids: Set<string>; images: Set<string> } {
    return { ids: new Set(distinctValues(index, "id")), images };
  }

  /** What is wrong with the open document: a cell with no id, two cells
   * sharing one, a link to nothing, front matter the build needs. Every
   * one of them is a fault a reader or the build would hit. */
  function problemsInOpenDocument(): Problem[] {
    return open
      ? checkDocument(open.document.markdown(), { ...around(), path: open.path })
      : [];
  }

  function checkThisDocument(): void {
    if (!open) return;
    report.show(problemsInOpenDocument(), "this document");
  }

  /** Every cell, in order, one at a time — one interpreter, and a
   * tutorial's cells usually depend on the ones above them. */
  async function runEveryCell(): Promise<void> {
    if (!open) return;
    for (const id of open.document.cellIds()) {
      // A later cell usually depends on this one, so its error would
      // only be a confusing echo of the first.
      if (!(await open.document.runCell(id))) return;
    }
  }

  /** Every page in the workspace, not only the one that is open — a
   * fault is found on the day somebody opens the page it is written on,
   * which is too late. */
  function checkWholeWorkspace(): void {
    const all = [...files].map(([path, content]) => ({ path, content }));
    report.show(checkWorkspace(all, around()), "the workspace");
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
    const path = open.path;
    const text = open.document.markdown();
    try {
      await store.write(path, text, `Edit ${path}`);
    } catch (error) {
      const problem: SaveProblem =
        typeof error === "object" && error !== null && "conflict" in error
          ? (error as SaveProblem)
          : { message: messageOf(error), conflict: false };
      if (problem.conflict) return resolveConflict(path, text, problem);
      // It holds until it is resolved. A refused save that looks like a
      // successful one is the worst failure this app can have, because
      // the next thing an author does is close the tab.
      spine.setProblem({ message: problem.message });
      return false;
    }
    markSaved(path, text);
    return true;
  }

  function markSaved(path: string, text: string): void {
    void dropDraft(draftKey(path));
    if (open?.path === path) open.saved = text;
    files.set(path, text);
    reindex();
    refreshSpine();
  }

  /** The file changed on the branch after it was opened. Reading it
   * again fetches the other version and, on a repository, the version
   * stamp a write has to name — so Keep mine is an ordinary write after
   * that, and still refused if the file moves yet again. True when the
   * conflict ended with something saved or deliberately discarded. */
  async function resolveConflict(path: string, mine: string, problem: SaveProblem): Promise<boolean> {
    if (!store) return false;
    let theirs: string;
    try {
      theirs = await store.read(path);
    } catch {
      spine.setProblem({ message: problem.message });
      return false;
    }

    // What both sides started from: what the editor made of the file as
    // last saved. The editor's form rather than the bytes, so that the
    // tidying it does when a file opens is not read as an edit of mine.
    const base = open?.path === path ? open.saved : files.get(path);
    const combined = base === undefined ? null : mergeLines(base, theirs, mine);
    const choice = await conflict.resolve(path, theirs, mine, combined);
    if (choice === "both" && combined !== null) {
      try {
        await store.write(path, combined, `Edit ${path}`);
      } catch (error) {
        spine.setProblem({ message: messageOf(error) });
        return false;
      }
      spine.setProblem(null);
      markSaved(path, combined);
      if (open?.path === path) await showPath(path);
      return true;
    }
    if (choice === "mine") {
      try {
        await store.write(path, mine, `Edit ${path}`);
      } catch (error) {
        spine.setProblem({ message: messageOf(error) });
        return false;
      }
      spine.setProblem(null);
      markSaved(path, mine);
      return true;
    }
    if (choice === "theirs") {
      await dropDraft(draftKey(path));
      files.set(path, theirs);
      reindex();
      await showPath(path);
      return true;
    }
    spine.setProblem({ message: problem.message });
    return false;
  }

  function reindex(): void {
    const all: StoreFile[] = [...files].map(([path, content]) => ({ path, content }));
    // courses/index.yaml says what order the courses come in; the
    // palette and the series picker follow it.
    const index_ = all.find((file) => /(^|\/)(courses|modules)\/index\.yaml$/.test(file.path));
    courses = parseCourseFiles(
      all.filter((file) => isCourseFile(file.path)),
      index_ ? parseCourseIndex(index_.content) : [],
    );
    index = buildFileIndex(
      all.filter((file) => file.path.endsWith(".md")),
      courses,
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
    if (meta && event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      if (store) fileChanges.finder.open();
      return;
    }
    if (meta && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveNow();
    }
  }
  window.addEventListener("keydown", onKeyDown);

  /** The browser's own "leave site?" prompt, for closing or reloading
   * the tab with changes that are not saved. */
  function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  }
  window.addEventListener("beforeunload", onBeforeUnload);

  return {
    async useStore(next, onProgress) {
      store = next;
      const listed = await next.list(onProgress);
      files = new Map(listed.map((file) => [file.path, file.content]));
      opened = new Map(files);
      images = new Set(await next.imagePaths().catch(() => []));
      reindex();
      spine.setWorkspace({
        label: next.kind === "folder" ? next.label : next.label.split(" · ")[0] ?? next.label,
        detail: next.kind === "repo" ? (next.label.split(" · ")[1] ?? "") : "",
      });
      spine.show();
      gear.hidden = false;
      showEmptyPage();
      registerCommands(shellCommands(
        ctx,
        {
          openAppearance: () => settings.open(),
          showSource,
          checkThisDocument,
          checkWholeWorkspace,
          runEveryCell,
        },
        authoring,
        fileChanges,
        exports,
        github,
      ));
      // Choosing a document is the next thing to do.
      palette.open();
    },

    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
      open?.document.destroy();
      palette.destroy();
      gear.remove();
      settings.destroy();
      sourceView.destroy();
      asker.destroy();
      fileChanges.finder.destroy();
      conflict.destroy();
      report.destroy();
      spine.destroy();
      clearCommands();
    },
  };
}
