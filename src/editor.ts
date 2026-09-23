// The editor, and the only module that knows Milkdown exists.
//
// Two schema overrides carry everything dewlab writes that Crepe's own
// preset would lose. Both are mechanisms the API does not advertise, and
// both were found by measuring rather than by reading:
//
//   1. A schema is replaced by re-registering it under the same id, not
//      by updating its ctx slice. `ctx.update(codeBlockSchema.key, …)`
//      inside `editor.config()` updates a value that `$node`'s runner
//      has already read, so it does nothing at all — silently.
//
//   2. Crepe models a `$$` maths block as a code fence whose language is
//      `LaTeX`, converted in and out by its own `codeBlockSchema`
//      extension. Re-registering that schema drops Crepe's extension, so
//      ours has to carry the same branch or every block of maths turns
//      into a fence. Measured: 18 files in the dewlab corpus.

import { Crepe } from "@milkdown/crepe";
import { bulletListSchema, codeBlockSchema, remarkPreserveEmptyLinePlugin } from "@milkdown/kit/preset/commonmark";
import { extendListItemSchemaForTask } from "@milkdown/kit/preset/gfm";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import { editorViewCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import remarkFrontmatter from "remark-frontmatter";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { LanguageDescription } from "@codemirror/language";
import { cellLanguage, codeOnItsLines, isRunnable, parseCell, wrapSqlCode, type CellOutput } from "./cells.ts";
import { uploadConfig } from "@milkdown/kit/plugin/upload";
import { imageInlineComponent, inlineImageConfig } from "@milkdown/kit/component/image-inline";
import { isImageName, isLocalAsset } from "./images.ts";
import { canonicaliseDisplayMath, unmathPlainDollars } from "./maths.ts";
import { pythonHelp, type PythonHelpHost } from "./python-help.ts";
import { idMaker, SNIPPETS } from "./slash-menu.ts";
import { insert } from "@milkdown/kit/utils";
import { commandsCtx } from "@milkdown/kit/core";
import { clearTextInCurrentBlockCommand } from "@milkdown/kit/preset/commonmark";

/** A fence's info string past its first word — `exec` in `python exec`,
 * `site` in `html site`, `cell=name persist` in `sql cell=name persist`.
 * The commonmark preset reads mdast's `lang` and drops its `meta`; this
 * keeps both, which is the whole of dewlab's dialect. */
export const codeBlockWithMeta = codeBlockSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    attrs: { ...base.attrs, meta: { default: "" } },
    parseMarkdown: {
      match: base.parseMarkdown.match,
      runner: (state, node, type) => {
        state.openNode(type, { language: node.lang ?? "", meta: node.meta ?? "" });
        if (node.value) state.addText(node.value as string);
        state.closeNode();
      },
    },
    toMarkdown: {
      match: base.toMarkdown.match,
      runner: (state, node) => {
        // Crepe's own branch, kept. See the header comment.
        if (String(node.attrs.language ?? "").toLowerCase() === "latex") {
          state.addNode("math", undefined, node.content.firstChild?.text || "");
          return;
        }
        state.addNode("code", undefined, node.content.firstChild?.text || "", {
          lang: node.attrs.language,
          meta: node.attrs.meta || null,
        });
      },
    },
  };
});

/** mdast reads a list's `spread` as a boolean: false is a tight list,
 * where an item's text is its own content, and true is a loose one,
 * where each item is wrapped in a paragraph. dewlab's build renders the
 * two differently, so the distinction is not cosmetic.
 *
 * The preset stores it on the node as a *string* and hands that string
 * straight back to mdast, where `"false"` is truthy — so every tight
 * bullet list comes back loose. Ordered lists escape it because their
 * own schema writes `node.attrs.spread === 'true'`. This does the same.
 *
 * Only the list, never `list_item`: the GFM preset extends that one to
 * carry a task item's `checked`, and re-registering it drops the
 * checkbox from every `- [ ]` in the file. */
const tightBulletLists = bulletListSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    toMarkdown: {
      match: base.toMarkdown.match,
      runner: (state, node) => {
        state
          .openNode("list", undefined, {
            ordered: false,
            spread: String(node.attrs.spread) === "true",
          })
          .next(node.content)
          .closeNode();
      },
    },
  };
});

