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
import { bulletListSchema, codeBlockSchema, htmlSchema, remarkPreserveEmptyLinePlugin } from "@milkdown/kit/preset/commonmark";
import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { extendListItemSchemaForTask } from "@milkdown/kit/preset/gfm";
import { $nodeSchema, $prose, $remark, $view } from "@milkdown/kit/utils";
import { describeTrigger, foldLine, hintIn, parseTrigger, questionIn, siteGroups, sitePage, type Question, type SiteGroup, type StagedHint } from "./fences.ts";
import { renderFragment } from "./export-html.ts";
import { extractFrontMatter } from "./frontmatter.ts";
import { setYamlField } from "./authoring.ts";
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

const STATUSES = ["draft", "beta", "live", "archived"];

/** Whether the YAML is showing, kept outside the view: ProseMirror
 * rebuilds a node view whenever it likes (a click that moves the
 * selection is enough), and a rebuild must not close what the author
 * opened. One document is open at a time, so one flag will do. */
let frontMatterRawShown = false;

/** Front matter as the fields an author changes most, over the YAML it
 * is. Title and status are fields; a change rewrites that one line of
 * the YAML (setYamlField) and nothing else, so key order and quoting
 * survive as they always have. Version is shown and set only by a
 * release. The YAML itself stays editable under "Show all fields". */
export const frontMatterView = $view(frontMatterSchema.node, () => (initial, view, getPos) => {
  let node = initial;
  const dom = document.createElement("div");
  dom.className = "dn-front";
  dom.dataset["frontMatter"] = "true";

  const form = document.createElement("div");
  form.className = "dn-front-fields";
  form.contentEditable = "false";

  const field = (labelText: string, control: HTMLElement): HTMLLabelElement => {
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = labelText;
    label.append(name, control);
    return label;
  };

  const title = document.createElement("input");
  title.type = "text";
  title.className = "dn-front-title";
  const status = document.createElement("select");
  const version = document.createElement("span");
  version.className = "dn-front-version";
  version.title = "Set by Release a new version.";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "dn-front-toggle";

  form.append(field("Title", title), field("Status", status), field("Version", version), toggle);

  const raw = document.createElement("pre");
  raw.className = "dn-front-raw";
  dom.append(form, raw);

  const drawToggle = () => {
    toggle.textContent = frontMatterRawShown ? "Hide all fields" : "Show all fields";
    raw.hidden = !frontMatterRawShown;
  };
  // On mousedown, and with the default prevented: a click arrives after
  // the selection has moved, by which time this view may have been
  // rebuilt and the button it lands on is gone.
  toggle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    frontMatterRawShown = !frontMatterRawShown;
    drawToggle();
  });
  toggle.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    frontMatterRawShown = !frontMatterRawShown;
    drawToggle();
  });

  const yaml = () => node.textContent;
  const fields = () => extractFrontMatter(`---\n${yaml()}\n---\n`).fields;

  function draw(): void {
    const values = fields();
    if (document.activeElement !== title) title.value = typeof values["title"] === "string" ? values["title"] : "";
    const current = typeof values["status"] === "string" ? values["status"] : "live";
    const options = STATUSES.includes(current) ? STATUSES : [...STATUSES, current];
    status.replaceChildren(...options.map((value) => new Option(value, value, false, value === current)));
    version.textContent = values["version"] === undefined ? "none yet" : String(values["version"]);
  }

  /** Replaces the node's YAML with `next`, as one undoable step. */
  function write(next: string): void {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (pos === undefined || next === yaml()) return;
    const from = pos + 1;
    const to = from + node.content.size;
    view.dispatch(view.state.tr.replaceWith(from, to, next ? view.state.schema.text(next) : []));
  }

  title.addEventListener("change", () => write(setYamlField(yaml(), "title", title.value.trim())));
  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter") title.blur();
  });
  status.addEventListener("change", () => write(setYamlField(yaml(), "status", status.value)));

  draw();
  drawToggle();

  return {
    dom,
    contentDOM: raw,
    update(next) {
      if (next.type !== node.type) return false;
      node = next;
      draw();
      return true;
    },
    // The form's own events and changes are the form's: ProseMirror
    // leaves them alone. Only the YAML under it is document.
    stopEvent: (event) => form.contains(event.target as Node),
    ignoreMutation: (mutation) => form.contains(mutation.target),
  };
});

