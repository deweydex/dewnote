# How dewnote is built

dewnote opens a folder of markdown, or a GitHub repository, and edits the
tutorials in it as documents rather than as text. There is no server: the
files come from the reader's own disk or from the GitHub API, Python runs
in a Worker in the tab, and the whole application is one HTML file.

---

## The shape

```
index.html            three mount points
src/style.css         the chrome, in dewlab's own tokens
src/theme/            dewlab's tokens, vendored

src/editor.ts         the only module that knows Milkdown exists
src/cells.ts          what a runnable fence says
src/markdown.ts       reading a document the editor has not opened
src/frontmatter.ts    the leading `---` block

src/store.ts          folder and repository behind one interface
src/folder.ts         the File System Access API
src/github.ts         the REST API

src/workspace.ts      the index: what every file is and where it sits
src/modules.ts        course descriptors
src/shell.ts          spine, palette, commands, save
src/spine.ts          the left margin
src/workspace-palette.ts   ⌘K
src/commands.ts       one place a command is named
src/settings.ts       what the reader chose
src/settings-panel.ts the panel that changes it

src/runtime/          Pyodide, in a Worker
```

---

## The document

The document is a ProseMirror tree owned by Milkdown, through its Crepe
preset. Saving re-serialises it. That means every construct dewlab writes
has to survive a round trip, and the first test in this repository
(`tests/e2e/roundtrip.spec.ts`) is the one that says whether it does.

Two properties are asserted, and they are not the same thing:

- **nothing structural is lost** — fence info strings, cell ids,
  headings, `<details>` folds and maths blocks come back as they went in;
- **the pass is idempotent** — `f(f(x)) == f(x)`.

The second is what makes the first tolerable. A file is normalised at
most once, the first time it is saved, and is byte-identical from then
on. Against the 184 markdown files in a dewlab checkout: 94 round-trip
byte-for-byte, 184 are idempotent, 184 keep everything structural. What
differs in the other 90 is bullet markers, blank-line placement, table
cell padding, autolinks and escaping.

`planning/probe/` runs that measurement against a whole dewlab checkout,
which CI does not have. Run it before taking a Milkdown upgrade.

### Three things `editor.ts` has to know

**A schema is replaced by re-registering it under the same id.**
`ctx.update(codeBlockSchema.key, …)` inside `editor.config()` updates a
value that `$node`'s runner has already read, so it does nothing at all —
silently. `codeBlockSchema.extendSchema(handler)` passed to `.use()`
works, because `$node` registers into `nodesCtx` with
`ns.filter(n => n[0] !== id)` and the last registration wins.

**Crepe models a `$$` maths block as a code fence whose language is
`LaTeX`**, converted in and out by its own extension of that same schema.
Re-registering the schema drops Crepe's extension, so ours carries the
same branch:

```ts
if (String(node.attrs.language ?? "").toLowerCase() === "latex") {
  state.addNode("math", undefined, node.content.firstChild?.text || "");
  return;
}
```

Anything that extends `code_block` has to keep that branch. Without it,
every block of maths in the corpus becomes a fence — 18 files.

**Display maths is normalised on the way in.** Milkdown handles exactly
one form correctly, `$$` alone on its own line at each end. A block whose
delimiters share a line with content is *destroyed*: `$$a = 1\nb = 2$$`
comes back as `$$$\nb = 2$$\n$$$`. A block written on one line is read as
inline maths and comes back at a different size. `canonicaliseDisplayMath`
rewrites both into the form that survives, before Milkdown reads the
file. dewlab's `DISPLAY_MATH_RE` accepts all three, so what a page
renders never changes.

---

## The cell

**A code block mounts when it scrolls into view.** Until then it is a
plain `<pre>` placeholder, so a document whose cells are below the fold
reports zero CodeMirror instances and zero Run buttons. This is Crepe
behaving as designed, and it is the single easiest thing to mistake for a
broken editor — any test that asks about a cell has to scroll to it
first.

A fence is runnable when the word `exec` appears in its info string —
dewlab's own convention, and the reason `editor.ts` keeps a `meta` attr
at all. Crepe's preset reads mdast's `lang` and drops its `meta`, which
loses `exec`, `site`, and `cell=name persist`.

Execution hangs off Crepe's `renderPreview` hook rather than a node view
of our own, with two constraints that decide the shape:

- **The hook fires on every keystroke.** It is a Vue `watch` on the
  block's text. So it builds the panel and never starts a run; only the
  panel's own button does.
- **Crepe's preview toggle renders only when a preview already exists**,
  so it can never be the thing that creates one. The panel is the Run
  affordance, and Crepe's toggle then hides the *code*, which is the
  right gesture for a finished cell someone is reading.

