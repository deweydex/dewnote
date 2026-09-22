// What a markdown document says, as opposed to how it is written.
//
// The round trip may rewrite a file's formatting once: `*` bullets become
// `-`, table cells are padded, a reference link is inlined, an escape is
// added or dropped. None of that changes what the page says. It may not
// lose or alter anything that does: a heading, a fence's info string or
// a line of its code, a cell's id, a front-matter field, a `<details>`
// fold or its class, a `<br>`, a table cell, a list's numbering, an
// image, a formula.
//
// So both versions are parsed with the same remark plugins dewlab's
// constructs need, positions are dropped, and the trees are compared
// whole. Anything the parser distinguishes, the test distinguishes.

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import { unmathPlainDollars } from "../../src/maths.ts";

type Node = { type: string; children?: Node[]; [key: string]: unknown };

// `unmathPlainDollars` is dewlab's own reading of a dollar sign: "$5 and
// $6" is prose, not a formula. remark-math alone would disagree with the
// site about what the document says.
const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ["yaml"])
  .use(unmathPlainDollars);

/** The document's tree, reduced to what it says. */
export function structureOf(markdown: string): Node {
  const tree = parser.runSync(parser.parse(markdown)) as unknown as Node;

  // Reference links and images say the same as inline ones once their
  // definitions are resolved, and the editor inlines them.
  const definitions = new Map<string, { url: string; title: unknown }>();
  const collect = (node: Node) => {
    if (node.type === "definition") {
      definitions.set(String(node["identifier"]), { url: String(node["url"]), title: node["title"] ?? null });
    }
    node.children?.forEach(collect);
  };
  collect(tree);

  const reduce = (node: Node): Node | null => {
    if (node.type === "definition") return null;
    const out: Node = { type: node.type };
    for (const [key, value] of Object.entries(node)) {
      if (["type", "children", "position", "data", "identifier", "label", "referenceType"].includes(key)) continue;
      out[key] = value;
    }
    if (node.type === "linkReference" || node.type === "imageReference") {
      const found = definitions.get(String(node["identifier"]));
      out.type = node.type === "linkReference" ? "link" : "image";
      out["url"] = found?.url ?? `[unresolved ${String(node["identifier"])}]`;
      out["title"] = found?.title ?? null;
    }
    if (out.type === "link" || out.type === "image") out["title"] ??= null;
    if (typeof out["value"] === "string" && (out.type === "html" || out.type === "yaml")) {
      out["value"] = (out["value"] as string).trim();
    }
    if (node.children) {
      const children: Node[] = [];
      for (const child of node.children) {
        const reduced = reduce(child);
        if (!reduced) continue;
        // Adjacent text is one run of text, however the escapes split it.
        const last = children.at(-1);
        if (reduced.type === "text" && last?.type === "text") {
          last["value"] = String(last["value"]) + String(reduced["value"]);
        } else {
          children.push(reduced);
        }
      }
      out.children = children;
    }
    return out;
  };

  return reduce(tree)!;
}