/** A fold's opening and closing lines, drawn as what they are. dewlab
 * writes a hint or an answer as `<details class="dl-hint"><summary>…</summary>`,
 * markdown, then `</details>`; the editor holds the two lines as inline
 * HTML atoms, which it draws as their source by default. Only the
 * drawing changes here: the node, and so the file, stay as written.
 * Any other inline HTML is drawn the default way. */
export const foldLineView = $view(htmlSchema.node, () => (node) => {
  const value = String(node.attrs["value"] ?? "");
  const fold = foldLine(value);
  const dom = document.createElement("span");
  dom.dataset["type"] = "html";
  dom.dataset["value"] = value;
  dom.contentEditable = "false";
  if (!fold) {
    dom.textContent = value;
  } else if (fold.kind === "open") {
    dom.className = "dn-fold-open";
    const label = document.createElement("span");
    label.className = "dn-fold-label";
    label.textContent = fold.label;
    const summary = document.createElement("span");
    summary.className = "dn-fold-summary";
    summary.textContent = fold.summary;
    dom.append(label, summary);
    dom.title = "Readers see this line, and open it to read what is below. Edit the summary in the markdown (Ctrl+/).";
  } else {
    dom.className = "dn-fold-close";
    dom.textContent = "end";
  }
  return { dom };
});

/** Marks the top-level blocks inside a fold, so they can be drawn as
 * belonging to it. */
export const foldBodies = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state) {
          const marks: Decoration[] = [];
          let inside = false;
          state.doc.forEach((block, offset) => {
            const only = block.type.name === "paragraph" && block.childCount === 1 ? block.firstChild : null;
            const fold = only?.type.name === "html" ? foldLine(String(only.attrs["value"] ?? "")) : null;
            if (fold?.kind === "open") {
              inside = true;
              marks.push(Decoration.node(offset, offset + block.nodeSize, { class: "dn-fold-head" }));
            } else if (fold?.kind === "close" && inside) {
              inside = false;
              marks.push(Decoration.node(offset, offset + block.nodeSize, { class: "dn-fold-foot" }));
            } else if (inside) {
              marks.push(Decoration.node(offset, offset + block.nodeSize, { class: "dn-fold-body" }));
            }
          });
          return DecorationSet.create(state.doc, marks);
        },
      },
    }),
);

/** The site editors in a document, from its top-level blocks, with each
 * pane's position so decorations can find it. */
function sitesIn(state: EditorState): { group: SiteGroup; from: number[]; to: number[] }[] {
  const blocks: ({ info: string; body: string } | null)[] = [];
  const from: number[] = [];
  const to: number[] = [];
  state.doc.forEach((block, offset) => {
    from.push(offset);
    to.push(offset + block.nodeSize);
    blocks.push(
      block.type.name === "code_block"
        ? { info: `${block.attrs["language"] ?? ""} ${block.attrs["meta"] ?? ""}`, body: block.textContent }
        : null,
    );
  });
  return siteGroups(blocks).map((group) => ({
    group,
    from: group.panes.map((pane) => from[pane.at]!),
    to: group.panes.map((pane) => to[pane.at]!),
  }));
}

const TAB_NAMES: Record<string, string> = { html: "HTML", css: "CSS", js: "JavaScript" };
const siteKey = new PluginKey<Map<number, string>>("dewnoteSites");

/** A site editor's panes as one editor: a tab bar over them, one pane
 * showing at a time, and the page they make, live, under them. The file
 * keeps three fences, as dewlab writes and builds them; only the drawing
 * changes. Which tab is showing is per editor, by its place among the
 * document's site editors, and is the editor's own state, not the file's. */