/** An item holding a nested list has the same string-versus-boolean
 * fault as the list itself. Built on the GFM preset's own extension
 * rather than on the base, so a task item keeps its `checked`. */
const tightListItems = extendListItemSchemaForTask.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    toMarkdown: {
      match: base.toMarkdown.match,
      runner: (state, node) => {
        if (node.attrs.checked != null) {
          base.toMarkdown.runner(state, node);
          return;
        }
        state.openNode("listItem", undefined, {
          spread: String(node.attrs.spread) === "true",
        });
        state.next(node.content);
        state.closeNode();
      },
    },
  };
});

/** dewlab writes `-` for both; remark-stringify defaults to `*`. */
function keepMarkers(ctx: { update: Function }): void {
  ctx.update(remarkStringifyOptionsCtx, (options: any) => ({
    ...options,
    bullet: "-",
    rule: "-",
  }));
}

/** Front matter, held as the one string it is. Nothing parses the YAML on
 * the way through, so key order and quoting survive by construction. */
export const frontMatterSchema = $nodeSchema("front_matter", () => ({
  content: "text*",
  group: "block",
  marks: "",
  defining: true,
  code: true,
  parseDOM: [{ tag: "div[data-front-matter]", preserveWhitespace: "full" as const }],
  toDOM: () => ["div", { "data-front-matter": "true" }, 0] as const,
  parseMarkdown: {
    match: ({ type }: { type: string }) => type === "yaml",
    runner: (state: any, node: any, type: any) => {
      state.openNode(type);
      if (node.value) state.addText(node.value);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node: any) => node.type.name === "front_matter",
    runner: (state: any, node: any) => {
      state.addNode("yaml", undefined, node.content.firstChild?.text || "");
    },
  },
}));

export const frontMatterRemark = $remark("frontMatter", () => remarkFrontmatter, ["yaml"]);

/** Runs after Crepe's own maths pass, so a `$…$` span it claimed but
 * dewlab would read as prose is put back as the text it was written as. */
export const plainDollars = $remark("dewnotePlainDollars", () => unmathPlainDollars);

/** The info string past its first word, for the code block holding
 * `content`.
 *
 * Crepe hands `renderPreview` a language and a body and nothing else,
 * and `exec` lives in the `meta` attr — so this looks the block up in
 * the document by its text. Two code blocks with byte-identical bodies
 * would resolve to the same answer, which is correct anyway: they carry
 * the same info string or they are not identical. */
function metaOf(view: { state: { doc: { descendants(fn: (node: any) => boolean): void } } } | null, content: string): string {
  if (!view) return "";
  let found = "";
  view.state.doc.descendants((node: any) => {
    if (found) return false;
    if (node.type.name === "code_block" && node.textContent === content) {
      found = String(node.attrs.meta ?? "");
      return false;
    }
    return true;
  });
  return found;
}

/** A cell's own output, as an element rather than a string: the panel
 * holds rendered HTML the Python side produced, and a string would be
 * sanitised on the way through Crepe's own DOMPurify pass. */
function outputPanel(output: CellOutput): HTMLElement {
  const panel = document.createElement("div");
  panel.className = output.ok ? "dn-cell-output" : "dn-cell-output is-error";
  panel.innerHTML = output.markup;
  return panel;
}

export interface Heading {
  level: number;
  text: string;
}

/** Draw the images the document names.
 *
 * The resolved URL goes on the element, never on the node: the markdown
 * keeps the bare name the build resolves. ProseMirror re-renders an
 * `<img>` whenever its node is touched, which drops the resolved src, so
 * this watches the editor rather than running once. */
export interface Document {
  /** Every runnable cell's id, in the order they appear. */
  cellIds(): string[];
  /** Run one, by id. Resolves when it has finished. */
  /** Runs one cell. True when it ran and succeeded; false when it
   * failed, was stopped, or could not run at all. */
  runCell(id: string): Promise<boolean>;
  /** The save path. Re-serialises the whole document, so a file is
   * normalised the first time it is saved and byte-stable after that. */
  markdown(): string;
  headings(): Heading[];
  destroy(): void;
}

