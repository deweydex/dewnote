# remark: the plan

Written 2026-09-06 from a survey of the four repositories the idea comes
from (dewlab, dewstack, FAQ, writing-content) and of what each of them
already built towards an editor. It is a plan, not a specification: the
first three sections settle what the thing is and what it must never do,
the middle sections weigh the choices, and the last section is the order
of work with a test that says when each step is done.

---

## 1. What it is, in one paragraph

An editor whose document is a markdown file. You open a tutorial from
dewlab or dewstack, or a plain markdown file, or a folder of them, and see
the page much as a reader would: serif prose at a comfortable measure,
maths set by KaTeX, code cells you can run and whose output appears beneath
them. Click into any paragraph and it becomes its own markdown source, in
the same font at the same width; click out and it is prose again. Between
blocks, on hover, a single quiet control lets you add a paragraph, a cell,
a hint, an image. Save writes markdown back, byte for byte identical
wherever you did not touch it. The same document exports as a Jupyter
notebook or as a standalone HTML page. It runs as one HTML file in a
browser and as a Mac app built from the same code.

## 2. What it is for, and what it is not for

It is for Josh, and for at most one or two co-authors, writing tutorials
for dewlab and dewstack and for whatever the next site turns out to be.
The student never sees it. That rules out two things that the FAQ app
and dewlab's `editor.html` had to carry: mobile-first layout, and a
reading surface that must satisfy the pedagogical style guide. It is a
writing tool, and the style guide's rules about the text students read
apply to the text it produces, not to its own chrome.

It is not a replacement for `build.py` in either site. The build scripts
remain the definition of what a tutorial means; the editor's preview is a
close likeness, the build's output is the truth. dewlab's decision 7.11
made this point about its own editor (preview structure, not appearance,
because a second renderer drifts) and the compromise here is stated in
§5.3: render with the same tokens and the same stylesheet, and treat any
difference the author notices as a bug in the editor, never in the site.

It is not a notebook runtime for students. dewmini is that, and dewmini's
thirty decision entries are about a different reader. remark borrows
dewmini's cell mechanics and leaves its pedagogy alone.

## 3. Three rules that everything else follows from

**The file is the document.** There is no internal format that gets
exported to markdown. The editor's model is a list of blocks sliced out
of the markdown text; a block's content is the text between two offsets;
saving concatenates the blocks. Prose is never parsed into a tree and
re-serialised, because that is where round-trip damage comes from. This
is the lesson dewlab paid for with Milkdown, which dropped `exec` from
every fence it touched (decision 7.59). The first test in the repository
is: parse every tutorial in dewlab and dewstack, serialise it, and compare
bytes.

**A dialect is data, not code paths.** dewlab has one cell form and two
folds; dewstack has five cell forms and a check block; plain markdown has
none. Each is described in one module (`DIALECTS.md` has the inventory)
that says what the front matter fields are, what fences mean, what the
add-block menu should offer, and which runtime a cell needs. The editor
reads that description. Adding the next site is adding a file.

**Quiet by default, everything one press away.** dewmini's workbench
document put it this way and it is the right sentence for this project
too. A fresh window is a page with text on it. Rails, palettes, front
matter forms, run controls: each appears on hover, on focus, or on one
keystroke, and each goes away again. Nothing is boxed unless the box
carries meaning (a cell is a box; a paragraph is not).

## 4. What already exists, and what to take from it

The four repositories contain six editors between them. None is the one
wanted, but each has solved something the new one needs.

**dewlab `assets/editor.js`** (1,235 lines) is a GitHub client: fine-grained
token in `localStorage`, commits to a branch, opens a draft PR, checks
`tutorial:` links against real slugs, warns before a cell id changes. The
GitHub layer and the link checker port over almost unchanged. Its prose
surface, Milkdown Crepe, does not: half a megabyte gzipped with Vue inside,
a preset that fights extension, and the fence-info bug above. Two of Crepe's
other traps are recorded there too (a spurious first `markdownUpdated`; a
hover tooltip that never surfaced, 7.60) and the whole entry is worth
reading once before choosing a surface.

**dewlab `compose/` (dewmini)** is the cell prototype: six cell types,
hover action bars, drag reorder, a real Stop button, OPFS and real-folder
mounting in `dewmini-fs.js`, and the rule that cell output is rendered by
Python in `tutorial_tools.py` so it can be tested without a browser. The
runtime pair `pyodide-engine.js` and `pyodide-worker.js` is the piece to
lift whole. dewmini's decisions 7.109, 7.110 and 7.114 show the pattern
this project should continue: cell UX is built in the notebook first,
then ported onto tutorial pages.

