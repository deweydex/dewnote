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
import { renderBlockPreview } from "./render-block.ts";
import { languageExtensionFor, sourceLanguageExtension } from "./lang.ts";
import { isRunnableFence, parseCellSourceFromFenceText } from "./cell.ts";
import { canStop, ensureBooted, requestStop, runCell, type OutputEvent } from "./runtime/pyodide-engine.ts";

export interface MountedDocument {
  /** The document's current source, byte for byte, including whatever is
   * live in any currently-mounted editor — this is what a save writes. */
  getSource(): string;
  /** Tears down every CodeMirror instance this mount created. */
  destroy(): void;
}

const BASE_EXTENSIONS: Extension[] = [history(), keymap.of([...defaultKeymap, ...historyKeymap])];

type AddKind = "paragraph" | "cell" | "math" | "hint";
const ADD_MENU_ITEMS: { kind: AddKind; label: string }[] = [
  { kind: "paragraph", label: "Paragraph" },
  { kind: "cell", label: "Code cell" },
  { kind: "math", label: "Math" },
  { kind: "hint", label: "Hint" },
];

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
  }

  /** Called on a block's own blur. Patches just that block in place when
   * the document's shape hasn't changed; falls back to a full rebuild
   * otherwise. See this file's header comment for why the patch path
   * exists at all. */
  function commit(changedIndex: number) {
    const newSource = currentSource();
    const newDoc = parseDocument(newSource);

    if (!sameShape(doc, newDoc)) {
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
  const NEW_BLOCK_SPEC: Record<AddKind, () => { text: string; anchor: number; head: number }> = {
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

  function insertAfter(afterIndex: number | null, kind: AddKind) {
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

  function moveBlock(index: number, delta: -1 | 1) {
    const parts = blockTexts();
    const [moved] = parts.splice(index, 1);
    parts.splice(index + delta, 0, moved!);
    source = parts.join("");
    teardownLiveViews();
    doc = parseDocument(source);
    render();
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
        insertAfter(afterIndex, kind);
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
  function buildToolbar(index: number): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = "dn-block-toolbar";

    const moveUp = document.createElement("button");
    moveUp.type = "button";
    moveUp.className = "dn-block-move";
    moveUp.setAttribute("aria-label", "Move this block up");
    moveUp.textContent = "▲";
    moveUp.disabled = !canMoveUp(index);
    moveUp.addEventListener("click", (event) => {
      event.stopPropagation();
      moveBlock(index, -1);
    });

    const moveDown = document.createElement("button");
    moveDown.type = "button";
    moveDown.className = "dn-block-move";
    moveDown.setAttribute("aria-label", "Move this block down");
    moveDown.textContent = "▼";
    moveDown.disabled = !canMoveDown(index);
    moveDown.addEventListener("click", (event) => {
      event.stopPropagation();
      moveBlock(index, 1);
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

    toolbar.append(moveUp, moveDown, deleteButton);
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

  /** A runnable fence (isRunnableFence) gets a Run/Stop bar and an output
   * area under its editor. Run reads the fence's *live* text — not
   * `block.text`, which is only as fresh as this fence's last blur — so
   * typing and running without ever leaving the editor works the way a
   * notebook cell does. Stop only ever becomes enabled once booted with
   * cross-origin isolation in effect (pyodide-engine.ts's canStop()); on a
   * page without it there is no way to interrupt a running cell, a
   * documented gap, not a bug here. */
  function buildCellRunner(index: number, view: EditorView): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "dn-cell-panel";

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
      try {
        await ensureBooted();
        stopButton.disabled = !canStop();
        await runCell(cellId, code, (out) => applyOutputEvent(output, out));
      } finally {
        runButton.disabled = false;
        runButton.textContent = "Run";
        stopButton.disabled = true;
      }
    });

    bar.append(runButton, stopButton);
    panel.append(bar, output);
    return panel;
  }

  function renderBlockWrapper(block: Block, index: number): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = `dn-block dn-block-${block.kind}`;
    wrapper.dataset["index"] = String(index);

    if (block.kind === "frontmatter") {
      // Front matter always stays first — no move controls at all, per
      // canMoveUp/canMoveDown, so it never gets a toolbar either.
    } else {
      wrapper.appendChild(buildToolbar(index));
    }

    if (block.kind === "fence") {
      const host = document.createElement("div");
      host.className = "dn-block-source";
      wrapper.appendChild(host);
      const view = mountEditor(host, index, block.text, languageExtensionFor(block.fence?.info ?? ""));
      if (isRunnableFence(block.fence?.info ?? "")) wrapper.appendChild(buildCellRunner(index, view));
      return wrapper;
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

  return {
    getSource: currentSource,
    destroy() {
      document.removeEventListener("click", closeOpenAddMenus);
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
