// Reading a document dewnote has not opened.
//
// The palette previews files the editor is not holding — it has their
// text and nothing else — so it needs a heading and a first sentence out
// of plain markdown. The only question that needs answering is which
// parts of the text are prose, and that is a fence scanner.

const FENCE_RE = /^(?:```|~~~)/;
const FRONT_MATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** Every run of prose in `source`, in order, with front matter and the
 * inside of every fence left out. A `#` inside a fence is a comment or a
 * shell prompt, never a heading — the one rule that matters here, and
 * the one a plain `/^#/gm` over the whole file gets wrong. */
export function proseRuns(source: string): string[] {
  const body = source.replace(FRONT_MATTER_RE, "");
  const runs: string[] = [];
  let current: string[] = [];
  let inFence = false;

  const flush = () => {
    const text = current.join("\n").trim();
    if (text) runs.push(text);
    current = [];
  };

  for (const line of body.split("\n")) {
    if (FENCE_RE.test(line)) {
      if (!inFence) flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.trim() === "") flush();
    else current.push(line);
  }
  flush();
  return runs;
}

/** Inline markdown read as the words it stands for, for somewhere that
 * shows a line of text rather than a rendered document. */
export function plainInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first real sentence. Headings are skipped, and so is a dewlab
 * tutorial's own bold subtitle line — it names the module, and it is
 * never the sentence that says what the page is about. */
export function openingOf(source: string): string {
  for (const run of proseRuns(source)) {
    if (run.startsWith("#")) continue;
    if (/^(\*\*|__).+(\*\*|__)$/.test(run) && !run.includes("\n")) continue;
    return plainInline(run).slice(0, 320);
  }
  return "";
}

/** Every heading under the title, without its marks. */
export function headingsOf(source: string): string[] {
  const headings: string[] = [];
  for (const run of proseRuns(source)) {
    for (const line of run.split("\n")) {
      const match = /^#{2,6}\s+(.+?)\s*$/.exec(line);
      if (match) headings.push(plainInline(match[1]!));
    }
  }
  return headings;
}
