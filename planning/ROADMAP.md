# Roadmap

Known problems and planned work, in the order they should be done. Each
item says what is wrong, why it matters, and the proposed approach. When
an item is done, delete it here and describe the result in
`ARCHITECTURE.md` or the user guide.

Last reviewed: 2026-09-23. Phase 1 (things that could lose or corrupt
work) is done: unsaved-changes prompts, kept drafts, save conflicts,
releases that freeze the published version, and new tutorials the
build accepts. Phase 2 (the browser tests, and real Python, run in CI on
every pull request) is done. Phase 3 (the editor shows what the site
shows: hint folds, one editor for web page panes, the Run button, the
empty page, front matter fields, the margin) is done, as is Jedi help in
Python cells. Phase 4 (renaming, moving and deleting; new practice
pages; find and replace; named pull requests; keeping both sides of a
conflict; no trailing blank line; disconnecting from GitHub) is done.
Phase 5 (splitting `shell.ts`, calling a course a course in code,
bringing `planning/DIALECTS.md` up to date) is done.

---

## Phase 6: The rest of dewlab's format

dewlab's build reads constructs dewnote only shows as raw text. Each is
listed, with what dewlab does with it, in `planning/DIALECTS.md` §5.

### 6.2 Questions as questions

A ```` ```question ```` fence is checked but shown as code. Draw a
multiple-choice question with its options and the correct one marked,
and a fill-in-the-blank one with its gaps.

### 6.3 App panes

`html app`, `css app` and `js app` are shown as code. Group them as the
site editor groups site panes; running one needs the page's `db`, which
the Worker already has.

### 6.4 Pages: cards, generated blocks, wrappers

On `pages/`, a card shows as code, `[[search-box]]` as text, and a
`dl-hero` wrapper as loose tags around its paragraphs.

---

## Phase 7: Later, once it is clear they are wanted

### 7.1 `{{include: …}}` in a cell

A line such as `{{include: setup/load_readings.py}}` inside a cell is
replaced, when dewlab builds the site, by the contents of that file:
setup code several cells or tutorials share. dewnote keeps the line but
does not expand it, so a cell that depends on one fails when run in
dewnote. Expanding it means reading the named file from the workspace
and splicing it in at run time. Worth doing once tutorials use includes;
check how many do first.

### 7.2 Two checks the build makes and dewnote does not

dewlab's build refuses a footnote (`[^1]`) inside a `hint`, `question`
or `card` fence, and a `tutorial:<id>#anchor` link whose anchor names no
heading on that page. dewnote's checker reports neither, so an author
finds out only when the build fails.
