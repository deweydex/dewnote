# Rebuilding dewnote on Milkdown

dewnote's editing half is being replaced. The document model moves from
"markdown text plus byte offsets" to a ProseMirror document owned by
Milkdown, and the ~4,000 lines that maintained the first model go away.
This document says what replaces them, what is kept, and what the change
costs.

`DECISIONS.md` 1 rejected a WYSIWYG library on the grounds that it would
own the document model. It would, and now it does. What changed is the
evidence below: the loss that argument feared is measurable, small, and
mostly a formatting normalisation rather than a loss of meaning.

---

## 1. The evidence

A probe loaded Crepe 7.21.3 headless in Chromium, fed it all 184 markdown
files in the dewlab checkout, and compared `getMarkdown()` against the
bytes on disk. `planning/probe/` holds it.

| | |
|---|---|
| Files round-tripped byte-for-byte | **94 / 184** |
| Files stable on a second pass (`f(f(x)) == f(x)`) | **184 / 184** |
| Files keeping every fence info string, cell id, heading, `<details>` fold and maths block | **184 / 184** |

Three findings matter.

**The serialiser reaches a fixed point after one pass.** All 184 files are
stable the second time through. So the 90 files that differ differ
*once*: after a single pass, every later save is byte-identical. That
turns "the editor rewrites your file" into a one-off commit that can be
read and reviewed like any other.

**Nothing structural is lost.** Fence info strings — `exec`, `site`,
`cell=name persist` — cell ids, headings, raw-HTML folds and maths blocks
all survive on every file. What differs is bullet markers (`-` becoming
`*`), blank-line placement, table cell padding, autolinks becoming
resource links, and escaping: a formatting dialect, not a change of
meaning.

**Crepe destroys one form of maths block, and dewlab writes it.** Given a
`$$` block whose delimiters share a line with its content —

```
$$a = 1
b = 2$$
```

— Crepe returns `$$$\nb = 2$$\n$$$`: the first line gone and the rest
malformed. `tutorials/multiplying-grids/multiplying-grids-practice.md` is
written that way, which means **dewlab's current authoring editor already
loses that content on any edit**. That is a live bug in dewlab, found
here by accident, and it should be reported there whatever happens to
this rebuild.

A block written on one line, `$$x = 1$$`, has a quieter fault: it is read
as *inline* maths and written back as `$x = 1$`, which renders at a
different size. 18 files use that form and two of them put a pair on
consecutive lines, where they share one paragraph.

`canonicaliseDisplayMath()` handles both by rewriting every display block
into the three-line form before Milkdown reads it. `build.py`'s
`DISPLAY_MATH_RE` is `\$\$(?P<tex>.+?)\$\$` with `DOTALL` and a
`.strip()`, so all three forms build the same page: this changes how a
file is written, never what it renders.

### Two mechanisms the probe had to discover

Both are undocumented in anything reachable from here, and both cost an
hour of wrong turns. `editor.ts` rests on both.

**A schema is overridden by re-registering it, not by updating its ctx
slice.** `ctx.update(codeBlockSchema.key, …)` inside `editor.config()`
does update the slice, and the update is never read: `$node`'s runner
calls the factory before `ConfigReady` resolves. The path that works is
`codeBlockSchema.extendSchema(handler)` passed to `.use()`, because
`$node` registers into `nodesCtx` with `ns.filter(n => n[0] !== id)` — the
last registration under an id wins.

**Crepe models a `$$` block as a code fence with language `LaTeX`.** Its
`remarkMathBlockPlugin` rewrites every mdast `math` node into a `code`
node with `lang: 'LaTeX'`, and `blockLatexSchema` turns it back on the way
out. That schema is itself a `codeBlockSchema.extendSchema`, so **our**
extension replaces it and silently destroys every block of maths in the
corpus unless it carries the same branch. It does:

```js
if ((node.attrs.language ?? "").toLowerCase() === "latex") {
  state.addNode("math", undefined, node.content.firstChild?.text || "");
  return;
}
```

Anything that extends `code_block` in future must keep that branch. It is
the single sharpest edge in this design.

---

## 2. The shape

Seven modules. Not five — a 1,400-line `shell.ts` is not an improvement on
four 350-line files, and the win here is the total, not the file count.

```
index.html      the three mount points
style.css       appearance tokens; Crepe restyled in terms of them
editor.ts       Milkdown assembly: schema, views, slash menu
cells.ts        the Python/SQL cell: header lines, running, output
store.ts        folder and repository behind one interface
workspace.ts    the index: modules, series, versions, breadcrumb
shell.ts        spine, palette, commands, settings, save
```

### `editor.ts`

Owns the Milkdown editor and nothing else. No DOM outside the editor's
root, no knowledge of where a document came from.

