// Reading a document's leading `---` block, and nothing else.
//
// Nothing here writes. The front matter is a node in the document
// (editor.ts), held as the one opaque string it is, so key order and
// quoting survive a save without anyone protecting them. This is the
// read the index does, and the one question every reader of a file has
// to answer the same way: is that opening block front matter at all.

import { load as parseYaml } from "js-yaml";

export interface FrontMatter {
  present: boolean;
  /** The text between the fences, exactly as written. */
  raw: string;
  fields: Record<string, unknown>;
}

/** A byte-order mark is allowed in front: an editor on Windows writes
 * one, and every markdown reader skips it. */
const FRONT_MATTER_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

type Reading = { kind: "fields"; fields: Record<string, unknown> } | { kind: "unreadable" } | { kind: "prose" };

/** What a leading block's YAML turns out to be. A mapping is front
 * matter. YAML that does not parse is front matter being written: a
 * file passes through such states while someone edits it, and the index
 * would rather keep the path than throw. Anything else (a sentence, a
 * list, a date) is an ordinary file that opens with a rule, since no
 * tool that reads front matter can use it as fields. */
function read(raw: string): Reading {
  let value: unknown;
  try {
    value = parseYaml(raw);
  } catch {
    return { kind: "unreadable" };
  }
  if (value === null || value === undefined) return { kind: "fields", fields: {} };
  if (Object.prototype.toString.call(value) === "[object Object]") {
    return { kind: "fields", fields: value as Record<string, unknown> };
  }
  return { kind: "prose" };
}

/** Never reformats. A document with no leading `---` fence, or one that
 * is never closed, has no front matter — an unclosed fence is a body's
 * problem to report, not something this guesses at. Nor does one whose
 * block is prose between two rules. */
export function extractFrontMatter(source: string): FrontMatter {
  const match = FRONT_MATTER_RE.exec(source);
  if (!match) return { present: false, raw: "", fields: {} };
  const raw = match[1] ?? "";
  const reading = read(raw);
  if (reading.kind === "prose") return { present: false, raw: "", fields: {} };
  return { present: true, raw, fields: reading.kind === "fields" ? reading.fields : {} };
}

/** The file with its front matter taken off, or the file as it is when
 * it has none. */
export function bodyOf(source: string): string {
  const match = FRONT_MATTER_RE.exec(source);
  if (!match || read(match[1] ?? "").kind === "prose") return source;
  return source.slice(match[0].length);
}

/** `source`, ready for a parser that treats any `---` block at the very
 * first byte as front matter, which remark-frontmatter does. When the
 * block is prose between two rules, a blank line in front stops that
 * reading, and the file parses as CommonMark says it should: a rule,
 * the text, a rule. Without it the text is hidden in a front-matter
 * node, under a Title field with nothing in it.
 *
 * Only the reading changes. Markdown ignores a leading blank line, and
 * the editor never writes one, so a save puts the file back as it was. */
export function readableAsMarkdown(source: string): string {
  const match = FRONT_MATTER_RE.exec(source);
  if (!match || read(match[1] ?? "").kind !== "prose") return source;
  return `\n${source.replace(/^\uFEFF/, "")}`;
}
