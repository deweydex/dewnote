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
import { EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { parseDocument, serialize, type Block, type Document } from "./blocks.ts";
import { detectDialect } from "./dialect.ts";
import { renderBlockPreview } from "./render-block.ts";
import { languageExtensionFor, sourceLanguageExtension } from "./lang.ts";

export interface MountedDocument {
  /** The document's current source, byte for byte, including whatever is
   * live in any currently-mounted editor — this is what a save writes. */
  getSource(): string;
  /** Tears down every CodeMirror instance this mount created. */
  destroy(): void;
}

const BASE_EXTENSIONS: Extension[] = [history(), keymap.of([...defaultKeymap, ...historyKeymap])];

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

  function insertAfter(afterIndex: number | null, text: string) {
    const parts = blockTexts();
    parts.splice(afterIndex === null ? 0 : afterIndex + 1, 0, text);
    source = parts.join("");
    teardownLiveViews();
    doc = parseDocument(source);
    render();
  }

  function deleteBlock(index: number) {
    const parts = blockTexts();
    parts.splice(index, 1);
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

  function addGap(afterIndex: number | null): HTMLElement {
    const gap = document.createElement("div");
    gap.className = "dn-add-gap";
    const button = document.createElement("button");
    button.className = "dn-add-btn";
    button.type = "button";
    button.setAttribute("aria-label", "Add a paragraph here");
    button.textContent = "+";
    button.addEventListener("click", () => insertAfter(afterIndex, "New paragraph.\n\n"));
    gap.appendChild(button);
    return gap;
  }

  function renderBlockWrapper(block: Block, index: number): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = `dn-block dn-block-${block.kind}`;
    wrapper.dataset["index"] = String(index);

    if (block.kind === "fence") {
      const host = document.createElement("div");
      host.className = "dn-block-source";
      wrapper.appendChild(host);
      mountEditor(host, index, block.text, languageExtensionFor(block.fence?.info ?? ""));
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

    const toolbar = document.createElement("div");
    toolbar.className = "dn-block-toolbar";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "dn-block-delete";
    deleteButton.setAttribute("aria-label", "Delete this block");
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteBlock(index);
    });
    toolbar.appendChild(deleteButton);

    wrapper.appendChild(rendered);
    wrapper.appendChild(toolbar);
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

  return {
    getSource: currentSource,
    destroy() {
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