**dewstack's `site=` component and workspace page** are the HTML/CSS/JS
runtime: three panes, a sandboxed iframe with `allow-scripts` only, JS on
explicit Run. Its SQL runs on Pyodide's own `sqlite3`, not sql.js, which
means one interpreter serves every language remark needs. Take that
decision as made.

**FAQ** is the closest in spirit: borderless title, hairline rules,
tokens on `<html>` shared with the public site, two-tier autosave (fast
local, slow commit) that shows both copies on conflict rather than picking
one, front matter kept out of the editor's hands. Its `github.js` (194
lines, plain `fetch`, SHA-conflict semantics) is the smaller of the two
GitHub clients and the one to start from. Its own report card says what
to leave: Crepe, GitHub as the only filesystem, no folders.

**dewmark** is an exam system, not a tutorial editor. It is where
multiple-choice, fill-in-the-blank and dropdown questions live as a fenced
`question` / `answer` grammar. dewlab's practice pages have no such
syntax; a dewlab problem is bold-numbered prose plus a `dl-hint` or
`dl-answer` fold. §7 raises what to do about that.

**writing-content** is seven stub files with YAML front matter and no
maths or code. It asks nothing of the editor beyond front-matter
round-tripping and CommonMark with inline HTML passed through.

## 5. The choices

### 5.1 The editing surface

Three candidates were on the table.

*A WYSIWYG block editor* (Milkdown, Tiptap, BlockNote, Lexical). Every
one of them owns the document model, so the file becomes an export of the
model and the round-trip rule is broken by design. Two repositories here
have already lived with the consequences. Rejected.

*CodeMirror 6 as the whole surface with live-preview decorations*, in the
manner of Obsidian's live preview: the source is always on screen, and
decorations hide the syntax and render maths and headings when the cursor
is elsewhere. This is the purest form of "the file is the document" and it
is extensible in exactly the way wanted (every feature is a view plugin).
Its cost is that tables, images, folds and lists all need their own
decoration work, and a fenced cell with a run button and an output pane is
a large block widget inside a text editor. It is the right destination and
too much for the first version.

*Blocks that render when blurred and edit when focused.* The document is
split at fences, `$$` blocks, `<details>` blocks and blank lines. A prose
block is rendered HTML (markdown-it plus KaTeX) until clicked, when it
becomes a CodeMirror markdown editor of the same width and typeface; a
code cell is always a CodeMirror editor with a run control and an output
pane. This is what dewmini's text cells already do, and what Jupyter does
badly (with a border and a mode switch). Done without the border, with the
rendered and source states sharing metrics so nothing jumps, it gives the
instant preview asked for at a fraction of the cost of the second option.

**Choose the third, and keep the door to the second open.** The upgrade
path is inside a block: a focused prose block's CodeMirror instance can
gain live-preview decorations later without the block model changing.
Cmd+/ on the whole document shows the raw file in one CodeMirror instance
for the times an author wants the file itself.

### 5.2 Parsing and rendering

Rendering: **markdown-it**, which FAQ already uses with `markdown-it-texmath`
and `markdown-it-task-lists`, plus `attr_list`-style support if dewstack's
pages need it (dewstack's build enables it; check whether any tutorial uses
it before adding a plugin). Maths goes through **KaTeX**, self-hosted,
lazily loaded when a document has any. Highlighting inside rendered
(non-cell) fences comes from CodeMirror's own highlighter run over the
text, so there is one highlighter, not a second one at render time.

Splitting: a small hand-written block splitter, not a markdown AST. It
needs to recognise front matter, fenced code with the full info string,
`$$` display blocks, `<details>` and `<aside>` blocks (balanced, since a
fold contains markdown), and otherwise blank-line paragraphs. It records
offsets, never rewrites text. Its correctness is the byte round-trip test.

Front matter: **js-yaml** for parsing into the form; on save, edit values
in the original text rather than re-dumping the document, so key order
and quoting survive (writing-content's timestamps are quoted; a re-dump
would unquote them).

### 5.3 Look

The design vocabulary exists and is shared between two sites already: the
`--dl-*` custom properties, Georgia at 18px on warm off-white, navy and
orange, a measure of 34rem (dewlab) or 30rem (dewstack), line-height 1.62,
faint tinted cells, hover controls done with `opacity: 0; pointer-events:
none` so they stay in the tab order and reappear on `:focus-within`. remark
imports that vocabulary as its default texture and renders the document
with it, so the preview looks like the site because it is dressed the same
way.

