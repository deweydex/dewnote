// What is wrong with this document.
//
// Everything here is a fault dewlab's build or a reader would hit, not a
// matter of taste. A block with no `id:` cannot hold anybody's work; two
// sharing one silently share the work as well; a link to nothing ships
// as a broken address; a question the build refuses stops the build.

import { parseCell, isRunnable } from "./cells.ts";
import { segments, fenceBody } from "./notebook.ts";
import { extractFrontMatter } from "./frontmatter.ts";
import { brokenLinksIn } from "./links.ts";
import {
  QUESTION_TYPES,
  cardIn,
  gapsBalanced,
  hasGap,
  questionIn,
  sitePaneIn,
  type Card,
  type Question,
} from "./fences.ts";
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

  // One namespace. A cell, a site pane and a question are all keys into
  // the same saved-work record, so a page cannot hold two of anything
  // under one id.
  const seen = new Set<string>();
  const claim = (id: string | null, what: string, line: number): void => {
    if (!id) {
      problems.push({
        message: `A ${what} with no \`id:\`. Nobody's work can be saved against it.`,
        line,
        severity: "blocking",
      });
      return;
    }
    if (seen.has(id)) {
      problems.push({
        message: `Two blocks share the id \`${id}\` — they would share a reader's saved work too.`,
        line,
        severity: "blocking",
      });
      return;
    }
    seen.add(id);
  };

  let line = 1;
  for (const part of segments(source)) {
    const info = part.info ?? "";
    if (part.kind === "fence") {
      const body = fenceBody(part.text);
      const pane = sitePaneIn(info, body);
      const question = questionIn(info, body);
      const card = cardIn(info, body);

      if (isRunnable(languageOf(info), info)) {
        claim(parseCell(body).id, "runnable cell", line);
      } else if (pane) {
        claim(pane.id, "site pane", line);
        if (!pane.site) {
          problems.push({
            message: "A site pane with no `site:`. It is what groups the panes into one editor.",
            line,
            severity: "blocking",
          });
        }
      } else if (question) {
        claim(question.id, "question", line);
        checkQuestion(question, line, problems);
      } else if (card) {
        checkCard(card, line, problems);
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
 * anywhere else, front matter is what marks a file as a page.
 *
 * A dotted folder is tooling, never content: `.claude/` and `.github/`
 * hold markdown with front matter of their own that means something
 * else entirely. */
function isPage(path: string, content: string): boolean {
  if (!path.endsWith(".md")) return false;
  if (path.split("/").some((segment) => segment.startsWith("."))) return false;
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

/** A `question` fence's own rules, which are dewlab's: a type it knows,
 * something to answer, and — for multiple choice — options and a
 * `correct:` that names one of them. */
function checkQuestion(question: Question, line: number, problems: Problem[]): void {
  const blocking = (message: string) => problems.push({ message, line, severity: "blocking" as const });

  if (!question.type) {
    blocking("A question with no `type:`. It has to say how it is answered.");
  } else if (!(QUESTION_TYPES as readonly string[]).includes(question.type)) {
    blocking(`\`type: ${question.type}\` is not one of ${QUESTION_TYPES.join(" or ")}.`);
  }
  if (!question.text.trim()) {
    blocking("A question with nothing in it to answer.");
    return;
  }

  if (question.type === "multiple-choice") {
    if (question.options.length < 2) {
      blocking("A multiple-choice question with fewer than two options.");
    } else if (!question.prompt) {
      blocking("A multiple-choice question with options but nothing above them to answer.");
    }
    const at = Number(question.correct);
    if (!question.correct) {
      blocking("A multiple-choice question with no `correct:` line, so nothing marks it.");
    } else if (!/^\d+$/.test(question.correct) || at < 1 || at > question.options.length) {
      blocking(
        `\`correct: ${question.correct}\` names none of the ${question.options.length} options — ` +
          "they are counted from 1, in the order they are written.",
      );
    }
  }

  if (question.type === "fill-in-the-blank") {
    if (!gapsBalanced(question.text)) {
      blocking("A gap in this question opens with `{` and never closes.");
    } else if (!hasGap(question.text)) {
      blocking("A fill-in-the-blank question with no `{…}` gap in it, so there is nothing to fill in.");
    }
  }
}

/** A `card` fence is a tile: somewhere to go, and something to read. */
function checkCard(card: Card, line: number, problems: Problem[]): void {
  if (!card.url) {
    problems.push({ message: "A card with no `url:`, so it goes nowhere.", line, severity: "blocking" });
  }
  if (!card.heading) {
    problems.push({
      message: "A card whose text does not open with a heading, which is the tile's title.",
      line,
      severity: "blocking",
    });
  }
}
