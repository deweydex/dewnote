// dewlab's fences that are not runnable code.
//
// A `question` fence is an exercise the page marks. A `card` fence is a
// clickable tile on a hand-written page. An `html site`/`css site`/`js
// site` fence is one language of a live editor. None of them runs
// Python, and each opens with the same `key: value` header lines a
// runnable cell opens with.
//
// Parsing only. What counts as a fault lives in `checks.ts`.

/** The header lines at the top of a fence, and everything after them.
 *
 * Reading stops at the first line that is not a header line, and at a
 * key already read — the build stops there too, so a question whose
 * prose opens `type: the kind of thing that…` keeps its prose. */
export function splitHeader(body: string, keys: readonly string[]): {
  header: Map<string, string>;
  rest: string;
} {
  const allowed = new Set(keys);
  const lines = body.split("\n");
  const header = new Map<string, string>();
  let at = 0;
  for (; at < lines.length; at += 1) {
    const match = /^\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(lines[at]!);
    if (!match || !allowed.has(match[1]!) || header.has(match[1]!)) break;
    header.set(match[1]!, match[2]!.trim());
  }
  return { header, rest: lines.slice(at).join("\n").replace(/^\n+|\n+$/g, "") };
}

/** A fence's language and the words after it. */
export function infoWords(info: string): string[] {
  return info.trim().split(/\s+/).filter(Boolean);
}

// ── site panes ─────────────────────────────────────────────────────────

const SITE_LANGUAGES = new Set(["html", "css", "js"]);

export interface SitePane {
  id: string | null;
  /** The editor this pane belongs to. Consecutive panes naming the same
   * site become one editor with a tab per language. */
  site: string | null;
  language: string;
}

/** `html site`, `css site`, `js site` — and nothing else. */
export function sitePaneIn(info: string, body: string): SitePane | null {
  const words = infoWords(info);
  if (words.length < 2 || words[1] !== "site" || !SITE_LANGUAGES.has(words[0]!.toLowerCase())) {
    return null;
  }
  const { header } = splitHeader(body, ["id", "site"]);
  return {
    id: header.get("id") ?? null,
    site: header.get("site") ?? null,
    language: words[0]!.toLowerCase(),
  };
}

// ── questions ──────────────────────────────────────────────────────────

export const QUESTION_TYPES = ["multiple-choice", "fill-in-the-blank"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface Question {
  id: string | null;
  /** As written, so a report can quote a type the build would refuse. */
  type: string | null;
  /** As written, for the same reason. */
  correct: string | null;
  /** The prose above the first bullet, which is the question itself. */
  prompt: string;
  /** One per bullet line, in source order. */
  options: string[];
  /** Header lines stripped: the prompt and its options together, or the
   * sentence with its gaps. */
  text: string;
}

/** `- an option`, `* an option`, `+ an option` — the three markers
 * dewlab's own markdown accepts. */
const OPTION_LINE = /^[ \t]*[-*+]\s+(.*\S)\s*$/;

/** A `question` fence. The prose before the first bullet is the
 * question; every bullet from there on is an option, whatever sits
 * between them. */
export function questionIn(info: string, body: string): Question | null {
  if (infoWords(info)[0] !== "question") return null;
  const { header, rest } = splitHeader(body, ["id", "type", "correct"]);
  const lines = rest.split("\n");
  const firstOption = lines.findIndex((line) => OPTION_LINE.test(line));
  const at = firstOption === -1 ? lines.length : firstOption;
  return {
    id: header.get("id") ?? null,
    type: header.get("type") ?? null,
    correct: header.get("correct") ?? null,
    prompt: lines.slice(0, at).join("\n").trim(),
    options: lines.slice(at).flatMap((line) => {
      const match = OPTION_LINE.exec(line);
      return match ? [match[1]!] : [];
    }),
    text: rest,
  };
}

/** Every `{…}` gap in a fill-in-the-blank question. Gaps are one flat
 * level, so a depth counter says whether they all close. */
export function gapsBalanced(text: string): boolean {
  let depth = 0;
  for (const character of text) {
    if (character === "{") depth += 1;
    else if (character === "}") {
      if (depth === 0) return false;
      depth -= 1;
    }
  }
  return depth === 0;
}

export function hasGap(text: string): boolean {
  return /\{[^{}]*\}/.test(text);
}

// ── cards ──────────────────────────────────────────────────────────────

export interface Card {
  url: string | null;
  /** The markdown heading the body has to open with. */
  heading: string | null;
}

/** A `card` fence: `url:`, `status:`, `meta:` and `wide:` header lines,
 * then a markdown heading and, optionally, a line or two under it. */
export function cardIn(info: string, body: string): Card | null {
  if (infoWords(info)[0] !== "card") return null;
  const { header, rest } = splitHeader(body, ["url", "status", "meta", "wide"]);
  const heading = /^#{1,6}\s*(.+?)\s*#*$/.exec(rest.split("\n")[0] ?? "");
  return {
    url: header.get("url") ?? null,
    heading: heading ? heading[1]! : null,
  };
}

/** What a line of raw HTML is, as a fold: the opening of a
 * `<details>`, with its kind (from dewlab's class) and summary, or its
 * close. dewlab writes a fold as `<details class="dl-hint"><summary>…</summary>`
 * on one line and `</details>` on another, with ordinary markdown
 * between, which is how the editor holds it: two inline HTML atoms and
 * the blocks between them. */
export type FoldLine =
  | { kind: "open"; label: string; summary: string }
  | { kind: "close" };

const FOLD_LABELS: Record<string, string> = { "dl-hint": "Hint", "dl-answer": "Answer" };

export function foldLine(html: string): FoldLine | null {
  const text = html.trim();
  if (/^<\/details>$/i.test(text)) return { kind: "close" };
  const open = /^<details\b([^>]*)>\s*<summary>([\s\S]*?)<\/summary>$/i.exec(text);
  if (!open) return null;
  const classes = /\bclass="([^"]*)"/.exec(open[1]!)?.[1]?.split(/\s+/) ?? [];
  const known = classes.map((name) => FOLD_LABELS[name]).find(Boolean);
  return { kind: "open", label: known ?? "Fold", summary: open[2]!.trim() };
}
