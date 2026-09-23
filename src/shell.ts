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
import { parseModuleFiles, parseModuleIndex, isModuleFile } from "./modules.ts";
import type { Module } from "./modules.ts";
import { messageOf, type SaveProblem } from "./save-problem.ts";
import { canStop, editorHelp, requestStop, restartInterpreter, runCell } from "./runtime/pyodide-engine.ts";
import type { CellOutput } from "./cells.ts";
import { assetPathFor, freeAssetName, imageTypeOf } from "./images.ts";
import type { Progress, Store, StoreFile } from "./store.ts";
import { mountSettingsPanel } from "./settings-panel.ts";
import { mountSourceView } from "./source-view.ts";
import { mountAsk } from "./ask.ts";
import { mountConflict } from "./conflict.ts";
import { draftFor, dropDraft, keepDraft } from "./drafts.ts";
import { idFromTitle, newPracticePage, newTutorial, prepareRelease } from "./authoring.ts";
import { applyToFiles, planDeleteFile, planDeleteTutorial, planMove, planRename, tutorialIdOf, type Plan } from "./rename.ts";
import { addToSeries, placementsOf, removeFromSeries } from "./placement.ts";
import { checkDocument, checkWorkspace, type Problem } from "./checks.ts";
import { distinctValues } from "./workspace.ts";
import { extractFrontMatter } from "./frontmatter.ts";
import { exportHtml, titleOf } from "./export-html.ts";
import { fromNotebook, toNotebook, type Notebook } from "./notebook.ts";
// The reading half, not the editor's: an exported page is plain
// markdown markup, and `style.css` describes the editor. The tokens go
// with it, because a `var(--dl-*)` with nothing behind it is how an
// exported page ends up in the browser's default serif.
import { tokensCss } from "./theme/tokens.ts";
import { shortcut } from "./keys.ts";
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
  const conflict = mountConflict();

  /** A new tutorial, written and opened. A draft, because a half-written
   * page should never be served. */
  async function createTutorial(): Promise<void> {
    if (!store) return;
    if (!(await readyToLeave())) return;
    const title = await asker.ask("New tutorial", {
      label: "Title. It also makes the tutorial's id: the name of its folder and its web address.",
      confirm: "Create tutorial",
    });
    if (!title) return;
    const made = newTutorial(title, new Date(), workspaceYear());
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
    await showPath(made.path);
  }

  /** A practice page beside the open tutorial, written and opened. */
  async function createPracticePage(): Promise<void> {
    if (!store || !open) return;
    if (!(await readyToLeave())) return;
    const made = newPracticePage(open.path, files.get(open.path) ?? "");
    if ("error" in made) {
      spine.setProblem({ message: made.error });
      return;
    }
    if (files.has(made.path)) {
      await showPath(made.path);
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
    await showPath(made.path);
  }

  /** The `year:` most tutorials in the workspace carry, which is the one
   * a new tutorial belongs with. Undefined when none has one. */
  function workspaceYear(): string | undefined {
    const counts = new Map<string, number>();
    for (const [path, content] of files) {
      if (!/^tutorials\/[^/]+\/[^/]+\.md$/.test(path)) continue;
      const year = extractFrontMatter(content).fields["year"];
      if (year === undefined || year === null) continue;
      counts.set(String(year), (counts.get(String(year)) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  /** Which series lists the open tutorial, and putting it in one.
   *
   * A tutorial dewnote has just written is on no course at all, so it
   * has no breadcrumb and appears in no series — which is where making
   * one stops being useful. */
  /** The open tutorial's id, when it has one a course can list. */
  function openTutorialId(): string | undefined {
    return open ? index.find((entry) => entry.path === open!.path)?.id : undefined;
  }

  async function placeTutorial(mode: "add" | "remove"): Promise<void> {
    if (!store || !open) return;
    const id = openTutorialId();
    if (!id) {
      spine.setProblem({ message: "This file is not a tutorial, so it cannot be added to a series." });
      return;
    }

    const already = placementsOf(id, modules);
    const choices = modules.flatMap((module) =>
      module.contents
        .filter((series) => series.tutorials.includes(id) === (mode === "remove"))
        .map((series) => ({
          value: `${module.id}\u0000${series.title}`,
          label: `${module.title ?? module.id} › ${series.title}`,
          note: `${series.tutorials.length} tutorial${series.tutorials.length === 1 ? "" : "s"}`,
        })),
    );

    const picked = await asker.choose(
      mode === "add" ? "Add this tutorial to a series" : "Remove this tutorial from a series",
      choices,
      already.length === 0
        ? "It is not in any series yet, so readers cannot reach it from a course."
        : `It is in ${already.map((where) => `${where.courseTitle} › ${where.seriesTitle}`).join(", ")}.`,
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
      await store.write(
        module.path,
        changed,
        mode === "add" ? `Add ${id} to ${series.title}` : `Remove ${id} from ${series.title}`,
      );
    } catch (error) {
      spine.setProblem({ message: messageOf(error) });
      return;
    }
    files.set(module.path, changed);
    reindex();
    refreshSpine();
  }

  // ── renaming, moving and deleting ──────────────────────────────────

  /** A plan applied: the store first, as one commit where it has
   * commits, then dewnote's own copies of what moved. */
  async function carryOut(plan: Plan, message: string): Promise<boolean> {
    if (!store) return false;
    try {
      await store.apply(plan.changes, message);
    } catch (error) {
      spine.setProblem({ message: messageOf(error) });
      return false;
    }
    applyToFiles(files, plan.changes);
    for (const change of plan.changes) {
      if (change.kind === "remove") images.delete(change.path);
      if (change.kind === "move" && images.delete(change.from)) images.add(change.to);
    }
    for (const [from, to] of plan.moves) {
      if (opened.has(from)) opened.set(to, opened.get(from)!);
      opened.delete(from);
    }
    for (const change of plan.changes) {
      if (change.kind === "remove") void dropDraft(draftKey(change.path));
    }
    try {
      const recent = JSON.parse(localStorage.getItem(recentKey()) ?? "[]") as unknown;
      if (Array.isArray(recent)) {
        localStorage.setItem(recentKey(), JSON.stringify(recent.map((path) => plan.moves.get(path) ?? path)));
      }
    } catch {
      // A convenience; storage that refuses loses nothing.
    }
    reindex();
    return true;
  }

  function closeDocument(): void {
    clearTimeout(draftTimer);
    open?.document.destroy();
    open = null;
    spine.setFile(null);
    spine.setLocation({ module: "", series: "", page: "" });
    spine.refreshOutline();
    refreshHealth();
    showEmptyPage();
  }

  /** A tutorial's id changed: its folder, its files, and everything
   * that names it. Asks for the new id, then shows what will change. */
  async function renameTutorial(): Promise<void> {
    if (!store || !open) return;
    const from = tutorialIdOf(open.path);
    if (!from) return;
    if (!(await readyToLeave())) return;
    const content = files.get(open.path) ?? "";
    const title = extractFrontMatter(content).fields["title"];
    const suggested = typeof title === "string" && idFromTitle(title) !== from ? idFromTitle(title) : from;
    const to = await asker.ask("Rename this tutorial", {
      label: "New id. It names the tutorial's folder and files, and it is the page's web address.",
      value: suggested,
      confirm: "Next",
    });
    if (!to) return;
    const plan = planRename({ files, folderNames: await store.listFolder(`tutorials/${from}`), from, to: to.trim() });
    if ("error" in plan) {
      spine.setProblem({ message: plan.error });
      return;
    }
    const draft = extractFrontMatter(content).fields["status"] === "draft";
    const going = await asker.choose(
      `Rename ${from} to ${to.trim()}`,
      [
        { value: "go", label: "Rename", note: plan.summary.join(" ") },
        { value: "stay", label: "Keep the old id" },
      ],
      draft
        ? "It is a draft, so no reader has it yet."
        : "Old links keep working. Readers' saved answers are kept under the old id, so anyone part-way through it starts again.",
    );
    if (going !== "go") return;
    if (!(await carryOut(plan, `Rename ${from} to ${to.trim()}`))) return;
    spine.setProblem(null);
    await showPath(plan.moves.get(open.path) ?? open.path);
  }

  /** A page outside tutorials/ to another path. */
  async function moveDocument(): Promise<void> {
    if (!store || !open) return;
    if (!(await readyToLeave())) return;
    const from = open.path;
    const to = await asker.ask("Move or rename this file", {
      label: "New path, from the top of the workspace.",
      value: from,
      confirm: "Move",
    });
    if (!to) return;
    const plan = planMove(files, from, to);
    if ("error" in plan) {
      spine.setProblem({ message: plan.error });
      return;
    }
    if (!(await carryOut(plan, `Move ${from} to ${plan.moves.get(from)}`))) return;
    spine.setProblem(null);
    await showPath(plan.moves.get(from)!);
  }

  /** The open document gone: a tutorial with its whole folder, anything
   * else on its own. Refused while anything still points at it. */
  async function deleteDocument(): Promise<void> {
    if (!store || !open) return;
    const path = open.path;
    const id = tutorialIdOf(path);
    const folder = path.split("/").slice(0, -1).join("/");
    const names = folder ? await store.listFolder(folder) : [];
    const plan = id
      ? planDeleteTutorial({ files, folderNames: names, id })
      : planDeleteFile(files, names, path);
    if ("error" in plan) {
      spine.setProblem({ message: plan.error });
      return;
    }
    const status = extractFrontMatter(files.get(path) ?? "").fields["status"];
    const notes = [
      id && status !== "draft" && status !== "archived"
        ? "It is published, so readers' links to it stop working. Setting its status to archived keeps them working instead."
        : "",
      isDirty() ? "Its unsaved changes go with it." : "",
      store.kind === "repo" ? "It stays in the repository's history." : "A folder keeps no copy.",
    ].filter(Boolean);
    const going = await asker.choose(
      id ? `Delete the tutorial ${id}` : `Delete ${path}`,
      [
        { value: "go", label: "Delete", note: plan.summary.join(" ") },
        { value: "stay", label: "Keep it" },
      ],
      notes.join(" "),
    );
    if (going !== "go") return;
    if (!(await carryOut(plan, id ? `Delete ${id}` : `Delete ${path}`))) return;
    spine.setProblem(null);
    closeDocument();
  }

  /** dewlab's two-file release: the bytes on the branch are frozen under
   * their own version, and what is open keeps the address readers have. */
  async function releaseVersion(): Promise<void> {
    if (!store || !open) return;
    let published: string | null | undefined;
    try {
      published = store.readPublished
        ? await store.readPublished(open.path)
        : opened.get(open.path);
    } catch (error) {
      spine.setProblem({ message: `Could not read the published version: ${messageOf(error)}` });
      return;
    }
    if (published === null || published === undefined) {
      spine.setProblem({
        message: store.readPublished
          ? "This tutorial is not on the main branch yet, so there is no published version to keep. Merge it first, then release new versions of it."
          : "This tutorial is new since the folder was opened, so there is no published version to keep.",
      });
      return;
    }
    const versions = index
      .filter((entry) => entry.path.startsWith(open!.path.split("/").slice(0, -1).join("/")))
      .map((entry) => entry.version);
    const made = prepareRelease(open.path, published, open.document.markdown(), versions);
    if ("error" in made) {
      spine.setProblem({ message: made.error });
      return;
    }
    const going = await asker.ask(`Release a new version`, {
      label:
        `The current version, ${made.previousVersion}, is copied unchanged to ${made.frozenPath}. ` +
        `Your edits become the new version, below. Readers' links and saved work keep working.`,
      value: made.nextVersion,
      confirm: "Release",
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
    await dropDraft(draftKey(made.livePath));
    if (!store.readPublished) {
      // In a folder, what was just written is what readers now get, and
      // a second release counts on from it.
      opened.set(made.frozenPath, made.frozenContent);
      opened.set(made.livePath, made.liveContent);
    }
    reindex();
    await showPath(made.livePath);
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
    create.addEventListener("click", () => void createTutorial());
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
  async function openNotebook(): Promise<void> {
    if (!(await readyToLeave())) return;
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
        spine.setProblem({ message: `dewnote could not read that file as a Jupyter notebook: ${messageOf(error)}` });
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
      // A later cell usually depends on this one, so its error would
      // only be a confusing echo of the first.
      if (!(await open.document.runCell(id))) return;
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
        `${blocking.length} problem${blocking.length === 1 ? "" : "s"} in this workspace would stop the site building`,
        [
          { value: "look", label: "Show the problems", note: "The same list Check every document shows." },
          { value: "go", label: "Open the pull request anyway", note: "Reviewers will see the problems too." },
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
      ? `No problems found in ${scope}.`
      : `${found.length} problem${found.length === 1 ? "" : "s"}`;
    box.appendChild(heading);

    if (blocking > 0) {
      const note = document.createElement("p");
      note.textContent =
        blocking === found.length
          ? `${blocking === 1 ? "It stops" : "All of them stop"} the site from building.`
          : `${blocking} of them stop the site from building. The others are worth fixing but will not stop it.`;
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

    const choice = await conflict.resolve(path, theirs, mine);
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
    modules = parseModuleFiles(
      all.filter((file) => isModuleFile(file.path)),
      index_ ? parseModuleIndex(index_.content) : [],
    );
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
      registerCommands([
        {
          id: "appearance",
          label: "Appearance…",
          section: "Appearance",
          keywords: ["settings", "theme", "dark", "font", "size", "width", "preferences"],
          detail: "Theme, fonts, text size, line width and spacing. Only changes how dewnote looks to you.",
          run: () => settings.open(),
        },
        {
          id: "stop",
          label: "Stop the running cell",
          section: "Cells",
          keywords: ["interrupt", "halt", "cancel", "loop", "hang"],
          detail: "Interrupts it. Variables from earlier cells are kept.",
          available: () => canStop(),
          run: () => requestStop(),
        },
        {
          id: "restart",
          label: "Restart Python",
          section: "Cells",
          keywords: ["reset", "pyodide", "interpreter", "clear", "fresh"],
          detail: "Clears every variable, as if no cell had run.",
          available: () => canStop(),
          run: () => restartInterpreter(),
        },
        {
          id: "new-tutorial",
          label: "New tutorial…",
          section: "Workspace",
          keywords: ["create", "add", "write", "start"],
          detail: "Creates a draft tutorial with its own folder, front matter and one cell.",
          run: () => void createTutorial(),
        },
        {
          id: "place",
          label: "Add to a series…",
          section: "Tutorial",
          keywords: ["course", "series", "module", "place", "contents", "list"],
          detail: "Lists this tutorial in a series on a course. Only the course file changes.",
          available: () => openTutorialId() !== undefined,
          run: () => void placeTutorial("add"),
        },
        {
          id: "unplace",
          label: "Remove from a series…",
          section: "Tutorial",
          keywords: ["course", "series", "module", "take out", "contents", "unlist"],
          detail: "Takes this tutorial out of a series. The tutorial itself is not deleted.",
          available: () => {
            const id = openTutorialId();
            return id !== undefined && placementsOf(id, modules).length > 0;
          },
          run: () => void placeTutorial("remove"),
        },
        {
          id: "new-practice",
          label: "New practice page",
          section: "Tutorial",
          keywords: ["create", "add", "exercises", "problems", "practice"],
          detail: "Creates this tutorial's practice page as a draft, beside it, and opens it.",
          available: () => {
            const id = open ? tutorialIdOf(open.path) : undefined;
            return id !== undefined && !files.has(`tutorials/${id}/${id}-practice.md`);
          },
          run: () => void createPracticePage(),
        },
        {
          id: "open-practice",
          label: "Open the practice page",
          section: "Tutorial",
          keywords: ["exercises", "problems", "practice"],
          detail: "Opens the practice page that goes with this tutorial.",
          available: () => {
            const id = open ? tutorialIdOf(open.path) : undefined;
            return id !== undefined && files.has(`tutorials/${id}/${id}-practice.md`);
          },
          run: () => {
            const id = tutorialIdOf(open!.path)!;
            void openPath(`tutorials/${id}/${id}-practice.md`);
          },
        },
        {
          id: "rename-tutorial",
          label: "Rename this tutorial…",
          section: "Tutorial",
          keywords: ["id", "address", "url", "folder", "move", "slug"],
          detail: "Changes its id, folder and web address, and every course list, link and redirect that names it.",
          available: () => open !== null && tutorialIdOf(open.path) !== undefined,
          run: () => void renameTutorial(),
        },
        {
          id: "move-document",
          label: "Move or rename this file…",
          section: "Document",
          keywords: ["path", "rename", "folder", "move"],
          detail: "Gives the file a new path. For pages outside tutorials/; a tutorial is renamed by its id.",
          available: () => open !== null && !open.path.startsWith("tutorials/"),
          run: () => void moveDocument(),
        },
        {
          id: "delete-tutorial",
          label: "Delete this tutorial…",
          section: "Tutorial",
          keywords: ["remove", "trash", "folder"],
          detail: "Removes its folder and its place in every course. Refused while other pages link to it.",
          available: () => open !== null && tutorialIdOf(open.path) !== undefined,
          run: () => void deleteDocument(),
        },
        {
          id: "delete-document",
          label: "Delete this document…",
          section: "Document",
          keywords: ["remove", "trash"],
          detail: "Removes the file. Refused while other pages link to it.",
          available: () => open !== null && tutorialIdOf(open.path) === undefined,
          run: () => void deleteDocument(),
        },
        {
          id: "release",
          label: "Release a new version…",
          section: "Tutorial",
          keywords: ["publish", "freeze", "version", "supersedes"],
          detail: "Keeps a copy of the current version and makes your edits the next one.",
          // Only a tutorial's own live file has versions to count.
          available: () => open !== null && /^tutorials\/([^/]+)\/\1\.md$/.test(open.path),
          run: () => void releaseVersion(),
        },
        {
          id: "preview",
          label: "Preview as a reader",
          section: "Document",
          keywords: ["read", "look", "reader", "html", "how it looks", "page"],
          detail: "Opens the page in a new tab, styled the way the site shows it.",
          available: () => open !== null,
          run: () => void previewPage(),
        },
        {
          id: "source",
          label: "Edit the markdown",
          section: "Document",
          keywords: ["source", "whole file", "raw", "text", "front matter"],
          detail: `${shortcut("/")}. The file exactly as it will be saved, front matter included.`,
          available: () => open !== null,
          run: () => showSource(),
        },
        {
          id: "export-html",
          label: "Download as HTML",
          section: "Import and export",
          keywords: ["export", "html", "send", "share", "save as"],
          detail: "One self-contained file, with styles and images inside it, to send to someone.",
          available: () => open !== null,
          run: () => void saveAsHtml(),
        },
        {
          id: "export-ipynb",
          label: "Download as a Jupyter notebook",
          section: "Import and export",
          keywords: ["export", "ipynb", "jupyter", "notebook", "save as"],
          detail: "An .ipynb file. Importing it back gives the same markdown, exactly.",
          available: () => open !== null,
          run: () => saveAsNotebook(),
        },
        {
          id: "import-ipynb",
          label: "Import a Jupyter notebook…",
          section: "Import and export",
          keywords: ["open", "ipynb", "jupyter", "notebook"],
          detail: "Replaces this document's content with the notebook's. Nothing is saved until you save.",
          available: () => open !== null,
          run: () => openNotebook(),
        },
        {
          id: "check-document",
          label: "Check this document",
          section: "Document",
          keywords: ["problems", "validate", "ids", "duplicate", "lint"],
          detail: "Lists anything that would break the site build or confuse a reader.",
          available: () => open !== null,
          run: () => checkThisDocument(),
        },
        {
          id: "run-all",
          label: "Run every cell",
          section: "Cells",
          keywords: ["execute", "all", "check", "top to bottom"],
          detail: "Top to bottom, stopping at the first that fails.",
          available: () => open !== null && open.document.cellIds().length > 0,
          run: () => void runEveryCell(),
        },
        {
          id: "check-workspace",
          label: "Check every document",
          section: "Workspace",
          keywords: ["broken", "links", "ids", "front matter", "build", "page", "all"],
          detail: "The same checks, across the whole workspace.",
          run: () => checkWholeWorkspace(),
        },
        {
          id: "save",
          label: "Save",
          section: "Document",
          keywords: ["write", "commit"],
          detail: `${shortcut("S")}.`,
          available: () => isDirty(),
          run: () => void saveNow(),
        },
        ...(next.publish
          ? [{
              id: "publish",
              label: "Open a pull request…",
              section: "GitHub" as const,
              keywords: ["pr", "github", "review", "publish"],
              detail: "Asks for your working branch to be merged. Checks every document first.",
              run: () => void publish(next.publish!),
            }]
          : []),
      ]);
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
      conflict.destroy();
      reportOverlay.remove();
      spine.destroy();
      clearCommands();
    },
  };
}
