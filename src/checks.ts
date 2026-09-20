// What is wrong with this document.
//
// Everything here is a fault dewlab's build or a reader would hit, not a
// matter of taste. A cell with no `id:` cannot hold anybody's work; two
// cells sharing one silently share the work as well; a link to nothing
// ships as a broken address.

import { parseCell, isRunnable } from "./cells.ts";
import { segments, fenceBody } from "./notebook.ts";
import { extractFrontMatter } from "./frontmatter.ts";
import { brokenLinksIn } from "./links.ts";
import { isReleaseVersion } from "./authoring.ts";

export interface Problem {
  /** What is wrong, written for the author. */
  message: string;
  /** The file it is in. Absent when the checker was given one document
   * and the caller already knows which. */
  path?: string;
  /** 1-based, where the document can say. */
  line?: number;
  /** Whether the build would refuse this, or only a reader would notice. */
  severity: "blocking" | "worth fixing";
}

/** A fence's language is its info string's first word. */
function languageOf(info: string): string {
  return info.trim().split(/\s+/)[0] ?? "";
}

/** How many lines a segment spans, so the running count stays in step
 * with the file the author is reading. */
function linesOf(text: string): number {
  return text.split("\n").length - 1;
}

export function checkDocument(source: string, knownIds: ReadonlySet<string>): Problem[] {
  const problems: Problem[] = [];
  const { present, fields } = extractFrontMatter(source);

  if (!present) {
    problems.push({ message: "No front matter: the build has no title to show.", severity: "blocking" });
  } else {
    if (typeof fields["title"] !== "string" || !fields["title"].trim()) {
      problems.push({ message: "No `title:`, so the page has nothing to be called.", severity: "blocking" });
    }
    const version = fields["version"];
    if (version !== undefined && !isReleaseVersion(version)) {
      problems.push({
        message: `\`version: ${String(version)}\` is not a date and a counter, so a release cannot count from it.`,
        severity: "worth fixing",
      });
    }
  }

  const seen = new Map<string, number>();
  let line = 1;
  for (const part of segments(source)) {
    if (part.kind === "fence" && isRunnable(languageOf(part.info ?? ""), part.info ?? "")) {
      const { id } = parseCell(fenceBody(part.text));
      if (!id) {
        problems.push({
          message: "A runnable cell with no `id:`. Nobody's work can be saved against it.",
          line,
          severity: "blocking",
        });
      } else if (seen.has(id)) {
        problems.push({
          message: `Two cells share the id \`${id}\` — they would share a reader's saved work too.`,
          line,
          severity: "blocking",
        });
      } else {
        seen.set(id, line);
      }
    }
    line += linesOf(part.text);
  }

  for (const link of brokenLinksIn("", source, knownIds)) {
    problems.push({
      message: `\`tutorial:${link.target}\` names no page${link.text ? ` — the link reads "${link.text}"` : ""}.`,
      line: link.line,
      severity: "blocking",
    });
  }

  return problems.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}

/** A page dewlab builds, as against a README or a note left beside one.
 * A file under `tutorials/` is a page whether or not it has front
 * matter — a missing header is exactly the fault worth reporting — and
 * anywhere else, front matter is what marks a file as a page. */
function isPage(path: string, content: string): boolean {
  if (!path.endsWith(".md")) return false;
  return /(^|\/)tutorials\//.test(path) || extractFrontMatter(content).present;
}

/** Every page in the workspace at once, which is what says whether the
 * site is sound. Checking only the open document finds a fault on the
 * day somebody opens the page it is written on, which is too late. */
export function checkWorkspace(
  files: readonly { path: string; content: string }[],
  knownIds: ReadonlySet<string>,
): Problem[] {
  return files
    .filter((file) => isPage(file.path, file.content))
    .flatMap((file) =>
      checkDocument(file.content, knownIds).map((problem) => ({ ...problem, path: file.path })),
    )
    .sort((a, b) => (a.path ?? "").localeCompare(b.path ?? "") || (a.line ?? 0) - (b.line ?? 0));
}