```ts
export interface Document {
  markdown(): string;              // getMarkdown(), the save path
  setMarkdown(text: string): void;
  headings(): Heading[];           // for the spine's outline
  focusHeading(slug: string): void;
  destroy(): void;
}

export function mountEditor(root: HTMLElement, opts: {
  markdown: string;
  onChange(markdown: string): void;
  runCell(source: string, id: string): Promise<CellOutput>;
}): Promise<Document>;
```

Internally, four pieces:

- `codeBlockWithMeta` — `codeBlockSchema.extendSchema(…)` adding a `meta`
  attr, carrying the LaTeX branch. This is what makes `python exec`,
  `sql cell=name persist` and `html site` survive a save.
- `frontMatterSchema` / `frontMatterRemark` — `$remark(remarkFrontmatter,
  ['yaml'])` plus a `$nodeSchema('front_matter')` holding the block as one
  opaque string. Key order and quoting survive because nothing parses it.
- `canonicaliseDisplayMath` — a pure text pass over the markdown on the
  way in. An earlier version of this was a remark plugin plus a custom
  stringify handler, which was more code, needed two more dependencies,
  and could not see the two-blocks-in-one-paragraph case at all. The text
  pass is 25 lines and is unit-tested without a browser.
- `slashMenu` — `BlockEdit`'s `buildMenu` callback, adding *Python cell*,
  *SQL cell* and *Hint* to the default groups.
- `imageUploader` — `plugin-upload`'s uploader, writing a pasted image
  beside the document and inserting a relative link. dewnote cannot do
  this today at all.

Crepe features off: `ImageBlock` (it rewrites an image's alt text to an
aspect ratio — a measured corpus fault), `Toolbar`, `TopBar`, `AI`.

### `cells.ts`

A cell is a code fence whose info string carries `exec`, with `id:`,
`hint:`, `expect:` and `name:` header lines inside the body. That parse
stays exactly as it is — `src/cell.ts` is 520 lines that already match
dewlab's own `HEADER_RE`, and it is the one piece of the old editor worth
carrying across unchanged.

Execution hangs off Crepe's `renderPreview` hook rather than a node view:

```ts
renderPreview(language, content, applyPreview) {
  if (language !== "python") return null;
  const cached = results.get(content);
  if (cached) return outputElement(cached);
  if (!ranOnce.has(content)) return null;   // never run: no panel
  applyPreview(await run(content));
}
```

The hook fires on **every keystroke** — it is a Vue `watch` on the text —
so the cache is not an optimisation, it is what stops a keypress starting
an interpreter. `previewToggleButton` is relabelled Run/Hide.

Cost of taking the hook instead of writing a node view: no slot for the
`id`/`hint`/`expect` buttons. They become header lines you type, which is
what the file format already is.

### `store.ts`

Unchanged in character; this is the part Milkdown does not touch.

```ts
export interface Store {
  kind: "folder" | "repo";
  list(): Promise<string[]>;
  read(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
  write(path: string, text: string): Promise<void>;   // throws SaveProblem
  publish?(): Promise<string>;                        // repo only: a PR
}
```

`github.ts` (327 lines) and `folder-store.ts` (194) are already close to
the floor and port as they are. What goes is the 1,627 lines of
`repo-panel.ts` and `folder-panel.ts` — those are browsers, and the
palette is the browser now.

The four findings in `UI_REVIEW.md` §4 are untouched by this rewrite and
stay open: the 350-call repository load, the commit-per-file, the
in-memory change set, the reused branch.

### `workspace.ts`

`modules.ts` (406), `file-index.ts` (243) and `workspace-nav.ts` (233)
merged. They already form one concern — read `courses/*.yaml` and every
file's front matter, answer "where does this document sit" and "which
version would the build serve" — and they are split three ways for
historical reasons. `module-writer.ts` (305) stays separate: writing a
module file back is a different risk.

### `shell.ts`

`spine.ts` (278), `workspace-palette.ts` (506), `commands.ts` (125) and
the settings panel. These are the parts of the current interface worth
keeping, and they are independent of the editing engine. They port with
edits, not rewrites. The palette's ranking in particular took three real
corpus-measured faults to get right and is not being written twice.

---

## 3. What the old tree teaches

Reading all 41 modules before archiving them turned up four things worth
not repeating.

**Front matter is read in ten places.** `blocks.ts`, `file-index.ts`,
`folder-panel.ts`, `frontmatter.ts`, `main.ts`, `release.ts`,
`render-block.ts`, `repo-panel.ts`, `settings-panel.ts` and `store.ts`
each reach for the leading `---` block. In the new tree exactly one module
knows that shape: `editor.ts`'s front-matter node. Everything else asks
the document.

**Headings are parsed in four places.** `cell.ts`, `outline-panel.ts`,
`spine.ts` and `workspace-palette.ts` each have their own `#{1,6}` regex,
and three of them have their own answer to "is this `#` inside a fence".
`Document.headings()` is the single answer, and it reads the ProseMirror
tree rather than re-parsing text.

