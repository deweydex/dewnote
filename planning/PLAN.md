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
   fix works). The single-file build exists and a real dewlab tutorial
   round-trips byte for byte through the mounted DOM, not only through
   `blocks.ts` directly (`tests/e2e/surface.spec.ts`).

   **Second slice built**: the add control is a real menu (paragraph,
   code cell, math, hint), each with a cursor or selection placed
   somewhere sensible to start typing rather than at offset zero — a
   fresh cell's cursor on its blank body line, a fresh paragraph or hint
   with its own placeholder words selected so the first keystroke
   replaces them. Move up, move down and delete apply to every block
   kind, fences included, not only the ones with a rendered state to
   click into. Front matter never gets these controls and nothing can be
   moved above it. Found while testing this, not designed for in advance:
   a fence or a front-matter block does not own a trailing blank line the
   way a prose block does (`blocks.ts`'s own rule), so a blank line
   sitting right after either becomes its own orphan prose block —
   harmless for round-tripping, since it is still exactly the bytes it
   always was, but it renders as nothing at all and so is invisible and
   unreachable by clicking. `tests/e2e/surface.spec.ts` names two real
   cases of it directly rather than working around them quietly.

   **Third slice built**: a settings panel (`src/settings.ts`,
   `src/settings-panel.ts`) — decision 7's own "every one of those values
   is a user setting" made real: theme (system/light/dark, over dewlab's
   own existing light/dark token pairs — nothing new to design there),
   body font, text size, measure, margins, and cell tint, applied to
   `<html>` before first paint the way dewstack's own `settings.js` does
   it, localStorage-backed with the same "a default value removes the
   property, not sets it" rule so the stylesheet's own default (media
   queries included) stays authoritative rather than getting pinned.
   Closed until asked (plan §3's own rule), a real dialog rather than a
   hover reveal, since adjusting several settings in a row needs it to
   stay open between changes. Also seeded here rather than invented from
   nothing: a "Running Python" section (the Pyodide source URL §5.9
   already named as a self-host setting, and a "Restart Python
   interpreter" action — `pyodide-engine.ts`'s own terminate-and-restart
   mechanism, decision 19, given a button of its own rather than only
   ever firing as Stop's fallback).

   Deliberately not built: the mockup's three named aesthetic presets
   (`workshop`/`manuscript`/`chalkboard`) — that sketch is exploratory,
   not a ratified decision the way decision 7 is, and choosing new
   palettes and type pairings is real art direction Josh may want to do
   directly, not something to invent solo. `--dl-cell-bg`/`--dl-output-bg`
   are layered behind `--dn-cell-bg`/`--dn-output-bg` in `app.css`
   specifically so a later preset system has one place to hang colour
   choices, not five.

   **Fourth slice built** (`src/frontmatter.ts`'s `setFrontMatterField`,
   `src/frontmatter-fields.ts`, `app.ts`'s front-matter branch of
   `renderBlockWrapper`): decision 11's per-field form, scoped down to what
   doesn't need step 4's file index. A dewlab or dewstack document's front
   matter (detected the same way `detectDialect` always has) now opens to
   a form built straight from `frontMatterFieldsFor(dialect)` — one row
   per required scalar field, an optional field (`status`, a dialect-aware
   live/archived or live/draft `<select>`) shown only once it exists, a
   "+ Status" button to add it, and a "×" to remove it. Editing commits on
   a field's own `change` event through a new `commitFrontMatterField`,
   which patches just the one block the same way `commit()` already does
   for a live editor, except there is no `EditorView` behind a plain HTML
   field to read from. `setFrontMatterField` touches only the one line
   that changed — every other line's bytes, key order and quoting are
   untouched, `src/frontmatter.test.ts` checks this directly, not only
   `commit()`'s own shape check. A list or nested mapping (`packages`,
   `covers`, `practice_for`, `practice_across`) gets no row: an
   "Edit raw YAML" toggle in the form's footer falls back to the exact
   flat-CodeMirror editor every other block already uses, so those fields
   stay reachable without the form pretending to understand them. A
   "Done" button collapses back to the one-line summary. Plain markdown's
   front matter (`frontMatterFieldsFor("plain")` is empty — arbitrary
   keys, no fixed schema per DIALECTS.md §3) skips the form entirely and
   opens straight to the raw editor, as before.

   `module` and `series` started this slice as plain text, since step 4's
   file index didn't exist yet when this slice began; by the time it
   merged, a separate line of concurrent work (step 5.10/8, below) had
   landed `file-index.ts` on `main`. With the blocker gone, finishing
   decision 11 properly took one more step rather than shipping the
   second-best version: both fields now carry `indexedAs` in
   `frontmatter-fields.ts`, and `app.ts` attaches a plain `<datalist>` —
   populated from `distinctValues(sharedFileIndex, ...)`, the same shared
   index `link-picker.ts` already reads — to each one's text input. A
   `<datalist>` suggests, never restricts, so it is decision 11's own
   "picker... with a 'new' escape hatch" without a custom overlay
   component; an empty index (nothing opened yet) just leaves the field
   an ordinary text input.

   **Fifth slice built**: the whole-file source view §5.1 already named
   as the third option's own upgrade path — `src/source-view.ts`, a
   Cmd+/ overlay showing the entire document in one CodeMirror instance,
   fence markers and front matter included, the same `sourceLanguageExtension`
   a focused prose block's own raw view already uses. Modelled on
   `command-palette.ts`'s full-screen overlay, not `outline-panel.ts`'s
   or `dialect-panel.ts`'s docked side rail: those stay open *alongside*
   a still-editable document underneath, fine for a read-only outline or
   a one-shot convert, but this view is a second, complete editing
   surface over the very same content — letting both it and the block
   surface accept edits at once would mean whichever closes last
   silently wins, and taking over the screen removes the ambiguity
   rather than trying to reconcile it. Applies its edit on close (the
   close button, Escape, or Cmd+/ again), not on every keystroke, for
   the same reason a per-block commit only ever fires on blur —
   reparsing the whole document as the reader types would tear this very
   editor down mid-edit. Reachable from the command palette too
   (`command-palette.ts`'s own "find the button and click it" pattern,
   unchanged). *Done when* opening and closing with no edit round-trips
   the document byte for byte, and an edit made in the whole-file view
   shows up in the ordinary block surface once closed.

   **Sixth slice built** (`src/cell.ts`'s `setCellHeaderField`/
   `replaceCellCode`, `app.ts`'s `fenceCodeViews`, decision 27): the
   "cleanest and simplest editing experience" thread's own centrepiece —
   a runnable fence's `id:`/`hint:`/`expect:`/`name:` header lines render
   as a compact form (the language as a label, `id` always shown, the
   rest behind a "+ field" until asked for), and the fence's own live
   editor holds only the code beneath them, not the fence markers or
   header lines mixed in. Decision 15 is untouched — still one live
   CodeMirror instance per fence, always — only *which text* that
   instance holds changed. Four real treatments were mocked up and
   compared before choosing this one over a full Obsidian-style
   cursor-aware decoration system; decision 27 has the comparison and
   why the chosen one won on cost. `id` edits go through their own path,
   confirmed before a genuine rename and refused outright on an empty
   value or a collision with another cell's id (DIALECTS.md §1's own
   contract, and the same warning dewlab's own authoring editor gives);
   `hint`/`expect`/`name` patch only the header bar's own DOM, so editing
   one never costs the code editor its cursor position or undo history.
   Scoped to `isRunnableFence` fences (`python exec`/`sql exec`) only —
   the one shape with these header lines to begin with. *Done when*,
   satisfied: a cell with every header field set round-trips through the
   mounted DOM byte for byte with no edit made, editing the code below a
   just-added hint keeps both, and a rename is refused, confirmed, or
   applied exactly as DIALECTS.md's own contract requires.

   (This section's own "still open" list, several entries of which had
   already been closed by later steps — an image and a link in the add
   menu, drag reorder, the front-matter form, the whole-file view itself,
   the orphan blank block, a runnable fence's own raw header syntax — is
   corrected below rather than left further out of date.)

   Still open: named aesthetic presets, as above; the add menu's six
   kinds are the same regardless of dialect, not yet reading dewstack's
   five cell forms or knowing it has no maths, which decision 3 already
   promises a dialect module rather than this; a fence *other* than a
   runnable `python exec`/`sql exec` cell — a dewstack SQL cell, a site
   pane, a staged-hint fence — still shows its full raw text, fence
   markers and all, since the sixth slice above is scoped to the one
   fence shape that actually has header lines to turn into a form; there
   is no "+ Add field" for an optional front-matter field a dialect
   doesn't already give a fixed spot to (dewlab's `packages`, `covers`,
   and the rest stay raw-YAML-only) — this needs a real index of
   existing values to seed a text field with, the way `status`'s select
   seeds itself from its own fixed options, and is its own small slice,
   not folded into this one.
3. **Cells that run.** Worker runtime, output rendering, Stop, SQL,
   iframe preview for the web cells, hints and answers as folds. *Done
   when* the tutorials in the fixtures folder run the same in dewnote as
   on the built site.

   **First slice built**: a runnable fence (`isRunnableFence`, `src/cell.ts`
   — the word `exec` in its info string, dewlab's own convention) gets a
   Run/Stop bar and an output area under its editor. One Pyodide 0.28.3
   interpreter per page, in a classic Worker built from a Blob URL rather
   than a module Worker (`src/runtime/worker-source.ts`'s own header
   comment has the reasoning — Bun's bundler doesn't resolve a
   `new Worker(new URL(...))` reference the way Vite's does, so the
   worker's source is a hand-authored string, not a separately-built
   file), with `dewnote_tools.py` (a trimmed `tutorial_tools.py`)
   rendering a cell's stdout/stderr, trailing expression, pandas tables
   and matplotlib figures, and trimming a traceback to the cell's own
   frames. A shared Python namespace across the page's cells, so a second
   cell sees a first one's variables, the way a notebook does. Packages
   load lazily, per cell, via Pyodide's own `loadPackagesFromImports`
   against that cell's code, with dewlab's own `packages:` front-matter
   field (`declaredPackages`, `src/cell.ts`) read for the case that
   mechanism can't cover on its own — a package needed under a different
   import name, or without being imported by name at all — and passed to
   the interpreter's one eager boot rather than replaced by it; a page
   that never imports pandas and never declares it never pays to load it,
   which a hardcoded package list checked in and then reverted during
   this slice would not have given it. Stop has both of this section's
   own documented paths: the SharedArrayBuffer interrupt where cross-origin
   isolation makes one available, and terminate-and-restart otherwise
   (`requestStop`, `pyodide-engine.ts`) — every hosting mode this step
   ships on today lacks the headers for the first, so the second is what
   actually runs; it loses the shared namespace, same as a first run.

   The Run button shows the interpreter's own boot/package-loading status
   text while it's the thing waiting (`setStatusListener`, `app.ts`) —
   one global status slot for the one page-wide interpreter, so if two
   cells are clicked before the first boot finishes, only the more
   recently clicked one's button shows it; a known simplification, not
   an oversight, since only one boot ever happens regardless of how many
   cells asked for it.

   **Second slice built**: dewstack's SQL cells (` ```sql cell=name `,
   DIALECTS.md §2 — researched directly against dewstack's own
   `assets/sql-cell.js` and `assets/sql_tools.py`, not guessed from the
   dialect summary alone). `parseSqlCellInfo`/`sqlScriptFromFenceText`
   (`src/cell.ts`) read the fence; `dewnote_sql_tools.py` (a trimmed
   `sql_tools.py`) keeps one in-memory sqlite3 connection per `cell=`
   name, shared by every fence using that name anywhere on the page, in
   the same Pyodide interpreter the exec cells already share rather than
   a second one. Run and Reset (`runSql`/`resetSql`, `pyodide-engine.ts`)
   reuse the request/response envelope the exec-cell worker already has;
   sqlite3 itself loads lazily, on a page's first SQL cell run, the same
   "pay for what's used" discipline as `loadPackagesFromImports`.
   `persist` (`cell=name persist`) **built**, in dewnote's own shape:
   dewstack restores a saved script automatically, by silently
   overwriting the visible text on load — safe there because that text
   is disposable generated markup, never true on dewnote where a fence's
   live text is the document's own saved content (`blockTexts()` reads
   it back out on every commit). A reader instead sees a "Restore saved
   work" banner and clicks it themselves (`parseSqlCellInfo`'s `persist`
   flag, `sqlPersistStorageKey`, `src/cell.ts`; the banner and its click
   handler, `app.ts`) — nothing is ever silently overwritten. Run saves
   the script it just ran; Reset clears the saved entry along with the
   connection. Also deliberately not ported: `sql-check` (a hardcoded,
   single-tutorial quiz convention with no dewnote equivalent yet).

   **`read_sql` bridge built**, in dewnote's own shape rather than
   dewstack's: `read_sql(db_name, query)` is pre-seeded into the one
   shared exec-cell namespace every cell already has (`dewnote_tools.py`),
   not a per-name `py cell=` namespace the way dewstack's own bridge is,
   since dewnote's exec cells don't have per-name namespaces to bridge
   between in the first place — any exec cell can read any SQL cell's
   table, not just ones sharing a name with it. `dewnote_sql_tools.py`
   gained `get_connection`, the public door dewstack's own `read_sql`
   uses too. Loading sqlite3 and pandas for a cell that calls `read_sql`
   is triggered by a plain substring check on the cell's own code (the
   literal text `read_sql(`) run before it, since a function call — unlike
   an `import` line — is invisible to `loadPackagesFromImports`; a real
   heuristic, not exact static analysis, and documented as such.

   A hint/answer fold's own code, if it has any, was already covered
   before this section was written: `render-block.ts`'s `renderFold` runs
   markdown-it over a fold's body independently, and a quoted fence
   already renders as a real, correctly-labelled `<pre><code>` block —
   `render-block.test.ts` has checked this directly for a while.
   Deliberately **not** wired to run, on Josh's own call: a reader
   adapting a hint's code by hand, rather than clicking Run on someone
   else's answer, is the better pedagogical experience. (`blocks.ts`'s own
   header comment used to claim this was still unsolved; it wasn't, and
   the comment was simply stale — fixed alongside this entry.)

   Still open: `site=`/`app=` cells (dewstack's iframe-based web and
   full-stack tracks) are unbuilt — they need consecutive-fence grouping
   dewnote's block model doesn't have yet, a materially different piece
   of work than a single-fence cell kind, deliberately put on hold rather
   than folded into this one (Josh's own call — the design isn't settled
   yet); `sql-check` is deliberately skipped too, on the same call, rather
   than inventing a check registry no other part of dewnote uses yet.
   The persisted-script localStorage key is name-only like dewstack's,
   with no per-document identity yet to fold in, so two differently-named
   documents each using the same `cell=name persist` would offer each
   other's saved script for restore — harmless given restore is a
   reader's own explicit click, not silent, but still a real gap once
   dewnote has more than one document open in the same browser.
   Verification gap specific to this environment, not to
   the feature (every slice of this step shares it): the sandbox this
   work was built in blocks outbound access to `cdn.jsdelivr.net`, so
   `tests/e2e/pyodide.spec.ts` could not be run to a real pass from
   inside it — confirmed as a network-policy
   block, not an application bug, with a standalone script that reached
   the same dynamic `import()` call (and, for the SQL cells, the same
   click-to-run wiring) and watched it fail on the tunnel, not on
   anything before it. `.github/workflows/e2e-pyodide.yml`
   (`workflow_dispatch` only, kept out of the push/PR gate the same way
   `tests.yml` already keeps the rest of the e2e suite out of it) exists
   so the same tests can actually run somewhere with real network access.