**Crepe's preview panel is display-only.** It renders whatever
`renderPreview` hands back by assigning `innerHTML`, which serialises the
element and re-parses it — so every event listener on it is lost. The Run
button is therefore markup carrying its own `data-dn-cell`, and one
delegated listener on the editor root does the work. A listener attached
to the button renders perfectly and does nothing at all, which is the
kind of fault a test asserting the button exists will happily miss.

A result is keyed by the cell's `id:` and remembers which body produced
it, so fixing a typo leaves the last output visible and marked as
belonging to the older code.

One cell runs at a time, and the button that started it becomes Stop.
`requestStop()` writes Pyodide's own SIGINT into the shared interrupt
buffer; where a page has no cross-origin isolation the worker is
terminated and restarted instead.

---

## Images

An image lives beside the document that names it, and the markdown says
only its bare name because that is what both builds resolve.

The resolved URL goes on the `<img>` element, never on the node, so a
save writes the name rather than a blob URL. ProseMirror re-renders an
image whenever its node is touched, which drops that URL, so
`drawLocalImages` watches the editor root rather than running once.

A pasted image goes through `plugin-upload`'s uploader: written beside
the document under a name that is free, and referenced by that name. Not
inlined as base64 — that is a file nobody can open, edit or replace.

**Never add a `@codemirror/*` package at the top level.** Crepe carries
its own, and a second copy in the bundle breaks its `instanceof` checks:
"Unrecognized extension value in extension set", and no code block
mounts at all. Removing the dependency is not enough on its own — a
stale `node_modules` keeps the copy, so `rm -rf node_modules && bun
install`. This is why the source view is a textarea.

## Export

`exportHtml` renders from the markdown, not from the editor's DOM. The
DOM carries contenteditable attributes, Vue wrappers, and code blocks
that have not mounted because they are below the fold; the markdown is
the document.

KaTeX's stylesheet is inlined only when the rendered page contains
KaTeX's own output — asked of the result rather than guessed from the
source, because a sentence about costing $5 and $6 is not maths.

Which is the other thing here: **remark-math claims any `$…$`**, and
dewlab's build does not — its `INLINE_MATH_RE` refuses a span with
whitespace against either delimiter. `unmathPlainDollars` puts those
spans back as text, in the editor and in the export alike, so what is on
screen is what the site will show. A save then writes `\$`, which dewlab
renders as `$`.

### The page a reader reads

`export-html.ts` renders the markdown, not the editor's DOM: the DOM
carries contenteditable attributes, Vue wrappers, and code blocks that
have not mounted because they are below the fold. **Preview this page**
and **Save as an HTML page** are the same function, one to a tab and one
to a file.

It inlines `theme/reading.css` and dewlab's tokens, not `style.css`.
`style.css` describes the editor — the spine, the palette, Crepe's own
chrome — and almost none of it applies to plain markdown markup.

The tokens are read once, in `theme/tokens.ts`, and used twice: the
editor needs them as a stylesheet and the export needs the same bytes as
text. A file cannot be imported both ways, since the bundler picks one
loader per specifier, so it is imported as text and made a stylesheet by
hand. Getting that wrong is silent: every `var(--dl-*)` resolves to
nothing and the page reads in the browser's default serif at full window
width, with a `<style>` tag present the whole time. The e2e test
therefore asserts computed font, size and heading colour rather than the
tag.

## The store

```ts
export interface Store {
  readonly kind: "folder" | "repo";
  readonly label: string;
  list(): Promise<StoreFile[]>;
  read(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array<ArrayBuffer> | null>;
  write(path: string, text: string, message: string): Promise<void>;
  publish?(): Promise<string>;
}
```

A store never touches the DOM and never decides what to show. It throws a
`SaveProblem` and nothing else, so a refused save always reaches the
author as a sentence — a save that fails silently is the worst thing this
application can do, because the next thing an author does is close the
tab.

Neither store has a file browser. The palette is the browser.

The repository store sends the blob SHA it read a file at, which is
GitHub's own optimistic-concurrency check and the only thing standing
between two tabs and a silent overwrite. A 409 means both versions exist
and the author has to choose.

---

## The interface

Two things on screen: the document, and a column of small text in the
left margin.

The **spine** is that column — filename, breadcrumb, workspace, the
document's own headings, save state, and a refusal that holds until it is
resolved. Its width is measured with a `ResizeObserver` rather than a
media query, because the measure and the margins are reader settings that
arrive as custom properties and a media query cannot read one. Too narrow
for a legible column and it folds to a row across the top.

The **palette** is ⌘K, and it indexes the workspace rather than the
application: tutorials, dewlab's own site pages, series, and every
command. A preview pane says what a row is — path, status, version,
opening sentence, headings — before Enter commits to it.

Its ranking answers two questions with two numbers. Sections are for the
eye, which wants a tutorial where a tutorial always is; the highlight is
for the hand, which wants the thing you typed. One number cannot do both:
it puts the cursor on the first *tutorial* whose letters contain
a-p-p-e-a-r when you type "appear".

