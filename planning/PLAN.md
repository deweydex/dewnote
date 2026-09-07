# dewnote: the plan

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
thirty decision entries are about a different reader. dewnote borrows
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
means one interpreter serves every language dewnote needs. Take that
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

*A WYSIWYG block editor* (Milkdown, Tiptap, BlockNote, Lexical). Rejected,
and for one reason only: every one of them owns the document model, so the
file on disk becomes an export of that model rather than the model itself,
and the round-trip rule in §3 is broken by construction, not by a bug that
better engineering fixes. dewlab's own experience is the proof, not an
argument by association — Milkdown Crepe silently dropped `exec` from
every fence it touched (decision 7.59), because its code-block feature
keeps only the first word of a fence's info string, and no amount of care
in how it is driven changes what its model can hold. FAQ's report on the
same library also named its size (half a megabyte gzipped, with Vue
pulled in transitively for Crepe's node-view widgets) as a weakness, and
that complaint is dropped here on purpose: at the scale of one or two
authors' tutorials, half a megabyte costs nothing worth arguing about, and
if this reads as a rejection of Milkdown for being heavy, that is not the
argument being made. A future block-editor library that solved the
round-trip problem — kept its model in lossless sync with the exact
source text, fence attributes and all — would be worth a second look
regardless of its weight. None of the four considered here make that
claim about themselves.

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
none` so they stay in the tab order and reappear on `:focus-within`. dewnote
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

"The File System API is enough for Safari" is half right, and the half
that is wrong is the important half, so it is worth being precise about
what Safari actually does in 2026, since three things travel under
similar-sounding names and only one of them is the gap.

- **`<input type="file">` and `<input type="file" webkitdirectory>`** — a
  picker dialog that hands the page a `File` or a list of them, read-only,
  no path, no way to write back to the same spot on disk. Full support in
  Safari. This is almost certainly what "selecting files has always
  worked well in Safari" refers to across these repositories: opening a
  notebook, importing a CSV, choosing an image to attach.
- **The origin-private file system (OPFS)**, `navigator.storage.getDirectory()`
  — a private, sandboxed storage area the page can read and write freely,
  with no picker and no permission prompt, but invisible in Finder and
  reachable only from the page that wrote to it. Supported in Safari since
  15.2. This is dewmini's default backend (`dewmini-fs.js`'s `mountOpfs()`)
  and it is very likely a second thing behind "everything has worked well"
  — an editor backed by OPFS feels exactly like a normal file-backed app
  from inside the page, because saves persist across visits, right up
  until someone goes looking for the file in Finder and there is nothing
  there to find.
- **`showOpenFilePicker()` / `showDirectoryPicker()`**, the File System
  Access API proper — a picker that returns a live, permission-scoped
  handle the page can keep and write back through, so a save actually
  lands on the file the user chose, at the path they chose it from. This
  is the one Safari does not implement, on any Apple platform, and it is
  the one a "open my `tutorials/` folder from Finder and save into it
  directly" workflow needs. `dewmini-fs.js` already treats it as optional
  — `chooseFolder()` feature-detects `showDirectoryPicker` and only offers
  the button when it exists — so nothing here is broken today; it is
  narrower than it looks, because the OPFS and `<input>` paths cover
  everything except that one workflow.

So the honest claim is: Safari is fully capable of opening a file, editing
it, and downloading the result, and of a private vault that survives
between sessions. What it cannot do is open `~/dewlab/tutorials/`, edit a
file in place, and have the save land back in that real folder — and that
is specifically the workflow of editing a checked-out git repository,
which is what an afternoon of writing tutorials actually looks like. That
gap, not file selection in general, is what makes a Mac app worth
building rather than a nice-to-have. It settles the shape: a **store
interface** with several implementations, and the app not caring which is
mounted.

- *Browser store*: OPFS for a private vault, `<input type=file>` and drag
  and drop to bring files in, download to get them out, and the File
  System Access API for a real folder when the browser has it (Chrome and
  Edge; not Safari, per the above). All of this is in `dewmini-fs.js`
  already. This is the single-file mode, and it is complete in Safari for
  everything except live-editing a real folder.
- *GitHub store*: the FAQ client, extended with dewlab's branch and draft
  PR flow. A repository is a folder; a series is a module folder with its
  `order.yaml`; saving is a commit on a branch. This is available in
  Safari too, since it never touches local paths at all — a token and
  `fetch` are all it needs.
- *Native store*: Tauri's fs and dialog plugins, described in §5.6. Real
  paths, file watching, a folder tree, and the ability to run `build.py`
  in the folder and open the result. This is the one that closes the gap
  above, in the one place (a local WebKit view, not the Safari app) where
  WebKit's own missing API stops mattering.

A document remembers which store it came from. Two stores can hold the
same file (a GitHub copy and a local clone); the editor does not try to
reconcile them, and FAQ's rule holds: on conflict show both, never pick.

### 5.6 The Mac app

**What Tauri actually is.** Not a browser, and not a way to make a website
into an app by wrapping it — that description fits Electron better. A
Tauri app is two halves talking over one process boundary: the front end
is the same HTML, CSS and TypeScript the browser build already is, shown
in the operating system's own web view (WebKit's `WKWebView` on the Mac —
the same engine Safari uses, not a bundled Chromium); the back end is a
small Rust binary that owns everything a web page is sandboxed away from —
real file paths, the dialog boxes the Finder shows, the keychain, a menu
bar, a dock icon. The two halves talk over `invoke()`, a typed
call-and-response the front end uses exactly like calling an async
function; `@tauri-apps/plugin-dialog`'s `open()` and `save()` cross that
boundary, ask Rust to show the OS's real folder or file picker, and hand
back a real path a JavaScript `File` object never carries. `@tauri-apps/
plugin-fs` then reads and writes at that path directly — no origin
sandbox, no permission re-prompt on every launch, no OPFS. This is the
whole of what closes the gap named in §5.5: not a better web API, but a
second process, next to the web view, that has the access a web page is
built never to have.

Three reasons this over Electron. The web view is WebKit, so a bug that
shows up only in Safari shows up in Tauri too, and a fix that works in
Tauri is a fix that works for every visitor still on Safari — Electron
ships its own Chromium and would hide exactly the bugs worth catching.
The dialog and fs plugins are current (dialog 2.7 in July 2026, core
runtime 2.11.x) and do exactly the two things above. And the binary is
tens of megabytes, not the few hundred Electron starts from, because it
is not carrying a second browser inside it.

Two costs to name. Building needs a Rust toolchain, which is a one-time
install and which CI can carry, and which Tauri's own tooling installs
alongside the project rather than separately. And a Mac binary that is
not signed needs a right-click-open the first time; signing needs an
Apple developer account and is a decision for when there is a second user.

A different alternative deserves a sentence: a tiny Python server
(`python -m dewnote`) that serves the app on localhost and does file I/O,
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
in cell metadata under a `dewnote` key so the round trip back is lossless.
Outputs from the last run can be included as `stream` and `display_data`
entries, with figures as `image/png`. Import is the reverse; dewlab's
`dev/from_notebook.py` has already faced the awkward cases.

*HTML*: the rendered document with the stylesheet and KaTeX CSS inlined,
cells shown with their last output, no runtime. A page to send to someone.

### 5.9 Stack, in one list

Real TypeScript, not the JSDoc-and-`@ts-check` compromise the first draft
of this plan proposed. Every other repository here (dewlab, dewstack, the
vendor builds) is plain JavaScript because nobody working on them wanted
to learn TypeScript for the occasion; that reason does not hold here.
Plain ES modules with no framework is kept — a block-based editor is
DOM manipulation and event handling, not component trees, so React,
Vue or Svelte would be structure bought for a problem this project
does not have.

- **TypeScript**, compiled by Bun, no framework. `strict: true` from the
  first commit — turning it on later, once untyped code exists to please,
  is the harder order.
- **Bun** as runtime, package manager, bundler and test runner in one
  tool, replacing what would otherwise be four (Node, npm, Vite/esbuild,
  vitest). Its bundler takes TypeScript in and reads HTML entry points
  directly: point it at an `index.html` with `<script type="module"
  src="./main.ts">` in it, target `browser`, and it resolves every
  import, bundles the CSS, and inlines fonts and small assets as data
  URIs — checked directly, and this part holds: KaTeX's own webfonts come
  out as `data:font/woff2` URIs inside the bundled CSS with nothing asked
  for. What does not hold is "the single-file build with no extra plugin"
  — `bun build ./index.html --outdir dist` writes `index.html` plus a
  separate hashed `.js` and `.css` next to it, the same shape Vite's
  default build has, not one file. `scripts/inline-single-file.ts` is the
  extra plugin this sentence said wouldn't be needed: a few lines that
  read the two asset files `bun build` wrote and splice them into
  `index.html` directly, deleting the originals — decision 14 has the
  finding and the one-line bug (`String.prototype.replace`'s `$`-pattern
  interpolation, tripped by literal `$` sequences already present in
  minified JavaScript) that came with writing it. `bun test` is
  Jest-shaped and is the runner for the block model and dialects (§6,
  step 1's byte round-trip test). This is a genuine trade, not a
  default: Bun is younger than Vite and Node, so if its bundler's HTML
  handling or a native module the project needs turns out unready,
  falling back to Vite plus vitest costs a day, not a rewrite, because
  neither TypeScript nor the source layout is Bun-specific.
- **Tauri 2** (§5.6) is unaffected by this choice — `create-tauri-app`
  and its dialog, fs and keychain plugins work with any tool that leaves
  a static build in a folder, Bun's own included, and are not written in
  or tied to Node.
- CodeMirror 6 (`view`, `state`, `commands`, `language`, `search`,
  `autocomplete`, `lang-markdown`, `lang-python`, `lang-sql`, `lang-html`,
  `lang-css`, `lang-javascript`), pinned, with `@codemirror/*`'s own
  TypeScript types used directly rather than hand-written ones.
- markdown-it, markdown-it-texmath, KaTeX, js-yaml — each has published
  types or a `@types` package; where neither exists, a small local `.d.ts`
  rather than `any`.
- Pyodide 0.28.x, loaded from jsDelivr by default with a self-host
  setting, as dewlab does.
- Playwright, still outside Bun's own test runner, driving the real built
  app for everything with a cursor in it — both Crepe's traps in dewlab
  were found only that way, and a headless assertion against the DOM
  cannot stand in for actually clicking.

### 5.10 Front matter: which fields, and which values already exist

Two different questions hide inside "how do I know what to fill in".
Which *fields* a dialect needs is a fixed, known list — `DIALECTS.md` has
it, and because decision 3 already makes a dialect a data module rather
than code spread through the editor, the front-matter form is
generated directly from that same data. A field added to a dialect's
description in `DIALECTS.md` appears in the form without the form itself
changing. Which *values* already exist — module names, series titles,
slugs, version numbers — is not answered by knowing the schema at all; it
needs the editor to have actually looked at the other files already
there, so a new tutorial reuses `computational-methods` rather than
quietly creating `computational_methods` as an unrelated fourth module.

So opening a folder, or a GitHub repository, builds a small in-memory
index: one pass over every markdown file's front matter (front matter
alone, not the whole file, so this stays fast even on a large folder),
refreshed on save. The form's `module`, `series`, and
`practice_for`/`practice_across` fields are then a picker drawn from that
index, with a plain "new" option for a value that genuinely doesn't exist
yet, rather than free text a typo can silently fork. `version` defaults to
today's date with the next sequence number unused for that day, computed
from the index rather than typed by hand. An empty folder just gets an
empty picker and free text — the same as today, and no worse.

This is a real cost, not a free improvement: the index has to exist
before the form can offer anything, so opening a large folder does real
work up front rather than at the first keystroke. Worth it, since the
alternative is a human tracking module and series names by memory across
however many tutorials exist by then.

### 5.11 CI and dependency updates

`.github/workflows/tests.yml` runs `bun test` and `bun run typecheck` on
every push to main and every pull request, mirroring dewlab's own
`tests.yml`. `.github/dependabot.yml` opens a weekly PR for the `bun`
ecosystem and for `github-actions`, so a dependency bump goes through the
same gate a hand-written change does rather than landing unreviewed —
decision 13 has the incident that prompted writing this down rather than
just doing it. `.github/workflows/deploy.yml` mirrors dewlab's
`deploy.yml` for the same reason dewlab has one: publishing on push,
not from somebody's laptop. It publishes the real single-file build
(`bun run build`) as of step 2's first slice; before that existed it
published the design sketch in `planning/mockups/` as a placeholder.

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

   **First slice built** (`src/app.ts`, `src/render-block.ts`,
   `src/lang.ts`): prose, maths, a fold and front matter render when
   blurred and edit when focused, sharing one CodeMirror instance per
   focused block; a fence has no rendered state at all and is always a
   live, language-highlighted editor, several at once where a document
   has several cells (decision 15 — the bug this uncovered and how the
   fix works). One add control per gap inserts a paragraph; a per-block
   delete control removes one. The single-file build exists and a real
   dewlab tutorial round-trips byte for byte through the mounted DOM, not
   only through `blocks.ts` directly (`tests/e2e/surface.spec.ts`).
   Still open: the add menu offers only a paragraph, not a cell, a hint or
   an image; there is no drag reorder or keyboard-driven reorder; there is
   no whole-file source view (Cmd+/) yet; there is no settings/texture
   rail, so the page renders in dewlab's own fixed look with nothing
   user-tunable yet; a fence shows its full raw text, fence markers
   included, rather than the site's bordered cell chrome with the fence
   syntax hidden — the live-preview decoration work §5.1 already named as
   the upgrade path, not a new gap.
3. **Cells that run.** Worker runtime, output rendering, Stop, SQL,
   iframe preview for the web cells, hints and answers as folds. *Done
   when* the tutorials in the fixtures folder run the same in dewnote as
   on the built site.
4. **Files.** The store interface, the browser store with OPFS and folder
   mounting, the files rail, the series view from `order.yaml`, new
   tutorial from a template, new series. *Done when* a module folder from
   dewlab can be opened in Chrome and worked on for an afternoon.
5. **GitHub.** Token, open a repository, edit, commit to a branch, draft
   PR, link checking against real slugs. *Done when* a change to dewlab
   goes from dewnote to a PR without a terminal.
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

## 7. Answered, and what's still open

**Which browser is daily.** Safari, on the evidence that everything
tried in these four repositories so far has worked well there. §5.5
draws the line precisely: the browser store is complete in Safari for a
private vault, importing files and downloading results; what it cannot
do is live-edit a real folder in place, because Safari has no File
System Access API. That single gap is what moves the Mac app (§5.6, §6
step 7) up in priority — it stops being a nice-to-have for a Chrome
holdout and becomes the only way to open `~/dewlab/tutorials/` directly.

**Milkdown, size, and library choice generally.** Also answered: size is
not a factor at this scale (§5.1), and it never was the real objection —
the round-trip guarantee in §3 is. Bun over Node/Vite and TypeScript over
JSDoc (§5.9) are both taken as decided rather than left open, on the
strength of wanting to learn TypeScript this year and Bun's bundler
already doing the single-file HTML build natively; §5.9's own escape
hatch (Vite plus vitest) says what reverting either would cost, precisely
so this isn't a decision made without a way back.

Still open:

- **Practice problems.** dewlab has no dropdown or multiple-choice syntax;
  dewmark does, in a fenced `question` grammar the tutorial build does
  not read. Is the ask to bring that grammar into dewlab (a build change
  there first), or to give dewnote a fold-and-answer helper that writes
  what dewlab already accepts? The second is smaller and needs no change
  to any site.
- **What this retires.** dewlab's `editor.html` overlaps step 5 entirely;
  dewmini's file mounting overlaps step 4. Retiring the first once dewnote
  reaches step 5 seems right. dewmini stays, since it is for students.
- **Signing the Mac build.** Not needed for one user. Say when a second
  appears.
- **How many design directions to carry forward.** §5.3 already treats
  every visual value as a setting rather than a fixed choice, which is
  the cheap way to get "multiple versions" — one surface, several presets
  — rather than several surfaces to maintain. `planning/mockups/` has a
  first sketch built on that premise (three presets, one settings rail);
  whether it should grow more presets or fewer is a question about how
  much choice is actually wanted, not one research can answer.
