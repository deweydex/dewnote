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

### 5.1 Split `shell.ts`

At nearly 1,500 lines, it holds opening and saving, every command's
registration, the problem report, authoring flows (new tutorial,
practice page, series, release, rename, delete, find and replace, pull
request) and export. Move the command list, the report overlay, and the
authoring flows into their own modules; `shell.ts` keeps opening,
saving and the state they share.

### 5.2 Call a course a course in code

The interface says *course*; the code says `Module` (`modules.ts`,
`SpineLocation.module`). Rename, now that dewlab itself uses `courses/`.

### 5.3 Review `planning/DIALECTS.md`

Parts describe dewlab before its 2026-09 refactor, and it was written
against earlier dewnote modules. Check each section against the current
`build.py` and mark or remove what is historical.
