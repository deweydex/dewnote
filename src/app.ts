// The block surface: decision 2's "render when blurred, edit when
// focused." This owns the one piece of mutable state that matters — the
// document's source text — and treats every edit as: rebuild the source by
// joining every block's text in order, taking a live editor's current
// content over the block's own stale text wherever one is mounted, then
// reparse from scratch (blocks.ts's round-trip guarantee is what makes
// that safe).
//
// Insert and delete are expressed the same way — as a change to that same
// per-block join, keyed by block index — rather than as a splice at some
// remembered character offset. A remembered offset goes stale the moment
// any *other* live block's content changes length before the click lands;
// an index into the block list currently on screen does not, because
// baking and restructuring happen in the same pass, against the one `doc`
// that is still guaranteed to match what's rendered.
//
// A fence block has no rendered state at all (plan §5.1) — it is always a
// live CodeMirror instance, which means a document with several cells can
// have several editors live at once, unlike a prose/math/fold/frontmatter
// block, where at most one is ever focused. That is exactly why a commit
// patches only the one block whose editor just blurred rather than
// rebuilding the whole container: an early version did the latter, and a
// Playwright test (tests/e2e/surface.spec.ts, "editing one fence and then
// focusing a second") caught the real consequence directly — clicking
// from a live fence into a second one blurs the first, whose commit tore
// down and remounted *every* block including the second, destroying the
// very click that was about to focus it. A structural edit (one that adds
// or removes a block, changes a block's kind, or reorders — checked by
// comparing the reparsed block list's shape to the old one) still falls
// back to a full rebuild, since indices no longer line up cleanly enough
// to patch in place.

import { EditorView, keymap } from "@codemirror/view";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { parseDocument, serialize, type Block, type Document } from "./blocks.ts";
import { detectDialect } from "./dialect.ts";
import { setFrontMatterField } from "./frontmatter.ts";
import { frontMatterFieldsFor, isScalarField, type FrontMatterFieldSpec } from "./frontmatter-fields.ts";
import { renderBlockPreview, renderHintFencePreview } from "./render-block.ts";
import { languageExtensionFor, sourceLanguageExtension } from "./lang.ts";
import { distinctValues, type FileIndexEntry } from "./file-index.ts";
import { pickLink } from "./link-picker.ts";
import {
  declaredPackages,
  execCellLanguage,
  isHintFence,
  isRunnableFence,
  isSitePaneFence,
  parseCellSourceFromFenceText,
  parseSitePaneInfo,
  parseSqlCellInfo,
  sqlPersistStorageKey,
  sqlScriptFromFenceText,
  wrapSqlExecCode,
  type SitePaneInfo,
  type SqlCellInfo,
} from "./cell.ts";
import { findSiteGroups, siteGroupContaining, type SiteGroup, type SitePane } from "./site-cell.ts";
import { mountSite, type SiteMountOptions } from "./runtime/site-relay.ts";
import {
  canStop,
  ensureBooted,
  requestStop,
  resetSql,
  runCell,
  runSql,
  setStatusListener,
  type OutputEvent,
} from "./runtime/pyodide-engine.ts";

export interface MountedDocument {
  /** The document's current source, byte for byte, including whatever is
   * live in any currently-mounted editor — this is what a save writes. */
  getSource(): string;
  /** Tears down every CodeMirror instance this mount created. */
  destroy(): void;
}

const BASE_EXTENSIONS: Extension[] = [history(), keymap.of([...defaultKeymap, ...historyKeymap])];

type AddKind = "paragraph" | "cell" | "math" | "hint" | "image" | "link";
const ADD_MENU_ITEMS: { kind: AddKind; label: string }[] = [
  { kind: "paragraph", label: "Paragraph" },
  { kind: "cell", label: "Code cell" },
  { kind: "math", label: "Math" },
  { kind: "hint", label: "Hint" },
  { kind: "image", label: "Image" },
  { kind: "link", label: "Link" },
];

/** Set by main.ts whenever folder-panel.ts or repo-panel.ts (re)builds
 * its own file-index.ts index — a module-level singleton rather than
 * something threaded through mountDocument, since there is only ever one
 * store open and one document mounted at a time (the same reasoning
 * window.__dewnote's own test hook already relies on). Starts empty, so
 * a document opened before any folder or repository is opened still
 * gets a working link picker — DIALECTS.md never had a `tutorial:` link
 * depend on the index existing, only on it being helpful when it does. */
let sharedFileIndex: FileIndexEntry[] = [];
export function setFileIndex(index: FileIndexEntry[]): void {
  sharedFileIndex = index;
}
/** link-check.ts's own read of the same index the link picker searches —
 * a getter alongside the existing setter rather than exporting the
 * variable itself, so every reader goes through one place regardless of
 * whether the index has been built yet. */
export function getFileIndex(): FileIndexEntry[] {
  return sharedFileIndex;
}

/** file-bar.ts's own promptForNotebookFile follows the same shape: an
 * `<input type=file>` never attached to the DOM, clicked once and
 * discarded. A picker dismissed without choosing a file never fires
 * `change` in every browser this app targets, so a cancelled pick just
 * leaves this promise unsettled rather than resolving null — the same
 * behaviour file-bar.ts's own picker already has, not a new gap. */
function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.click();
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error as Error);
    reader.readAsDataURL(file);
  });
}

// A persisted SQL cell's saved script lives in localStorage, wrapped in
// try/catch the way dewstack's own save/restore is — private browsing or
// blocked storage just means this run's script won't be there to offer
// back next time, never a reason to fail the run or the restore click
// itself.
function readPersistedSql(name: string): string | null {
  try {
    return localStorage.getItem(sqlPersistStorageKey(name));
  } catch {
    return null;
  }
}
function writePersistedSql(name: string, script: string): void {
  try {
    localStorage.setItem(sqlPersistStorageKey(name), script);
  } catch {
    // Nothing to do — this run's own result is unaffected either way.
  }
}
function clearPersistedSql(name: string): void {
  try {
    localStorage.removeItem(sqlPersistStorageKey(name));
  } catch {
    // Couldn't have written it in the first place, then.
  }
}

