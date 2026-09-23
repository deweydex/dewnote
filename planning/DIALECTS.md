# The file formats dewnote opens and saves

What dewlab's files look like, read from its `build.py`, and what dewnote
does with each part. Checked against dewlab at `0335c46` (2026-09-23).
When `build.py` changes, this file changes first; each section names the
constant or function in `build.py` it was read from, so the check can be
repeated.

Everything is CommonMark underneath, with GFM tables and task lists.
dewlab adds the constructs below. dewnote saves every construct, including
ones it does not understand, as the bytes it read: the round-trip tests
(`tests/e2e/roundtrip.spec.ts`) hold it to that across dewlab's own
tutorials.

---

## 1. dewlab

### Where files live

A tutorial is `tutorials/<id>/<id>.md`, flat: every tutorial sits directly
under `tutorials/`, whatever course it is on. Beside it can be a practice
page `<id>-practice.md`, glossaries `<id>.glossary.yaml` and
`<id>-practice.glossary.yaml`, frozen releases `v<version>.md`, and
images.

**A page's id is its path** (`id_of()`): a tutorial's id is its file's
stem, which is also its folder; a practice page has its own id,
`<id>-practice`; a frozen release takes the folder's id. Nothing is read
from the front matter, because the id is the page's address and the key
readers' saved work is kept under. A live tutorial and the frozen
releases beside it share one id, which is why `workspace.ts` has
`defaultEntryFor`.

*dewnote:* **New tutorial…**, **New practice page** and **Rename this
tutorial…** write these paths (`authoring.ts`, `rename.ts`). A rename
moves the glossaries with the files and leaves images and releases their
names.

### Courses

A tutorial does not say where it appears; a course says what it holds
(`read_course()`, `COURSE_INDEX_FILE`, `REDIRECTS_FILE`).

- `courses/<course-id>.yaml`: `title`, `code`, `status` (`draft`, `beta`
  or `live`), `card`, `description`, and `contents`, a list of series,
  each a `title` and a `tutorials` list of ids in reading order. A
  top-level `mixed:` lists mixed practice pages.
- `courses/index.yaml`: `order:`, the course ids in the order they are
  shown.
- `courses/redirects.yaml`: `old address: new address`, one per line.
  The build writes a stub page at each old address, and stops if a line
  points at a page it did not write, or from one it did.

A tutorial can be on several courses, or on none and still build. A
course listing a draft is skipped with a note, so a course can name next
week's tutorial early. A practice page and a context page cannot be
listed.

*dewnote:* `courses.ts` reads these, and still accepts the older
`modules/` directory. **Add to a series…** and **Remove from a series…**
edit a course's lists line by line. A rename rewrites course lists and
adds redirects for anything that was ever served (not a draft); a delete
removes the tutorial from course lists and refuses while a redirect
points at it.

### Front matter

Required for a tutorial (`REQUIRED_FRONTMATTER`): `title`, `year` (an
academic year such as `"2026-2027"`), and `version` (`VERSION_RE`,
`2026.09.23.1`).

Optional:

- `status` (`STATUSES`): `draft` (left out of the build), `beta`, `live`
  (the default) or `archived` (built, and shown in the course's Archive
  rather than its reading order).
- `packages`: Pyodide packages beyond the baseline, a list.
- `datasets`: the names the cells load with `load_csv()` or
  `load_text()`, declared rather than scraped.
- `practice_for`: on a practice page, the one tutorial it practises.
- `practice_across`: on a mixed practice page, the tutorials it draws on.
- `context_for`: on a context page, the tutorials it gives background
  to. One id or a list.