Three things the scoring has to handle, none of them visible against a
small fixture — they show up against 181 real tutorials:

- **Greedy scanning misses the alignment a reader means.** "grid" against
  "Multiplying Grids" takes the `g` in "Multiplyin**g**". `fuzzyScore`
  also scores the whole query as one contiguous run and takes the better.
- **Subsequence matching says yes to far more than anyone means.**
  "matri" is inside "A Model That Corrects Itself". The best score sets a
  bar at 60%; an empty query has no bar.
- **A slug is a subsequence goldmine.** Every hyphen reads as a word
  start, so a keyword match is worth 0.7 of a label match.

**Checking** is one pure function, `checkDocument(source, knownIds)` in
`checks.ts`: markdown in, a sorted list of `Problem` out, each one
`blocking` or `worth fixing` with the line it is on. It parses nothing
Milkdown parses — it reads the file as text, through `segments()` from
`notebook.ts`, so it sees what dewlab's Python build will see rather than
what ProseMirror made of it. The shell owns the report; the checker owns
the rules, and is tested without a browser.

`fences.ts` parses dewlab's fences that are not runnable code — a
`question`, a `card`, an `html site`/`css site`/`js site` pane — and says
nothing about whether they are right. The rules are in `checks.ts`, and
they are dewlab's: a question type the build knows, options a `correct:`
can name, a gap that closes, a card with somewhere to go. An id is one
namespace across all of them, because a cell, a pane and a question are
all keys into the same saved-work record.

The check runs at three moments, in rising order of consequence: a
count in the margin as you type, a command when you ask, and a warning
before a pull request opens. Saving is never checked — a half-written
draft has to be possible to save — and the pull request warning is a
warning, since a reviewer is what one is for.

The spine carries a running count of the open document's faults, at the
foot beside the save line, and clicking it opens the report. It is
debounced: a fault found a moment after you write it is as useful as one
found instantly, and serialising the whole document on every keystroke
is not.

Two tests measure the rules against the real thing, and skip themselves
when dewlab is not checked out beside this repository: every page the
build accepts, the checker accepts too — any blocking report there would
be a false positive — and a real question fence broken three ways is
caught each time, because a checker that says nothing about a broken
file is worth nothing either.

The slash menu writes them, and a test runs the checker over what every
snippet writes — a snippet that failed it would put a fault in the
document the moment it was inserted.

`checkDocument(source, around)` takes one object rather than a growing
list of arguments. `around.images` is every image path in the workspace,
read once by `Store.imagePaths()` when the workspace opens — the editor
never opens an image, so `list()` never sees one, and without it an
image whose file was renamed looks exactly like one that is fine. An
absent set turns the rule off rather than failing every image, which is
what makes a caller that cannot answer the question safe.

Only prose counts, with code spans blanked. dewlab teaches HTML, so a
fence saying `<img src="does-not-exist.jpg">` and a reference table row
reading `` `<img src="…">` `` are both real files in the checkout, and
both were false positives before the corpus test caught them.

`checkWorkspace` is the same rules over every page, and it is the same
function applied file by file rather than a second set of rules. One
overlay renders both: a row that carries a path is a button and opens
that file, a row without one is a `div`. The rules live in one place
because a workspace check that could disagree with a document check is
worse than either alone.

Two of Crepe's own defaults are overridden, both with one line. It pads
the editing surface 120px each side for its own full-width shell, which
inside a measured page only eats the column — 544px of measure read as
304px of text. The block handle is positioned relative to the block and
sits outside the editor either way, so the padding goes. And it pins
paragraphs at `16px/24px`, which beat the reader's own settings: a
paragraph and a list item in the same document came out at different
sizes, and the size slider moved one of them.

**An image is drawn by Milkdown's own `imageInlineComponent`**, through
its `proxyDomURL` hook: the written name goes in, the URL to draw comes
back, and the node keeps the name. Crepe's whole `ImageBlock` feature
stays off, because `imageBlockComponent`'s schema reads an image's alt
text as a number and writes it back as an aspect ratio — `![A diagram](x.svg)`
becomes `![1.00](x.svg)`. That is not configurable, and dewlab teaches
alt text. The inline component has no schema of its own, so taking it
alone costs nothing in the round trip.

**Appearance** is eleven settings, each a CSS custom property, drawn from
one `ROWS` list. The page is described in dewlab's own tokens, so a
slider moves the thing it names — describing it in a second set of names
is how a slider ends up moving nothing.

---

## Running things

```bash
bun install
bun run dev                       # hot reload
bun run build                     # dist/index.html, one file
bun run test                      # unit
bun run typecheck
bunx playwright test              # against the built file
```

`tests/e2e/roundtrip.spec.ts` is the one that matters. If it cannot be
kept green, the document model is wrong.

Pyodide loads from jsDelivr at runtime, so `tests/e2e/pyodide.spec.ts`
needs a network the sandbox does not always have.
