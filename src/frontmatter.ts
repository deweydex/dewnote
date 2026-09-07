// Front matter is read for the form fields the editor shows, but never
// re-dumped: a tutorial's front matter is only ever touched byte-for-byte
// (extractFrontMatter) unless a field is actually edited, so key order and
// quoting (writing-content's quoted ISO-8601 timestamps, for instance)
// survive a save that changed nothing up here. See DECISIONS.md 1 and the
// plan's section 5.2.

import { load as parseYaml } from "js-yaml";

export interface FrontMatter {
  /** True if the document opens with a `---` front matter block at all. */
  present: boolean;
  /** The raw text between the fences, exactly as written (no fences). */
  raw: string;
  /** Parsed fields, for the form UI. Empty if `present` is false. */
  fields: Record<string, unknown>;
  /** Byte offset in the source where the body starts (0 if `present` is false). */
  bodyStart: number;
  /** The exact text of the front matter block including both `---` fences and
   * the trailing newline, so `source.slice(0, bodyStart) === fenceText`. */
  fenceText: string;
}

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Split a document's leading `---`-fenced front matter from its body.
 * Only ever reads; never reformats. A document with no leading `---`
 * fence (or one not closed) has no front matter, by design — an
 * unclosed fence is a body's problem to report, not something this
 * function guesses at.
 */
export function extractFrontMatter(source: string): FrontMatter {
  const match = FRONT_MATTER_RE.exec(source);
  if (!match) {
    return { present: false, raw: "", fields: {}, bodyStart: 0, fenceText: "" };
  }
  const fenceText = match[0];
  const raw = match[1] ?? "";
  const fields = (parseYaml(raw) as Record<string, unknown> | null) ?? {};
  return { present: true, raw, fields, bodyStart: fenceText.length, fenceText };
}