export const siteEditors = $prose(
  () =>
    new Plugin<Map<number, string>>({
      key: siteKey,
      state: {
        init: () => new Map(),
        apply(transaction, chosen) {
          const choice = transaction.getMeta(siteKey) as { editor: number; language: string } | undefined;
          if (!choice) return chosen;
          return new Map(chosen).set(choice.editor, choice.language);
        },
      },
      props: {
        decorations(state) {
          const chosen = siteKey.getState(state) ?? new Map<number, string>();
          const marks: Decoration[] = [];
          sitesIn(state).forEach(({ group, from, to }, editor) => {
            const languages = group.panes.map((pane) => pane.language);
            const showing = chosen.has(editor) && languages.includes(chosen.get(editor)!)
              ? chosen.get(editor)!
              : languages[0]!;

            marks.push(
              Decoration.widget(
                from[0]!,
                (view) => {
                  const bar = document.createElement("div");
                  bar.className = "dn-site-tabs";
                  bar.contentEditable = "false";
                  const name = document.createElement("span");
                  name.className = "dn-site-name";
                  name.textContent = group.site;
                  bar.appendChild(name);
                  for (const language of languages) {
                    const tab = document.createElement("button");
                    tab.type = "button";
                    tab.textContent = TAB_NAMES[language] ?? language;
                    tab.classList.toggle("is-showing", language === showing);
                    tab.setAttribute("aria-pressed", String(language === showing));
                    // On mousedown, with the default prevented, like the
                    // front-matter toggle: a click would move the
                    // selection first and may land on a rebuilt bar.
                    tab.addEventListener("mousedown", (event) => {
                      event.preventDefault();
                      view.dispatch(view.state.tr.setMeta(siteKey, { editor, language }));
                    });
                    bar.appendChild(tab);
                  }
                  return bar;
                },
                { side: -1, key: `dn-site-tabs-${editor}-${group.site}-${showing}-${languages.join(",")}` },
              ),
            );

            group.panes.forEach((pane, at) => {
              marks.push(
                Decoration.node(from[at]!, to[at]!, {
                  class: pane.language === showing ? "dn-site-pane" : "dn-site-pane dn-site-hidden",
                }),
              );
            });

            const page = sitePage(group);
            marks.push(
              Decoration.widget(
                to[to.length - 1]!,
                () => {
                  const frame = document.createElement("iframe");
                  frame.className = "dn-site-preview";
                  frame.title = `The page ${group.site} makes`;
                  frame.dataset["dnSite"] = String(editor);
                  // Scripts run; nothing else. It cannot reach the editor.
                  frame.setAttribute("sandbox", "allow-scripts");
                  frame.srcdoc = page;
                  return frame;
                },
                { side: 1, key: `dn-site-preview-${editor}-${group.site}` },
              ),
            );
          });
          return DecorationSet.create(state.doc, marks);
        },
      },
      /** The preview widget keeps its iframe between keystrokes, so it
       * does not flash; this refreshes what it shows, a moment after the
       * typing stops. */
      view() {
        let timer: ReturnType<typeof setTimeout> | undefined;
        return {
          update(view, previous) {
            if (view.state.doc.eq(previous.doc)) return;
            clearTimeout(timer);
            timer = setTimeout(() => {
              sitesIn(view.state).forEach(({ group }, editor) => {
                const frame = view.dom.querySelector<HTMLIFrameElement>(`iframe[data-dn-site="${editor}"]`);
                const page = sitePage(group);
                if (frame && frame.srcdoc !== page) frame.srcdoc = page;
              });
            }, 400);
          },
          destroy() {
            clearTimeout(timer);
          },
        };
      },
    }),
);

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

/** The runnable cell above the code block holding `content`: the one a
 * staged hint with no `for:` line belongs to. Found the same way
 * `metaOf` finds a block, by its text. */