**`blocks.ts` has a fan-in of 15.** Fifteen modules import the block
model. That is the measure of how much of the tree exists to serve a
document model that is about to stop existing — and it is why the saving
is 4,000 lines rather than 500.

**`icon-rail.ts` exists because eight panels each chose their own
`top: Nrem`.** A shared layout module was the fix for a problem that only
existed because there were eight panels. There is one overlay now.

---

## 4. What this costs

**The byte-for-byte promise goes.** Today a save writes the original bytes
with your edit spliced in, and `docs/USING_DEWNOTE.md` says so. After this,
a save re-serialises the document. The promise is replaced by a weaker,
true one: *your file is normalised once, the first time dewnote saves it,
and is byte-stable from then on.* The guide changes with the code.

**A corpus normalisation commit lands in dewlab.** 90 files, none of them
changing the built site. It should be reviewed as a formatting pass and
merged before dewnote starts writing to that repository.

**The dependency is 2.9 MB and consolidating.** `plugin-math` and
`plugin-diagram` were deprecated rather than superseded; `plugin-menu` has
been dead since 2022. The project folds capability into Crepe and drops
what does not fit. We extend it in four places, and each is a place that
could break on a major version.

---

## 5. Order of work

1. ~~This document, and the archive move.~~
2. ~~`editor.ts` against the probe's proven configuration, with the
   round-trip test running over the real corpus in CI.~~
3. ~~`store.ts` and `shell.ts` ported.~~
4. ~~`cells.ts`, Pyodide and the appearance settings.~~ ← *here*
5. The normalisation pass over dewlab, as its own reviewable PR.
6. `docs/USING_DEWNOTE.md` rewritten where it now lies.
7. What `archive/` still holds, listed in §7.

Step 2 carries the round-trip corpus test. If that test cannot be kept
green, this design is wrong and the archive comes back.

---

## 6. Where it came out

Steps 1–3, measured rather than estimated.

| | Before | After |
|---|---|---|
| TypeScript, not counting tests | 12,274 | **4,004** |
| CSS | 4,287 | **793** |
| Modules | 41 | 18 |

The largest file is now `workspace-palette.ts` at 462 lines, and the
second is `modules.ts` at 406 — neither of them editor code. The editor
itself is 203 lines, of which about 80 are the two schema overrides and
the maths normalisation, and about 60 are the comments saying why they
are shaped the way they are.

What is gone: the block model and its offsets, the per-block editor
lifecycle, the three view maps, `suppressBlurCommit`, the two file
browsers, the icon rail, the file bar, the workflow shell, and the
render-when-blurred half of the editor. About 9,300 lines.

What came across nearly unchanged: `github.ts`, `folder.ts` and
`modules.ts` — protocol and parsing, which Milkdown does not touch — and
the spine, the palette and the command registry, which are the interface
and are independent of the editing engine.

Four things merged rather than ported. `file-index.ts` and the pure half
of `workspace-nav.ts` became `workspace.ts`, where the breadcrumb is a
function of path, index and modules rather than the state of three
dependent `<select>` elements. `frontmatter.ts` went from 133 lines to
37, because writing a field back without disturbing the bytes around it
is the editor's job now. `blocks.ts` became `markdown.ts`, 79 lines that
answer "which parts of this text are prose" for the one caller that still
needs it — the palette, previewing a file the editor is not holding.
And `active-store.ts`, which existed so a third module could ask either
browser to open a path, has nothing left to mediate: there is one store
interface and one thing that calls it.


---

## 7. What `archive/` still holds

The archive was 16,105 lines when it was made and is 6,415 now. What went
was everything superseded outright: the block model and its offsets, the
per-block editor lifecycle, both file browsers, the icon rail, the file
bar, the workflow shell, the outline panel, the front-matter form, and
the twenty e2e specs that drove surfaces which no longer exist.

What is left is not a graveyard — it is the list of features not yet
rebuilt, each with a working implementation to read:

| Still in `archive/src/` | Lines | What it is |
|---|---|---|
| `series-panel.ts`, `module-writer.ts` | 997 | Moving a tutorial between series, and writing the module file back |
| `cell.ts` | 520 | The hint, card, question and site-pane fences. Only the exec-cell half is ported |
| `export-html.ts`, `jupyter.ts` | 351 | The two exports |
| `link-check.ts`, `link-picker.ts` | 326 | Checking links against real slugs, and picking one |
| `asset-name.ts`, `asset-preview.ts` | 209 | An image beside the document that names it |
| `site-cell.ts` | 80 | Grouping `html site` panes that share a `site:` key |
| `release.ts` | 63 | Freezing a version and starting a new one |
| `dialect.ts` | 40 | dewlab or dewstack, decided from front matter |

`archive/tests/e2e/` keeps the eleven specs for those features and no
others. Each one is a description of behaviour that still has to exist;
the rest described a shape that does not.

A module leaves the archive when the thing it describes is rebuilt, not
when it is read.
