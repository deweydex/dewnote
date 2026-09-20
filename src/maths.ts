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
