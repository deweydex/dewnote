// Which dialect a document is written in, decided from its front matter
// alone. See planning/DIALECTS.md for the full inventory this follows;
// this module is deliberately the only place that inventory turns into
// code, per DECISIONS.md 3 (a dialect is data, not a code path spread
// through the editor).

import type { FrontMatter } from "./frontmatter.ts";

export type DialectName = "dewlab" | "dewstack" | "plain";

/**
 * dewlab requires `year`; dewstack requires `module_title` but never
 * `year`. A document with neither (or no front matter at all) is treated
 * as plain markdown — the safe default, since plain markdown is a strict
 * subset of what either site's dialect can hold.
 */
export function detectDialect(frontMatter: FrontMatter): DialectName {
  if (!frontMatter.present) return "plain";
  const { fields } = frontMatter;
  if (typeof fields["year"] !== "undefined") return "dewlab";
  if (typeof fields["module_title"] !== "undefined") return "dewstack";
  return "plain";
}
