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

// ── site and app panes ─────────────────────────────────────────────────

const PANE_LANGUAGES = new Set(["html", "css", "js"]);

/** A site pane is one language of a live web page in a sandbox; an app
 * pane is one language of a page whose script reads the page's own
 * database (dewlab's `SitePane` and `AppPane`). The same shape, keyed by
 * a different header word. */
export type PaneKind = "site" | "app";

export interface SitePane {
  id: string | null;
  /** The editor this pane belongs to: its `site:` or `app:` line.
   * Consecutive panes naming the same one become one editor with a tab
   * per language. */
  site: string | null;
  language: string;
}

/** `html site`, `css app` and the like, as `kind` says, and nothing else. */
export function paneIn(kind: PaneKind, info: string, body: string): SitePane | null {
  const words = infoWords(info);
  if (words.length < 2 || words[1] !== kind || !PANE_LANGUAGES.has(words[0]!.toLowerCase())) {
    return null;
  }
  const { header } = splitHeader(body, ["id", kind]);
  return {
    id: header.get("id") ?? null,
    site: header.get(kind) ?? null,
    language: words[0]!.toLowerCase(),
  };
}

export const sitePaneIn = (info: string, body: string) => paneIn("site", info, body);
export const appPaneIn = (info: string, body: string) => paneIn("app", info, body);

/** One live editor: consecutive panes naming the same site or app, in
 * the order they are written. `at` is each pane's place in the list of
 * blocks it was found in. */
export interface SiteGroup {
  site: string;
  panes: { at: number; language: string; code: string }[];
}

/** The editors of `kind` among a document's top-level blocks, grouped
 * the way dewlab's build groups them: panes naming the same one, with
 * nothing but other such panes between them. A block that is not a pane
 * is `null`, and ends any group running up to it. A pane with no name
 * belongs to no editor (the checker reports it). */
export function paneGroups(kind: PaneKind, blocks: readonly ({ info: string; body: string } | null)[]): SiteGroup[] {
  const groups: SiteGroup[] = [];
  let current: SiteGroup | null = null;
  blocks.forEach((block, at) => {
    const pane = block ? paneIn(kind, block.info, block.body) : null;
    if (!pane?.site) {
      current = null;
      return;
    }
    const code = splitHeader(block!.body, ["id", kind]).rest;
    if (current && current.site === pane.site) {
      current.panes.push({ at, language: pane.language, code });
    } else {
      current = { site: pane.site, panes: [{ at, language: pane.language, code }] };
      groups.push(current);
    }
  });
  return groups;
}

export const siteGroups = (blocks: readonly ({ info: string; body: string } | null)[]) => paneGroups("site", blocks);

function codeOf(group: SiteGroup, language: string): string {
  return group.panes.filter((pane) => pane.language === language).map((pane) => pane.code).join("\n");
}

/** A `</script>` inside JavaScript would close the tag early. */
const scriptSafe = (js: string) => js.replace(/<\/script/gi, "<\\/script");

/** The page a site editor previews, put together the way dewlab's
 * site-relay.js does: the CSS in the head, the HTML as the body, the
 * JavaScript last. */
export function sitePage(group: SiteGroup): string {
  const script = scriptSafe(codeOf(group, "js"));
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${codeOf(group, "css")}</style></head>` +
    `<body>${codeOf(group, "html")}${script ? `<script>${script}</script>` : ""}</body></html>`
  );
}

/** What an app page's script has instead of dewlab's page: `dlQuery`,
 * which asks the editor holding the frame to run a query against the
 * page's database and answers with its rows, and a place to see an
 * error, since there is no console to read. */
const APP_BRIDGE = `
const dnPending = new Map();
let dnNext = 0;
function dlQuery(sql, params) {
  return new Promise((resolve, reject) => {
    const id = ++dnNext;
    dnPending.set(id, { resolve, reject });
    parent.postMessage({ type: "dn-app-query", id, sql: String(sql), params: params ?? [] }, "*");
  });
}
addEventListener("message", (event) => {
  const answer = event.data;
  if (!answer || answer.type !== "dn-app-answer") return;
  const waiting = dnPending.get(answer.id);
  if (!waiting) return;
  dnPending.delete(answer.id);
  if (answer.error) waiting.reject(new Error(answer.error));
  else waiting.resolve(answer.rows);
});
function dnShowError(error) {
  const box = document.createElement("pre");
  box.className = "dn-app-error";
  box.style.cssText = "color:#b3461a;white-space:pre-wrap;font:13px monospace;margin:8px 0 0";
  box.textContent = String(error && error.message ? error.message : error);
  document.body.appendChild(box);
}
addEventListener("error", (event) => dnShowError(event.error ?? event.message));
addEventListener("unhandledrejection", (event) => dnShowError(event.reason));
`;

/** The page an app editor previews: dewlab renders its HTML into a
 * root element, scopes its CSS to it, and on Run calls the JavaScript
 * with that root and `dlQuery`. Here the frame is the scope. Without
 * `run`, the JavaScript is left out, as dewlab leaves it until Run. */
export function appPage(group: SiteGroup, run: boolean): string {
  const js = scriptSafe(codeOf(group, "js"));
  const call = run && js
    ? `<script>(async function (root, dlQuery) {\n${js}\n})(document.getElementById("dn-app-root"), dlQuery).catch(dnShowError);</script>`
    : "";
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${codeOf(group, "css")}</style></head>` +
    `<body><div id="dn-app-root">${codeOf(group, "html")}</div><script>${APP_BRIDGE}</script>${call}</body></html>`
  );
}

