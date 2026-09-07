// Bun's HTML-entry bundler (`bun build ./index.html --outdir dist`) does
// not produce one file on its own — it writes index.html plus separate
// hashed .js and .css assets next to it, the same shape Vite's default
// build has. The plan originally assumed otherwise (decision 10, before
// this was checked directly); this is the "extra plugin" that claim said
// wouldn't be needed. It reads the linked stylesheet and module script
// bun build wrote, inlines both directly into index.html, and deletes the
// now-unreferenced asset files — so what's left is the actual single-file
// distributable the browser store and the Mac app's downloadable copy
// both need.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const htmlPath = join(DIST, "index.html");
let html = readFileSync(htmlPath, "utf8");

const linkMatch = /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/.exec(html);
const scriptMatch = /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/.exec(html);
if (!linkMatch || !scriptMatch) {
  throw new Error("inline-single-file: expected exactly one linked stylesheet and one module script in dist/index.html");
}

const cssFile = join(DIST, linkMatch[1]!.replace(/^\.\//, ""));
const jsFile = join(DIST, scriptMatch[1]!.replace(/^\.\//, ""));
const css = readFileSync(cssFile, "utf8");
const js = readFileSync(jsFile, "utf8");

// A replacement *function* is required here, not a template string: with a
// string replacement, `String.prototype.replace` still interprets `$&`,
// `$$`, `` $` ``, `$'` and `$<n>` as special patterns even though the
// search value is a plain string — and minified JavaScript is full of
// literal `$` sequences that happen to collide with them. Found by the
// build producing a 42 MB file (15x too large) with the script tag
// duplicated 28 times, from exactly this, rather than assumed safe.
html = html.replace(linkMatch[0], () => `<style>${css}</style>`);
html = html.replace(scriptMatch[0], () => `<script type="module">${js}</script>`);

writeFileSync(htmlPath, html);
unlinkSync(cssFile);
unlinkSync(jsFile);

console.log(`inlined ${linkMatch[1]} and ${scriptMatch[1]} into ${htmlPath}`);
