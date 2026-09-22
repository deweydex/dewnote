// What counts as inline maths.
//
// remark-math reads any `$…$` as a formula, so "it costs $5 and $6"
// renders as one. dewlab's build does not: its `INLINE_MATH_RE` is
// `\$(?!\s)(?P<tex>[^$\n]+?)(?<!\s)\$`, which refuses a span with
// whitespace against either delimiter. A sentence about money is the
// common case, and showing it as algebra is wrong on the page.
//
// So a span remark-math claimed but dewlab would not is turned back into
// the text it was written as.

import { visit } from "unist-util-visit";

/** dewlab's rule: no whitespace immediately inside either delimiter, and
 * something between them. */
export function readsAsMaths(value: string): boolean {
  return value.length > 0 && !/^\s/.test(value) && !/\s$/.test(value);
}

export function unmathPlainDollars() {
  return (tree: unknown): void => {
    visit(tree as never, "inlineMath", (node: any, index: number | undefined, parent: any) => {
      if (!parent || index === undefined) return;
      if (readsAsMaths(node.value)) return;
      parent.children.splice(index, 1, { type: "text", value: `$${node.value}$` });
    });
  };
}

/** Rewrite every display-maths block into the one form Milkdown handles
 * correctly: `$$` alone on its own line at each end.
 *
 * Milkdown gets the other two wrong.
 *
 * - Delimiters sharing a line with content are **destroyed**:
 *   `$$a = 1\nb = 2$$` comes back as `$$$\nb = 2$$\n$$$`.
 * - A block on one line is read as *inline* maths and comes back as
 *   `$x = 1$`, at a different size. 18 of 184 dewlab files use it.
 *
 * dewlab's `DISPLAY_MATH_RE` accepts all three, so this changes how a
 * file is written and never what it renders.
 *
 * Only a span that owns its lines is touched, never one inside a fence. */
export function canonicaliseDisplayMath(markdown: string): string {
  const fences: [number, number][] = [];
  let open: number | null = null;
  for (const match of markdown.matchAll(/^(?:```|~~~).*$/gm)) {
    if (open === null) open = match.index;
    else {
      fences.push([open, match.index + match[0].length]);
      open = null;
    }
  }
  if (open !== null) fences.push([open, markdown.length]);
  const inFence = (at: number) => fences.some(([from, to]) => at >= from && at < to);

  return markdown.replace(/\$\$([\s\S]*?)\$\$/g, (whole, inner: string, at: number) => {
    if (inFence(at)) return whole;
    // It has to own its lines: something before it or after it on the
    // same line means it is inline maths and none of our business.
    const before = markdown.lastIndexOf("\n", at - 1) + 1;
    if (markdown.slice(before, at).trim() !== "") return whole;
    const after = at + whole.length;
    const lineEnd = markdown.indexOf("\n", after);
    if (markdown.slice(after, lineEnd === -1 ? undefined : lineEnd).trim() !== "") return whole;

    const body = inner.trim();
    if (inner === `\n${body}\n`) return whole;   // already canonical
    return `$$\n${body}\n$$`;
  });
}
