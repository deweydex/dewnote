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
import { assetPathFor, isLocalAsset } from "./images.ts";
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

/** dewlab's `STATUSES`, in build.py. `draft` is built into nothing;
 * the others are published, and anything else stops the build. */
export const TUTORIAL_STATUSES = ["draft", "beta", "live", "archived"] as const;

/** dewlab's `MOVED_FRONTMATTER`: fields a tutorial used to carry, which
 * the build now refuses, and where the information lives instead. */
const MOVED_FIELDS: Record<string, string> = {
  order: "the course file under courses/ lists tutorials in reading order",
  slug: "the folder name is the tutorial's id",
  module: "the course file that lists this tutorial says which course it is on",
  module_title: "the course file's own `title:` names the course",
  series: "a series is a heading in the course file under courses/",
};

/** A fence's language is its info string's first word. */
function languageOf(info: string): string {
  return info.trim().split(/\s+/)[0] ?? "";
}

/** How many lines a segment spans, so the running count stays in step
 * with the file the author is reading. */
function linesOf(text: string): number {
  return text.split("\n").length - 1;
}

/** What the checker has to know about the workspace around a document.
 * An empty set and an absent one mean different things: no ids at all is
 * a workspace with no pages, while no image list is "nobody asked", and
 * a rule that cannot be answered is not reported. */
export interface Around {
  /** Every page id the site claims, for `tutorial:` links. */
  ids: ReadonlySet<string>;
  /** Every image path in the workspace. Absent turns the image rule
   * off rather than failing every image. */
  images?: ReadonlySet<string>;
  /** The document's own path, which is what an image resolves against.
   * Absent turns the image rule off for the same reason. */
  path?: string;
}