function cellAbove(view: { state: { doc: { forEach(fn: (node: any) => void): void } } } | null, content: string): string | null {
  if (!view) return null;
  let above: string | null = null;
  let found: string | null | undefined;
  view.state.doc.forEach((node: any) => {
    if (found !== undefined || node.type.name !== "code_block") return;
    if (node.textContent === content && node.attrs.language === "hint") {
      found = above;
      return;
    }
    if (isRunnable(String(node.attrs.language ?? ""), String(node.attrs.meta ?? ""))) {
      above = parseCell(node.textContent).id;
    }
  });
  return found ?? null;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A staged hint as a reader meets it: its title and text in a hint
 * box, under a line saying which cell it belongs to and what makes it
 * appear. A string, so Crepe's own sanitiser sees the body's HTML. */
function hintPreview(hint: StagedHint, cell: string | null): string {
  const trigger = parseTrigger(hint.after);
  const when = "error" in trigger
    ? `<span class="dn-hint-fault">The <code>after:</code> line cannot be read. ${escapeHtml(trigger.error.replace(/`/g, ""))}</span>`
    : `Appears ${escapeHtml(describeTrigger(trigger))} in ${cell ? `<code>${escapeHtml(cell)}</code>` : "the cell above"}.`;
  return (
    `<div class="dn-hint">` +
    `<p class="dn-hint-when">Staged hint. ${when}</p>` +
    `<div class="dn-hint-box"><p class="dn-hint-title">${escapeHtml(hint.title)}</p>` +
    `${hint.text.trim() ? renderFragment(hint.text) : `<p class="dn-hint-fault">No text yet.</p>`}</div>` +
    `</div>`
  );
}

/** One paragraph's markdown as inline HTML: an option sits on a line of
 * its own, not in a paragraph. */
function inlineFragment(markdown: string): string {
  const html = renderFragment(markdown).trim();
  return /^<p>[\s\S]*<\/p>$/.test(html) && html.indexOf("<p>", 1) === -1 ? html.slice(3, -4) : html;
}

/** A question as its author needs to see it: what the reader is asked,
 * and the answer marked, which a reader has to find for themselves.
 * Built the way dewlab's `render_question()` builds it; a string, like a
 * hint, so Crepe's sanitiser sees it. */
function questionPreview(question: Question): string {
  if (question.type === "multiple-choice") {
    const correct = Number(question.correct);
    const options = question.options
      .map((option, at) => {
        const right = at + 1 === correct;
        return (
          `<li class="dn-question-option${right ? " is-correct" : ""}">` +
          `<span class="dn-question-mark" aria-label="${right ? "correct" : "wrong"}">${right ? "✓" : ""}</span>` +
          `<span>${inlineFragment(option)}</span></li>`
        );
      })
      .join("");
    const noted = Number.isInteger(correct) && correct >= 1 && correct <= question.options.length
      ? `Multiple choice. The answer is option ${correct}.`
      : `<span class="dn-hint-fault">Multiple choice, with no correct option marked.</span>`;
    return (
      `<div class="dn-question"><p class="dn-question-kind">${noted}</p>` +
      `<div class="dn-question-prompt">${question.prompt ? renderFragment(question.prompt) : ""}</div>` +
      `<ol class="dn-question-options">${options}</ol></div>`
    );
  }
  if (question.type === "fill-in-the-blank") {
    // Each gap stands aside while the sentence around it becomes HTML,
    // as dewlab's build does it, then comes back as the answer.
    const gaps: string[] = [];
    const tokenised = question.text.replace(/\{([^{}]*)\}/g, (_whole, raw: string) => `dngap${gaps.push(raw) - 1}z`);
    let html = renderFragment(tokenised);
    gaps.forEach((raw, at) => {
      const choices = raw.includes("|") ? raw.split("|").map((choice) => choice.trim()) : null;
      const shown = choices
        ? `${escapeHtml(choices[0] ?? "")}<span class="dn-question-others"> / ${choices.slice(1).map(escapeHtml).join(" / ")}</span>`
        : escapeHtml(raw.trim());
      html = html.replace(`dngap${at}z`, `<span class="dn-question-gap">${shown}</span>`);
    });
    const count = gaps.length;
    return (
      `<div class="dn-question"><p class="dn-question-kind">Fill in the blank. ` +
      `${count} gap${count === 1 ? "" : "s"}, answers shown; in a drop-down the first choice is right.</p>` +
      `<div class="dn-question-prompt">${html}</div></div>`
    );
  }
  return `<div class="dn-question"><p class="dn-question-kind dn-hint-fault">A question needs a \`type:\` of multiple-choice or fill-in-the-blank.</p></div>`;
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
        // Hides the code, leaving what it makes; then brings it back.
        previewToggleButton: (codeShowing: boolean) => (codeShowing ? "Hide" : "Edit"),
        // Hidden in style.css: the Run button heads the panel.
        previewLabel: "Output",
        previewLoading: "Running…",
        renderPreview: (language: string, content: string, apply: (value: string | HTMLElement | null) => void) => {
          // Crepe calls this from a `watch` on the block's text, so it
          // fires on every keystroke. It must therefore never start a
          // run of its own: all it does is build the panel, and the
          // panel's own button is what runs anything.
          if (language === "question") return questionPreview(questionIn("question", content)!);
          if (language === "hint") {
            const hint = hintIn("hint", content)!;
            return hintPreview(hint, hint.cell ?? cellAbove(view(), content));
          }
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
    .use(frontMatterView)
    .use(plainDollars)
    .use(foldLineView)
    .use(foldBodies)
    .use(siteEditors);
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

  /** A document ending in a list or a table gets an empty paragraph
   * after it, so there is somewhere to put the cursor, and that
   * paragraph is written as a blank line at the end of the file. No
   * markdown file needs one, and it is churn in every diff. */
  const oneFinalNewline = (markdown: string) => markdown.replace(/\n{2,}$/, "\n");

  let hydrated = false;
  if (options.onChange) {
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (hydrated) options.onChange!(oneFinalNewline(markdown));
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
    markdown: () => oneFinalNewline(crepe.getMarkdown()),
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
