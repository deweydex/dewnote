// The document as one HTML file, to send to somebody who does not have
// dewlab.
//
// Rendered from the markdown rather than from the editor's own DOM: the
// editor's DOM carries contenteditable attributes, Vue wrappers, and
// code blocks that have not mounted yet because they are below the fold.
// The markdown is the document, so the markdown is what is rendered.
//
// A cell exports as its code. Its `id:`, `hint:`, `expect:` and `name:`
// lines are how an author addresses it and are no part of what a reader
// reads, so they are dropped. Its *output* is not in the document
// either — that lives in the worker and the live DOM for as long as the
// tab is open, and is never written back — so there is nothing truthful
// to put in its place.

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import { extractFrontMatter } from "./frontmatter.ts";
import { isLocalAsset } from "./images.ts";
import { unmathPlainDollars } from "./maths.ts";
import { segments, joinSegments, fenceBody } from "./notebook.ts";
import { isRunnable, parseCell } from "./cells.ts";

export interface ExportOptions {
  /** Inlined into the page, so the file stands on its own. */
  css: string;
  /** KaTeX's own stylesheet, inlined only when the document has maths. */
  katexCss?: string;
  /** Turns a `src` the document owns into a data URI. An image left
   * unresolved keeps its name, which at least says what is missing. */
  resolveImage?(src: string): Promise<string | null>;
}

/** The document's own title, for the page and its `<title>`. */
export function titleOf(source: string): string {
  const { fields } = extractFrontMatter(source);
  const declared = fields["title"];
  if (typeof declared === "string" && declared.trim()) return declared.trim();
  const heading = /^#\s+(.+?)\s*$/m.exec(source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ""));
  return heading?.[1]?.trim() ?? "Untitled";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A runnable cell's header lines, removed. They are the author's
 * address for the cell, not the reader's. */
export function withoutCellHeaders(source: string): string {
  return joinSegments(
    segments(source).map((part) => {
      const info = part.info ?? "";
      if (part.kind !== "fence" || !isRunnable(info.trim().split(/\s+/)[0] ?? "", info)) return part;
      const body = fenceBody(part.text);
      const { code } = parseCell(body);
      if (code === body) return part;
      return { ...part, text: part.text.replace(body, code.replace(/^\n+/, "")) };
    }),
  );
}

/** Markdown to a document body. Front matter is dropped: a reader never
 * sees it on the site either. */
export async function renderBody(source: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkMath)
    .use(unmathPlainDollars)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(withoutCellHeaders(source));
  return String(file);
}

/** A piece of markdown, such as a hint's body, as HTML, at once. The
 * editor draws these on every keystroke, so this cannot wait on anything;
 * every step of the pipeline is synchronous. */
export function renderFragment(source: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(unmathPlainDollars)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeKatex)
      .use(rehypeStringify, { allowDangerousHtml: true })
      .processSync(source),
  );
}

const IMG_RE = /<img\b[^>]*\bsrc="([^"]*)"[^>]*>/g;

/** Every image the document owns, inlined, so the file is one file. */
async function inlineImages(html: string, resolve: ExportOptions["resolveImage"]): Promise<string> {
  if (!resolve) return html;
  const wanted = [...new Set([...html.matchAll(IMG_RE)].map((m) => m[1]!).filter(isLocalAsset))];
  const found = new Map<string, string>();
  for (const src of wanted) {
    const url = await resolve(src);
    if (url) found.set(src, url);
  }
  return html.replace(IMG_RE, (tag, src: string) => {
    const url = found.get(src);
    return url ? tag.replace(`src="${src}"`, `src="${url}"`) : tag;
  });
}

export async function exportHtml(source: string, options: ExportOptions): Promise<string> {
  const title = titleOf(source);
  const body = await inlineImages(await renderBody(source), options.resolveImage);
  // Asked of the rendered page rather than guessed from the source: a
  // sentence about costing $5 and $6 is not maths, and a regex over the
  // markdown cannot tell the difference.
  const katex = options.katexCss && body.includes("katex")
    ? `\n<style>${options.katexCss}</style>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${options.css}</style>${katex}
</head>
<body>
<main class="dn-page">
${body}
</main>
</body>
</html>
`;
}
