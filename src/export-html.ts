// Step 6's first slice (plan §5.8): "the rendered document with the
// stylesheet and KaTeX CSS inlined, cells shown with their last output,
// no runtime — a page to send to someone." Scoped here to rendering: a
// cell's *last output* is not part of dewnote's document model at
// all — it lives only in the live worker and the live DOM for as long as
// a page stays open (Pyodide's own namespace, `runtime/pyodide-engine.ts`),
// never written back into the block text the way an edit is. So this
// exports the rendered *source* faithfully — prose, maths, folds — and a
// fence as a plain, labelled code block, the same honest illustrative
// text a fold's own quoted code already gets (decision 23), rather than
// a captured run this architecture has nowhere to keep between a Run
// click and a later export.


import { parseDocument, type Block } from "./blocks.ts";
import { renderBlockPreview } from "./render-block.ts";
import { detectDialect } from "./dialect.ts";
import { isRunnableFence, parseCellSource, sqlScriptFromFenceText as fenceBodyOnly } from "./cell.ts";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderFenceBlock(block: Block): string {
  const info = block.fence?.info ?? "";
  const language = info.split(/\s+/)[0] || "text";
  // sqlScriptFromFenceText is the same "everything between the fence
  // lines" extraction an exec cell's own parseCellSource builds on —
  // exported under a SQL-specific name there because that was the first
  // caller, but it does exactly what a plain or SQL fence both need here.
  const code = isRunnableFence(info) ? parseCellSource(block).code : fenceBodyOnly(block.text);
  return `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(code)}</code></pre>`;
}

/** Renders a document's blocks to the same HTML shape the live page's
 * own blurred (rendered) state uses — `.dn-block .dn-block-<kind>`
 * wrappers around each, so the inlined stylesheet styles it identically.
 * Pure and unit-tested directly; front matter is never shown, matching
 * the live page (a reader never sees it rendered there either). */
export function renderBlocksToHtml(source: string): string {
  const doc = parseDocument(source);
  const dialect = detectDialect(doc.frontMatter);
  const parts: string[] = [];
  for (const block of doc.blocks) {
    if (block.kind === "frontmatter") continue;
    const inner = block.kind === "fence" ? renderFenceBlock(block) : renderBlockPreview(block, dialect);
    parts.push(`<div class="dn-block dn-block-${block.kind}">${inner}</div>`);
  }
  return parts.join("\n");
}

function titleFrom(source: string): string {
  const doc = parseDocument(source);
  const title = doc.frontMatter.fields["title"];
  return typeof title === "string" && title.trim() ? title.trim() : "Untitled";
}

/**
 * Wraps rendered blocks into one standalone HTML document — `pageCss` is
 * every rule already active on the live page (see `collectPageCss`,
 * export-html's own browser-only half), so the exported page looks like
 * dewnote's own reading surface, including KaTeX's fonts, without a
 * second copy of any of it to keep in sync by hand.
 */
/** The handful of rules an exported page needs and the live editor never
 * had. A fence on screen is a CodeMirror instance inside `.dn-block-source`;
 * an exported one is a plain `<pre><code>`, which nothing in `app.css`
 * has ever described — so until now every exported code block came out
 * unstyled, unindented from the prose and running off the right edge on
 * any long line. These are the same tokens the live cell uses, applied
 * to the markup the export itself produces, plus the one thing the
 * editor has no use for: a page that survives being printed. */
const EXPORT_CSS = `
.dn-block-fence pre {
  margin: 1rem 0;
  padding: 0.75rem 0.9rem;
  overflow-x: auto;
  border: 1px solid var(--dl-cell-border);
  border-radius: 4px;
  background: var(--dn-cell-bg, var(--dl-cell-bg));
}
.dn-block-fence pre code {
  font-family: var(--dl-mono);
  font-size: 0.85em;
  white-space: pre;
}
@media print {
  .dn-block-fence pre { overflow-x: visible; white-space: pre-wrap; }
  .dn-block-fence pre code { white-space: pre-wrap; }
  .dn-block { break-inside: avoid; }
}
`;

