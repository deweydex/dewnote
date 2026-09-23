// The open document, leaving dewnote or arriving from elsewhere: as one
// HTML file, as a page in a new tab, as a Jupyter notebook, and a
// notebook read in.

import { exportHtml, titleOf } from "./export-html.ts";
import { fromNotebook, toNotebook, type Notebook } from "./notebook.ts";
import { messageOf } from "./save-problem.ts";
import type { ShellContext } from "./shell-context.ts";
// The reading half, not the editor's: an exported page is plain
// markdown markup, and `style.css` describes the editor. The tokens go
// with it, because a `var(--dl-*)` with nothing behind it is how an
// exported page ends up in the browser's default serif.
import { tokensCss } from "./theme/tokens.ts";
import readingCss from "./theme/reading.css" with { type: "text" };
import katexCss from "katex/dist/katex.min.css" with { type: "text" };

const pageCss = `${tokensCss}\n${readingCss}`;

/** A name a file system will take, from a document's own title. */
function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "document";
}

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Revoked on the next turn, once the click has been taken up.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface ExportFlows {
  saveAsHtml(): Promise<void>;
  previewPage(): Promise<void>;
  saveAsNotebook(): void;
  openNotebook(): Promise<void>;
}

export function exportFlows(ctx: ShellContext): ExportFlows {
  /** The page as one HTML file: the stylesheet and, where the page
   * renders maths, KaTeX's own, both inlined, and every image the
   * document owns turned into a data URI. */
  async function page(path: string, source: string): Promise<string> {
    return exportHtml(source, {
      css: pageCss,
      katexCss,
      resolveImage: (src) => ctx.asDataUri(path, src),
    });
  }

  return {
    /** Something to send to somebody who does not have dewlab. */
    async saveAsHtml() {
      const open = ctx.open();
      if (!open) return;
      const source = open.document.markdown();
      download(`${slugOf(titleOf(source))}.html`, await page(open.path, source), "text/html");
    },

    /** The same page, in a tab, without writing a file. What an author
     * wants before publishing is to read the thing, not to keep a copy
     * of it, and a blob URL in a new tab is a page with its stylesheet,
     * its typeset maths and its images already inside it.
     *
     * A cell's output is not in it. Output lives in the tab that ran the
     * cell, which is this one. */
    async previewPage() {
      const open = ctx.open();
      if (!open) return;
      const html = await page(open.path, open.document.markdown());
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      window.open(url, "_blank", "noopener");
      // Long enough for the tab to have loaded it; the tab keeps its own
      // copy from there.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },

    /** The open document as an nbformat 4.5 notebook. Every cell keeps
     * its own exact text, so importing one back is the same bytes. */
    saveAsNotebook() {
      const open = ctx.open();
      if (!open) return;
      const source = open.document.markdown();
      download(
        `${slugOf(titleOf(source))}.ipynb`,
        `${JSON.stringify(toNotebook(source), null, 1)}\n`,
        "application/x-ipynb+json",
      );
    },

    /** A notebook, opened as the document. Replaces what is on screen
     * rather than writing anything: saving is still ⌘S, and still the
     * author's decision. */
    async openNotebook() {
      if (!(await ctx.readyToLeave())) return;
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = ".ipynb,application/json";
      picker.addEventListener("change", async () => {
        const file = picker.files?.[0];
        if (!file || !ctx.open()) return;
        try {
          const notebook = JSON.parse(await file.text()) as Notebook;
          await ctx.remount(fromNotebook(notebook));
        } catch (error) {
          ctx.spine.setProblem({ message: `dewnote could not read that file as a Jupyter notebook: ${messageOf(error)}` });
        }
      });
      picker.click();
    },
  };
}