export interface EditorOptions {
  markdown: string;
  onChange?(markdown: string): void;
  /** Runs one cell and answers with what it produced. Absent means no
   * interpreter is available, and a cell then shows its code and no Run
   * button — which is the right state for an export or a test, not an
   * error to report. */
  runCell?(request: { id: string; code: string; sql: boolean }): Promise<CellOutput>;
  /** Interrupt whatever is running. A cell that loops forever is not a
   * rare mistake — it is the first thing a class writes — so the button
   * that starts one has to be able to stop it. */
  stopCell?(): void;
  /** Asks Jedi for help while a Python cell is written: completion, a
   * name's documentation, the signature of the call being typed. Absent
   * means none, which is right for an export or a test. */
  askPython?: PythonHelpHost["ask"];
  /** Turns a `src` the document owns into something a browser can draw.
   * Null where nothing is at that path, which is ordinary for a document
   * being written. Absent means images stay as written. */
  resolveImage?(src: string): Promise<string | null>;
  /** Writes a pasted or dropped image beside the document and answers
   * with the `src` to put in the markdown. Absent means pasting an image
   * does nothing. */
  saveImage?(file: File): Promise<string>;
}

/** What each cell's last run produced, keyed by the exact source that
 * produced it.
 *
 * This is not a cache for speed. Crepe calls `renderPreview` from a
 * `watch` on the block's text, so it fires on **every keystroke** — for
 * rendering a diagram that is fine, and for starting an interpreter it
 * is not. Keying on the source means a run only ever happens when one
 * was asked for, and an edit since the last run shows as stale rather
 * than quietly re-running.
 */
interface RunRecord {
  /** The exact body that produced this output, so an edit since the run
   * shows as stale rather than as a fresh result for code that changed. */
  source: string;
  output: CellOutput;
}