export function buildStandaloneHtmlPage(source: string, pageCss: string): string {
  const title = titleFrom(source);
  const body = renderBlocksToHtml(source);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${pageCss}${EXPORT_CSS}</style>
</head>
<body>
<div class="dn-page">
${body}
</div>
</body>
</html>
`;
}

/** The CSS an exported page needs, and no more, drawn from whichever form
 * the build put this app's own stylesheet in — a `<style>` tag (the
 * single-file build, decision 14) or a `<link>` (dev mode's own
 * `bun --hot`) — so export works the same way regardless of how dewnote
 * itself is being run. A cross-origin stylesheet (there are none in this
 * app today) is skipped rather than thrown on, since reading its rules
 * would throw first anyway.
 *
 * ## Why this filters rather than copying everything
 *
 * Copying every active rule was the first version, and it was measured
 * rather than guessed at: 1.54 MB for a 13 KB tutorial, of which
 * 1.44 MB — ninety-four per cent — was twenty `@font-face` rules
 * carrying KaTeX's webfonts as base64, shipped whether or not the
 * document contained a single formula, and another 200-odd rules
 * describing a repository panel, a command palette and a CodeMirror
 * editor that an exported page has none of. A page to send to someone
 * is the one artefact here whose whole job is to travel, so it should
 * not carry the editor on its back.
 *
 * Two filters, in order of what they save. A font is included only when
 * the rendered document has maths in it, which is the whole 1.44 MB for
 * every document that does not. Then a style rule survives only if one
 * of its selectors matches something in that same rendered document —
 * tested against the real thing, not guessed from selector text — with
 * the document-wide selectors (`:root`, `html`, `body`, `*`) kept
 * unconditionally, since that is where every custom property this
 * stylesheet reads is defined. `@media` blocks are filtered the same
 * way and dropped when nothing inside them survives. Anything this does
 * not recognise is kept, on the principle that an export is better
 * slightly too large than subtly wrong. */
export function collectPageCss(source: string): string {
  const probe = document.createElement("div");
  probe.className = "dn-page";
  probe.innerHTML = renderBlocksToHtml(source);
  const needsFonts = probe.querySelector(".katex") !== null;

  /** `:root`, `html`, `body` and `*` cannot be matched inside a detached
   * element, and are exactly where the theme's tokens live. */
  const DOCUMENT_WIDE = /(^|,)\s*(:root|html|body|\*)\b/;

  /** `querySelector` never matches a pseudo-element and never matches a
   * state nothing is currently in, so both have to come off before the
   * test — otherwise a fold's own `summary::before` marker and every
   * `a:hover` rule would be dropped from a page that needs them. */
  function testable(selector: string): string {
    return selector
      .replace(/::[\w-]+(\([^)]*\))?/g, "")
      .replace(/:(hover|active|focus|focus-visible|focus-within|target|visited)\b/g, "");
  }

  function keepsStyleRule(rule: CSSStyleRule): boolean {
    const selector = rule.selectorText;
    if (!selector) return true;
    if (DOCUMENT_WIDE.test(selector)) return true;
    try {
      const probed = testable(selector);
      return probe.matches(probed) || probe.querySelector(probed) !== null;
    } catch {
      // A selector this browser cannot parse in `querySelector` is kept
      // rather than dropped: an export is better slightly too large
      // than subtly wrong.
      return true;
    }
  }

  function keep(rule: CSSRule): string | null {
    if (rule instanceof CSSFontFaceRule) return needsFonts ? rule.cssText : null;
    if (rule instanceof CSSStyleRule) return keepsStyleRule(rule) ? rule.cssText : null;
    if (rule instanceof CSSMediaRule) {
      const inner = Array.from(rule.cssRules).map(keep).filter((text): text is string => text !== null);
      return inner.length ? `@media ${rule.conditionText} {\n${inner.join("\n")}\n}` : null;
    }
    return rule.cssText;
  }

  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        const text = keep(rule);
        if (text !== null) parts.push(text);
      }
    } catch {
      // Cross-origin stylesheet; nothing this app ships today, but skip
      // rather than fail the whole export over one unreadable sheet.
    }
  }
  return parts.join("\n");
}
