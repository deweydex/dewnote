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

---

## Phase 5: Code structure

### 5.2 Call a course a course in code

The interface says *course*; the code says `Module` (`modules.ts`,
`SpineLocation.module`). Rename, now that dewlab itself uses `courses/`.

### 5.3 Review `planning/DIALECTS.md`

Parts describe dewlab before its 2026-09 refactor, and it was written
against earlier dewnote modules. Check each section against the current
`build.py` and mark or remove what is historical.
