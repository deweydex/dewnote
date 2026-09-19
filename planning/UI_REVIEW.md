# dewnote: a review of the interface, the flow, and the two stores

Written 2026-09-19. The survey was made against `cb91c5e`, the commit
that landed the progressive workspace workflow (#68); `34caee3` (#69)
landed while it was being written and closed several of its findings
independently, which is noted at each one. The method was not reading:
the app was built, driven in a real Chromium with a fake
`showDirectoryPicker` backed by the real dewlab checkout and a mocked
GitHub API, and photographed at each step. Every number below was
measured rather than estimated, and every claim about what the
interface does was seen happening.

The short version: the document surface is the best thing here and
should be left almost alone. The shell around it is a new set of
controls in front of the old architecture rather than in place of it,
and that gap is where the flow problems and both store problems come
from. The export and push worries in the brief were well founded, and
three of them were defects rather than design disagreements.

---

## 1. What is already right

**The reading and writing surface.** A dewlab tutorial opened in dewnote
looks like dewlab. Georgia on warm off-white at a comfortable measure,
headings that carry, a cell whose header is a compact form and whose
body is a live editor with real highlighting. Clicking into a paragraph
and out of it does not move the baseline. The dark theme is handsome in
its own right rather than an inversion of the light one. Whatever else
changes, this should not.

**The block model.** The discipline in `blocks.ts` — offsets, never a
re-serialised tree — is the reason a tutorial round-trips byte for byte,
and it holds under everything built on top of it. The byte round-trip
test being the first test in the repository was the right call and is
still paying.

**The per-field front-matter form and the cell header form.** Both take
something that was raw YAML or raw fence syntax and make it a form
without taking the file away from the author. The `id` rename guard is
the sort of care this tool needs more of, not less.

## 2. The architecture: a new shell in front of the old one

`PROGRESSIVE_WORKFLOW_UI.md` §6 put centralising state first, and named
the risk of not doing so in §8: *"Moving visuals before centralising
state would preserve the same bugs under new chrome. Phase 1 must land
first."* Phase 1 did not land. There is no `app-state.ts`, no
`AppScreen`, no `WorkspaceSession`. What shipped is phases 2 to 5 drawn
on top of the rails phase 6 was meant to remove.

The shape of it is visible in one line of `main.ts`:

```ts
const clickToggle = (selector: string) =>
  document.querySelector<HTMLButtonElement>(selector)?.click();
```

Every entry in the new workspace menu — whole-file source, outline, link
check, module organiser, settings, browse files — is a synthetic click on
a legacy rail button that is still mounted and still in the document,
hidden by `display: none !important`. Loading the app builds twenty-two
top-level elements, of which two are visible. The command palette reaches
the same hidden buttons by the same selectors, under different names:
what the menu calls "Open a Markdown or YAML file…" the palette calls
"Import Markdown file…", and what the menu calls "Arrange modules and
series" the palette calls "Modules". Two menus, two vocabularies, one set
of buttons neither of them owns.

Session state is in four places at once: a module-level `let session` in
`main.ts`, a second `let session` inside `mountWorkflowShell`,
`document.body.dataset.workspaceSession`, and the `disabled` flags on two
hidden rail toggles. The shell reads its own DOM back as state in
`render()`:

```ts
identityName.textContent = session === "github"
  ? repoContext.label
  : identityName.textContent || "Local workspace";
```

This is not a tidiness complaint. It is where the defects in §3 and §4
came from, and it is why the next change to the flow will be harder than
this one was rather than easier.

**Recommendation.** Land phase 1 now, late, rather than building phase 7
on this foundation. One `app-state.ts` owning screen, session, surface
and dirty state; the panels reduced to content that the shell mounts
where it wants; one command registry that both the menu and the palette
read, so a command exists once and is named once. That registry is also
what lets the palette become the thing it should be — see §5.

## 3. The flow, step by step

### The source gate

Two choices, correct in principle. In practice the cards are flat grey
boxes using `--dn-control-bg`, which reads as disabled rather than
inviting; the focus ring is an orange glow that reads as a validation
error; and the headline is set at `clamp(2.15rem, 7vw, 4.7rem)`, which
at any ordinary window width wraps "What are you working on?" onto two
lines and makes a two-button screen feel like a product launch page.

The local card used to promise "Edit files on this computer, **or begin
with a blank document**" while clicking it opened an OS folder picker
and nothing else. #69 rewrote the copy to describe only what the button
does, which closes the gap the right way round. What is still unanswered
is Safari, where `showDirectoryPicker` does not exist at all: the card
is the only door on offer and it cannot open there. The gate should say
so, or offer the single-file path it already has.

There is no third thing the gate could offer that would earn its keep
more than either of these: a list of the last few workspaces, so the
common case (the same repository as yesterday) is one click rather than
a picker plus a form.

### Connecting a repository

This step is the old rail panel dragged to the middle of the screen with
seven `!important` rules. It shows a token field with no link to
GitHub's token page, no statement of which scopes are needed beyond a
sentence, and no expiry — `PLAN.md` §5.7 asked for expiry shown, and it
is not. Owner and repo are two free-text boxes with no list to pick from,
although the token could list them. "Modules / All files" and a "New file
path" field are both on screen before a repository has been loaded, doing
nothing.

The working branch used to be missing from this screen entirely — it
lived in the push section, which stays hidden until a document is open —
so an author connected a repository, watched `main → dewnote-edits`
appear in the header, and had been given no opportunity to disagree with
either. That is fixed in this pass (§6).

### Choosing a document

Two faults, one of them the kind that erodes trust in everything else the
header says.

**The header claimed a document that was not open.** On opening a folder
or a repository the breadcrumb read *Programming and Maths, Integrated ›
Programming Foundations › First Steps* while the starter "Untitled"
document was on screen. The location came from three `<select>` elements,
and a `<select>` selects its first option whether or not that option is
true of anything. #69 fixed this independently, and better than the
version drafted here: it reports no location until `currentPath` is set,
handles a file opened from All files with no module context, opens the
chooser on arrival so the first thing an author does is choose, and adds
the real filename to the header.

**The first tutorial in a series could not be opened.** Same cause,
worse effect: the page `<select>` was already resting on the first
tutorial, so choosing it fired no `change` event and nothing happened.
Every other tutorial opened. #69's "Open document" button gives that
tutorial a second route in; this pass adds the placeholder option that
removes the cause, so the chooser no longer displays a page as selected
that nobody picked, and Open document has nothing to do until a real
choice is made.

One thing the chooser still does that is worth a look: opening is bound
to the page select's `change` as well as to the button, and in Chrome a
closed `<select>` fires `change` on every arrow key. Keyboard navigation
through a series therefore opens each tutorial as it passes. Leaving the
binding alone here rather than undoing a decision made hours ago, but
the button makes `change` redundant.

Beyond the defects, three dropdowns is a thin reading of
`PROGRESSIVE_WORKFLOW_UI.md` §2.4. It satisfies "module → series →
tutorial" and gives an author no view of the curriculum at all: you
cannot see a series' shape, cannot tell which tutorials exist near the
one you want, cannot see which have practice pages. A module of thirty
tutorials is a scrolling native menu. The panel is also translucent
enough that the document's first line reads through it.

At 420px the responsive sheet §2.3 promised is still missing, and #69's
open-on-arrival makes its absence worse rather than better: the chooser
is now opened for you, laid out 420px wide starting 16px in, at
y = 815 in an 860px viewport. It is off the bottom of the screen and
overflowing the right of it. An author at that width chooses a
workspace and sees nothing happen. The header wraps too — Save drops
onto a second row and the save-state label is squeezed out entirely.

### Saving

Clicking Save in a local session writes through the folder handle and
confirms. Clicking Save in a repository session commits to the working
branch. Both correct. The confirmation was not: the toast set
`hidden = false` and nothing ever set it back, so the first save left a
permanent panel in the bottom-right corner for the rest of the session.
#69 fixed the confirmation half at the same time and in the same way —
a five-second timer and a dismiss control. This pass keeps that and adds
the other half: a refusal has the opposite lifetime and must not share
one.

The refusal is §4's subject and the most serious thing in this review.

## 4. The GitHub store

### A refused push was silent

The repository panel writes every refusal into its own status line. The
progressive shell closes that panel as soon as a session opens. The two
facts together meant that a failed push — expired token, 409 against a
file changed underneath you, 422 on a taken path — produced no visible
signal at all. `workflow-shell.ts` had:

```ts
const ok = await host.saveCurrent();
if (!ok) return;
```

Driven against a mocked GitHub returning 409, the observed behaviour was:
the author edits, presses Save, the push is refused, the previous
success toast is still on screen saying "Saved to dewnote-edits", and the
conflict panel — with both versions in it, waiting for a decision — is
revealed inside an element with `display: none`. The only trace is the
dirty marker staying lit, which is exactly what it looks like when you
have not pressed Save yet.

This is the failure mode that loses work, because the next thing an
author does after a save is close the tab. Fixed in this pass: stores
report refusals rather than only recording them, the shell shows one that
stays until dismissed, and a conflict carries a **Show me** control that
opens the panel where the choice lives. `tests/e2e/workflow-shell.spec.ts`
now drives the whole sequence.

### One commit per file, no atomic change

Every save is a separate `PUT /contents/{path}` — one commit. A realistic
dewlab change is a tutorial, its glossary, and its module descriptor: three
commits titled `Edit <path> from dewnote`, `Edit <path> from dewnote`,
`Edit <path> from dewnote`. There is no way to say what a change was for.
The pull request is titled after whichever file happened to be open when
the button was pressed, and has no body at all.

The Git Data API exists for this: build a tree, make one commit, move the
ref. It is three calls instead of one per file and gives a change a single
commit with a message the author wrote. For a repository whose own
`CLAUDE.md` says a change is not finished until the document describing
the behaviour describes the new behaviour, a commit log of
`Edit tutorials/foo/foo.md from dewnote` is not good enough.

### The review screen cannot see the branch

`PROGRESSIVE_WORKFLOW_UI.md` §8 named this too: *"The review screen must
consume branch-level changes, not only changes initiated by the active
editor."* It consumes an in-memory `Set<string>` of paths this session
pushed. Reload the page and the branch looks empty. Push from a second
tab and this one never learns. A commit made on GitHub itself is
invisible. The endpoint that answers the question properly is
`GET /compare/{base}...{branch}`, one call, and it also answers "is this
branch behind its base", which nothing currently asks.

### Branch hygiene

The working branch defaults to the constant `dewnote-edits` and
`ensureBranch` returns early if a branch by that name exists, whatever
state it is in. After a pull request merges and the branch is not
deleted, the next session pushes onto a branch whose pull request is
closed and whose base has moved on; `openPullRequest` then either finds
no open PR and rethrows GitHub's 422, or opens one carrying a stale base.
Nothing warns, and nothing offers to start a fresh branch. A branch whose
PR is merged should be recognised and a new one proposed by default.

### Loading a repository costs about 350 API calls

The front-matter index is built by fetching every markdown file's
content, one file per request, at concurrency 8:

```ts
const entries = await mapWithConcurrency(markdownFiles, 8, async (file) => {
  const { content } = await getFileContent(repo, file.path, ref, token);
  ...
```

dewlab has 348 markdown files. So "Load files" is roughly 350 requests
returning whole base64 bodies, plus two full recursive tree calls (one
for markdown, one for module descriptors — the code notes the duplication
and accepts it), plus one per course file. The code comment says the
index reads "front matter alone, not the whole file, so this stays fast",
which is true of the folder store and cannot be true over the Contents
API, which has no way to ask for the first ten lines. Against a
fine-grained token's 5,000 requests an hour, that is about thirteen loads
before the account is rate-limited, and it is slow enough to feel like a
hang the first time.

Three ways out, in increasing order of effort. `courses/*.yaml` already
names every tutorial in every module in order, and the location chooser
needs nothing else — building navigation from nine files rather than 348
removes the cost from the path that feels slow. Titles for the link
picker can then be filled in lazily, per module, as an author moves
around. If the whole index is wanted eagerly,
`GET /repos/{owner}/{repo}/tarball/{ref}` is one request for the entire
tree, and GraphQL can batch blob texts by oid in tens of requests rather
than hundreds.

## 5. Look and feel

The document is right. The chrome around it is not yet the "quiet by
default, everything one press away" that `PLAN.md` §3 asks for.

**The loudest thing on screen is Save.** A solid orange button in the
top-right corner, the only saturated block of colour anywhere, sitting
above a document whose whole aesthetic is restraint. Save is important
and should be reachable; it should not be the first thing the eye lands
on every time the window is looked at. Cmd+S already works. A quiet
button that becomes emphatic only when the document is dirty would say
more with less.

**The filename was nowhere.** `PROGRESSIVE_WORKFLOW_UI.md` §3 State C
says "current filename appears quietly above the document title". It
appeared nowhere on the document screen; the only place it existed was
truncated inside the workspace menu
(`tutorials/storing-and-computing/storing-and-computin…`). With dewlab's
versioning able to put several files behind one slug, which file you are
editing is not a detail. #69 put it in the header, above the breadcrumb,
with "No document selected" when there is none.

**`Front matter — 4 fields`** floats in monospace above the title with a
hundred pixels of nothing under it. It reads as a debug label. The front
matter is metadata about the page, and the natural place for it is
attached to the title, or folded into the header, not hovering above the
document like a console line.

**The breadcrumb was a bordered pill in the centre of the header**,
which made it look like a search field. #69 demoted it to quiet muted
text under the filename, which is right. **The workspace menu was eleven
undifferentiated rows**; #69 grouped them under Open, Transfer, Document
and Workspace, which is also right. What remains is that those groups
duplicate the command palette exactly, under different names — see §2.

**At 420px the shell degrades rather than adapts**, as §3 describes:
the header wraps, the save-state label is squeezed out, and the chooser
lands off-screen.

### A direction worth considering

*(Built. `src/spine.ts`, `src/commands.ts`, `src/workspace-palette.ts`,
decisions 51–53. What follows is the argument as it was made; §8 below
says what landed and what it cost.)

Taking the invitation to be bold seriously, the strongest move available
is to stop having a header at all and let the palette be the interface.

The chrome exists to answer three questions: where am I, what state is
the document in, and how do I get somewhere else. The first two need a
line of text, not a toolbar — a filename and a breadcrumb set in the
document's own typeface, in the left margin or above the title, at the
same weight as a caption. The third is what a command palette is for,
and dewnote has one that currently does nothing a menu could not do.

A palette that indexed the workspace rather than the rails would be a
different tool: type three letters of any tutorial title in any module
and open it; type a series name and see its tutorials in order; type
"push" and push. The file index is already in memory. Navigation, the
thing the three dropdowns do badly, is the thing a fuzzy palette does
better than any other interface, and it scales to a module of thirty
tutorials where a `<select>` does not.

That leaves the window as: the document, a caption line, and one key.
Save stays on Cmd+S with a dirty marker in the caption. The repository's
review-and-publish step stays a full screen, because publishing is a
different mode and should look like one. Everything else — settings,
outline, link check, transfer, module arrangement — is a command, named
once.

This is a bigger change than the one just made, and it depends on §2's
command registry existing first. It is also the version of this tool that
would be a pleasure to open, which is the actual brief.

## 6. What this pass changed

Six things, all defects rather than redesigns, each with a test.

0. *(Rebased onto #69, which had landed independently and closed several
   findings above. Where both had a fix, #69's was kept: its location
   reporting, its filename in the header, its grouped menu, its toast
   timer. What follows is what was left.)*

1. **A refused save is said out loud.** `save-problem.ts` is a new,
   dependency-free channel; `repo-panel.ts` reports every refusal through
   it as well as writing it into its own status line; the shell shows it
   as a banner that stays until dismissed, with **Show me** on a conflict
   to open the panel holding both versions.
2. **A refusal is styled and lifetimed differently from a
   confirmation** rather than sharing one slot with one timer: it holds
   until dismissed, it steps the branch-review offer aside while it is
   showing, and a successful save clears it.
3. **The location chooser preselects nothing.** A placeholder option
   means the page select never shows a tutorial as chosen that nobody
   chose, and the first tutorial in a series can be opened by picking
   it like any other.
4. **The working branch is shown at connect time**, with a sentence
   saying what a working branch is for, and the header follows the field
   instead of freezing at whatever it said when the session opened.
5. **Standalone HTML export went from 1.54 MB to 21 KB** for a
   maths-free tutorial. Of the original, 1.44 MB was twenty `@font-face`
   rules carrying KaTeX's webfonts, included whether or not the document
   had a formula in it; the rest was rules describing a repository
   panel, a command palette and a CodeMirror editor an exported page has
   none of. Fonts now travel only with maths, and a style rule survives
   only if it matches something in the rendered document. A tutorial
   with maths still comes out at 1.44 MB, all of it fonts — subsetting
   is the next step there and is not attempted here.
6. **Exported code blocks are styled.** A fence on screen is a
   CodeMirror instance inside `.dn-block-source`; an exported one is a
   plain `<pre><code>` that nothing in `app.css` had ever described, so
   every exported code block came out unindented and running off the
   right edge on any long line. The export now carries the handful of
   rules that markup needs, plus a print stylesheet.

Two stale test expectations on `main` were also brought up to date: the
block menu gained Code block, Card, Site playground and Staged hint
without `block-menu.test.ts` learning about them, which had left CI red.

## 7. What this pass did not change, and why

- **The one-commit-per-file push and the machine-written commit and PR
  messages.** This is the Git Data API rather than the Contents API and a
  message field in the interface. Real work, worth doing, not a fix to
  smuggle into a review.
- **The 350-request repository load.** Same reason, and the right shape
  for it depends on whether navigation should be built from
  `courses/*.yaml` alone, which is a decision rather than a patch.
- **Branch hygiene after a merged pull request.** Needs the compare
  endpoint and a decision about what to propose.
- **The review screen's in-memory change set.** Same dependency.
- **The three-dropdown location chooser, the missing filename, the
  weight of the Save button, and the narrow-width behaviour.** All
  design, not defects, and all better decided together with §5 than one
  at a time.
- **`tests/e2e/file-bar.spec.ts:37`**, which fails on `main` and still
  fails: it measures the legacy file bar's layout at 320px, and that bar
  is the chrome `PROGRESSIVE_WORKFLOW_UI.md` §6 phase 6 exists to remove.
  Fixing its CSS would be maintaining something scheduled for deletion.
- **`tests/e2e/pyodide.spec.ts`**, which cannot pass in this environment:
  the sandbox blocks `cdn.jsdelivr.net`, as `PLAN.md` step 3 already
  records.


## 8. The direction, built

§5 argued for stopping having a header and letting the palette be the
interface. That is what `src/spine.ts`, `src/commands.ts` and
`src/workspace-palette.ts` now are, and decisions 51–53 have the
reasoning. What it turned out to mean in practice:

**The header is gone rather than restyled.** `workflow-shell.ts` kept
the source gate, the save banner and the change-review screen and lost
everything else — the header, the workspace menu, the save menu. What
they carried is either a caption in the margin or a row in the palette.
The shell's host interface went from 24 methods to 7.

**The three dropdowns are gone as a surface, not as code.**
`workspace-nav.ts` stays mounted and still does the one thing nothing
else does: work out which module and series the open document sits in,
for the breadcrumb. It just never draws. That is the difference between
retiring a surface and deleting a capability, and it is why the
breadcrumb still knows where a practice page belongs.

**The measured layout was the piece that had to be right.** `measure`
and `margins` are reader settings, so the gutter the spine lives in is
not a number anyone can write in CSS. A `ResizeObserver` on the page
element answers for the window and the settings at once. Widening the
measure to its maximum narrows the spine, and narrowing the window past
the point where a column would be legible folds it to a line across the
top — the responsive behaviour §3 said was promised and missing.

**What is still open here.** The right margin now takes a docked panel,
which is a happy accident rather than a designed place for one. The
folded spine has no obvious touch affordance for the palette beyond the
breadcrumb being a button. The palette has no preview against a
repository, by choice, so a GitHub session gets a thinner pane than a
folder one. And §4's four GitHub-store findings — the 350-call load, the
commit per file, the in-memory change set, the reused branch — are
untouched: none of them is chrome.