- `covers`: sections mapped to learning outcomes. Not on a practice page.
- `supersedes`: the version a release replaced. Written by a release
  (dewlab's own editor and dewnote both write it); `build.py` does not
  read it.

Refused (`MOVED_FRONTMATTER`): `order`, `slug`, `module`, `module_title`
and `series`. Each was a placement field before placement moved to
`courses/`, and the build stops on any of them with a sentence saying
where the information lives now.

*dewnote:* the editor shows **Title**, **Status** and **Version** as
fields; everything else is under **Show all fields** as YAML, edited as
text. A field change rewrites only its own line. The checker reports a
missing `title`, `year` or `version`, a malformed version, an unknown
status and each refused field. A rename rewrites `practice_for`,
`practice_across` and `context_for`.

### Links

`[text](tutorial:<id>)` and `[text](tutorial:<id>#anchor)` are the only
links the build resolves (`TUTORIAL_HREF_RE`); a dead id or anchor stops
it. An id is site-wide, so the link works from any page.

*dewnote:* the checker reports a link to an id the workspace does not
have (not anchors). A rename rewrites every link to the id, and also any
`tutorials/<id>.html` address in the text.

### Cells

Two runnable fence languages (`CELL_TYPES`), `python exec` and
`sql exec`, with the same header lines at the top of the body
(`HEADER_RE`), in any order:

````markdown
```python exec
id: filter-evening
hint: Try printing readings["evening"] > 14 on its own first.
readings[readings["evening"] > 14]
```
````

- `id:` is required. A reader's saved work is kept under it, so renaming
  one throws that work away. Cells, questions, site panes and app panes
  share one set of ids on a page; the build stops on a repeat.
- `hint:` is a one-line hint for the cell.
- `expect:` is a Python expression checked after a run, which can trigger
  a staged hint.
- `name:` is reserved; preserve it.

A fence without `exec` is illustrative code and never runs.

A `sql exec` cell runs against the page's one shared SQLite connection,
`db`, in the same Python namespace every `python exec` cell uses: the
build wraps its SQL as `tutorial_tools._run_sql_cell(db, <script>)`.

`{{include: setup/load_readings.py}}` inside a cell (`INCLUDE_RE`) is
replaced with that file at build time.

*dewnote:* cells run in Pyodide in a Worker (`src/runtime/`), top to
bottom in one namespace; SQL goes through the same wrapper
(`dewnote_sql_tools.py`). The header lines are parsed and kept
(`cells.ts`); the checker reports a missing or repeated id. Jedi gives
completion, hover docs and signatures. An `{{include: …}}` line is kept
but not expanded, so a cell that depends on one fails in dewnote.

### Folds

Raw HTML, and the build stops on any `<details>` whose class is not one
of `FOLD_CLASSES`, `dl-hint` or `dl-answer`:

```markdown
<details class="dl-hint"><summary>hint</summary>

Name the columns you want, separated by commas, in place of `*`.

</details>
```

The blank lines inside are required for the markdown in it to render. A
practice problem is `**2.**` and prose, followed by folds.

*dewnote:* drawn as a fold, labelled Hint or Answer, with the markdown
inside it editable (`foldLine` in `fences.ts`). The `/` menu inserts one.

### Staged hints

A hint that waits for a real attempt before it appears, unlike a
`dl-hint` fold, which is always there to open. Its own fence
(`HINT_HEADER_RE`):

````markdown
```hint
after: 3 errors
title: Let's slow down a moment…

Check that every column name matches the table exactly, including case.
```
````

`for:` names the cell it belongs to (default: the exec cell just above
it); `after:` is the trigger (`TRIGGER_KEYS`: errors, identical errors,
unchanged runs, runs, failed checks, empty results, minutes; default
`errors:5`); `title:` defaults to "Let's slow down a moment…". The rest is
markdown.

*dewnote:* shown as a code block. Not drawn as a hint, and the checker
does not read it.

### Questions

A marked exercise (`QUESTION_HEADER_RE`, `QUESTION_TYPES`):

````markdown
```question
id: which-loop
type: multiple-choice
correct: 2
Which loop runs at least once?
- for
- while
```
````

`type:` is `multiple-choice` or `fill-in-the-blank`. A multiple-choice
question's options are its bullet lines (`OPTION_LINE_RE`), and
`correct:` is the 1-based number of the right one. A fill-in-the-blank
question marks each gap as `{answer}`, or `{right|wrong|wrong}` for a
drop-down, the first item being correct (`GAP_RE`).

*dewnote:* shown as a code block. The checker reports a missing id or
type, a question with no text, a multiple-choice question with fewer
than two options or no `correct:`, and a fill-in-the-blank question with
no gap or one that does not close (`questionIn` in `fences.ts`). The `/`
menu inserts both kinds.

### Site panes

One live web page, written as consecutive fences (`SITE_LANGS`,
`SITE_HEADER_RE`):

````markdown
```html site
id: hero-markup
site: hero
<button>Hover me</button>
```

```css site
id: hero-style
site: hero
button { padding: 0.5rem 1rem; }
```
````

Languages are `html`, `css` and `js`. `site:` groups the panes, which
must be consecutive; at most one pane per language per site. The page
renders in a sandboxed iframe, CSS in the head, HTML as the body,
JavaScript last.

*dewnote:* drawn as one editor with a tab per language and a live
preview in a sandboxed iframe (`siteGroups`, `sitePage` in `fences.ts`).
The checker reports a pane with no `site:` or no `id:`.

### App panes

A full-stack page that reads the database the page's `sql exec` cells
built (`APP_LANGS`, `APP_HEADER_RE`, dewlab decision 7.180). The same
shape as a site pane, with `app:` in place of `site:`:

````markdown
```js app
id: list-js
app: list
const rows = await dlQuery("select * from readings");
```
````

Unlike a site pane it is not sandboxed: its HTML and CSS render into the
page, its CSS scoped with `@scope`, and its JavaScript runs on the page
with `root` and `dlQuery(sql, params)` in scope.

*dewnote:* shown as code blocks. Nothing runs them, and the checker does
not read them.

### Notes

`<aside class="dl-note" id="…">`, lifted out of the body into the
reference panel by the build (`NOTE_RE`).

*dewnote:* kept as raw HTML, shown as written.

### Images

`![alt](name.svg)`, a file name resolved against the tutorial's folder.
The build stops on an `<img>` without `alt` (`IMG_RE`, `ALT_RE`).

*dewnote:* drawn from the store; a pasted image is written beside the
document. The checker reports an image with no file behind it.

### Maths

`$…$` and `$$…$$`, taken out before markdown runs (`INLINE_MATH_RE`,
`DISPLAY_MATH_RE`). `\$` is a literal dollar. Inline maths never spans a
line and never has a space just inside either dollar, so "$5 and $10"
stays prose.

*dewnote:* the same rule (`maths.ts`), so the editor typesets what the
site will. A display formula is saved over three lines.

### Footnotes

`[^label]` and its definition work in prose, folds and notes. The build
stops on one inside a `hint`, `question` or `card` fence
(`no_footnotes_in()`): each is converted on its own, so the footnote
could not reach the foot of the page.

*dewnote:* footnotes are kept as written; the checker does not report
one inside a fence.

### Hand-written pages

`pages/<name>.md` (`read_page()`): the About, home and features pages.
`title` is the only front matter; no course, series or version.

Three things a page has that a tutorial does not:

- **Cards** (`CARD_HEADER_RE`): a ```` ```card ```` fence with `url:`
  (required), `status:`, `meta:` and `wide:` header lines, then a
  heading and an optional line or two. Adjacent cards share one grid.
- **Generated blocks** (`GENERATED_BLOCKS`): a line holding only
  `[[search-box]]` or `[[course-cards]]`, replaced by the build. Any
  other name stops it.
- **Wrappers** (`MARKDOWN_WRAPPER_RE`): `<div class="dl-hero">`,
  `dl-audience`, `dl-attribution` and `<ul class="dl-feature-list">`,
  whose markdown inside the build converts.

*dewnote:* the palette lists pages separately from tutorials. The checker
reports a card with no `url:` or no heading. A card shows as a code
block, a generated block as a line of text, and a wrapper as its opening
and closing tags around the paragraphs inside.

### Written by the build, never by an author

The table of contents, previous and next, series navigation, the
reference panel, breadcrumbs.

### The runtime

Pyodide 0.28.3 in a Worker, with `numpy`, `pandas` and `matplotlib`
loaded; `packages:` adds more. Output rendering lives in
`assets/tutorial_tools.py`.

*dewnote:* the same Pyodide version, in its own Worker; output
rendering is `src/runtime/dewnote_tools.py`.

## 2. dewstack

dewnote opens and saves dewstack's tutorials as markdown, byte for byte,
but runs none of their cells and has no converter to dewlab's spelling.
The converter (`dialect-convert.ts`) went with the rewrite onto Milkdown
(#72). dewstack is being merged into dewlab, and dewlab's spelling is the
one to write in.

What dewnote still has to keep intact:

- **Front matter** carries `slug`, `module`, `module_title` and `series`,
  which dewlab now refuses. The index reads `module` and `series`, and
  the palette shows them beside a dewstack tutorial.
- **Fences carry everything in the info string**: `html site=name`,
  `sql cell=name persist`, `py cell=name`, `sql-check db=name task=…`,
  `html app=name`. There are no header lines. This is the case that once
  broke Milkdown, and why the editor keeps a fence's info string whole
  (`editor.ts`).
- **No maths.** A dewstack document with `$` in it means a dollar sign.

## 3. Plain markdown

Anything else: YAML front matter with any keys, kept in their order and
quoting (a YAML re-dump would unquote a quoted date); CommonMark with GFM
tables and task lists; inline HTML passed through; `$…$` maths on. No
fence runs.

## 4. Jupyter (import and export)

nbformat 4.5 (`notebook.ts`).

- A run of prose becomes one markdown cell. Front matter becomes a raw
  cell.
- A fence becomes a code cell holding its body, header lines included;
  an illustrative one is marked `dewnote_illustrative`.
- Every cell keeps the exact text it came from in `metadata.dewnote.raw`,
  with its kind and fence info. Importing a notebook dewnote exported
  gives back the same bytes; a cell edited in Jupyter is rebuilt from its
  new source.
- A notebook written in Jupyter, with no `metadata.dewnote`, becomes
  markdown with its code cells as plain `python` fences, which do not
  run until `exec` and an `id:` line are added.

## 5. Not yet handled

What dewlab's build reads and dewnote shows only as raw text, in the
order an author would notice it. Each is planned in
`planning/ROADMAP.md`, Phase 6.

1. Staged `hint` fences: shown as code, not as the hint they are.
2. `question` fences: checked, but shown as code rather than as the
   question a reader sees.
3. App panes: shown as code; nothing runs them.
4. `{{include: …}}` in a cell: kept, not expanded, so the cell fails
   when run in dewnote.
5. Cards, generated blocks and page wrappers: shown as code, text and
   loose tags.
6. The checker does not report footnotes inside fences, or `tutorial:`
   anchors that name no heading.
