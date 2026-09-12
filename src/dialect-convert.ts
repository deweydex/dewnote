// Step 6's third slice — plan §5.8's "conversion between dialects is a
// mapping in the dialect modules... applied block by block, with a
// report of what did not map," and DIALECTS.md §5's own table, followed
// directly rather than re-derived: dewlab `python exec` with `id: x`
// becomes dewstack `py cell=x` (a hint has no home there, reported);
// dewstack `py cell=x` becomes dewlab `python exec`; dewstack's other
// four fence forms (`sql`, `sql-check`, `site=`, `app=`) have no dewlab
// equivalent and become illustrative fences, reported; either dialect
// dropped to plain markdown keeps the language and drops the attribute.
//
// Unlike blocks.ts's own round trip, or jupyter.ts's notebook import,
// this is not lossless by design — DIALECTS.md §5 names exactly what
// does not survive (a hint, a SQL cell's whole runtime) and asks for a
// report instead of silent data loss. Front matter is re-dumped through
// js-yaml rather than edited byte-for-byte in place, a real, deliberate
// exception to frontmatter.ts's own "never reformat" rule: converting a
// document's dialect already changes what fields exist, so key order and
// quoting were never going to survive regardless.

import { load as parseYaml, dump as dumpYaml } from "js-yaml";
import { parseDocument, type Block } from "./blocks.ts";
import { isRunnableFence, parseCellSource, parseSqlCellInfo } from "./cell.ts";
import type { DialectName } from "./dialect.ts";

export interface ConversionResult {
  markdown: string;
  /** One line per block whose meaning didn't survive the conversion —
   * a dropped hint, an illustrative fallback, a front-matter field this
   * dialect has no room for. Empty for a lossless conversion. */
  report: string[];
}

const PY_CELL_RE = /^py\s+cell=([a-z0-9-]+)\s*$/;

/** The same "everything between the fence lines" extraction cell.ts's
 * own sqlScriptFromFenceText and jupyter.ts's fenceBodyVerbatim both
 * are — reimplemented locally again rather than threading an import
 * through for a four-line function with no state of its own. */
function fenceBody(fenceText: string): string {
  const lines = fenceText.split("\n");
  let end = lines.length - 1;
  while (end > 0 && lines[end] === "") end--;
  return lines.slice(1, end).join("\n");
}

function fence(backticks: string, info: string, body: string): string {
  return `${backticks}${info}\n${body}\n${backticks}\n`;
}

function convertFence(block: Block, from: DialectName, to: DialectName, report: string[]): string {
  const info = block.fence?.info ?? "";
  const backticks = "`".repeat(block.fence?.length ?? 3);

  if (from === "dewlab" && to === "dewstack") {
    if (!isRunnableFence(info)) return block.text;
    const { id, hint, expect, name, code } = parseCellSource(block);
    const cellName = id ?? "cell";
    if (hint) report.push(`"${cellName}": hint: has no home in dewstack — dropped ("${hint}")`);
    if (expect) report.push(`"${cellName}": expect: has no home in dewstack — dropped ("${expect}")`);
    if (name) report.push(`"${cellName}": name: has no home in dewstack — dropped ("${name}")`);
    return fence(backticks, `py cell=${cellName}`, code);
  }

  if (from === "dewstack" && to === "dewlab") {
    const pyCell = PY_CELL_RE.exec(info.trim());
    if (pyCell) return fence(backticks, "python exec", `id: ${pyCell[1]}\n${fenceBody(block.text)}`);
    const isOtherDewstackCell = parseSqlCellInfo(info) !== null || /^sql-check\b/.test(info) || /\b(?:site|app)=/.test(info);
    if (isOtherDewstackCell) {
      report.push(`fence "${info}": no dewlab equivalent — kept as illustrative code`);
      const language = info.split(/\s+/)[0] || "text";
      return fence(backticks, language, fenceBody(block.text));
    }
    return block.text;
  }

  if (to === "plain" && info.trim() !== "") {
    const language = info.split(/\s+/)[0] || "";
    if (language === info.trim()) return block.text;
    report.push(`fence "${info}": attributes dropped for plain markdown, language kept`);
    return fence(backticks, language, fenceBody(block.text));
  }

  return block.text;
}

const DEWLAB_ONLY_FIELDS = ["year", "covers", "practice_for", "practice_across"];

function convertFrontMatter(block: Block, from: DialectName, to: DialectName, report: string[]): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(block.text);
  if (!match) return block.text;
  const fields = (parseYaml(match[1] ?? "") as Record<string, unknown> | null) ?? {};
  const next: Record<string, unknown> = { ...fields };

  if (from === "dewlab" && to === "dewstack") {
    for (const key of DEWLAB_ONLY_FIELDS) delete next[key];
  } else if (from === "dewstack" && to === "dewlab") {
    if (!("year" in next)) {
      next.year = "";
      report.push('front matter: dewlab requires "year" — left blank, fill in before using this document');
    }
    if (!("covers" in next)) next.covers = {};
  } else {
    // Plain markdown keeps arbitrary keys (DIALECTS.md §3), and neither
    // direction into it is named in §5's table as dropping anything from
    // front matter specifically — only fence attributes.
    return block.text;
  }

  const yaml = dumpYaml(next, { lineWidth: -1 }).trimEnd();
  return `---\n${yaml}\n---\n`;
}

/**
 * Converts one document from `from`'s dialect to `to`'s, block by block,
 * per DIALECTS.md §5's own table. `from === to` returns the source
 * unchanged with an empty report — this is a real conversion, not a
 * dialect-detection pass, so the caller is expected to already know
 * which dialect the document is actually written in (`detectDialect`
 * alone cannot tell "dewlab" from "plain markdown that happens to lack
 * `year`," for instance).
 */
export function convertDialect(source: string, from: DialectName, to: DialectName): ConversionResult {
  if (from === to) return { markdown: source, report: [] };
  const doc = parseDocument(source);
  const report: string[] = [];
  const markdown = doc.blocks
    .map((block) => {
      if (block.kind === "frontmatter") return convertFrontMatter(block, from, to, report);
      if (block.kind === "fence") return convertFence(block, from, to, report);
      return block.text;
    })
    .join("");
  return { markdown, report };
}
