// The editor, and the only module that knows Milkdown exists.
//
// Two schema overrides carry everything dewlab writes that Crepe's own
// preset would lose. Both were found by measurement rather than by
// reading — planning/REBUILD.md §1 records the probe and the two
// mechanisms that are not obvious from the API:
//
//   1. A schema is replaced by re-registering it under the same id, not
//      by updating its ctx slice. `ctx.update(codeBlockSchema.key, …)`
//      inside `editor.config()` updates a value that `$node`'s runner has
//      already read, so it does nothing at all — silently.
//
//   2. Crepe models a `$$` maths block as a code fence whose language is
//      `LaTeX`, converted in and out by its own `codeBlockSchema`
//      extension. Re-registering that schema drops Crepe's extension, so
//      ours has to carry the same branch or every block of maths in the
//      corpus turns into a fence. Measured: 18 files.

import { Crepe } from "@milkdown/crepe";
import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import { editorViewCtx } from "@milkdown/kit/core";
import remarkFrontmatter from "remark-frontmatter";

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

/** Front matter, held as the one string it is. Nothing parses the YAML on
 * the way through, so key order and quoting survive by construction —
 * which is what `archive/src/frontmatter.ts` spent 133 lines protecting. */
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

/** Put every display-maths block into the one form Milkdown handles
 * correctly — `$$` alone on its own line at each end — before Milkdown
 * reads it.
 *
 * Two measured faults make this necessary, and neither is cosmetic.
 *
 * A block whose delimiters share a line with its content is destroyed:
 * given `$$a = 1\nb = 2$$`, Crepe returns `$$$\nb = 2$$\n$$$` — the
 * first line gone, the rest malformed. dewlab has one file written that
 * way, so its current authoring editor already loses that content.
 *
 * A block written on one line, `$$x = 1$$`, is read as *inline* maths and
 * written back as `$x = 1$`, which renders at a different size. 18 of the
 * 184 files in the dewlab corpus use that form, and two of them put a
 * pair on consecutive lines, where they share one paragraph.
 *
 * `build.py`'s `DISPLAY_MATH_RE` is `\$\$(?P<tex>.+?)\$\$` with
 * `DOTALL` and a `.strip()`, so all three forms build the same page: this
 * changes how a file is written, never what it renders.
 *
 * Only a span that owns its lines is touched, and never one inside a
 * fence, where `$$` is code. */
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

export interface Heading {
  level: number;
  text: string;
}

export interface Document {
  /** The save path. Re-serialises the whole document — see REBUILD.md §4. */
  markdown(): string;
  headings(): Heading[];
  destroy(): void;
}

export interface EditorOptions {
  markdown: string;
  onChange?(markdown: string): void;
}

export async function mountEditor(
  root: HTMLElement,
  options: EditorOptions,
): Promise<Document> {
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
  });

  crepe.editor.use(codeBlockWithMeta).use(frontMatterRemark).use(frontMatterSchema);

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
    destroy: () => crepe.destroy(),
  };
}
