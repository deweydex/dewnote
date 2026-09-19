import { Crepe } from "@milkdown/crepe";
import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import { editorViewCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import remarkFrontmatter from "remark-frontmatter";

/* ---- override 1: keep a fence's info string past the first word ---- */
const codeBlockWithMeta = codeBlockSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    attrs: { ...base.attrs, meta: { default: "" } },
    parseMarkdown: {
      match: base.parseMarkdown.match,
      runner: (state, node, type) => {
        state.openNode(type, { language: node.lang ?? "", meta: node.meta ?? "" });
        if (node.value) state.addText(node.value);
        state.closeNode();
      },
    },
    toMarkdown: {
      match: base.toMarkdown.match,
      runner: (state, node) => {
        // Crepe models a $$ block as a code fence with language LaTeX;
        // re-registering this schema would drop that branch, so keep it.
        if ((node.attrs.language ?? "").toLowerCase() === "latex") {
          state.addNode("math", undefined, node.content.firstChild?.text || "");
          return;
        }
        state.addNode("code", undefined, node.content.firstChild?.text || "", {
          lang: node.attrs.language,
          meta: node.attrs.meta || null,
        });
      },
    },
  };
});

/* ---- override 2: front matter as an opaque block ---- */
const frontMatterSchema = $nodeSchema("front_matter", () => ({
  content: "text*",
  group: "block",
  marks: "",
  defining: true,
  code: true,
  parseDOM: [{ tag: "div[data-front-matter]", preserveWhitespace: "full" }],
  toDOM: () => ["div", { "data-front-matter": "true" }, 0],
  parseMarkdown: {
    match: ({ type }) => type === "yaml",
    runner: (state, node, type) => {
      state.openNode(type);
      if (node.value) state.addText(node.value);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "front_matter",
    runner: (state, node) => {
      state.addNode("yaml", undefined, node.content.firstChild?.text || "");
    },
  },
}));

const frontMatterRemark = $remark("frontMatter", () => remarkFrontmatter, ["yaml"]);

async function build(markdown, mode) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const crepe = new Crepe({
    root, defaultValue: markdown,
    features: {
      [Crepe.Feature.AI]: false,
      [Crepe.Feature.ImageBlock]: false,
      [Crepe.Feature.Toolbar]: false,
      [Crepe.Feature.TopBar]: false,
    },
  });
  if (window.__stringify) crepe.editor.config((ctx) => {
    ctx.update(remarkStringifyOptionsCtx, (o) => ({ ...o, ...window.__stringify }));
  });
  if (mode !== "plain") crepe.editor.use(codeBlockWithMeta);
  if (mode === "full") crepe.editor.use(frontMatterRemark).use(frontMatterSchema);
  await crepe.create();
  return { crepe, root };
}

window.roundTrip = async function (markdown, mode) {
  const { crepe, root } = await build(markdown, mode);
  const out = crepe.getMarkdown();
  crepe.destroy(); root.remove();
  return out;
};

window.debugDoc = async function (markdown, mode) {
  const { crepe, root } = await build(markdown, mode);
  let doc = null;
  crepe.editor.action((ctx) => { doc = ctx.get(editorViewCtx).state.doc.toJSON(); });
  const out = crepe.getMarkdown();
  crepe.destroy(); root.remove();
  return { doc, out };
};
