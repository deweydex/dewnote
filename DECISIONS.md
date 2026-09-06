# Decisions

What was decided, why, and what it would cost to change. Numbered so
other documents can cite an entry. The first block was seeded on
2026-09-06 with the planning session; nothing was built when it was
written.

**1 — The markdown file is the document; the editor holds offsets into
it, not a model it exports from.** Every WYSIWYG block editor considered
(Milkdown, Tiptap, BlockNote, Lexical) owns its own document model, and
two of the source repositories have already paid for that: dewlab's
Milkdown surface silently dropped the `exec` attribute from every fence it
saved (dewlab decision 7.59). The block splitter here records offsets and
never rewrites prose; the first test in the repository is a byte-for-byte
round trip over every tutorial in dewlab and dewstack.
*Cost to change: the whole editing surface. This is the one decision
that is meant to be expensive.*

**2 — Blocks render when blurred and edit when focused; live-preview
decorations inside a focused block are the upgrade path, not the start.**
The Obsidian-style single-surface approach is where the project should
end up, and it is too much decoration work for a first version. The block
model chosen lets a focused prose block's CodeMirror instance gain those
decorations later without anything else changing.
*Cost to change: small, and additive.*

**3 — The name is provisional.** `remark` is the name of the JavaScript
markdown processor at the centre of the unified ecosystem (`remark`,
`remark-math`, `remark-gfm`), which this project may well depend on, and
of `remark.js`, a markdown slideshow tool. Both will collide in
`package.json`, in searches, and in conversation. Candidates that keep
the sense and the brevity: `margin` (where notes go), `folio`, `quire`,
`dewnote` (matches `dewlab`, `dewstack`, `dewmini`, `dewmark`), `marginal`.
The GitHub repository can be renamed without breaking clones. Decision
left to Josh; the plan uses `remark` until then.
*Cost to change: a rename, cheapest now.*

**4 — A dialect is a data module, and the editor has no site-specific
code paths.** dewlab has one fence attribute and two fold classes;
dewstack has five fence forms and a check block; the next site will have
something else. `planning/DIALECTS.md` is the inventory. Each dialect
declares front matter, block kinds, add-menu entries, and the runtime a
cell needs.
*Cost to change: moderate; the discipline is easy to lose one shortcut at
a time.*

**5 — One Pyodide interpreter serves Python and SQL, in a Worker;
HTML/CSS/JS previews in a sandboxed iframe.** dewstack already made both
calls and dewlab's `pyodide-engine.js` and `pyodide-worker.js` are the
Worker. sql.js is not used anywhere current and is not adopted here. Stop
is terminate-and-restart by default and interrupt-flag where cross-origin
isolation headers allow it, because a single HTML file opened from disk
cannot set headers.
*Cost to change: the runtime is behind one interface; swapping it is a
week, not a rewrite.*

**6 — Files come through a store interface with browser, GitHub and
native implementations, because Safari on a Mac cannot open a folder from
a web page.** Safari in 2026 supports only the origin-private file system,
not `showOpenFilePicker` or `showDirectoryPicker`. Chrome has both. A Mac
app is therefore not a luxury but the only way to open a Finder folder in
the default browser's engine. The browser store still gets real folders in
Chrome via the File System Access API, and OPFS plus drag-and-drop
everywhere.
*Cost to change: none; the interface is the cheap part.*

**7 — Tauri 2 for the Mac app, over Electron and over a local Python
server.** Its web view is WebKit, so testing in Safari is testing the app;
its dialog and fs plugins are current and return real paths; the binary
is small. Electron fails all three. A Python server (`python -m remark`)
is the recorded fallback: no Rust, no signing, runs `build.py` natively,
loses double-click launch.
*Cost to change: the native store implementation and the packaging, a few
days.*

**8 — The design tokens are dewlab's `--dl-*` set, imported not copied,
and every one is a user setting.** The two sites already share them so
that they read as siblings; the editor renders the document under the
same variables so the preview looks like the site because it is dressed
the same way. Family, size, measure, margins, cell tint and theme are
written to `<html>` before first paint, FAQ's way.
*Cost to change: small; the tokens are one file.*

**9 — Generated navigation is rendered, never written.** Table of
contents, previous and next, and series navigation are produced by both
build scripts from headings and `order.yaml`. The editor shows them in
the preview from the same inputs and does not put them in the file. A
plain-markdown target gets an explicit "insert contents" command that
writes a marked list.
*Cost to change: small.*

**10 — Tests drive the built app in a real browser for anything with a
cursor in it.** Both of dewlab's Milkdown traps were invisible from the
API and found only by driving the editor. vitest covers the block model,
dialects and exports; Playwright covers the surface.
*Cost to change: none worth taking.*
