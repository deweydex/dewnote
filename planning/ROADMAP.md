# Roadmap

Known problems and planned work, in the order they should be done. Each
item says what is wrong, why it matters, and the proposed approach. When
an item is done, delete it here and describe the result in
`ARCHITECTURE.md` or the user guide.

Last reviewed: 2026-09-22.

---

## Phase 1: Things that can lose or corrupt work

### 1.1 Resolve save conflicts instead of only reporting them

**Problem.** When a GitHub save fails because the file changed on the
branch (HTTP 409), dewnote says so and tells the author to copy their
changes and reload. `SaveProblem.conflict` marks the case, but nothing
reads it.

**Approach.** On a conflict, fetch the branch's current version and show
both in a dialog, with three actions: **Keep mine** (overwrite, using the
new SHA), **Take theirs** (discard local edits and reopen), and **Cancel**.
A line diff is enough; a merge editor is not needed at this stage.

### 1.3 Keep unsaved drafts across a closed tab

**Problem.** The unsaved-changes prompt (done) stops a switch or a close
from losing work, but a crash, a killed tab or a dead laptop still loses
everything since the last save.

**Approach.** Write the open document's markdown to IndexedDB, debounced,
keyed by workspace and path. On opening that file again, if a draft
exists and differs from the file, offer **Restore draft** or **Discard
draft**. Clear it on save.

### 1.4 Confirm `status: draft` means what dewnote says

**Problem.** **New tutorial…** writes `status: draft`, and the guide says
the site will not show a draft. `planning/DIALECTS.md` lists dewlab's
`status` values as `live` and `archived` only.

**Approach.** Check dewlab's `build.py`. If it does not treat `draft` as
unpublished, either change dewnote to write the value dewlab uses, or
add `draft` to dewlab. Then update DIALECTS.md and the guide.

---

## Phase 2: Tests that guard what the README says matters

### 2.1 Run the Playwright suite in CI

**Problem.** The README calls `tests/e2e/roundtrip.spec.ts` the test the
application stands on, but CI (`tests.yml`) runs only unit tests and the
type checker. The e2e suite runs only locally, or on demand.

**Approach.** Add a job to `tests.yml` that installs Chromium, builds,
and runs `bunx playwright test`. The suite takes about a minute and a
half. The tests are already written to pass without network access.

### 2.2 A test that runs real Python

**Problem.** No test runs a cell through Pyodide. Every cell test passes
whether Python loads or not, so a broken worker would not be caught.

**Approach.** Add `tests/e2e/pyodide.spec.ts`, tagged so it runs only in
the `e2e (pyodide)` workflow, which has network: run `print(2 + 2)` and
assert the output is `4`; run a failing cell and assert the error; stop a
`while True` loop.

---

## Phase 3: The editor shows what the site shows

### 3.1 Show hints as a fold

**Problem.** The block menu's **Hint** inserts
`<details class="dl-hint">…</details>`, and the editor shows it as that
raw HTML. The one construct the menu inserts looks broken.

**Approach.** A Milkdown node for `<details>`/`<summary>` that renders as
a fold with an editable summary and body, and serialises back to the
same HTML. The round-trip test already covers `<details>`, so it will
catch a regression.

### 3.2 One editor for web page panes

**Problem.** The `html site`, `css site` and `js site` blocks show as
three separate code blocks. On the site they are one editor with tabs and
a live preview.

**Approach.** Group adjacent panes with the same `site:` into one node
view with three tabs and an iframe preview. The file keeps three fences.

### 3.3 Make Run look like a button

**Problem.** The Run button is plain text under Crepe's "OUTPUT" label,
so it reads as output rather than as a control.

**Approach.** Style it as a button, and put it on the cell's own toolbar
beside Crepe's copy control rather than in the output area.

### 3.4 Say something when no document is open

**Problem.** Pressing Esc on the palette when a workspace first opens
leaves an empty page.

**Approach.** An empty state in the page area: *Open a document
(Ctrl+K)*, *New tutorial…*, and the last few documents opened.

### 3.5 Edit front matter as fields

**Problem.** Front matter shows as a raw YAML block. Changing `status`
from `draft` to `live`, the most common edit, means using **Edit the
markdown**.

**Approach.** A small form above the title for `title`, `status` and
`version`, with the raw block still reachable through Edit the markdown.

### 3.6 Make the margin easier to read

**Problem.** The left margin's text is small, grey and partly monospace,
and the file path is truncated.

**Approach.** Raise the contrast to the body text's muted colour, show
the file name rather than the full path (path on hover), and keep
monospace for the path only.

---

## Phase 4: Missing features

### 4.1 Rename, move and delete files

Only creation exists. Renaming a tutorial is special: its id is its
address and the key for readers' saved work, so a rename also has to add
an entry to dewlab's `courses/redirects.yaml` and update course lists.

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

### 4.5 A way to forget the token

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