What is new is that every one of those values is a setting: family, size,
measure, margins, cell tint, dark or light, plus which dialect's stylesheet
to preview under. Settings are custom properties written to `<html>` before
first paint, FAQ's way, so there is never a flash. The window itself has:
a title that is the file name, editable; the page; a left rail for files
and a right rail for outline and settings, both closed until asked; a
command palette on Cmd+K that reaches everything the rails do. No toolbar.

### 5.4 Running code

One Pyodide 0.28.x interpreter per document, in a module Worker, lifted
from dewlab's `pyodide-engine.js` and `pyodide-worker.js`, with
`tutorial_tools.py` rendering outputs. SQL cells use the interpreter's
`sqlite3`, dewstack's way. HTML/CSS/JS cells preview in a sandboxed iframe,
dewstack's way. The `packages:` front matter field (dewlab) and the cell
forms present (dewstack) decide what loads.

Stop is a real problem in two of the three hosting modes. dewlab's Stop
uses a `SharedArrayBuffer`, which needs cross-origin isolation headers. A
Tauri app can set them; a hosted page can use `coi-serviceworker` as dewlab
does; a single HTML file opened from disk cannot. The baseline Stop is
therefore terminate-and-restart the Worker, losing the namespace, with the
interrupt-flag Stop enabled where headers permit. Say so in the UI once,
not on every press.

### 5.5 Where files live

The Mac is the awkward case. Safari has no `showOpenFilePicker` or
`showDirectoryPicker` in 2026 (only the origin-private file system), so a
browser-only app cannot open a folder from Finder unless the browser is
Chrome. That settles the shape: a **store interface** with several
implementations, and the app not caring which is mounted.

- *Browser store*: OPFS for a private vault, `<input type=file>` and drag
  and drop to bring files in, download to get them out, and the File
  System Access API for a real folder when the browser has it. All of this
  is in `dewmini-fs.js` already. This is the single-file mode.
- *GitHub store*: the FAQ client, extended with dewlab's branch and draft
  PR flow. A repository is a folder; a series is a module folder with its
  `order.yaml`; saving is a commit on a branch.
- *Native store*: Tauri's fs and dialog plugins. Real paths, file watching,
  a folder tree, and the ability to run `build.py` in the folder and open
  the result.

A document remembers which store it came from. Two stores can hold the
same file (a GitHub copy and a local clone); the editor does not try to
reconcile them, and FAQ's rule holds: on conflict show both, never pick.

### 5.6 The Mac app

**Tauri 2**, for three reasons. The web view is WebKit, so a Safari test
is a Tauri test. The dialog and fs plugins are current (dialog 2.7 in July
2026) and return real paths. And the binary is small enough to hand to a
co-author. Electron is the alternative and none of those hold for it.

Two costs to name. Building needs a Rust toolchain, which is a one-time
install and which CI can carry. And a Mac binary that is not signed needs
a right-click-open the first time; signing needs an Apple developer account
and is a decision for when there is a second user.

A different alternative deserves a sentence: a tiny Python server
(`python -m remark`) that serves the app on localhost and does file I/O,
since Python is already how both sites build. It needs no Rust and no
signing, and it would run `build.py` natively. It loses double-click
launch and gains nothing the Tauri shell lacks. Keep it as the fallback
if Tauri proves heavier than expected.

Phone: Tauri 2 builds for iOS, and the reading and running half of the
app would work there. Editing code on a phone does not. Treat a phone
build as a viewer, and not before the Mac app exists.

### 5.7 GitHub and tokens

A fine-grained personal access token, pasted once, scoped to contents
and pull requests on the named repositories. In the browser it lives in
`localStorage` as it does in FAQ and dewlab, with expiry shown and a
Forget control. In Tauri it goes in the keychain through the stronghold or
keyring plugin, not the web view's storage. It is never written to a file,
and FAQ's pre-commit guard against that comes across too.

### 5.8 Exports

*Markdown in a dialect* is Save, not export. Conversion between dialects
is a mapping in the dialect modules (dewlab `python exec` with `id:` to
dewstack `py cell=<id>`, for instance) applied block by block, with a
report of what did not map.

