// nbformat 4.5, in and out.
//
// Lossless by keeping, not by reconstructing. Every cell carries the
// exact text it came from under `metadata.dewnote.raw`, and import plays
// that back verbatim — so a document that goes out to Jupyter and comes
// back is the same bytes, whatever was unusual about it. A notebook
// written in Jupyter itself has no such metadata and is rebuilt from the
// cells, which is the best anyone can do.
//
// dewlab's `exec` convention is the only one read here: a fence marked
// `exec` becomes a code cell, and every other fence becomes one too but
// is never claimed to be runnable.

export type CellType = "markdown" | "code" | "raw";

export interface DewnoteCellMeta {
  /** The segment's exact original text. Jupyter ignores metadata keys it
   * does not recognise, so a reader never sees this. */
  raw: string;
  kind: Segment["kind"];
  info?: string;
}

export interface NotebookCell {
  cell_type: CellType;
  id: string;
  metadata: { dewnote: DewnoteCellMeta } & Record<string, unknown>;
  /** nbformat allows a string or an array of lines. This writes a
   * string and accepts either, since a notebook from Jupyter is as
   * likely to use the array form. */
  source: string | string[];
  execution_count?: null;
  outputs?: unknown[];
}

export interface Notebook {
  nbformat: 4;
  nbformat_minor: 5;
  metadata: Record<string, unknown>;
  cells: NotebookCell[];
}

export interface Segment {
  kind: "frontmatter" | "prose" | "fence";
  /** Exact, including its trailing newline. Concatenating every
   * segment's text reproduces the document. */
  text: string;
  /** A fence's info string, for deciding what it is. */
  info?: string;
}

const FENCE_OPEN = /^(```|~~~)(.*)$/;
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** Every line with its own newline still attached, so joining them is
 * the identity. */
function linesWithBreaks(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

/** Split a document into front matter, prose runs and fences, keeping
 * every byte: `joinSegments(segments(x)) === x` for any `x`. That is the
 * whole of the document model a notebook needs, and the editor's own
 * ProseMirror tree cannot supply it — a tree does not know what the
 * bytes were. */
export function segments(source: string): Segment[] {
  const out: Segment[] = [];
  let rest = source;

  const front = FRONT_MATTER.exec(rest);
  if (front) {
    out.push({ kind: "frontmatter", text: front[0] });
    rest = rest.slice(front[0].length);
  }

  const lines = linesWithBreaks(rest);
  let prose: string[] = [];

  /** A run of blank lines is nobody's content; it belongs to whatever
   * came before, so a notebook does not gain an empty cell for it. */
  const flushProse = () => {
    if (prose.length === 0) return;
    const text = prose.join("");
    prose = [];
    if (text.trim() === "" && out.length > 0) out[out.length - 1]!.text += text;
    else out.push({ kind: "prose", text });
  };

  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at]!;
    const open = FENCE_OPEN.exec(line.replace(/\n$/, ""));
    if (!open) {
      prose.push(line);
      continue;
    }
    flushProse();
    const marker = open[1]!;
    const fence = [line];
    at += 1;
    while (at < lines.length && !lines[at]!.startsWith(marker)) {
      fence.push(lines[at]!);
      at += 1;
    }
    if (at < lines.length) fence.push(lines[at]!);
    out.push({ kind: "fence", text: fence.join(""), info: open[2]!.trim() });
  }
  flushProse();
  return out;
}

/** Concatenation is the inverse of `segments`. */
export function joinSegments(parts: readonly Segment[]): string {
  return parts.map((part) => part.text).join("");
}

const HEADER_LINE = /^\s*(id|hint|expect|name)\s*:/;

/** A fence's body with its dewlab header lines left in: a reader opening
 * the notebook should see what the cell says, and the header lines are
 * part of that. */
export function fenceBody(text: string): string {
  // Everything between the opening line and the closing fence. The
  // closing line is found, not assumed to be second from the end: a
  // fence at the end of a file with no final newline has no empty line
  // after it, and an unclosed one has no closing line at all.
  const lines = text.replace(/\n$/, "").split("\n").slice(1);
  if (lines.length > 0 && /^ {0,3}(`{3,}|~{3,})\s*$/.test(lines.at(-1)!)) lines.pop();
  return lines.join("\n");
}

function isExec(info: string): boolean {
  return info.split(/\s+/).includes("exec");
}

function idFor(part: Segment, at: number): string {
  if (part.kind === "fence") {
    const named = part.text.split("\n").find((line) => HEADER_LINE.test(line) && line.trim().startsWith("id:"));
    const id = named?.split(":")[1]?.trim();
    if (id) return id;
  }
  return `dewnote-${at}`;
}

export function toNotebook(source: string): Notebook {
  const cells = segments(source).map((part, at): NotebookCell => {
    const metadata = {
      dewnote: {
        raw: part.text,
        kind: part.kind,
        ...(part.info ? { info: part.info } : {}),
      },
    };
    if (part.kind === "fence") {
      return {
        cell_type: "code",
        id: idFor(part, at),
        metadata: isExec(part.info ?? "") ? metadata : { ...metadata, dewnote_illustrative: true },
        source: fenceBody(part.text),
        execution_count: null,
        outputs: [],
      };
    }
    return {
      cell_type: part.kind === "frontmatter" ? "raw" : "markdown",
      id: idFor(part, at),
      metadata,
      source: part.text.replace(/\n$/, ""),
    };
  });

  return { nbformat: 4, nbformat_minor: 5, metadata: {}, cells };
}

function sourceOf(cell: NotebookCell): string {
  return Array.isArray(cell.source) ? cell.source.join("") : cell.source;
}

/** What `toNotebook` put in a cell's source for this segment text. */
function sourceFor(raw: string, kind: string | undefined): string {
  return kind === "fence" ? fenceBody(raw) : raw.replace(/\n$/, "");
}

export function fromNotebook(notebook: Notebook): string {
  return notebook.cells
    .map((cell) => {
      const text = sourceOf(cell);
      const kept = cell.metadata?.dewnote?.raw;
      // The exact text a cell came from, byte for byte, as long as the
      // cell still says what it said. Edited in Jupyter, it is rebuilt
      // from what it says now: the edit is the point of the round trip.
      if (typeof kept === "string" && sourceFor(kept, cell.metadata?.dewnote?.kind) === text) return kept;
      if (cell.cell_type === "code") {
        const info = cell.metadata?.dewnote?.info ?? "python";
        return `\`\`\`${info}\n${text}\n\`\`\`\n\n`;
      }
      if (cell.cell_type === "raw" && cell.metadata?.dewnote?.kind === "frontmatter") return `${text}\n\n`;
      // A blank line after, so two text cells stay two paragraphs.
      return `${text}\n\n`;
    })
    .join("");
}