export function checkDocument(source: string, around: Around): Problem[] {
  const { ids: knownIds, images, path } = around;
  const problems: Problem[] = [];
  const { present, fields } = extractFrontMatter(source);

  // dewlab's build reads every tutorials/<id>/*.md, drafts included,
  // through `split_frontmatter`, which refuses the file outright for any
  // of these. Site pages go through a different reader and are only
  // held to the title.
  const tutorial = path !== undefined && /^tutorials\/[^/]+\/[^/]+\.md$/.test(path);

  if (!present) {
    problems.push({ message: "No front matter. Add a `---` block at the top with at least a `title:` line; the site cannot build the page without it.", severity: "blocking" });
  } else {
    if (typeof fields["title"] !== "string" || !fields["title"].trim()) {
      problems.push({ message: "No `title:` in the front matter. Add one; the site cannot build the page without a title.", severity: "blocking" });
    }
    if (tutorial && fields["year"] === undefined) {
      problems.push({
        message: "No `year:` in the front matter. Add the academic year, for example `year: \"2026-2027\"`; the site cannot build a tutorial without it.",
        severity: "blocking",
      });
    }
    const version = fields["version"];
    if (tutorial && version === undefined) {
      problems.push({
        message: "No `version:` in the front matter. Add one in the form year.month.day.number, for example `version: 2026.09.22.1`; the site cannot build a tutorial without it.",
        severity: "blocking",
      });
    } else if (version !== undefined && !isReleaseVersion(version)) {
      problems.push({
        message: `\`version: ${String(version)}\` is not in the form year.month.day.number, for example \`2026.09.22.1\`.` +
          (tutorial ? " The site cannot build a tutorial without a valid version." : " Releasing a new version counts on from it."),
        severity: tutorial ? "blocking" : "worth fixing",
      });
    }
    const status = fields["status"];
    if (tutorial && status !== undefined && !(TUTORIAL_STATUSES as readonly unknown[]).includes(status)) {
      problems.push({
        message: `\`status: ${String(status)}\` is not a status the site knows. Use ${TUTORIAL_STATUSES.map((each) => `\`${each}\``).join(", ")}.`,
        severity: "blocking",
      });
    }
    if (tutorial) {
      for (const [field, instead] of Object.entries(MOVED_FIELDS)) {
        if (field in fields) {
          problems.push({
            message: `\`${field}:\` no longer belongs in the front matter: ${instead}. Delete the line; the site will not build while it is there.`,
            severity: "blocking",
          });
        }
      }
    }
  }

  // One namespace. A cell, a site pane and a question are all keys into
  // the same saved-work record, so a page cannot hold two of anything
  // under one id.
  const seen = new Set<string>();
  const claim = (id: string | null, what: string, line: number): void => {
    if (!id) {
      problems.push({
        message: `A ${what} with no \`id:\`. Add an \`id:\` line at its top; without one, a reader's work in it cannot be saved.`,
        line,
        severity: "blocking",
      });
      return;
    }
    if (seen.has(id)) {
      problems.push({
        message: `Two blocks share the id \`${id}\`. Rename one; otherwise a reader's saved work in one overwrites the other.`,
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
        claim(pane.id, "web page pane", line);
        if (!pane.site) {
          problems.push({
            message: "A web page pane with no `site:` line. Add one naming its page; panes with the same `site:` become one editor.",
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

  if (images && path !== undefined) {
    for (const image of imagesIn(source)) {
      const at = assetPathFor(path, image.src);
      if (!images.has(at)) {
        problems.push({
          message: `The image \`${image.src}\`${image.alt ? ` ("${image.alt}")` : ""} is not a file beside this document. Check the name, or add the file.`,
          line: image.line,
          severity: "blocking",
        });
      }
    }
  }

  for (const link of brokenLinksIn("", source, knownIds)) {
    problems.push({
      message: `The link \`tutorial:${link.target}\`${link.text ? ` ("${link.text}")` : ""} names no tutorial in this workspace. Check the id.`,
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
  around: Omit<Around, "path">,
): Problem[] {
  return files
    .filter((file) => isPage(file.path, file.content))
    .flatMap((file) =>
      checkDocument(file.content, { ...around, path: file.path })
        .map((problem) => ({ ...problem, path: file.path })),
    )
    .sort((a, b) => (a.path ?? "").localeCompare(b.path ?? "") || (a.line ?? 0) - (b.line ?? 0));
}

/** A `question` fence's own rules, which are dewlab's: a type it knows,
 * something to answer, and — for multiple choice — options and a
 * `correct:` that names one of them. */
function checkQuestion(question: Question, line: number, problems: Problem[]): void {
  const blocking = (message: string) => problems.push({ message, line, severity: "blocking" as const });

  if (!question.type) {
    blocking("A question with no `type:` line. Add `type: multiple-choice` or `type: fill-in-the-blank`.");
  } else if (!(QUESTION_TYPES as readonly string[]).includes(question.type)) {
    blocking(`\`type: ${question.type}\` is not a question type the site knows. Use ${QUESTION_TYPES.map((type) => `\`${type}\``).join(" or ")}.`);
  }
  if (!question.text.trim()) {
    blocking("A question with no text. Write the question below its settings lines.");
    return;
  }

  if (question.type === "multiple-choice") {
    if (question.options.length < 2) {
      blocking("A multiple-choice question with fewer than two options. Add options as a bulleted list.");
    } else if (!question.prompt) {
      blocking("A multiple-choice question with no question above its options. Write it above the first bullet.");
    }
    const at = Number(question.correct);
    if (!question.correct) {
      blocking("A multiple-choice question with no `correct:` line, so answers cannot be marked. Add `correct:` with the number of the right option.");
    } else if (!/^\d+$/.test(question.correct) || at < 1 || at > question.options.length) {
      blocking(
        `\`correct: ${question.correct}\` names none of the ${question.options.length} options. ` +
          "Options are numbered from 1, in the order they are written.",
      );
    }
  }

  if (question.type === "fill-in-the-blank") {
    if (!gapsBalanced(question.text)) {
      blocking("A gap in this question opens with `{` and never closes. Add the missing `}`.");
    } else if (!hasGap(question.text)) {
      blocking("A fill-in-the-blank question with no gap. Put the answer in braces, like `{answer}`, where the blank should go.");
    }
  }
}

/** A `card` fence is a tile: somewhere to go, and something to read. */
function checkCard(card: Card, line: number, problems: Problem[]): void {
  if (!card.url) {
    problems.push({ message: "A card with no `url:` line, so clicking it goes nowhere. Add the address it should open.", line, severity: "blocking" });
  }
  if (!card.heading) {
    problems.push({
      message: "A card that does not start with a heading. Add one; it becomes the card's title.",
      line,
      severity: "blocking",
    });
  }
}

const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const HTML_IMAGE = /<img\b[^>]*\bsrc="([^"]+)"/g;

/** Inline code, blanked out, keeping the line's length so a position
 * still means something. A reference table's `` `<img src="…">` `` is a
 * row about HTML, not an image on the page. */
const INLINE_CODE = /(`+)(?:(?!\1)[\s\S])*?\1/g;

function withoutCode(line: string): string {
  return line.replace(INLINE_CODE, (span) => " ".repeat(span.length));
}

/** Every image a reader would see, with the line it is on.
 *
 * Prose only, and code spans within it blanked. An `<img
 * src="does-not-exist.jpg">` inside a fence is a tutorial teaching what
 * a broken image looks like, and dewlab has one; a check that read
 * fences or code spans would call it a fault. */
export function imagesIn(source: string): { src: string; alt: string; line: number }[] {
  const found: { src: string; alt: string; line: number }[] = [];
  let line = 1;
  for (const part of segments(source)) {
    if (part.kind === "prose") {
      const lines = part.text.split("\n");
      for (let at = 0; at < lines.length; at += 1) {
        const text = withoutCode(lines[at]!);
        for (const match of text.matchAll(MARKDOWN_IMAGE)) {
          if (isLocalAsset(match[2]!)) found.push({ src: match[2]!, alt: match[1] ?? "", line: line + at });
        }
        for (const match of text.matchAll(HTML_IMAGE)) {
          if (isLocalAsset(match[1]!)) found.push({ src: match[1]!, alt: "", line: line + at });
        }
      }
    }
    line += linesOf(part.text);
  }
  return found;
}
