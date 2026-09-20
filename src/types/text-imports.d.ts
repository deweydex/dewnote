// `import source from "./file.py" with { type: "text" }` — Bun's bundler
// inlines the file's raw text as a string at build time (checked
// directly: a backtick or `${` sequence in the source comes out
// correctly escaped). Used for dewnote_tools.py, which the Pyodide
// worker needs as a string to write into its own in-memory filesystem,
// not as something this build ever executes as TypeScript.
declare module "*.py" {
  const source: string;
  export default source;
}

// The HTML export asks for a stylesheet by value rather than as a side
// effect. `css-imports.d.ts` declares `*.css` with no exports, for
// `import "./style.css"`; this one has to name the files that are read,
// since the same specifier cannot be declared twice.
declare module "./style.css" {
  const source: string;
  export default source;
}

declare module "katex/dist/katex.min.css" {
  const source: string;
  export default source;
}