// ── staged hints ───────────────────────────────────────────────────────

/** What a ```` ```hint ```` fence's `after:` line may name, and the
 * runtime's own key for each: dewlab's `TRIGGER_KEYS`. */
const TRIGGER_KEYS: Record<string, string> = {
  "errors": "errors", "error": "errors",
  "identical errors": "same-errors", "identical error": "same-errors",
  "same errors": "same-errors", "same error": "same-errors",
  "same-error": "same-errors", "same-errors": "same-errors",
  "identical-errors": "same-errors",
  "unchanged runs": "unchanged", "unchanged run": "unchanged", "unchanged": "unchanged",
  "runs": "runs", "run": "runs",
  "failed checks": "check-fails", "failed check": "check-fails",
  "check-fails": "check-fails", "failed-checks": "check-fails",
  "empty results": "empty-results", "empty result": "empty-results",
  "empty-results": "empty-results", "empty-result": "empty-results",
  "minutes": "minutes", "minute": "minutes",
};

/** Each runtime key as a reader would say it, one and many. */
const TRIGGER_WORDS: Record<string, [string, string]> = {
  "errors": ["error", "errors"],
  "same-errors": ["identical error", "identical errors"],
  "unchanged": ["unchanged run", "unchanged runs"],
  "runs": ["run", "runs"],
  "check-fails": ["failed check", "failed checks"],
  "empty-results": ["empty result", "empty results"],
  "minutes": ["minute", "minutes"],
};

const TRIGGER_TERM_RE = /^(?:(\d+)\s+([a-z][a-z -]*[a-z])|([a-z][a-z-]*)\s*:\s*(\d+))$/;

export const DEFAULT_HINT_AFTER = "errors:5";
export const DEFAULT_HINT_TITLE = "Let\u2019s slow down a moment\u2026";

export interface TriggerTerm {
  key: string;
  count: number;
}

/** An `after:` line read the way dewlab's `parse_trigger()` reads it:
 * `5 errors`, `3 identical errors and 2 minutes` and `errors:5,
 * minutes:2` all parse. A term it cannot read is the build's refusal,
 * in the build's words. */
export function parseTrigger(text: string): TriggerTerm[] | { error: string } {
  const terms: TriggerTerm[] = [];
  for (const raw of text.trim().toLowerCase().split(/\s*(?:,|\band\b|&)\s*/)) {
    if (!raw) continue;
    const match = TRIGGER_TERM_RE.exec(raw);
    if (!match) return { error: `\`${raw}\` cannot be read. Write it like \`5 errors\` or \`errors:5\`.` };
    const key = (match[2] ?? match[3])!.trim();
    const count = Number(match[1] ?? match[4]);
    const canonical = TRIGGER_KEYS[key];
    if (!canonical) {
      return {
        error: `\`${key}\` is not something a hint can wait for. Use errors, identical errors, unchanged runs, runs, failed checks, empty results or minutes.`,
      };
    }
    if (count < 1) return { error: `A hint waits for at least 1 of something, not ${count}.` };
    terms.push({ key: canonical, count });
  }
  if (terms.length === 0) return { error: "The `after:` line is empty." };
  return terms;
}

/** "after 3 errors and 2 minutes": the terms as a reader would say them.
 * The runtime shows the hint once every one of them is reached
 * (`triggerHolds()` in dewlab's tutorial-runtime.js); minutes count from
 * the cell's first run. */
export function describeTrigger(terms: readonly TriggerTerm[]): string {
  const said = terms.map(({ key, count }) => {
    const [one, many] = TRIGGER_WORDS[key] ?? [key, key];
    return `${count} ${count === 1 ? one : many}`;
  });
  return `after ${said.length > 1 ? `${said.slice(0, -1).join(", ")} and ${said.at(-1)}` : said[0]}`;
}