4. **Files.** The store interface, the browser store with OPFS and folder
   mounting, the files rail, the series view from `order.yaml`, new
   tutorial from a template, new series. *Done when* a module folder from
   dewlab can be opened in Chrome and worked on for an afternoon.

   **First slice built** (`src/store.ts`, `src/file-bar.ts`, #18): the
   quiet file bar every later panel is modelled on — a filename control
   (Open, the current name, Save), mounted the same fixed, always-there
   way `settings-panel.ts` mounts its own gear icon. `OpenedDocument`
   is one type with a nullable `handle` rather than two document types
   with duplicated plumbing: `showOpenFilePicker()` (Chrome, Edge) keeps
   a real, writable `FileSystemFileHandle` and Save writes straight back
   to it; the `<input type=file>` fallback (Safari, per decision 5, which
   has no File System Access API at all) has no such handle, and Save
   downloads instead. Dropping a file anywhere on the page opens it
   either way.

   **Second slice built** (`src/folder-store.ts`, `src/folder-panel.ts`,
   #20): mounting a real local folder — `~/dewlab/tutorials/`, say —
   rather than one file at a time, again Chrome/Edge only (the toggle
   itself disabled and saying so on Safari), via the directory picker's
   own recursive walk (`DirectoryLike`, a minimal shape of
   `FileSystemDirectoryHandle` kept exercisable against a hand-built fake
   in tests without a real browser). Search filters the listed markdown
   files by path; opening one hands the file bar exactly the single-file
   case the first slice already built — a name, content, a real writable
   handle — so Save and the dirty indicator needed no second
   implementation. §5.10's own file-front-matter index
   (`src/file-index.ts`) is built here too: one pass over every listed
   file's front matter (never the body, so a large folder stays fast),
   feeding `link-picker.ts`'s search and, once a folder is open, the
   front-matter form's `module`/`series` autocomplete (decision 25). *Done
   when*, satisfied: a dewlab module folder opens in Chrome, its files
   list and search, and one opens, edits and saves through the same bar
   a single dropped file already uses.

   **Third slice built** (`src/series.ts`, `src/series-panel.ts`),
   read against dewlab's own `build.py` rather than guessed from this
   document's own summary — which turned out to be wrong in one real
   way, corrected in DIALECTS.md §1 alongside this: an order file is a
   genuine two-key mapping (`series:`, `order:`), not a flat list.
   `folder-panel.ts` and `repo-panel.ts` each gained a `listOrderFiles`
   read (`folder-store.ts`'s and `github.ts`'s own new function,
   factored out of the existing markdown walk/tree-fetch so the walk
   itself is written once, matched against `.order.yaml` instead of
   `.md`), handed to a new optional `onSeriesChange` callback the same
   shape `onIndexChange` already has. `series-panel.ts` is a read-only
   rail, closed until asked like every other one here, grouping every
   series by its module and listing each in its own reading order,
   showing an entry's real title from the file index where the slug is
   actually indexed and the bare slug otherwise — an order file naming a
   tutorial dewlab's own build would reject outright is a perfectly
   ordinary thing to see in an editor that hasn't opened every file yet.

   Deliberately not built, and not silently narrowed into this: opening
   a listed tutorial with a click (needs a store-agnostic "open this
   path" hook neither `folder-panel.ts` nor `repo-panel.ts` exposes
   today — real plumbing, not a detail); `series.yaml`'s own cross-series
   chaining and `modules.yaml`'s own module ordering (both real dewlab
   files, found while reading `build.py` rather than assumed, but purely
   about *glossary accumulation and module display order* for a build —
   nothing this session's series view needs); reordering a series or
   creating a new one, each listed as its own separate item on this same
   line. *Done when* opening a folder or repository with real
   `order.yaml` files shows every series, grouped by module, each in the
   order its own file lists, with indexed titles where available.

   Still open: no OPFS private-vault mode (decision 5's own "browser
   store" half beyond a folder or a single file); no "new tutorial from a
   template" or "new series" affordance; the file index and the series
   view are both built once, on open, not refreshed on save (§5.10's own
   other half) — a folder edited entirely through dewnote itself stays
   accurate, since every edit still round-trips through the same
   in-memory document, but a file changed by some other program while the
   folder stays open would not be picked up until it's reopened; opening
   a listed tutorial from the series view with a click (needs a
   store-agnostic "open this path" hook neither `folder-panel.ts` nor
   `repo-panel.ts` exposes today); reordering a series or creating a new
   one.
5. **GitHub.** Token, open a repository, edit, commit to a branch, draft
   PR, link checking against real slugs. *Done when* a change to dewlab
   goes from dewnote to a PR without a terminal.

   **First slice built** (`src/github.ts`, `src/repo-panel.ts`, #19): a
   thin `fetch` client against GitHub's REST API, in FAQ's own shape
   (plain fetch, SHA-conflict semantics) rather than an SDK — read a
   repository's markdown tree, fetch one file's content and SHA, write it
   back as a commit on a working branch (never straight to the base
   branch), open a draft pull request as the way to hand the change back.
   The token lives in `localStorage`, scoped to this app's origin, never
   written to a file (decision 5.7, carried over from FAQ and dewlab). A
   push that lands on a 409 — another dewnote tab, or a commit made
   straight on GitHub, changed the file since it was opened — shows both
   versions rather than picking one, FAQ's own rule: the reader chooses
   to keep their edit and overwrite, or take the remote copy and lose
   theirs, but nothing is ever silently clobbered. Deliberately not
   built in this slice: any front-matter index or module/series picker
   (needed step 4's fuller multi-file concept, since built separately)
   and any OPFS or local-clone mode — the REST API only.

   **Link checking built** (`src/link-check.ts`), the one item in this
   step's own line that stayed unbuilt after browse/edit/push (#19):
   DIALECTS.md §1's own "the editor should offer a picker over real
   slugs and anchors and check links on save" — link-picker.ts is the
   picker half; this reads every `tutorial:slug` link already in the
   document and reports any whose slug isn't in the current file index,
   the same index the picker itself searches. A manual "Check links"
   panel, the same "closed until asked" shape every other rail here
   already has, rather than the "on save" trigger DIALECTS.md itself
   suggests — that would mean this module reaching into file-bar.ts's,
   folder-panel.ts's, and repo-panel.ts's three separate save paths, a
   real piece of coupling left as a follow-up rather than folded in
   quietly. Anchor checking (a dead slug *or anchor* fails the build,
   per DIALECTS.md) is left open too: an anchor is a heading in some
   other document, which the index never reads, only front matter, for
   the same speed reason link-picker.ts's own search already depends
   on — checking anchors for real means reading and parsing every linked
   file's body, materially more work than comparing a slug against a
   list already in memory. *Done when* a document with both a real and
   a broken `tutorial:` link reports only the broken one, and a clean
   document says so rather than showing nothing.
6. **Exports.** Jupyter out and in, dialect conversion, HTML page.
   *Done when* a tutorial survives markdown → ipynb → markdown unchanged.

   **First slice built** (`src/export-html.ts`, #21): §5.8's own "the
   rendered document with the stylesheet and KaTeX CSS inlined, cells
   shown with their last output, no runtime — a page to send to
   someone," scoped to what the document model can actually give it. A
   cell's last output lives only in the live worker and the live DOM for
   as long as a page stays open (`runtime/pyodide-engine.ts`'s own
   namespace) — never written back into the block text the way an edit
   is — so this exports the rendered *source* faithfully (prose, maths,
   folds) and a fence as a plain, labelled code block: the same honest
   illustrative treatment a fold's own quoted code already gets
   (decision 23), not a captured run this architecture has nowhere to
   keep between a Run click and a later export.

   **Second slice built** (`src/jupyter.ts`, #22): nbformat 4.5, in and
   out, made genuinely lossless rather than merely plausible — every
   exported code cell also carries `metadata.dewnote.raw`, the block's
   own exact original text straight from `blocks.ts`, and import plays
   that back verbatim when it's present (always, for a document dewnote
   itself exported) rather than reconstructing a fence's bytes from
   parsed pieces (id, hint, info, header order) and hoping nothing was
   unusual — the same "never reconstruct what you can just keep"
   discipline `blocks.ts`'s own round-trip guarantee already runs on. A
   notebook with no such metadata (authored directly in Jupyter) falls
   back to a best-effort reconstruction instead, since there is no
   original text to play back. Left out, honestly rather than by
   oversight: dewstack's SQL, `py cell=`, and `site=`/`app=` cells
   export as illustrative code, never marked runnable — this only knows
   dewlab's `exec` convention.

   **Third slice built** (`src/dialect-convert.ts`, `src/dialect-panel.ts`,
   #23): DIALECTS.md §5's own conversion table, followed directly rather
   than re-derived, applied block by block with a report of what didn't
   map — dewlab's `hint:`/`expect:`/`name:` have no home in dewstack's
   `py cell=x` and are reported dropped; dewstack's `persist` has no home
   going the other way; dewlab's own staged-hint fence and `sql exec`
   have no dewstack equivalent at all; dewstack's `sql-check` and `app=`
   become illustrative fences on the way to dewlab, reported; either
   dialect dropped to plain markdown keeps the language and drops the
   attribute. `dialect-panel.ts` makes the table reachable without a
   terminal, a real dialog rather than a hover reveal since reading the
   report after converting is the whole point of having one. *Done
   when*, satisfied: a tutorial survives markdown → ipynb → markdown
   unchanged (the raw-metadata round trip is exactly why), and a
   documented, reported gap — not a silent one — is what happens when a
   dialect genuinely has no equivalent for something.

   Still open: HTML export has no live Python output at all, by design
   (decision 23's own "illustrative" treatment, not a gap this step
   could close without the document model itself holding a cell's last
   run); the ipynb export's own dewlab-only "which fence is runnable"
   rule means a dewstack tutorial's SQL and site cells round-trip as
   inert code in a notebook, never as something Jupyter itself could run.
7. **The Mac app.** Tauri shell, native store, keychain, file watching,
   run the build and open the result. *Done when* the app opens a folder
   from Finder and saves back to it.

   Not started. The only one of steps 1-6 and 8 with nothing built yet.
8. **Finish.** Command palette, outline rail, images with an `alt` prompt
   and a copy into the tutorial folder, link picker, the live-preview
   decorations if step 2's block editing still wants them.

   **Built**, across five slices: the outline rail (`src/outline-panel.ts`,
   #24) reads headings straight out of the document's own prose blocks —
   not a second markdown parse of the rendered HTML — and a click scrolls
   the matching block into view, using nothing of `app.ts` beyond the
   `data-index` attribute every block wrapper already carries. The
   command palette (`src/command-palette.ts`, #25) is deliberately not a
   second implementation of what a rail already does: every command is
   "find the button that rail already put in the DOM and click it," so
   the palette is the one place that has to know every rail's toggle
   exists, and none of them have to know the palette exists. Images with
   an `alt` prompt (`app.ts`'s own `pickImageFile`/`readAsDataUrl`, #26)
   insert a picked file inline as a `data:` URI. The link picker
   (`src/link-picker.ts`, shipped alongside the front-matter index in
   #28) is a self-contained async prompt over `file-index.ts`'s own
   search by title or path, inserting dewlab/dewstack's own
   `[text](tutorial:slug)` convention for an entry with a slug, or its
   bare path for one without; with no index yet (nothing opened) it
   falls back to typing a link by hand, since a URL to somewhere else
   entirely is too common a case for a slug-only picker to leave with no
   way in. A shared icon rail (`src/icon-rail.ts`, decision 28) replaced
   the eight independent `position: fixed; top: Nrem` offsets each panel
   toggle had picked for itself one at a time — one hand-spaced number
   per panel, with the repository toggle left on the opposite edge of
   the screen from the rest for no reason beyond who wrote it. Every
   toggle now appends into one flex-column container instead of
   `document.body` directly, keeps its own class name (so no existing
   Playwright selector needed to change) and gained a `title` tooltip
   alongside its existing `aria-label`. Plain markdown's front matter
   (decision 29) gained a one-line caption explaining why it opens as
   raw YAML rather than a form, and naming the fix (`year:` or
   `module_title:`) instead of only the absence — found looking at the
   starter document itself with fresh eyes for this same workstream.

   Still open: **"a copy into the tutorial folder"** is this step's own
   line, not yet true — a picked image is inlined as a `data:` URI, never
   saved as a real file alongside the document the way a dewlab tutorial
   image (`![alt](name.png)`, a bare file name resolved against the
   tutorial's own folder, DIALECTS.md §1) actually needs; a document
   exported or pushed today carries every image's full bytes inline
   rather than a real, reusable file. The live-preview decorations
   remain exactly as conditional as this line always named them ("if
   step 2's block editing still wants them") — not attempted, and
   folding a fence's own raw syntax out of its blurred view (the
   "cleanest and simplest editing experience" workstream this section's
   own step 2 entry is heading toward) may turn out to be the same piece
   of work under a different name, not two.

   A bigger question surfaced but deliberately not decided here:
   `main.ts`'s `STARTER_DOCUMENT` carries no `year` or `module_title`,
   so `detectDialect` reads it as plain and a first-time reader never
   sees the per-field form, dialect-aware preview styling, or anything
   else gated on a real dialect — the very features most worth showing
   in a first five minutes. `dialect.ts`'s own comment calls plain "the
   safe default, since plain markdown is a strict subset of what either
   site's dialect can hold," and dewlab's own texture is already
   dewnote's default rendering regardless of a document's front matter
   (§5.3) — so making the starter document model one specific dialect
   is a real identity choice (which one, and whether to pre-fill seven
   required dewlab fields with placeholder values to make its own form
   render cleanly), not a bug fix, and stayed open rather than picked
   unilaterally.

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

## 8. dewlab's own 2026-09 changes, and what they mean for dewnote

Written 2026-09-12, after dewlab's own `planning/DEWSTACK_MERGE.md`
(2026-09-10) and the commits either side of it. `DIALECTS.md` §§1-2, 5
are already updated against these; this section is the order of work to
close the gap they describe. Not started yet — a plan, the way this
document's own header describes itself, not a record of what's built.

**0. A correctness fix, ahead of everything else here.** `cell.ts`'s
header parser only recognises `id:`/`hint:` (`HEADER_RE` there); dewlab's
own now recognises `id:`/`hint:`/`expect:`/`name:` (`d2a21ed`,
2026-09-10). Opening a real dewlab tutorial that uses `expect:` or
`name:` today has that line fall through into the cell's own *code* —
harmless for the round-trip (blocks.ts still preserves it byte for byte,
same as it always has), but wrong the moment Run is clicked, since
`parseCellSourceFromFenceText` hands that line to Pyodide as Python and
`expect: len(readings) == 4` is not valid Python. *Done when* `cell.ts`
recognises all four header keys, preserves `expect:`/`name:` verbatim
(dewnote does not evaluate `expect:` yet — that's item 3 below, or later
— it only has to stop swallowing the line), and a fixtures document using
both runs its actual code, not its header line.

1. **`sql exec` cells.** DIALECTS.md §1 has the full grammar and the
   runtime shape (`_run_sql_cell(db, script)` wrapped around the fence's
   raw SQL, run through the same Pyodide exec pipeline every `python
   exec` cell already uses, against one page-wide shared connection
   seeded the first time a page needs it — not dewstack's per-name
   database model dewnote's existing dewstack SQL support already
   handles separately in `dewnote_sql_tools.py`). Needs: `cell.ts` to
   read a fence's language word (`python` vs `sql`, mirroring dewlab's
   own `CELL_TYPES`) rather than assuming every exec cell is Python;
   `lang.ts` to highlight a `sql exec` fence as SQL; a shared-`db`
   seed-on-first-use in `pyodide-engine.ts`/`dewnote_tools.py`, ported
   from dewlab's own `SEED_SQL_DB_SOURCE`; the SQL-wrapping call site in
   `app.ts`'s cell runner, alongside the Python case it already has, not
   replacing it. *Done when* a `sql exec` cell in the fixtures folder
   runs its query against the shared `db` and shows a real table, and a
   `python exec` cell run afterward on the same page can see whatever
   that query left behind (dewlab's own shared-namespace behaviour).

2. **The `hint` fence — built, in a shape corrected once actually
   building it met decision 15.** DIALECTS.md §1 has the grammar
   (`for:`/`after:`/`title:`, defaulting to the cell just above, `errors:5`,
   and dewlab's own default title). Round-trips safely as an opaque
   fence, unchanged. The plan as first written here said `render-block.ts`
   should render a `hint` fence as a fold "matching the look of a
   `dl-hint` fold" — which turned out to conflict with decision 15's own
   rule that a fence never gets a rendered/blurred state at all, folds
   included; giving one fence kind a render/edit toggle no other fence
   has would be a real architectural exception, not a rendering detail.
   Built instead: the fence stays a live editor like every other (its
   `for:`/`after:`/`title:` headers and body all directly editable,
   headers included, the same as any exec cell's own), and
   `render-block.ts`'s new `renderHintFencePreview` builds a read-only
   preview — the same `<details class="dl-hint dl-hint-staged">` markup
   dewlab's own build emits, open rather than hidden (no reader-side
   trigger to gate a reveal on) — shown *beside* the editor, the same way
   a cell's own Run bar and output sit beside its code rather than
   replacing it. `dialect-convert.ts` gained the rule DIALECTS.md §5
   names: dewstack has no equivalent, so either direction through
   dewstack drops it as illustrative and reports. *Done when* a fixtures
   document with a `hint` fence shows its title and body in dewnote's own
   preview alongside the still-editable fence, and converting that
   document to dewstack reports the drop rather than silently keeping a
   fence dewstack's own build would reject.

3. **`html site`/`css site`/`js site` cells — built, with the grouping
   in a different file than first planned.** This is plan §6 step 3's
   own long-deferred "`site=`/`app=` cells... need consecutive-fence
   grouping dewnote's block model doesn't have yet" — postponed there
   for exactly the reason DIALECTS.md §1 now gives in full: dewlab
   settled its own spelling only in 2026-09, so there was no stable
   target to build against before now. The plan as first written here
   said the grouping work belongs in `blocks.ts`; built instead in a new
   `site-cell.ts`, because deciding which fences group together means
   reading a `site:` header *inside* a fence's own body, and `blocks.ts`
   only ever looks at a fence's info string to split the document
   correctly (`cell.ts`'s own header comment already states this as the
   general rule for every other fence kind's header lines — grouping is
   the same rule, applied to a decision about several fences instead of
   one). `site-cell.ts`'s `findSiteGroups` walks `doc.blocks` directly:
   consecutive `html site`/`css site`/`js site` fences sharing one
   `site:` value group (a blank-only prose block between two panes
   doesn't break it — an ordinary blank line between two fences is its
   own orphan prose block, per `blocks.ts`'s own trailing-blank-line
   rule, not real content); a second pane of a language already claimed
   starts a fresh group instead of overwriting the first. `cell.ts` reads
   `id:`/`site:` off the header (`SITE_HEADER_RE`, alongside the
   exec-cell one); `runtime/site-relay.ts`'s `mountSite` — dewlab's own
   words for the shape (`DEWSTACK_MERGE.md` §3: "`mount(container,
   {html, css, js})` returning `{run, destroy}`") — drives a sandboxed
   `srcdoc` iframe, HTML/CSS rebuilding immediately, a `js site` pane
   running only on an explicit Run click with its console relayed back
   through `postMessage`. `app.ts` renders every pane as its own live
   editor, same as any other fence, with the group's one shared preview
   hosted after its *last* pane; editing any pane forces a full
   `render()` on blur (`commit()`'s own new check) rather than the
   single-block patch every other fence gets, since the preview lives on
   a different block's wrapper than whichever pane just changed — the
   one deliberate extra cost this feature has that no other fence kind
   does. `dialect-convert.ts` gained both directions DIALECTS.md §5 now
   names: dewstack `site=name` → dewlab `html/css/js site` (a fresh
   `<name>-<language>` id per pane); dewlab's own site fence back to
   dewstack (`id:` dropped, reported — `site=name`'s own info string is
   the whole identity there).

   A real, separately-found bug along the way, not part of the plan as
   written: `runtime/site-relay.ts` builds the sandboxed frame's own
   `<script>` tag as a JS string inside dewnote's *own* bundle — which is
   itself one `<script type="module">` element in `index.html`. The
   browser's HTML parser ends that outer element on the first literal
   closing-script-tag text it finds anywhere in its raw content, JS
   string literals included; the standard `<\/script>` escape in the
   TypeScript source wasn't enough on its own, because Bun's minifier
   normalises that escaped slash to a bare one (a legitimate
   simplification on its own — the two are always equivalent JS
   escapes), quietly reintroducing the exact literal text the escape was
   there to avoid. Found by a real build breaking every page load with a
   `SyntaxError: Unexpected end of input` pointing at `index.html`
   itself, the outer script element cut off mid-file — not assumed,
   caught because this step's own e2e suite runs the actual built app the
   same as every other step's does. Fixed by building the tag's angle
   bracket from `String.fromCharCode(60)` at runtime instead of writing
   it as source text at all, immune to a minifier's escape-normalising
   the way a plain backslash trick is not.

   *Done when* a fixtures page with a two-pane (`html site`+`css site`)
   group renders a live preview in dewnote the way it would on dewlab's
   own built page, editing either pane updates the preview, and a
   `js site` pane's Run button actually runs its script in the sandboxed
   frame — all true, checked directly against the real built app, not
   only against `bun test`.

Order matters here more than usual: item 0 is a real bug fix and costs
almost nothing, so it goes first regardless of what else is picked up.
Items 1-3 are independent of each other and can be built in any order —
listed here in the order dewlab itself built them (data track before web
track), not because dewnote must follow the same sequence. Item 4 depends
on all three existing first — there is nothing to consolidate a shared
shell out of until the panels it draws from are real.

4. **One shared shell for a fence's below-editor panels — built, this
   project's own idea rather than dewlab's, deferred to land after items
   0-3 rather than guessed at ahead of them.** Raised while planning this
   section: "let's make a plan for all but the panels, I think we can do
   better than panels after we have everything in place." By the time
   items 0-3 landed, four of these existed — a runnable cell's Run/Stop
   bar and output, a dewstack SQL cell's restore banner and output, a
   staged hint's read-only preview, a site group's live preview — each
   built in its own PR, each its own ad-hoc `<div>` tree with its own CSS
   namespace (`dn-cell-*`, `dn-sql-*`, `dn-hint-*`, `dn-site-*`) and no
   shared rule at all, so a spacing or border change meant four edits, by
   hand, which is exactly what happened once per feature this section.
   `app.ts` gained one shared `buildFencePanel(modifierClass, ...children)`
   — a thin `<div class="dn-fence-panel {modifierClass}">` that filters
   out `null`/`undefined` children so a caller can pass an optional part
   (a restore banner, a Run bar that only exists when a site group has a
   `js` pane) inline instead of building the child list up with
   conditional pushes. All four builders now construct on top of it;
   `app.css` gained one `.dn-fence-panel` rule carrying the spacing every
   panel already shared, with `.dn-site-preview`'s own border/radius/
   card look kept as a deliberate per-kind override, not folded in —
   genuinely different content (an iframe host, not just text) earns a
   genuinely different look, and forcing one skin onto both was never the
   point. Every existing per-kind class (`dn-cell-panel`, `dn-hint-preview`,
   and so on) stays exactly as it was, both for its own styling and
   because several already carry test coverage by name.

   One design call, made rather than left open: whether a site pane's own
   label (`html · site: hero`, shown above its editor) belongs in this
   family too, moved below like everything else, for consistency. Kept
   above, on purpose — it labels the editor a reader is about to read,
   the way a tab or filename sits above a file's contents, not a result
   the editor produced. The four panels this item consolidates all show
   something that happens *because of* the fence above them; the site
   label isn't that, and forcing it into the same shell to chase a
   surface-level consistency would have papered over a real difference
   in kind rather than removed one.

   *Done when* all four panels build on `buildFencePanel`, `bun test src`
   and the full e2e suite (`tests/e2e/hint-fence.spec.ts`,
   `site-cell.spec.ts`, `surface.spec.ts`'s SQL-restore tests,
   `pyodide.spec.ts`'s cell/SQL-runner tests) still pass unchanged against
   the same class names, and a spacing change to `.dn-fence-panel` visibly
   affects all four without touching any of their own files.

**Left open, on purpose:** `sql-check` (dewstack) and `app=` (dewstack's
full-stack track) both stay unbuilt, matching dewlab's own choice not to
port them yet (`DEWSTACK_MERGE.md` §2 in dewlab: full-stack needs both
tracks live first, and isn't scheduled). `expect:`'s own runtime meaning
— evaluating it after a run and using the result to drive anything —
is not proposed here at all; dewnote is an authoring surface, and
whether an author-side "does this look right" check ever belongs in it
is a question worth asking Josh directly rather than assuming yes because
dewlab has it on the reading side.
