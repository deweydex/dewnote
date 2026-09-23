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
Phase 6 (staged hints, questions, app panes and site pages drawn as
readers see them) is done.

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
