// Turns a Block (blocks.ts) into the HTML shown while it is *not* focused —
// the "render" half of "render when blurred, edit when focused" (plan
// §5.1, decision 2). This never touches the block model or its offsets;
// it is a second, independent parse of the same text purely for display,
// which is exactly what blocks.ts's own module comment says a fold's inner
// content will eventually need. Fence blocks are deliberately not handled
// here — a code cell has no rendered state at all (plan §5.1: "always a
// CodeMirror editor"), so the DOM layer never calls this for one.

import MarkdownIt from "markdown-it";
import texmath from "markdown-it-texmath";
import katex from "katex";
import type { Block } from "./blocks.ts";
import type { DialectName } from "./dialect.ts";

const md = new MarkdownIt({ html: true, linkify: true }).use(texmath, {
  engine: katex,
  delimiters: "dollars",
  katexOptions: { throwOnError: false },
});

/** Render a non-fence block's text for its blurred state. `dialect` is
 * accepted now and unused — dewstack has no maths, so a future check here
 * (skip texmath, since decision-worthy "$ renders as text" behaviour, per
 * DIALECTS.md §2) belongs to this function once dewstack fixtures need it
 * rendered rather than just round-tripped. */
export function renderBlockPreview(block: Block, _dialect: DialectName): string {
  switch (block.kind) {
    case "frontmatter":
      return renderFrontMatterPreview(block);
    case "prose":
    case "math":
      return md.render(block.text);
    case "fold":
      return renderFold(block);
    case "fence":
      throw new Error("renderBlockPreview: fence blocks have no rendered state — see this file's header comment");
  }
}

function renderFrontMatterPreview(block: Block): string {
  // The full per-field form (decision 11) is later work; for now the
  // rendered state is a quiet summary and the source itself is reached
  // the same way every other block's source is — see app.ts.
  const raw = block.text.replace(/^---\r?\n/, "").replace(/\r?\n---\r?\n?$/, "");
  const fieldCount = raw.split(/\r?\n/).filter((line) => /^[A-Za-z_][\w-]*:/.test(line)).length;
  const label = fieldCount === 1 ? "1 field" : `${fieldCount} fields`;
  return `<p class="dn-frontmatter-summary">Front matter — ${label}</p>`;
}

const FOLD_OPEN_RE = /^<(details|aside)\b([^>]*)>\s*(?:<summary>([\s\S]*?)<\/summary>)?/i;

interface FoldParts {
  tag: string;
  className: string | null;
  summaryHtml: string;
  bodyMarkdown: string;
}

/** Split a fold block's raw text into its wrapper and its body, so the
 * body can be parsed as markdown independently — CommonMark's own raw-HTML-
 * block rule would otherwise swallow it un-rendered (checked directly: this
 * is not what dewlab's build does, which relies on Python-Markdown's
 * md_in_html extension to treat the same blank-line-separated body as real
 * markdown; markdown-it has no equivalent, hence this function). Exported
 * for its own unit tests, separate from the fuller renderFold. */
export function parseFold(text: string): FoldParts {
  const openMatch = FOLD_OPEN_RE.exec(text);
  if (!openMatch) {
    // Malformed input shouldn't happen — FOLD_OPEN_RE here is a superset of
    // the pattern blocks.ts used to call this a fold block in the first
    // place — but showing the raw text beats throwing.
    return { tag: "details", className: null, summaryHtml: "", bodyMarkdown: text };
  }
  const tag = openMatch[1]!.toLowerCase();
  const attrs = openMatch[2] ?? "";
  const classMatch = /class="([^"]*)"/.exec(attrs);
  const className = classMatch ? classMatch[1]! : null;
  const summaryHtml = openMatch[3] ?? "";

  const bodyStart = openMatch.index + openMatch[0].length;
  const closeRe = new RegExp(`</${tag}\\s*>`, "gi");
  let lastClose = -1;
  for (let m = closeRe.exec(text); m; m = closeRe.exec(text)) lastClose = m.index;
  const bodyEnd = lastClose === -1 ? text.length : lastClose;

  const bodyMarkdown = text.slice(bodyStart, bodyEnd).trim();
  return { tag, className, summaryHtml, bodyMarkdown };
}

const FOLD_LABELS: Record<string, string> = {
  "dl-hint": "hint",
  "dl-answer": "answer",
};

function renderFold(block: Block): string {
  const { tag, className, summaryHtml, bodyMarkdown } = parseFold(block.text);
  const label = summaryHtml || (className && FOLD_LABELS[className]) || "details";
  const classAttr = className ? ` class="${escapeAttr(className)}"` : "";
  const bodyHtml = bodyMarkdown ? md.render(bodyMarkdown) : "";
  return `<${tag}${classAttr}><summary>${label}</summary>${bodyHtml}</${tag}>`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