export interface StagedHint {
  /** The cell it belongs to, when `for:` names one; otherwise the exec
   * cell above it, which the caller knows and this does not. */
  cell: string | null;
  after: string;
  title: string;
  /** The hint's own markdown. */
  text: string;
}

/** A ```` ```hint ```` fence: `for:`, `after:` and `title:` lines, then
 * the hint's markdown (dewlab's `parse_hint()`). */
export function hintIn(info: string, body: string): StagedHint | null {
  if (infoWords(info)[0] !== "hint") return null;
  const { header, rest } = splitHeader(body, ["for", "after", "title"]);
  return {
    cell: header.get("for") || null,
    after: header.get("after") || DEFAULT_HINT_AFTER,
    title: header.get("title") || DEFAULT_HINT_TITLE,
    text: rest,
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
  status: string | null;
  meta: string | null;
  /** `wide: true` (or `yes`): the card spans the grid. */
  wide: boolean;
  /** The markdown under the heading. */
  text: string;
}

/** A `card` fence: `url:`, `status:`, `meta:` and `wide:` header lines,
 * then a markdown heading and, optionally, a line or two under it
 * (dewlab's `parse_card()`). */
export function cardIn(info: string, body: string): Card | null {
  if (infoWords(info)[0] !== "card") return null;
  const { header, rest } = splitHeader(body, ["url", "status", "meta", "wide"]);
  const lines = rest.split("\n");
  const heading = /^#{1,6}\s*(.+?)\s*#*$/.exec(lines[0] ?? "");
  return {
    url: header.get("url") ?? null,
    heading: heading ? heading[1]! : null,
    status: header.get("status") || null,
    meta: header.get("meta") || null,
    wide: /^(true|yes)$/i.test(header.get("wide") ?? ""),
    text: (heading ? lines.slice(1) : lines).join("\n").trim(),
  };
}

// ── generated blocks ──────────────────────────────────────────────────

/** What dewlab's `GENERATED_BLOCKS` puts in place of each `[[name]]` line
 * on a hand-written page. */
export const GENERATED_BLOCKS: Record<string, string> = {
  "search-box": "The site-wide search box",
  "course-cards": "A card for each course, in the order courses/index.yaml gives",
};

/** A paragraph that is only `[[name]]`: dewlab's `GENERATED_BLOCK_RE`. */
export function generatedBlockIn(text: string): { name: string; description: string | null } | null {
  const match = /^\[\[([a-z-]+)\]\]\s*$/.exec(text.trim());
  if (!match) return null;
  return { name: match[1]!, description: GENERATED_BLOCKS[match[1]!] ?? null };
}

/** What a line of raw HTML is, as a fold: the opening of a
 * `<details>`, with its kind (from dewlab's class) and summary, or its
 * close. dewlab writes a fold as `<details class="dl-hint"><summary>…</summary>`
 * on one line and `</details>` on another, with ordinary markdown
 * between, which is how the editor holds it: two inline HTML atoms and
 * the blocks between them.
 *
 * A hand-written page's section wrappers have the same shape (dewlab's
 * `MARKDOWN_WRAPPER_RE`): `<div class="dl-hero">` on its own line, the
 * markdown the build converts, then `</div>`. They are read here too,
 * each with the tag that closes it, so a wrapper's `</div>` never ends a
 * hint. */
export type FoldLine =
  | { kind: "open"; label: string; summary: string; tag: string; wrapper: boolean }
  | { kind: "close"; tag: string };

const FOLD_LABELS: Record<string, string> = { "dl-hint": "Hint", "dl-answer": "Answer" };

const WRAPPER_LABELS: Record<string, string> = {
  "div dl-hero": "Hero",
  "div dl-audience": "Audience",
  "div dl-attribution": "Attribution",
  "ul dl-feature-list": "Feature list",
};

export function foldLine(html: string): FoldLine | null {
  const text = html.trim();
  const close = /^<\/(details|div|ul)>$/i.exec(text);
  if (close) return { kind: "close", tag: close[1]!.toLowerCase() };
  const wrapper = /^<(div|ul) class="([^"]+)">$/i.exec(text);
  if (wrapper) {
    const label = WRAPPER_LABELS[`${wrapper[1]!.toLowerCase()} ${wrapper[2]}`];
    return label ? { kind: "open", label, summary: "", tag: wrapper[1]!.toLowerCase(), wrapper: true } : null;
  }
  const open = /^<details\b([^>]*)>\s*<summary>([\s\S]*?)<\/summary>$/i.exec(text);
  if (!open) return null;
  const classes = /\bclass="([^"]*)"/.exec(open[1]!)?.[1]?.split(/\s+/) ?? [];
  const known = classes.map((name) => FOLD_LABELS[name]).find(Boolean);
  return { kind: "open", label: known ?? "Fold", summary: open[2]!.trim(), tag: "details", wrapper: false };
}
