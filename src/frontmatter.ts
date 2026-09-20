// Reading a document's leading `---` block, and nothing else.
//
// Nothing here writes. The front matter is a node in the document
// (editor.ts), held as the one opaque string it is, so key order and
// quoting survive a save without anyone protecting them. This is the
// read the index does.

import { load as parseYaml } from "js-yaml";

export interface FrontMatter {
  present: boolean;
  /** The text between the fences, exactly as written. */
  raw: string;
  fields: Record<string, unknown>;
}

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Never reformats. A document with no leading `---` fence, or one that
 * is never closed, has no front matter — an unclosed fence is a body's
 * problem to report, not something this guesses at. */
export function extractFrontMatter(source: string): FrontMatter {
  const match = FRONT_MATTER_RE.exec(source);
  if (!match) return { present: false, raw: "", fields: {} };
  const raw = match[1] ?? "";
  let fields: Record<string, unknown> = {};
  try {
    fields = (parseYaml(raw) as Record<string, unknown> | null) ?? {};
  } catch {
    // A file being edited passes through states where its YAML does not
    // parse. The index would rather have the path than throw.
    fields = {};
  }
  return { present: true, raw, fields };
}