export async function mountEditor(
  root: HTMLElement,
  options: EditorOptions,
): Promise<Document> {
  /** The editor view, once Crepe has made one. `renderPreview` can fire
   * before `create()` resolves, and answering "not runnable" then is
   * right: nothing has been asked to run yet. */
  const view = (): any => {
    let found: any = null;
    try {
      crepe.editor.action((ctx) => { found = ctx.get(editorViewCtx); });
    } catch { found = null; }
    return found;
  };

  /** Keyed by the cell's own `id:`, which is the thing that persists
   * across an edit — a reader who fixes a typo wants to still see what
   * the cell printed a moment ago, marked as belonging to the older
   * code. */
  /** Every `id:` a runnable fence in this document already carries. */
  function cellIdsInDocument(): string[] {
    const found: string[] = [];
    const editorView = view();
    if (!editorView) return found;
    editorView.state.doc.descendants((node: any) => {
      if (node.type.name !== "code_block") return true;
      const id = parseCell(node.textContent).id;
      if (id) found.push(id);
      return true;
    });
    return found;
  }

  /** Every runnable cell in the document, in order, read from the tree
   * rather than from the mounted panels: a cell below the fold has no
   * panel yet, and questions and site panes carry ids but never run. */
  function runnableCells(): { id: string; language: string; content: string }[] {
    const found: { id: string; language: string; content: string }[] = [];
    const editorView = view();
    if (!editorView) return found;
    editorView.state.doc.descendants((node: any) => {
      if (node.type.name !== "code_block") return true;
      const language = String(node.attrs.language ?? "");
      if (!isRunnable(language, String(node.attrs.meta ?? ""))) return true;
      const id = parseCell(node.textContent).id;
      if (id) found.push({ id, language, content: node.textContent });
      return true;
    });
    return found;
  }

  /** The code of every runnable Python cell above the one holding
   * `source`, in order: what the page will have run by the time this
   * one runs. Header lines are blanked, not removed, for the same reason
   * as in the cell itself. */
  function pythonAbove(source: string): string {
    const above: string[] = [];
    for (const cell of runnableCells()) {
      if (cell.content === source) break;
      if (cellLanguage(cell.language) === "python") above.push(codeOnItsLines(cell.content));
    }
    return above.length ? `${above.join("\n")}\n` : "";
  }

  const results = new Map<string, RunRecord>();
  /** One interpreter, so one cell runs at a time — and the button that
   * started it is the one that stops it. Holds the running cell's id. */
  let running: string | null = null;

  /** What each cell's panel needs to redraw itself, kept by cell id.
   *
   * Crepe's preview panel is display-only: it renders whatever
   * `renderPreview` hands back by assigning `innerHTML`, which
   * serialises the element and re-parses it. Every listener on it is
   * lost. So the Run button is markup that carries its own identity, and
   * one delegated listener on the editor root does the work. */
  interface CellHandle {
    language: string;
    content: string;
    apply(value: string | HTMLElement | null): void;
  }
  const handles = new Map<string, CellHandle>();

  /** The panel under a runnable cell: a Run button, and whatever the
   * last run produced. Crepe's own preview toggle appears beside Copy
   * once this exists, and hides the code rather than the output — so the
   * panel is what makes a cell a cell. */
  function cellPanel(
    language: string,
    content: string,
    apply: (value: string | HTMLElement | null) => void,
  ): HTMLElement {
    const id = parseCell(content).id ?? "cell";
    handles.set(id, { language, content, apply });

    const panel = document.createElement("div");
    panel.className = "dn-cell";

    const run = document.createElement("button");
    run.type = "button";
    run.className = "dn-cell-run";
    // The listener cannot survive; the identity can.
    run.dataset["dnCell"] = id;
    panel.appendChild(run);

    const record = results.get(id);
    if (running === id) {
      run.textContent = options.stopCell ? "Stop" : "Running…";
      run.classList.add("is-running");
    } else {
      run.textContent = record ? "Run again" : "Run";
    }

    if (record) {
      const output = outputPanel(record.output);
      if (record.source !== content) {
        output.classList.add("is-stale");
        output.title = "This ran before the code was edited.";
      }
      panel.appendChild(output);
    }

    return panel;
  }

  async function runCellById(id: string): Promise<boolean> {
    if (running === id) {
      options.stopCell?.();
      return false;
    }
    if (running !== null || !options.runCell) return false;
    // A cell below the fold has not mounted, so it has no handle. It
    // still runs, from the document's own text, and its panel shows the
    // result once it scrolls into view.
    const handle = handles.get(id);
    const source = handle ?? runnableCells().find((cell) => cell.id === id);
    if (!source) return false;

    running = id;
    handle?.apply(cellPanel(handle.language, handle.content, handle.apply));

    const cell = parseCell(source.content);
    const sqlCell = cellLanguage(source.language) === "sql";
    const output = await options
      .runCell({
        id,
        code: sqlCell ? wrapSqlCode(cell.code) : cell.code,
        sql: sqlCell,
      })
      .catch((error: unknown) => ({
        ok: false,
        markup: `<pre>${String(error instanceof Error ? error.message : error)}</pre>`,
      }));

    running = null;
    results.set(id, { source: source.content, output });
    // The handle may have arrived while the cell ran, if it scrolled
    // into view; the latest one is the one on screen.
    const shown = handles.get(id);
    shown?.apply(cellPanel(shown.language, shown.content, shown.apply));
    return output.ok;
  }

  const crepe = new Crepe({
    root,
    defaultValue: canonicaliseDisplayMath(options.markdown),
    features: {
      // Rewrites an image's alt text to its aspect ratio, which the probe
      // caught turning `![](x.svg)` into `![1.00](x.svg)`.
      [Crepe.Feature.ImageBlock]: false,
      [Crepe.Feature.Toolbar]: true,
      [Crepe.Feature.TopBar]: false,
      [Crepe.Feature.AI]: false,
    },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: {
        // Crepe's own is "Please enter…", which is nobody's voice and
        // teaches nothing. An empty block is the one place the editor
        // can say how to reach everything a tutorial is made of.
        text: "Type / for a cell, a question or a hint",
        mode: "block",
      },
      [Crepe.Feature.BlockEdit]: {
        /** dewlab's own blocks, added after Crepe's general-purpose
         * ones — the builder appends, and reordering would mean
         * rebuilding every default item by hand. Typing `/py` filters
         * to them immediately, which is how they are reached. */
        buildMenu: (builder: {
          addGroup(key: string, label: string): {
            addItem(key: string, item: { label: string; icon: string; onRun(ctx: unknown): void }): unknown;
          };
        }) => {
          const group = builder.addGroup("dewlab", "Tutorial");
          for (const snippet of SNIPPETS) {
            group.addItem(snippet.key, {
              label: snippet.label,
              icon: snippet.icon,
              onRun: (ctx: any) => {
                // The `/query` the author typed is still in the block.
                // Crepe's own items clear it before inserting; without
                // this the document keeps a stray "/py".
                ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
                insert(snippet.markdown(idMaker(cellIdsInDocument())))(ctx);
              },
            });
          }
        },
      },
      [Crepe.Feature.CodeMirror]: {
        extensions: options.askPython
          ? [pythonHelp({ ask: options.askPython, contextFor: (source) => pythonAbove(source) })]
          : [],
        languages: [
          LanguageDescription.of({ name: "python", support: python() }),
          LanguageDescription.of({ name: "sql", support: sql() }),
        ],
        previewToggleButton: (showingPreview: boolean) => (showingPreview ? "Hide" : "Run"),
        previewLabel: "Output",
        previewLoading: "Running…",
        renderPreview: (language: string, content: string, apply: (value: string | HTMLElement | null) => void) => {
          // Crepe calls this from a `watch` on the block's text, so it
          // fires on every keystroke. It must therefore never start a
          // run of its own: all it does is build the panel, and the
          // panel's own button is what runs anything.
          if (!options.runCell) return null;
          if (!isRunnable(language, metaOf(view(), content))) return null;
          return cellPanel(language, content, apply);
        },
      },
    },
  });

  if (options.saveImage) {
    const saveImage = options.saveImage;
    crepe.editor.config((ctx) => {
      ctx.update(uploadConfig.key, (config) => ({
        ...config,
        // Written beside the document, not inlined: a base64 image in a
        // tutorial is a file nobody can open, edit or replace.
        uploader: async (files: FileList, schema: { nodes: Record<string, any> }) => {
          const image = schema.nodes["image"];
          if (!image) return [];
          const made = [];
          for (const file of Array.from(files)) {
            if (!file.type.startsWith("image/") && !isImageName(file.name)) continue;
            const src = await saveImage(file);
            made.push(image.createAndFill({ src, alt: file.name.replace(/\.[^.]+$/, "") }));
          }
          return made.filter(Boolean);
        },
      }));
    });
  }

  if (options.resolveImage) {
    const resolveImage = options.resolveImage;
    crepe.editor.config((ctx) => {
      ctx.update(inlineImageConfig.key, (config) => ({
        ...config,
        // The document keeps the bare name; only the element drawn from
        // it gets a URL a browser can fetch.
        proxyDomURL: async (src: string) =>
          (isLocalAsset(src) ? await resolveImage(src) : null) ?? src,
      }));
    });
  }
  crepe.editor.use(imageInlineComponent);

  crepe.editor
    .config(keepMarkers)
    .use(codeBlockWithMeta)
    .use(frontMatterRemark)
    .use(frontMatterSchema)
    .use(plainDollars);
  crepe.editor.use(tightBulletLists).use(tightListItems);

  // Milkdown's "preserve empty line" plugin does two things, both wrong
  // for a file dewlab builds. Reading, it deletes every `<br>` HTML node
  // in the document, including one in the middle of a sentence ("a
  // line<br />next" came back as "a linenext"). Writing, it turns every
  // empty paragraph into `<br />`, so a practice answer written as a bare
  // `4.` (an empty ordered item to CommonMark) came back as `4. <br />`.
  // Without it, `<br>` is ordinary inline HTML and survives, and an
  // empty paragraph is simply not written, which is what markdown does.
  await crepe.editor.remove(remarkPreserveEmptyLinePlugin);

  let hydrated = false;
  if (options.onChange) {
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (hydrated) options.onChange!(markdown);
      });
    });
  }

  await crepe.create();
  hydrated = true;


  /** One listener for every cell, because a listener put on the button
   * itself does not survive the preview panel's `innerHTML`. */
  function onRootClick(event: MouseEvent): void {
    const button = (event.target as HTMLElement | null)?.closest?.(".dn-cell-run");
    const id = button instanceof HTMLElement ? button.dataset["dnCell"] : undefined;
    if (id) void runCellById(id);
  }
  root.addEventListener("click", onRootClick);

  return {
    cellIds: () => runnableCells().map((cell) => cell.id),
    runCell: (id) => runCellById(id),
    markdown: () => crepe.getMarkdown(),
    headings() {
      const found: Heading[] = [];
      crepe.editor.action((ctx) => {
        ctx.get(editorViewCtx).state.doc.descendants((node) => {
          if (node.type.name === "heading") {
            found.push({ level: Number(node.attrs.level ?? 1), text: node.textContent });
          }
          return true;
        });
      });
      return found;
    },
    destroy: () => {
      root.removeEventListener("click", onRootClick);
      crepe.destroy();
    },
  };
}
