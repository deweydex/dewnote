// What differs between two versions of a file, line by line.
//
// For a save conflict: the author has to choose between their version
// and the one on the branch, and cannot choose well without seeing what
// separates them. A line diff is enough for that; a tutorial is prose
// and short fences, and nobody merges one character by character.
//
// No DOM. The conflict dialog draws what this returns.

export type DiffLine =
  | { kind: "same"; text: string }
  | { kind: "theirs"; text: string }
  | { kind: "mine"; text: string };

/** A run of changed lines with a little unchanged context either side,
 * and the line in `mine` it starts at, counted from 1. */
export interface Hunk {
  line: number;
  lines: DiffLine[];
}

/** Beyond this many cells the table is not worth building: a file that
 * large and that different is better shown as "everything changed". */
const LIMIT = 4_000_000;

/** Every line of both versions, in order, each marked as common to both
 * or belonging to one side. A longest-common-subsequence table, which is
 * exact and quadratic; a tutorial is a few hundred lines. */
export function diffLines(theirs: string, mine: string): DiffLine[] {
  const a = theirs.split("\n");
  const b = mine.split("\n");

  // Trim what both share at either end, which is most of a real conflict
  // and keeps the table small.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const head: DiffLine[] = a.slice(0, start).map((text) => ({ kind: "same", text }));
  const tail: DiffLine[] = a.slice(endA).map((text) => ({ kind: "same", text }));
  const x = a.slice(start, endA);
  const y = b.slice(start, endB);

  if (x.length * y.length > LIMIT) {
    return [
      ...head,
      ...x.map((text): DiffLine => ({ kind: "theirs", text })),
      ...y.map((text): DiffLine => ({ kind: "mine", text })),
      ...tail,
    ];
  }

  // table[i][j]: the longest common run of x[i..] and y[j..].
  const width = y.length + 1;
  const table = new Uint32Array((x.length + 1) * width);
  for (let i = x.length - 1; i >= 0; i -= 1) {
    for (let j = y.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = x[i] === y[j]
        ? table[(i + 1) * width + j + 1]! + 1
        : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }

  const middle: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      middle.push({ kind: "same", text: x[i]! });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      middle.push({ kind: "theirs", text: x[i]! });
      i += 1;
    } else {
      middle.push({ kind: "mine", text: y[j]! });
      j += 1;
    }
  }
  while (i < x.length) middle.push({ kind: "theirs", text: x[i++]! });
  while (j < y.length) middle.push({ kind: "mine", text: y[j++]! });

  return [...head, ...middle, ...tail];
}

/** Only the changes, each with `context` unchanged lines either side;
 * two changes whose context would touch become one hunk. */
export function hunks(lines: readonly DiffLine[], context = 2): Hunk[] {
  const changed = lines.flatMap((line, at) => (line.kind === "same" ? [] : [at]));
  if (changed.length === 0) return [];

  const ranges: [number, number][] = [];
  for (const at of changed) {
    const from = Math.max(0, at - context);
    const to = Math.min(lines.length - 1, at + context);
    const last = ranges.at(-1);
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else ranges.push([from, to]);
  }

  // The line number in `mine` where each diff line sits.
  const mineLine: number[] = [];
  let counted = 1;
  for (const line of lines) {
    mineLine.push(counted);
    if (line.kind !== "theirs") counted += 1;
  }

  return ranges.map(([from, to]) => ({
    line: mineLine[from]!,
    lines: lines.slice(from, to + 1),
  }));
}