/** Same block count, same kind at every position — the condition under
 * which a change can be patched at one index rather than requiring a full
 * rebuild, because every other block's position and meaning is unchanged. */
function sameShape(a: Document, b: Document): boolean {
  return a.blocks.length === b.blocks.length && a.blocks.every((block, i) => block.kind === b.blocks[i]!.kind);
}

export function mountDocument(container: HTMLElement, initialSource: string): MountedDocument {
  let source = initialSource;
  let doc = parseDocument(source);
  const liveViews = new Map<number, EditorView>();
  const blockElements: HTMLElement[] = [];
  let focusedProseIndex: number | null = null;
  // Front matter's own edit state has two views (decision 11): the
  // per-field form (the default) or the plain raw-YAML editor every other
  // block already has. Reset whenever a fresh edit session starts, so
  // toggling to raw and then blurring away and back always lands on the
  // form again rather than getting stuck in whichever mode was last left.
  let frontMatterRawMode = false;
  /** The one block, if any, currently armed for drag reorder — set by
   * clicking its own grip handle, never by hovering or focusing the
   * block itself. A block is draggable only while armed (renderBlockWrapper
   * sets `wrapper.draggable` from this), so dragging never fires by
   * accident while selecting text or clicking through the document the
   * way an always-draggable block would invite. */
  let armedIndex: number | null = null;

  /** Every block's current text — a live editor's content where one is
   * mounted, the block's own text otherwise — joined in order. */
  function blockTexts(): string[] {
    return doc.blocks.map((block, index) => liveViews.get(index)?.state.doc.toString() ?? block.text);
  }

  function currentSource(): string {
    return blockTexts().join("");
  }

  function teardownLiveViews() {
    for (const view of liveViews.values()) view.destroy();
    liveViews.clear();
    focusedProseIndex = null;
    frontMatterRawMode = false;
  }

  /** Called on a block's own blur. Patches just that block in place when
   * the document's shape hasn't changed; falls back to a full rebuild
   * otherwise. See this file's header comment for why the patch path
   * exists at all. */
  function commit(changedIndex: number) {
    const newSource = currentSource();
    const newDoc = parseDocument(newSource);

    // A site pane's own live preview lives on a *different* block's
    // wrapper (its group's last pane — see buildSiteGroupPreview), which
    // the single-block patch below never touches. Forcing the full
    // rebuild here, the same path a structural change already takes, is
    // what makes editing any pane actually refresh the shared preview —
    // a small, deliberate cost, not an oversight.
    const editedBlock = doc.blocks[changedIndex];
    const editedIsSitePane = editedBlock?.kind === "fence" && isSitePaneFence(editedBlock.fence?.info ?? "");

    if (!sameShape(doc, newDoc) || editedIsSitePane) {
      source = newSource;
      teardownLiveViews();
      doc = newDoc;
      render();
      return;
    }

    liveViews.get(changedIndex)?.destroy();
    liveViews.delete(changedIndex);
    if (changedIndex === focusedProseIndex) focusedProseIndex = null;
    source = newSource;
    doc = newDoc;
    const newWrapper = renderBlockWrapper(doc.blocks[changedIndex]!, changedIndex);
    blockElements[changedIndex]!.replaceWith(newWrapper);
    blockElements[changedIndex] = newWrapper;
  }

  /** The front-matter form's own commit path (decision 11) — there is no
   * live EditorView backing a plain HTML form field, so this can't go
   * through `commit()`, but it patches the one changed block the same
   * way: reparse, and either patch in place (the common case — editing a
   * scalar field never changes the document's shape) or fall back to a
   * full rebuild if it somehow did. `setFrontMatterField` itself only
   * ever touches the one field's line, so every other line's bytes are
   * untouched (DECISIONS.md 1). Stays on the form (focusedProseIndex is
   * never changed here) so a field's own row simply shows its new value. */
  function commitFrontMatterField(index: number, key: string, value: string) {
    const block = doc.blocks[index]!;
    const newText = setFrontMatterField(block.text, key, value);
    if (newText === block.text) return;

    const parts = blockTexts();
    parts[index] = newText;
    source = parts.join("");
    const newDoc = parseDocument(source);

    if (!sameShape(doc, newDoc)) {
      teardownLiveViews();
      doc = newDoc;
      render();
      return;
    }

    doc = newDoc;
    const newWrapper = renderBlockWrapper(doc.blocks[index]!, index);
    blockElements[index]!.replaceWith(newWrapper);
    blockElements[index] = newWrapper;
  }

  /** The form's "Done" button: collapse front matter back to its one-line
   * summary, the same gate every other block's blurred state uses. */
  function exitFrontMatterEdit(index: number) {
    if (focusedProseIndex === index) focusedProseIndex = null;
    frontMatterRawMode = false;
    const newWrapper = renderBlockWrapper(doc.blocks[index]!, index);
    blockElements[index]!.replaceWith(newWrapper);
    blockElements[index] = newWrapper;
  }

  /** A new block's starting text and where the cursor should land, by
   * kind offered from the add menu — a selection spanning real
   * placeholder words (`paragraph`, `hint`) so the first keystroke
   * replaces it outright, or a bare cursor on an empty line (`cell`,
   * `math`) where there is nothing to replace, only somewhere to start
   * typing. Not yet dialect-aware — decision 3 already promises a
   * dialect its own add-menu content (dewstack has no maths and five
   * cell forms, not dewlab's one), and this is the same universal set
   * regardless of the open document's dialect until that per-dialect
   * module exists. */
  const NEW_BLOCK_SPEC: Record<Exclude<AddKind, "image" | "link">, () => { text: string; anchor: number; head: number }> = {
    paragraph: () => ({ text: "New paragraph.\n\n", anchor: 0, head: "New paragraph.".length }),
    cell: () => {
      const text = `\`\`\`python exec\nid: ${generateCellId()}\n\n\`\`\`\n\n`;
      const at = text.indexOf("\n\n") + 1;
      return { text, anchor: at, head: at };
    },
    math: () => {
      const text = "$$\n\n$$\n\n";
      const at = text.indexOf("\n\n") + 1;
      return { text, anchor: at, head: at };
    },
    hint: () => {
      const text = '<details class="dl-hint"><summary>hint</summary>\n\nHint text.\n\n</details>\n\n';
      const at = text.indexOf("Hint text.");
      return { text, anchor: at, head: at + "Hint text.".length };
    },
  };

  /** `new-cell-1`, `new-cell-2`, ... — the first not already used as a
   * dewlab `id:` line anywhere in the document, since that id is a
   * contract (DIALECTS.md §1) and two cells must never collide. */
  function generateCellId(): string {
    const existing = new Set<string>();
    for (const block of doc.blocks) {
      if (block.kind !== "fence") continue;
      const match = /^id:\s*(.+)$/m.exec(block.text);
      if (match) existing.add(match[1]!.trim());
    }
    let n = 1;
    while (existing.has(`new-cell-${n}`)) n++;
    return `new-cell-${n}`;
  }

  /** Not in NEW_BLOCK_SPEC's own synchronous table because picking a
   * file and reading it are both async, unlike every other add-menu
   * kind. Inlined as a `data:` URI in the markdown itself rather than
   * saved alongside the document, since no store this file knows about
   * (browser, folder, or GitHub — src/store.ts, src/folder-store.ts,
   * src/github.ts) has a "copy this asset next to the document" method
   * yet; plan §8's own "a copy into the tutorial folder" is still open
   * for the same reason the link picker is (§6 step 8's own note) —
   * both need more of the store interface than exists today. Alt text
   * is asked for the same way DIALECTS.md's own worked examples always
   * write it: required in the markdown, never left empty by this UI
   * even though a reader could still hand-edit it away afterwards. */
  async function insertImageAfter(afterIndex: number | null) {
    const file = await pickImageFile();
    if (!file) return;
    const dataUrl = await readAsDataUrl(file);
    const alt = window.prompt("Alt text for this image:", "") ?? "";
    const text = `![${alt}](${dataUrl})\n\n`;
    const parts = blockTexts();
    const newIndex = afterIndex === null ? 0 : afterIndex + 1;
    parts.splice(newIndex, 0, text);
    source = parts.join("");
    teardownLiveViews();
    doc = parseDocument(source);
    render();
  }

  /** Also async, like insertImageAfter, and for the same reason it isn't
   * in NEW_BLOCK_SPEC — pickLink is a whole search overlay, not a
   * synchronous placeholder. Resolves to the finished `[text](target)`
   * markdown already, so this only has to splice it in; sharedFileIndex
   * is whatever main.ts last set from an opened folder or repository,
   * empty until then. */
  async function insertLinkAfter(afterIndex: number | null) {
    const markdown = await pickLink(sharedFileIndex);
    if (!markdown) return;
    const text = `${markdown}\n\n`;
    const parts = blockTexts();
    const newIndex = afterIndex === null ? 0 : afterIndex + 1;
    parts.splice(newIndex, 0, text);
    source = parts.join("");
    teardownLiveViews();
    doc = parseDocument(source);
    render();
  }

  function insertAfter(afterIndex: number | null, kind: Exclude<AddKind, "image" | "link">) {
    const spec = NEW_BLOCK_SPEC[kind]();
    const parts = blockTexts();
    const newIndex = afterIndex === null ? 0 : afterIndex + 1;
    parts.splice(newIndex, 0, spec.text);
    source = parts.join("");
    teardownLiveViews();
    doc = parseDocument(source);
    render();
    // A fence is already live the moment it renders; anything else needs
    // enterEdit to swap it into its source view — either way, a block
    // just created from a placeholder is exactly when a reader wants to
    // start typing immediately, not clicking a second time to get there.
    const newBlock = doc.blocks[newIndex];
    if (newBlock?.kind === "fence") liveViews.get(newIndex)?.focus();
    else if (newBlock) enterEdit(newIndex);
    // enterEdit's own focus (renderBlockWrapper's queueMicrotask) queues
    // first when it applies; queuing this one after it, rather than
    // setting the selection synchronously here, is what makes it land
    // after that focus instead of being clobbered by it.
    queueMicrotask(() => {
      liveViews.get(newIndex)?.dispatch({ selection: EditorSelection.single(spec.anchor, spec.head) });
    });
  }

  function deleteBlock(index: number) {
    const parts = blockTexts();
    parts.splice(index, 1);
    source = parts.join("");
    teardownLiveViews();
    doc = parseDocument(source);
    render();
  }

  function canMoveUp(index: number): boolean {
    if (doc.blocks[index]!.kind === "frontmatter") return false;
    const target = index - 1;
    return target >= 0 && doc.blocks[target]!.kind !== "frontmatter";
  }

  function canMoveDown(index: number): boolean {
    return doc.blocks[index]!.kind !== "frontmatter" && index < doc.blocks.length - 1;
  }

  /** Keyboard reorder — ArrowUp/ArrowDown on an armed block's own grip
   * handle. Re-arms the block at its new position afterward, since
   * render() tears down and rebuilds every wrapper (including the grip
   * that has focus), and a keyboard user pressing the arrow again
   * expects the same block still armed under their finger, not the one
   * that used to be at this index. */
  function moveBlock(index: number, delta: -1 | 1) {
    const parts = blockTexts();
    const [moved] = parts.splice(index, 1);
    parts.splice(index + delta, 0, moved!);
    source = parts.join("");
    teardownLiveViews();
    doc = parseDocument(source);
    render();
    setArmed(index + delta);
    blockElements[index + delta]?.querySelector<HTMLElement>(".dn-block-grip")?.focus();
  }

  /** Drag reorder's own move — dropping block `fromIndex` onto block
   * `toIndex`. Clamped to never land above front matter (canMoveUp's own
   * rule, expressed differently here since drag has no "one step at a
   * time" adjacent-index shape to check against). */
  function moveBlockTo(fromIndex: number, toIndex: number) {
    const minIndex = doc.blocks[0]?.kind === "frontmatter" ? 1 : 0;
    if (fromIndex < minIndex || fromIndex === toIndex) return;
    const parts = blockTexts();
    const [moved] = parts.splice(fromIndex, 1);
    let target = toIndex > fromIndex ? toIndex - 1 : toIndex;
    if (target < minIndex) target = minIndex;
    parts.splice(target, 0, moved!);
    source = parts.join("");
    teardownLiveViews();
    doc = parseDocument(source);
    render();
  }

  /** Arms exactly one block for drag reorder at a time — arming a second
   * disarms the first, the same "one thing open" rule closeOpenAddMenus
   * already keeps for the add menus. */
  function setArmed(index: number | null) {
    if (armedIndex !== null && blockElements[armedIndex]) {
      blockElements[armedIndex]!.classList.remove("is-armed");
      blockElements[armedIndex]!.draggable = false;
      blockElements[armedIndex]!.querySelector(".dn-block-grip")?.setAttribute("aria-pressed", "false");
    }
    armedIndex = index;
    if (index !== null && blockElements[index]) {
      blockElements[index]!.classList.add("is-armed");
      blockElements[index]!.draggable = true;
      blockElements[index]!.querySelector(".dn-block-grip")?.setAttribute("aria-pressed", "true");
    }
  }

  function mountEditor(host: HTMLElement, index: number, text: string, extensions: Extension[]): EditorView {
    const view = new EditorView({
      state: EditorState.create({
        doc: text,
        extensions: [
          ...BASE_EXTENSIONS,
          ...extensions,
          EditorView.domEventHandlers({
            blur: () => {
              commit(index);
              return false;
            },
          }),
        ],
      }),
      parent: host,
    });
    liveViews.set(index, view);
    return view;
  }

  function enterEdit(index: number) {
    if (focusedProseIndex !== null) return; // one non-fence block editable at a time, in this first cut
    focusedProseIndex = index;
    frontMatterRawMode = false;
    const newWrapper = renderBlockWrapper(doc.blocks[index]!, index);
    blockElements[index]!.replaceWith(newWrapper);
    blockElements[index] = newWrapper;
  }

  function closeOpenAddMenus() {
    for (const menu of container.querySelectorAll(".dn-add-menu.is-open")) menu.classList.remove("is-open");
  }

  function addGap(afterIndex: number | null): HTMLElement {
    const gap = document.createElement("div");
    gap.className = "dn-add-gap";

    const button = document.createElement("button");
    button.className = "dn-add-btn";
    button.type = "button";
    button.setAttribute("aria-label", "Add a block here");
    button.textContent = "+";

    const menu = document.createElement("div");
    menu.className = "dn-add-menu";
    for (const { kind, label } of ADD_MENU_ITEMS) {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = label;
      item.addEventListener("click", () => {
        closeOpenAddMenus();
        if (kind === "image") insertImageAfter(afterIndex);
        else if (kind === "link") insertLinkAfter(afterIndex);
        else insertAfter(afterIndex, kind);
      });
      menu.appendChild(item);
    }

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = menu.classList.contains("is-open");
      closeOpenAddMenus();
      if (!wasOpen) menu.classList.add("is-open");
    });

    gap.appendChild(button);
    gap.appendChild(menu);
    return gap;
  }

  /** Move and delete apply to every block kind, fences included — a code
   * cell is as reorderable and removable as a paragraph, even though it
   * has no rendered state to click into the way the others do. */
  /** A single grip, not up/down arrows — clicking it arms the block for
   * drag reorder (setArmed), and once armed, ArrowUp/ArrowDown on the
   * grip itself move it exactly as the old buttons did, so keyboard
   * reorder loses nothing by losing the arrows. */
  function buildToolbar(index: number): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = "dn-block-toolbar";

    const grip = document.createElement("button");
    grip.type = "button";
    grip.className = "dn-block-grip";
    grip.setAttribute("aria-label", "Drag to reorder, or arm and use the arrow keys");
    grip.setAttribute("aria-pressed", String(index === armedIndex));
    grip.textContent = "⠿";
    grip.addEventListener("click", (event) => {
      event.stopPropagation();
      setArmed(armedIndex === index ? null : index);
    });
    grip.addEventListener("keydown", (event) => {
      if (armedIndex !== index) return;
      if (event.key === "ArrowUp" && canMoveUp(index)) {
        event.preventDefault();
        moveBlock(index, -1);
      } else if (event.key === "ArrowDown" && canMoveDown(index)) {
        event.preventDefault();
        moveBlock(index, 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setArmed(null);
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "dn-block-delete";
    deleteButton.setAttribute("aria-label", "Delete this block");
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteBlock(index);
    });

    toolbar.append(grip, deleteButton);
    return toolbar;
  }

  /** dewlab's own output-event protocol (clear/stream/append), applied to
   * one cell's output area exactly the way dewlab's applyOutputEvent
   * does: "clear" wipes it, "stream" appends running text (coalesced onto
   * the previous run of the same css class rather than one element per
   * write, since print() calls one line at a time), "append" inserts one
   * complete HTML fragment (a table, a figure, an error) verbatim — safe
   * because dewnote_tools.py, not any external input, produced it. */
  function applyOutputEvent(output: HTMLElement, event: OutputEvent) {
    if (event.kind === "clear") {
      output.replaceChildren();
      return;
    }
    if (event.kind === "stream") {
      const last = output.lastElementChild;
      if (last instanceof HTMLElement && last.dataset["stream"] === event.cssClass) {
        last.append(event.text);
      } else {
        const span = document.createElement("pre");
        span.className = `dn-cell-stream ${event.cssClass}`;
        span.dataset["stream"] = event.cssClass;
        span.textContent = event.text;
        output.appendChild(span);
      }
      return;
    }
    output.insertAdjacentHTML("beforeend", event.markup);
  }

  /** The shared shell every fence's below-editor "extra stuff" is built
   * on — a cell's Run bar and output, a SQL cell's restore banner and
   * output, a staged hint's read-only preview, a site group's live
   * preview. Grew up as four separate ad-hoc `<div>` trees across four
   * separate PRs; each kind keeps its own class (`dn-cell-panel`, and so
   * on) for its own look and for the tests that already select by it —
   * this only carries what all four genuinely share (the CSS to match,
   * on `.dn-fence-panel`), so a spacing change happens once instead of
   * four times over. `children` is filtered for `null`/`undefined` so a
   * caller can pass an optional part (a restore banner, a Run bar that
   * only exists when a group has a `js` pane) inline rather than
   * building the array up with conditional `.push`es. */
  function buildFencePanel(modifierClass: string, ...children: (HTMLElement | null | undefined)[]): HTMLElement {
    const panel = document.createElement("div");
    panel.className = `dn-fence-panel ${modifierClass}`;
    for (const child of children) if (child) panel.appendChild(child);
    return panel;
  }

  /** A runnable fence (isRunnableFence) gets a Run/Stop bar and an output
   * area under its editor. Run reads the fence's *live* text — not
   * `block.text`, which is only as fresh as this fence's last blur — so
   * typing and running without ever leaving the editor works the way a
   * notebook cell does. Stop only ever becomes enabled once booted with
   * cross-origin isolation in effect (pyodide-engine.ts's canStop()); on a
   * page without it there is no way to interrupt a running cell, a
   * documented gap, not a bug here. */
  function buildCellRunner(index: number, view: EditorView, info: string): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "dn-cell-runner";

    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.className = "dn-cell-run";
    runButton.textContent = "Run";

    const stopButton = document.createElement("button");
    stopButton.type = "button";
    stopButton.className = "dn-cell-stop";
    stopButton.textContent = "Stop";
    stopButton.disabled = true;
    stopButton.addEventListener("click", (clickEvent) => {
      clickEvent.stopPropagation();
      requestStop();
    });

    const output = document.createElement("div");
    output.className = "dn-cell-output";

    runButton.addEventListener("click", async (clickEvent) => {
      clickEvent.stopPropagation();
      const { id, code } = parseCellSourceFromFenceText(view.state.doc.toString());
      const cellId = id ?? `cell-${index}`;
      runButton.disabled = true;
      runButton.textContent = "Running…";
      stopButton.disabled = true;
      // pyodide-engine.ts's status listener is one global slot, not one
      // per cell — there is only ever one interpreter booting for the
      // whole page, so whichever cell's Run was clicked last owns the
      // button that shows it, a fine simplification until a page
      // regularly has two cells clicked before the first boot finishes.
      setStatusListener((text) => {
        runButton.textContent = text || "Running…";
      });
      try {
        await ensureBooted(declaredPackages(doc.frontMatter.fields));
        stopButton.disabled = !canStop();
        const isSql = execCellLanguage(info) === "sql";
        const toRun = isSql ? wrapSqlExecCode(code) : code;
        await runCell(cellId, toRun, (out) => applyOutputEvent(output, out), { sql: isSql });
      } catch (err) {
        // A rejection here, rather than a `{ ok: false }` result, means
        // the cell never got to run its own error handling at all — the
        // interpreter itself was terminated (requestStop's fallback for a
        // page without cross-origin isolation) rather than interrupted.
        // Built as a real element with textContent, not markup — unlike
        // dewnote_tools.py's own output, this message is a raw JS Error,
        // never pre-escaped HTML.
        const message = err instanceof Error ? err.message : String(err);
        const errorNode = document.createElement("pre");
        errorNode.className = "dn-error";
        errorNode.textContent = message;
        output.appendChild(errorNode);
      } finally {
        setStatusListener(null);
        runButton.disabled = false;
        runButton.textContent = "Run";
        stopButton.disabled = true;
      }
    });

    bar.append(runButton, stopButton);
    return buildFencePanel("dn-cell-panel", bar, output);
  }

  /** A dewstack SQL cell (parseSqlCellInfo) gets a Run/Reset bar and an
   * output area under its editor. The whole fence body is the SQL
   * script — there are no header lines the way an exec cell has — and
   * every SQL cell sharing `info.name`, anywhere on the page, runs
   * against the same connection (pyodide-engine.ts's runSql), so a
   * second cell can query a table an earlier one created. Unlike an exec
   * cell's Run, this has no Stop: dewstack's own SQL cells don't have
   * one either, and a script's worth of statements runs to completion or
   * to its first error, not indefinitely.
   *
   * `persist` restores by an explicit reader click, never automatically —
   * unlike dewstack, where the visible text is disposable generated
   * markup, a fence's live editor content here IS the document's own
   * saved text (`blockTexts()` reads it back out on every commit). An
   * automatic restore would mean opening a document with an old browser
   * session lying around silently overwrites the fence's authored
   * starter script the moment it next commits, with nothing to undo it.
   * A visible "Restore saved work" banner turns that into a choice
   * instead of a surprise. */
  function buildSqlCellRunner(index: number, view: EditorView, info: SqlCellInfo): HTMLElement {
    const restoreBar = document.createElement("div");
    restoreBar.className = "dn-sql-restore";
    restoreBar.hidden = true;

    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.className = "dn-sql-restore-button";
    restoreButton.textContent = "Restore saved work";
    restoreBar.append("A saved script for this cell is in this browser. ", restoreButton);

    const bar = document.createElement("div");
    bar.className = "dn-sql-runner";

    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.className = "dn-sql-run";
    runButton.textContent = "Run";

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "dn-sql-reset";
    resetButton.textContent = "Reset";

    const output = document.createElement("div");
    output.className = "dn-sql-output";

    function showError(err: unknown) {
      output.replaceChildren();
      const errorNode = document.createElement("pre");
      errorNode.className = "dn-error";
      errorNode.textContent = err instanceof Error ? err.message : String(err);
      output.appendChild(errorNode);
    }

    if (info.persist && readPersistedSql(info.name) !== null) {
      restoreBar.hidden = false;
    }

    restoreButton.addEventListener("click", (clickEvent) => {
      clickEvent.stopPropagation();
      const saved = readPersistedSql(info.name);
      if (saved === null) {
        restoreBar.hidden = true;
        return;
      }
      // Only the body changes — the opening (`sql cell=name persist`) and
      // closing fence lines stay exactly as authored, the same shape
      // fenceBody/sqlScriptFromFenceText already expect.
      const lines = view.state.doc.toString().split("\n");
      const openLine = lines[0]!;
      let closeIndex = lines.length - 1;
      while (closeIndex > 0 && lines[closeIndex] === "") closeIndex--;
      const closeLine = lines[closeIndex]!;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: `${openLine}\n${saved}\n${closeLine}\n` },
      });
      restoreBar.hidden = true;
    });

    runButton.addEventListener("click", async (clickEvent) => {
      clickEvent.stopPropagation();
      const script = sqlScriptFromFenceText(view.state.doc.toString());
      runButton.disabled = true;
      resetButton.disabled = true;
      if (info.persist) writePersistedSql(info.name, script);
      restoreBar.hidden = true;
      try {
        // dewnote_sql_tools.py already renders a complete, self-escaped
        // HTML fragment (a table, a row count, or a dn-error) — the same
        // "Python returns HTML, JS assigns it" contract dewstack's own
        // sql_tools.py uses, so there is no separate result type to walk.
        const result = await runSql(info.name, script);
        output.innerHTML = result.html;
      } catch (err) {
        showError(err);
      } finally {
        runButton.disabled = false;
        resetButton.disabled = false;
      }
    });

    resetButton.addEventListener("click", async (clickEvent) => {
      clickEvent.stopPropagation();
      runButton.disabled = true;
      resetButton.disabled = true;
      if (info.persist) clearPersistedSql(info.name);
      restoreBar.hidden = true;
      try {
        await resetSql(info.name);
        output.replaceChildren();
      } catch (err) {
        showError(err);
      } finally {
        runButton.disabled = false;
        resetButton.disabled = false;
      }
    });

    bar.append(runButton, resetButton);
    return buildFencePanel("dn-sql-panel", restoreBar, bar, output);
  }

  /** One field's row in the front-matter form: a label, its control (a
   * text input or, for `status`, a dialect-aware select), and — for an
   * optional field only, never a required one — a button to clear it back
   * out of the document entirely. Commits on `change`, not on every
   * keystroke, matching a plain HTML form's own native "did the reader
   * move on" signal rather than trying to debounce keystrokes ourselves. */
  function buildFrontMatterRow(index: number, field: FrontMatterFieldSpec, currentValue: unknown): HTMLElement {
    const row = document.createElement("label");
    row.className = "dn-frontmatter-row";

    const labelSpan = document.createElement("span");
    labelSpan.className = "dn-frontmatter-label";
    labelSpan.textContent = field.required ? field.label : `${field.label} (optional)`;
    row.appendChild(labelSpan);

    const stringValue = currentValue === undefined || currentValue === null ? "" : String(currentValue);
    let control: HTMLInputElement | HTMLSelectElement;
    if (field.kind === "select") {
      const select = document.createElement("select");
      for (const option of field.options ?? []) {
        const optionEl = document.createElement("option");
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        select.appendChild(optionEl);
      }
      select.value = stringValue;
      control = select;
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.value = stringValue;
      // Decision 11's own "picker over the index, not free text": a
      // native <datalist> suggests every distinct value already in use
      // elsewhere, typing anything else still works (the "new" escape
      // hatch, for free — a datalist never restricts input to its own
      // options), and an empty index just leaves this an ordinary text
      // field, same as before the index existed.
      if (field.indexedAs) {
        const suggestions = distinctValues(sharedFileIndex, field.indexedAs);
        if (suggestions.length > 0) {
          const datalistId = `dn-frontmatter-list-${field.key}-${index}`;
          const datalist = document.createElement("datalist");
          datalist.id = datalistId;
          for (const value of suggestions) {
            const option = document.createElement("option");
            option.value = value;
            datalist.appendChild(option);
          }
          input.setAttribute("list", datalistId);
          row.appendChild(datalist);
        }
      }
      control = input;
    }
    control.addEventListener("change", () => commitFrontMatterField(index, field.key, control.value));
    row.appendChild(control);

    if (!field.required) {
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "dn-frontmatter-clear";
      clearButton.setAttribute("aria-label", `Remove ${field.label}`);
      clearButton.textContent = "×";
      clearButton.addEventListener("click", (event) => {
        event.preventDefault();
        commitFrontMatterField(index, field.key, "");
      });
      row.appendChild(clearButton);
    }

    return row;
  }

  /** The front-matter form itself (decision 11): one row per dialect field
   * that's either required or already present with a scalar value, a
   * "+ field" button for every optional field that's still absent, and a
   * footer offering the raw-YAML fallback (for the list/mapping fields —
   * dewlab's `packages`, `covers`, and the rest — this form has no row
   * for) plus Done to collapse back to the one-line summary. Only ever
   * called with a non-empty `fields` list — a dialect with none (plain
   * markdown) has nothing here to build a form from, so its front matter
   * goes straight to the raw editor instead; see renderBlockWrapper. */
  function buildFrontMatterForm(index: number, docFields: Record<string, unknown>, fieldList: FrontMatterFieldSpec[]): HTMLElement {
    const form = document.createElement("div");
    form.className = "dn-frontmatter-form";

    const hiddenOptional: FrontMatterFieldSpec[] = [];
    for (const field of fieldList) {
      const present = isScalarField(docFields, field.key);
      if (!field.required && !present) {
        hiddenOptional.push(field);
        continue;
      }
      form.appendChild(buildFrontMatterRow(index, field, docFields[field.key]));
    }

    // Only a select-kind field has a non-empty value to seed itself with
    // on "+Add" — see the click handler below for why a text-kind optional
    // field (none exist in either dialect's list today) isn't offered one.
    const addableOptional = hiddenOptional.filter((field) => field.kind === "select");
    if (addableOptional.length > 0) {
      const addRow = document.createElement("div");
      addRow.className = "dn-frontmatter-add-row";
      for (const field of addableOptional) {
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "dn-frontmatter-add-field";
        addButton.textContent = `+ ${field.label}`;
        addButton.addEventListener("click", () => {
          // A select field has a sensible non-empty default to add with
          // (its first option) — an empty value is setFrontMatterField's
          // own "not set" sentinel, so a hypothetical optional text field
          // has nothing to seed it with yet and isn't offered a "+" button
          // (see the filter below); today's only optional field is
          // `status`, always a select, so this always has a real value.
          commitFrontMatterField(index, field.key, field.options?.[0]?.value ?? "");
        });
        addRow.appendChild(addButton);
      }
      form.appendChild(addRow);
    }

    const footer = document.createElement("div");
    footer.className = "dn-frontmatter-footer";

    const rawToggle = document.createElement("button");
    rawToggle.type = "button";
    rawToggle.className = "dn-frontmatter-raw-toggle";
    rawToggle.textContent = "Edit raw YAML";
    rawToggle.addEventListener("click", () => {
      frontMatterRawMode = true;
      const newWrapper = renderBlockWrapper(doc.blocks[index]!, index);
      blockElements[index]!.replaceWith(newWrapper);
      blockElements[index] = newWrapper;
    });

    const doneButton = document.createElement("button");
    doneButton.type = "button";
    doneButton.className = "dn-frontmatter-done";
    doneButton.textContent = "Done";
    doneButton.addEventListener("click", () => exitFrontMatterEdit(index));

    footer.append(rawToggle, doneButton);
    form.appendChild(footer);
    return form;
  }

  /** A staged-hint fence's own read-only preview, shown alongside its
   * live editor — never in place of it, unlike a fold block, since a
   * fence never loses its "always a live editor" state (plan §5.1,
   * decision 15). render-block.ts's renderHintFencePreview builds the
   * actual markup; this only hosts it. */
  function buildHintPreview(block: Block): HTMLElement {
    const container = buildFencePanel("dn-hint-preview");
    container.innerHTML = renderHintFencePreview(block);
    return container;
  }

  /** A small label above a site pane's own live editor, since three
   * fences in a row otherwise look identical until you read their info
   * strings — the same reason a cell's Run bar names nothing but a
   * site pane genuinely needs a "which language, which site" hint a
   * plain code fence doesn't. */
  function buildSitePaneLabel(info: SitePaneInfo): HTMLElement {
    const label = document.createElement("div");
    label.className = "dn-site-pane-label";
    label.textContent = `${info.language} · site: ${info.site || "(none)"}`;
    return label;
  }

  /** A site group's one shared live preview — HTML and CSS rebuild it
   * immediately (site-relay.ts's own `update`); a `js` pane, if the
   * group has one, gets its own Run button, since JS only ever runs on
   * an explicit click (plan §5.4's own convention, DIALECTS.md §2).
   * Reads every pane's *current, committed* body straight from `doc`,
   * which commit()'s own forced full-render for a site pane guarantees
   * is fresh by the time this runs — never blockTexts()'s live,
   * uncommitted text, since a pane that's still focused hasn't been
   * parsed into a body yet. */
  function buildSiteGroupPreview(group: SiteGroup): HTMLElement {
    const header = document.createElement("div");
    header.className = "dn-site-preview-header";
    header.textContent = `Preview — site: ${group.site || "(none)"}`;

    function bodyOf(pane: SitePane | undefined): string {
      return pane ? parseSitePaneInfo(doc.blocks[pane.blockIndex]!).body : "";
    }
    function currentBodies(): SiteMountOptions {
      return { html: bodyOf(group.panes.html), css: bodyOf(group.panes.css), js: bodyOf(group.panes.js) };
    }

    let runBar: HTMLElement | null = null;
    if (group.panes.js) {
      runBar = document.createElement("div");
      runBar.className = "dn-site-run-bar";
      const runButton = document.createElement("button");
      runButton.type = "button";
      runButton.className = "dn-site-run";
      runButton.textContent = "Run";
      runButton.addEventListener("click", (event) => {
        event.stopPropagation();
        consoleOutput.replaceChildren();
        mount.update(currentBodies());
        mount.run();
      });
      runBar.appendChild(runButton);
    }

    const frameHost = document.createElement("div");
    frameHost.className = "dn-site-frame-host";

    const consoleOutput = document.createElement("div");
    consoleOutput.className = "dn-site-console";

    const mount = mountSite(frameHost, (message) => {
      const line = document.createElement("div");
      line.className = `dn-site-console-line dn-site-console-${message.level}`;
      line.textContent = message.text;
      consoleOutput.appendChild(line);
    });
    mount.update(currentBodies());

    return buildFencePanel("dn-site-preview", header, runBar, frameHost, consoleOutput);
  }

  function renderBlockWrapper(block: Block, index: number): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = `dn-block dn-block-${block.kind}`;
    wrapper.dataset["index"] = String(index);

    if (block.kind === "frontmatter") {
      // Front matter always stays first — no move controls at all, per
      // canMoveUp/canMoveDown, so it never gets a toolbar (and so never a
      // grip to arm) either. Still a valid drop target, though — dropping
      // onto it is how a block gets moved to the very top of the body —
      // moveBlockTo's own minIndex clamp is what keeps it from landing
      // *above* front matter instead.
      wrapper.addEventListener("dragover", (event) => {
        if (armedIndex === null) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });
      wrapper.addEventListener("drop", (event) => {
        event.preventDefault();
        const from = Number(event.dataTransfer?.getData("text/plain"));
        if (Number.isNaN(from)) return;
        moveBlockTo(from, index);
        setArmed(null);
      });
    } else {
      wrapper.appendChild(buildToolbar(index));
      wrapper.draggable = index === armedIndex;
      // dragover must call preventDefault for drop to fire at all — the
      // browser's default is "this isn't a drop target." Gated on
      // armedIndex, not on wrapper.draggable, since the *target* wrapper
      // being dragged over is never itself the draggable one.
      wrapper.addEventListener("dragover", (event) => {
        if (armedIndex === null) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });
      wrapper.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData("text/plain", String(index));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      wrapper.addEventListener("drop", (event) => {
        event.preventDefault();
        const from = Number(event.dataTransfer?.getData("text/plain"));
        if (Number.isNaN(from)) return;
        moveBlockTo(from, index);
        setArmed(null);
      });
    }

    if (block.kind === "fence") {
      const info = block.fence?.info ?? "";
      const host = document.createElement("div");
      host.className = "dn-block-source";
      wrapper.appendChild(host);
      const view = mountEditor(host, index, block.text, languageExtensionFor(info));
      const sqlInfo = parseSqlCellInfo(info);
      if (isRunnableFence(info)) wrapper.appendChild(buildCellRunner(index, view, info));
      else if (sqlInfo) wrapper.appendChild(buildSqlCellRunner(index, view, sqlInfo));
      else if (isHintFence(info)) wrapper.appendChild(buildHintPreview(block));
      else if (isSitePaneFence(info)) {
        wrapper.appendChild(buildSitePaneLabel(parseSitePaneInfo(block)));
        const group = siteGroupContaining(findSiteGroups(doc.blocks), index);
        // Only the group's *last* pane hosts the shared preview — three
        // panes sharing one site get exactly one preview between them,
        // not one each.
        if (group && group.endIndex === index) wrapper.appendChild(buildSiteGroupPreview(group));
      }
      return wrapper;
    }

    if (block.kind === "frontmatter" && index === focusedProseIndex) {
      const fieldList = frontMatterFieldsFor(detectDialect(doc.frontMatter));
      if (fieldList.length > 0 && !frontMatterRawMode) {
        wrapper.appendChild(buildFrontMatterForm(index, doc.frontMatter.fields, fieldList));
        return wrapper;
      }
      // Plain markdown (no dialect field list to build a form from) or
      // the form's own "Edit raw YAML" toggle: falls through to the same
      // raw-source editor every other block already uses, just below.
    }

    if (index === focusedProseIndex) {
      const host = document.createElement("div");
      host.className = "dn-block-source";
      wrapper.appendChild(host);
      const view = mountEditor(host, index, block.text, [sourceLanguageExtension()]);
      queueMicrotask(() => view.focus());
      return wrapper;
    }

    const rendered = document.createElement("div");
    rendered.className = "dn-block-render";
    rendered.innerHTML = renderBlockPreview(block, detectDialect(doc.frontMatter));
    rendered.tabIndex = 0;
    rendered.addEventListener("click", () => enterEdit(index));
    rendered.addEventListener("keydown", (event) => {
      if (event.key === "Enter") enterEdit(index);
    });

    wrapper.appendChild(rendered);
    return wrapper;
  }

  function render() {
    container.innerHTML = "";
    blockElements.length = 0;
    container.appendChild(addGap(null));
    doc.blocks.forEach((block, index) => {
      const wrapper = renderBlockWrapper(block, index);
      blockElements[index] = wrapper;
      container.appendChild(wrapper);
      container.appendChild(addGap(index));
    });
  }

  render();

  // A click anywhere outside an open add menu closes it — each menu
  // button already stops its own click from reaching here, so this only
  // ever fires for a click genuinely elsewhere.
  document.addEventListener("click", closeOpenAddMenus);

  /** A click anywhere outside the armed block disarms it, the same
   * "elsewhere means done with this" rule closeOpenAddMenus follows —
   * the grip's own click handler stops propagation, so arming or
   * disarming via the grip itself never reaches this. */
  function disarmOnOutsideClick(event: MouseEvent) {
    if (armedIndex === null) return;
    const armedWrapper = blockElements[armedIndex];
    if (armedWrapper && event.target instanceof Node && armedWrapper.contains(event.target)) return;
    setArmed(null);
  }
  document.addEventListener("click", disarmOnOutsideClick);

  return {
    getSource: currentSource,
    destroy() {
      document.removeEventListener("click", closeOpenAddMenus);
      document.removeEventListener("click", disarmOnOutsideClick);
      teardownLiveViews();
      container.innerHTML = "";
    },
  };
}

/** Exists so a test can assert the byte-round-trip invariant holds through
 * the DOM, not just through blocks.ts directly — the point of decision 1
 * is that this file never breaks it, and that is only checked by actually
 * mounting, not editing anything, reading getSource() back out, and
 * comparing. */
export function roundTripsUnedited(source: string): boolean {
  return serialize(parseDocument(source)) === source;
}