*Jupyter*: nbformat 4.5 JSON. Prose blocks become markdown cells, code
cells become code cells, the dewlab cell id becomes the nbformat cell `id`
(4.5 added exactly that field), and `hint:` and the fence info string go
in cell metadata under a `remark` key so the round trip back is lossless.
Outputs from the last run can be included as `stream` and `display_data`
entries, with figures as `image/png`. Import is the reverse; dewlab's
`dev/from_notebook.py` has already faced the awkward cases.

*HTML*: the rendered document with the stylesheet and KaTeX CSS inlined,
cells shown with their last output, no runtime. A page to send to someone.

### 5.9 Stack, in one list

- Plain ES modules, no framework. `// @ts-check` with JSDoc types so the
  editor checks what it can without a compile step.
- Vite for the dev server and for the two builds: the app, and the
  single-file variant via a single-file plugin. esbuild underneath, as in
  dewlab's `vendor-src`.
- CodeMirror 6 (`view`, `state`, `commands`, `language`, `search`,
  `autocomplete`, `lang-markdown`, `lang-python`, `lang-sql`, `lang-html`,
  `lang-css`, `lang-javascript`), pinned.
- markdown-it, markdown-it-texmath, KaTeX, js-yaml.
- Pyodide 0.28.x, loaded from jsDelivr by default with a self-host
  setting, as dewlab does.
- Tauri 2 with the dialog, fs and a keychain plugin.
- vitest for the block model and dialects; Playwright driving the real
  built app for everything with a cursor in it, since both Crepe traps in
  dewlab were only found that way.

## 6. The order of work

Each step ends with a test that says it is done. Steps 1 and 2 are the
project; if they are not delightful, nothing after them will rescue it.

1. **The document.** Block splitter, serialiser, dialect detection from
   front matter, front-matter editing in place. *Done when* every
   tutorial and practice page in dewlab and dewstack round-trips byte for
   byte, and a fixtures folder holds a dozen of them plus the
   writing-content stubs.
2. **The surface.** Render blocks, edit on focus, insert between blocks
   on hover, move and delete, keyboard for all of it, the whole-file
   source view, settings for texture. Single-file build that opens a
   dropped file and downloads a saved one. *Done when* a dewlab tutorial
   opened in it looks like the site, edits to prose and maths preview as
   you type, and a fence never loses its info string.
3. **Cells that run.** Worker runtime, output rendering, Stop, SQL,
   iframe preview for the web cells, hints and answers as folds. *Done
   when* the tutorials in the fixtures folder run the same in remark as
   on the built site.
4. **Files.** The store interface, the browser store with OPFS and folder
   mounting, the files rail, the series view from `order.yaml`, new
   tutorial from a template, new series. *Done when* a module folder from
   dewlab can be opened in Chrome and worked on for an afternoon.
5. **GitHub.** Token, open a repository, edit, commit to a branch, draft
   PR, link checking against real slugs. *Done when* a change to dewlab
   goes from remark to a PR without a terminal.
6. **Exports.** Jupyter out and in, dialect conversion, HTML page.
   *Done when* a tutorial survives markdown → ipynb → markdown unchanged.
7. **The Mac app.** Tauri shell, native store, keychain, file watching,
   run the build and open the result. *Done when* the app opens a folder
   from Finder and saves back to it.
8. **Finish.** Command palette, outline rail, images with an `alt` prompt
   and a copy into the tutorial folder, link picker, the live-preview
   decorations if step 2's block editing still wants them.

The generated parts of a page (table of contents, previous and next,
series navigation) are rendered in the preview from headings and from
`order.yaml`, and never written into the markdown, because both build
scripts generate them and a hand-written copy would double up. For a
plain-markdown target, an "insert contents" command writes a real list
once, marked with a comment so it can be regenerated.

## 7. Questions that need Josh, not research

- **The name.** `remark` is taken twice over in the ecosystem the project
  will use (see `DECISIONS.md` 3). Change it now or live with it.
- **Which browser is daily.** If Chrome, the browser store gets real
  folders and the Mac app can wait. If Safari, the Mac app moves up the
  order.
- **Practice problems.** dewlab has no dropdown or multiple-choice syntax;
  dewmark does, in a fenced `question` grammar the tutorial build does
  not read. Is the ask to bring that grammar into dewlab (a build change
  there first), or to give remark a fold-and-answer helper that writes
  what dewlab already accepts? The second is smaller and needs no change
  to any site.
- **What this retires.** dewlab's `editor.html` overlaps step 5 entirely;
  dewmini's file mounting overlaps step 4. Retiring the first once remark
  reaches step 5 seems right. dewmini stays, since it is for students.
- **Signing the Mac build.** Not needed for one user. Say when a second
  appears.
