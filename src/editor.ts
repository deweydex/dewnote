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
import { bulletListSchema, codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { extendListItemSchemaForTask } from "@milkdown/kit/preset/gfm";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import { editorViewCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import remarkFrontmatter from "remark-frontmatter";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { LanguageDescription } from "@codemirror/language";
import { cellLanguage, isRunnable, parseCell, wrapSqlCode, type CellOutput } from "./cells.ts";
import { uploadConfig } from "@milkdown/kit/plugin/upload";
import { isImageName, isLocalAsset } from "./images.ts";
import { unmathPlainDollars } from "./maths.ts";

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

/** Rewrite every display-maths block into the one form Milkdown handles
 * correctly: `$$` alone on its own line at each end.
 *
 * Milkdown gets the other two wrong.
 *
 * - Delimiters sharing a line with content are **destroyed**:
 *   `$$a = 1\nb = 2$$` comes back as `$$$\nb = 2$$\n$$$`.
 * - A block on one line is read as *inline* maths and comes back as
 *   `$x = 1$`, at a different size. 18 of 184 dewlab files use it.
 *
 * dewlab's `DISPLAY_MATH_RE` accepts all three, so this changes how a
 * file is written and never what it renders.
 *
 * Only a span that owns its lines is touched, never one inside a fence. */
export function canonicaliseDisplayMath(markdown: string): string {
  const fences: [number, number][] = [];
  let open: number | null = null;
  for (const match of markdown.matchAll(/^(?:```|~~~).*$/gm)) {
    if (open === null) open = match.index;
    else {
      fences.push([open, match.index + match[0].length]);
      open = null;
    }
  }
  if (open !== null) fences.push([open, markdown.length]);
  const inFence = (at: number) => fences.some(([from, to]) => at >= from && at < to);

  return markdown.replace(/\$\$([\s\S]*?)\$\$/g, (whole, inner: string, at: number) => {
    if (inFence(at)) return whole;
    // It has to own its lines: something before it or after it on the
    // same line means it is inline maths and none of our business.
    const before = markdown.lastIndexOf("\n", at - 1) + 1;
    if (markdown.slice(before, at).trim() !== "") return whole;
    const after = at + whole.length;
    const lineEnd = markdown.indexOf("\n", after);
    if (markdown.slice(after, lineEnd === -1 ? undefined : lineEnd).trim() !== "") return whole;

    const body = inner.trim();
    if (inner === `\n${body}\n`) return whole;   // already canonical
    return `$$\n${body}\n$$`;
  });
}

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
function drawLocalImages(
  root: HTMLElement,
  resolve: (src: string) => Promise<string | null>,
): () => void {
  const drawn = new Map<string, string | null>();

  async function pass(): Promise<void> {
    for (const image of root.querySelectorAll("img")) {
      const written = image.getAttribute("data-dn-src") ?? image.getAttribute("src") ?? "";
      if (!isLocalAsset(written)) continue;
      if (image.getAttribute("data-dn-src") === written && image.src !== "") continue;
      image.setAttribute("data-dn-src", written);
      if (!drawn.has(written)) drawn.set(written, await resolve(written));
      const found = drawn.get(written) ?? null;
      if (found) image.src = found;
      else image.setAttribute("data-dn-missing", "true");
    }
  }

  void pass();
  const watcher = new MutationObserver(() => void pass());
  watcher.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  return () => {
    watcher.disconnect();
    for (const url of drawn.values()) if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  };
}

export interface Document {
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
  const results = new Map<string, RunRecord>();

  /** The panel under a runnable cell: a Run button, and whatever the
   * last run produced. Crepe's own preview toggle appears beside Copy
   * once this exists, and hides the code rather than the output — so the
   * panel is what makes a cell a cell. */
  function cellPanel(
    language: string,
    content: string,
    apply: (value: string | HTMLElement | null) => void,
  ): HTMLElement {
    const cell = parseCell(content);
    const id = cell.id ?? "cell";
    const panel = document.createElement("div");
    panel.className = "dn-cell";

    const run = document.createElement("button");
    run.type = "button";
    run.className = "dn-cell-run";
    panel.appendChild(run);

    const record = results.get(id);
    const stale = record !== undefined && record.source !== content;
    run.textContent = record ? "Run again" : "Run";

    if (record) {
      const output = outputPanel(record.output);
      if (stale) {
        output.classList.add("is-stale");
        output.title = "This ran before the code was edited.";
      }
      panel.appendChild(output);
    }

    run.addEventListener("click", async () => {
      run.disabled = true;
      run.textContent = "Running…";
      const sqlCell = cellLanguage(language) === "sql";
      const output = await options.runCell!({
        id,
        code: sqlCell ? wrapSqlCode(cell.code) : cell.code,
        sql: sqlCell,
      }).catch((error: unknown) => ({
        ok: false,
        markup: `<pre>${String(error instanceof Error ? error.message : error)}</pre>`,
      }));
      results.set(id, { source: content, output });
      // Hand back a freshly built panel: the click happened on this one,
      // and rebuilding is how the button's own label and the output stay
      // in step with each other.
      apply(cellPanel(language, content, apply));
    });

    return panel;
  }

  const crepe = new Crepe({
    root,
    defaultValue: canonicaliseDisplayMath(options.markdown),
    features: {
      // Rewrites an image's alt text to its aspect ratio, which the probe
      // caught turning `![](x.svg)` into `![1.00](x.svg)`.
      [Crepe.Feature.ImageBlock]: false,
      [Crepe.Feature.Toolbar]: false,
      [Crepe.Feature.TopBar]: false,
      [Crepe.Feature.AI]: false,
    },
    featureConfigs: {
      [Crepe.Feature.CodeMirror]: {
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

  crepe.editor
    .config(keepMarkers)
    .use(codeBlockWithMeta)
    .use(frontMatterRemark)
    .use(frontMatterSchema)
    .use(plainDollars);
  crepe.editor.use(tightBulletLists).use(tightListItems);

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

  const stopDrawing = options.resolveImage
    ? drawLocalImages(root, options.resolveImage)
    : () => {};

  return {
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
      stopDrawing();
      crepe.destroy();
    },
  };
}
