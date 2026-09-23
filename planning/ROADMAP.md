# Roadmap

Known problems and planned work, in the order they should be done. Each
item says what is wrong, why it matters, and the proposed approach. When
an item is done, delete it here and describe the result in
`ARCHITECTURE.md` or the user guide.

Last reviewed: 2026-09-22. Phase 1 (things that could lose or corrupt
work) is done: unsaved-changes prompts, kept drafts, save conflicts,
releases that freeze the published version, and new tutorials the
build accepts. Phase 2 (the browser tests, and real Python, run in CI on
every pull request) is done. Phase 3 (the editor shows what the site
shows: hint folds, one editor for web page panes, the Run button, the
empty page, front matter fields, the margin) is done, as is Jedi help in
Python cells. In Phase 4, renaming, moving and deleting (4.1) is done.

---

## Phase 4: Missing features

### 4.2 New practice page

A command on an open tutorial that creates `<id>-practice.md` with
`practice_for: <id>` and one cell.

### 4.3 Find and replace across the workspace

The palette finds documents by title only. Add a text search across every
document's content, with replace.

### 4.4 Fewer, better-named commits

Every save is a commit named `Edit <path>`. Either ask for a message when
opening the pull request and squash-merge, or batch saves into one commit
per session using the Git Data API.

### 4.5 Combine both sides of a save conflict

A conflict offers one version or the other. When both people changed
different paragraphs, keeping both needs a three-way merge against the
version the author opened, which the shell already has in `opened`.

### 4.6 No trailing blank line after editing at the end of a document

Clicking into a list or table that ends the document leaves Milkdown's
empty trailing paragraph in place, and the file is saved ending in a
blank line. Content is unchanged, but it is churn in a diff. Trim
trailing empty paragraphs on save.

### 4.7 A way to forget the token

The GitHub token stays in localStorage until the browser's site data is
cleared. Add a **Disconnect from GitHub** command that removes it.

---

## Phase 5: Code structure

### 5.1 Split `shell.ts`

At over 800 lines, it holds opening and saving, every command's
registration, the problem report, authoring flows and export. Move the
command list, the report overlay, and the authoring flows (new tutorial,
series, release) into their own modules; `shell.ts` keeps opening,
saving and the state they share.

### 5.2 Call a course a course in code

The interface says *course*; the code says `Module` (`modules.ts`,
`SpineLocation.module`). Rename, now that dewlab itself uses `courses/`.

### 5.3 Review `planning/DIALECTS.md`

Parts describe dewlab before its 2026-09 refactor, and it was written
against earlier dewnote modules. Check each section against the current
`build.py` and mark or remove what is historical.
