# Decisions

What was decided, why, and what it would cost to change. Numbered so
other documents can cite an entry. The first block was seeded on
2026-09-06 with the planning session; nothing was built when it was
written.

**1 — The markdown file is the document; the editor holds offsets into
it, not a model it exports from.** Every WYSIWYG block editor considered
(Milkdown, Tiptap, BlockNote, Lexical) owns its own document model, and
two of the source repositories have already paid for that: dewlab's
Milkdown surface silently dropped the `exec` attribute from every fence it
saved (dewlab decision 7.59). The block splitter here records offsets and
never rewrites prose; the first test in the repository is a byte-for-byte
round trip over every tutorial in dewlab and dewstack. This is not a
rejection on size — half a megabyte of Vue-carrying Crepe costs nothing
worth arguing about at the scale of one or two authors' tutorials — it is
a rejection on what the model can hold, which no amount of bundle weight
changes either way. See the plan §5.1.
*Cost to change: the whole editing surface. This is the one decision
that is meant to be expensive.*

**2 — Blocks render when blurred and edit when focused; live-preview
decorations inside a focused block are the upgrade path, not the start.**
The Obsidian-style single-surface approach is where the project should
end up, and it is too much decoration work for a first version. The block
model chosen lets a focused prose block's CodeMirror instance gain those
decorations later without anything else changing.
*Cost to change: small, and additive.*

**3 — A dialect is a data module, and the editor has no site-specific
code paths.** dewlab has one fence attribute and two fold classes;
dewstack has five fence forms and a check block; the next site will have
something else. `planning/DIALECTS.md` is the inventory. Each dialect
declares front matter, block kinds, add-menu entries, and the runtime a
cell needs.
*Cost to change: moderate; the discipline is easy to lose one shortcut at
a time.*

**4 — One Pyodide interpreter serves Python and SQL, in a Worker;
HTML/CSS/JS previews in a sandboxed iframe.** dewstack already made both
calls and dewlab's `pyodide-engine.js` and `pyodide-worker.js` are the
Worker. sql.js is not used anywhere current and is not adopted here. Stop
is terminate-and-restart by default and interrupt-flag where cross-origin
isolation headers allow it, because a single HTML file opened from disk
cannot set headers.
*Cost to change: the runtime is behind one interface; swapping it is a
week, not a rewrite.*

**5 — Files come through a store interface with browser, GitHub and
native implementations, because Safari has no live read-write handle to a
real folder.** Precisely: Safari fully supports `<input type="file">` (a
one-shot, read-only picker) and the origin-private file system since 15.2
(a private sandboxed store, no picker, invisible in Finder); what it has
never implemented, on any Apple platform, is `showOpenFilePicker()` /
`showDirectoryPicker()`, the File System Access API calls that return a
handle the page can keep and write back through at a real path. Chrome
and Edge have all three. Both the browser store's private vault and its
import/export by file and by download work in Safari today; only
"open `~/dewlab/tutorials/` and save into it directly" needs the native
store instead. See the plan §5.5 for the three-way distinction in full
and §5.6 for how Tauri closes that one gap.
*Cost to change: none; the interface is the cheap part.*

**6 — Tauri 2 for the Mac app, over Electron and over a local Python
server.** A Tauri app is the same TypeScript front end shown in the
operating system's own WebKit view, next to a small Rust process that
holds the real file paths, dialogs and keychain access a web page is
sandboxed away from; `invoke()` is the call across that boundary (the
plan's §5.6 has the mechanics). Its web view is WebKit, so testing in
Safari is testing the app; its dialog and fs plugins are current and
return real paths; the binary is small because it carries no bundled
browser. Electron fails all three, by shipping Chromium instead. A Python
server (`python -m dewnote`) is the recorded fallback: no Rust, no
signing, runs `build.py` natively, loses double-click launch.
*Cost to change: the native store implementation and the packaging, a few
days.*

**7 — The design tokens are dewlab's `--dl-*` set, imported not copied,
and every one is a user setting.** The two sites already share them so
that they read as siblings; the editor renders the document under the
same variables so the preview looks like the site because it is dressed
the same way. Family, size, measure, margins, cell tint and theme are
written to `<html>` before first paint, FAQ's way.
*Cost to change: small; the tokens are one file.*

**8 — Generated navigation is rendered, never written.** Table of
contents, previous and next, and series navigation are produced by both
build scripts from headings and `order.yaml`. The editor shows them in
the preview from the same inputs and does not put them in the file. A
plain-markdown target gets an explicit "insert contents" command that
writes a marked list.
*Cost to change: small.*

**9 — Tests drive the built app in a real browser for anything with a
cursor in it.** Both of dewlab's Milkdown traps were invisible from the
API and found only by driving the editor. `bun test` covers the block
model, dialects and exports; Playwright covers the surface.
*Cost to change: none worth taking.*

**10 — TypeScript, compiled and bundled by Bun, over plain JavaScript
with JSDoc and Vite.** The first draft of this plan proposed `// @ts-check`
JSDoc, matching every other repository here, all of which are plain
JavaScript because nobody working on them had a reason to reach for
TypeScript. That reason exists here: real TypeScript is wanted, as
something to learn, not only as a tool. Bun replaces Node, npm, Vite and
vitest with one binary; its bundler reads an HTML entry point and a
`browser` target and produces the single-file build directly (imports
resolved, CSS bundled, assets inlined), which is the project's single-file
requirement met without a separate plugin. Bun is younger than Vite and
Node, which is the trade being made: if its HTML bundling or a needed
native module proves unready, the fallback is Vite plus vitest, and
neither the TypeScript nor the source layout is Bun-specific, so that
fallback is a day's work, not a rewrite. Tauri does not care which of the
two produced its `dist/` folder.
*Cost to change: a day, by design — see above.*

**11 — Opening a folder builds a front-matter index, and the module and
series fields are a picker over it, not free text.** Knowing a dialect's
field list (decision 3) doesn't tell an author what values already exist
— `computational-methods` versus a typo'd `computational_methods` as a
new, unrelated module is exactly the failure a fixed field list can't
catch. One pass over every markdown file's front matter, on open and
refreshed on save, builds that index; `module`, `series`, and
`practice_for`/`practice_across` draw from it with a "new" escape hatch,
and `version` defaults to today's date plus the next unused sequence
number. See the plan §5.10.
*Cost to change: small; an empty index just leaves the form as free text,
which is where it started.*

**12 — CodeMirror 6 checked against the field, over Monaco and over
Typora's approach, not only against Milkdown.** Decision 1 rejected block
editors on the round-trip argument; this is the narrower question
decision 2 left open — whether CodeMirror 6 is the right tool for "render
when blurred, decorate when focused," or only the first one that came to
hand from dewlab. It is the field's converged answer, not an untested
one: Obsidian's Live Preview, Zettlr, and Logseq are all built on it for
this exact behaviour, and at least two open-source projects
(`atomic-editor`, `codemirror-live-markdown`) already implement
Obsidian-style decoration sets on top of it, worth reading before writing
dewnote's own. Checked since this entry was first written: neither is a
dependency to add now, for two different reasons, and step 8's live-preview
work should read rather than install either. `@atomic-editor/editor` (MIT,
137 stars, an actual published npm package, actively developed) is ruled
out as a direct dependency regardless of its polish, because its peer
dependencies are `react` and `react-dom` as hard requirements, not
optional ones — exactly the framework §5.9 already declined to take on for
a problem that is DOM manipulation and event handling, not component
trees. `codemirror-live-markdown` (MIT, zero runtime dependencies, CM6 and
`@lezer/markdown` as peers, KaTeX and lowlight as optional ones) is the
right architectural shape and needs no framework at all, but its latest
release is `0.5.1-alpha.1`, published January 2026 and quiet since — pinning
it as a real dependency means trusting a pre-1.0 API that could move
without warning. The reasonable use of both, when step 8 arrives, is
reading their decoration and widget code as worked examples of the exact
problem — how Obsidian-style hiding is implemented in CM6, concretely —
and vendoring a pinned copy or a rewritten equivalent of whichever pieces
prove useful — the same "vendor and adapt, don't chase a moving upstream"
instinct decision 4 already applies to Pyodide and decision 7 to the
`--dl-*` tokens — rather than taking either as a live `npm install`
dependency of the shipped app. Two real alternatives were checked and both fail for a
reason beyond size. Monaco, VS Code's own editor, is built for code, not
prose: it has no decoration or widget system tuned for hiding syntax and
rendering styled text in its place, so getting Live Preview's behaviour
out of it means fighting the tool rather than composing with it, whatever
its bundle costs (2–5MB against CodeMirror 6's tree-shaken core, a
difference that would not have mattered here either way — see decision
1). Typora takes the other real approach: no source view at all, a
hybrid renderer that parses to an AST and edits the rendered DOM
directly, serialising to markdown only on save. That is decision 1's
objection in its most complete form — the model, not the file, is what a
keystroke changes — and it is why Typora is proprietary and
un-embeddable rather than a library choice on the table.
*Cost to change: none; this confirms decision 2 rather than revising it.*

**13 — GitHub Actions runs the tests on every push and pull request, and
Dependabot opens the PRs that keep dependencies current, rather than
either being left to memory.** The prompt for writing this down rather
than only doing it: `bun add markdown-it js-yaml katex`, run to add two
new packages, silently rewrote `js-yaml`'s declared range from `^4.1.0`
to `^5.4.1` — Bun re-resolves an already-present package to latest when
it is named again, whatever the reason for the command — and nothing
short of reading the diff by hand caught it before a commit could have
carried an unplanned major bump in with two unrelated ones. Caught and
reverted this time; a rule that depends on catching it every time is not
a rule. `.github/workflows/tests.yml` (`bun install --frozen-lockfile`,
`bun test`, `bun run typecheck`, on push to main, on every pull request,
and on `workflow_dispatch` for the same reason dewlab's own tests.yml
carries it — a GitHub App's push starts no workflow on its own)
mirrors dewlab's `tests.yml` in shape. `.github/dependabot.yml` covers
two ecosystems: `bun` (GitHub's own version-update support for it went
GA in February 2025, reading the committed `bun.lock` text format
directly — `docs.github.com` and `github.blog` were both unreachable
from here to quote the exact YAML key verbatim, so this is worth a
glance at GitHub's own Dependabot config validation before trusting the
spelling blindly) and `github-actions` (so `actions/checkout@v4` and the
rest age the same way the runtime dependencies do). A weekly Dependabot
PR is exactly a rerun of what just happened by hand, except it lands as
its own PR, on its own branch, red or green on `tests.yml` before
anyone looks at it — which is the whole difference between this and
what `bun add` did unsupervised.

`.github/workflows/deploy.yml` rides along for the same reason dewlab's
own deploy.yml exists — publishing should be something that happens on
push, not something somebody remembers to do from a laptop — mirroring
its structure (`configure-pages` with `enablement: true`, `upload-pages-
artifact`, `deploy-pages`, the same concurrency group) even though there
is nothing real to publish yet. Its one build step copies
`planning/mockups/dewnote-sketch.html` to `dist/index.html` as a
placeholder, so turning Pages on for this repository — which Josh did
alongside this entry — shows the design sketch rather than a red
workflow or an empty site, until step 2 gives it a real single-file
build to run instead.
*Cost to change: small. The placeholder build step is one line to
replace; the ecosystem list in dependabot.yml grows by one entry if a
second package manager joins bun (Rust's cargo, once Tauri's own
dependencies exist, per §5.6).*

**14 — Bun's HTML-entry bundler needs one small script of its own to
produce a true single file, correcting what decision 10 assumed.**
Checked directly rather than trusted: `bun build ./index.html --outdir
dist` writes `index.html` plus a separate hashed `.js` and `.css` beside
it — the same shape Vite's default build has, not the one file the
browser-store and Mac-app-download modes both need (plan §5.5, §5.6).
`scripts/inline-single-file.ts` is the few lines that read those two
files and splice them into `index.html` directly. Writing it found a
second, sharper thing worth its own line: the first version used
`html.replace(linkMatch[0], \`<style>${css}</style>\`)`, and
`String.prototype.replace` treats `$&`, `$$`, `` $` ``, `$'` and
`$<n>`/`$<name>` in a replacement *string* as special patterns — always,
even when the search value being replaced is a plain string rather than
a regular expression. Minified JavaScript is dense with literal `$`
characters, and the built bundle happened to contain sequences matching
several of those patterns, so the naive version produced a 42 MB file (a
2.77 MB build inflated roughly 15x) with the script tag duplicated 28
times, silently — no error, no crash, just a build that "worked" until
someone looked at the size. Caught by checking the built file's size
against the sum of the two input files, not by trusting a green build. The fix is the standard one: pass a *function* as the
replacement (`() => \`<style>${css}</style>\``), whose return value
`replace` inserts verbatim with no pattern interpolation at all.
*Cost to change: none; this is what "no extra plugin" should have said
from the start.*

**15 — A block's commit patches only that block in the DOM; a
document-wide rebuild is the fallback for a structural change, not the
default.** Decision 2 already anticipated this in general shape — the
render/edit split — but the first version of `src/app.ts` still rebuilt
the whole container from scratch on every commit, and its own comment
undersold what that cost: "a cursor position or selection... can be
lost even though no text is." A Playwright test written to check the
opposite claim (`tests/e2e/surface.spec.ts`, "editing one fence and then
focusing a second preserves both") found the real failure directly:
clicking from one live fence into a second blurs the first, whose
commit tore down and remounted *every* block, including the second —
destroying the very click that was about to focus it, before a single
keystroke could land. Not lost cursor position; lost input, silently,
on the ordinary path of moving between two cells. The fix compares the
reparsed document's shape (block count and each block's kind) against
the old one: unchanged, and only the one block whose editor just
blurred is replaced in the DOM, every other live editor left exactly as
it was; changed — an edit that added or removed a block by, say,
introducing a blank line — falls back to the full rebuild, since indices
no longer line up cleanly enough to patch one in place. `enterEdit`
(clicking into a prose block) was changed the same way for the same
reason, on inspection rather than a second failing test: it would have
had the identical bug the moment a document had a live fence *and* a
reader clicked a paragraph.
*Cost to change: none; this is the correct version of what decision 2
already called for.*

**16 — The Pyodide worker's own source is a hand-authored string, built
at runtime from a Blob URL, not a separately-compiled file Bun's
bundler resolves.** Checked directly before assuming it, the same way
decision 14 checked the single-file build's actual shape rather than
trusting §5.9's claim about it: a `new Worker(new URL("./worker.ts",
import.meta.url))` reference, Vite's own documented pattern for a
bundled worker, is left completely unresolved by `bun build
--target=browser` — no second chunk, no error, just a broken reference
at runtime. dewstack's `assets/site-editor.js` already had the answer
for exactly this shape of problem (code for a different execution
context that a single-file build has nowhere else to put): author it as
a plain-JS string and hand it to `new Worker` via a Blob URL,
`new Blob([source], { type: "text/javascript" }).createObjectURL(...)`.
`src/runtime/worker-source.ts` follows that precedent — plain, untyped
JavaScript, kept as small as reasonably possible, with everything that
*can* be real, type-checked TypeScript (booting, the request/response
envelope, the interrupt buffer) living in `pyodide-engine.ts` instead.
The Python side (`dewnote_tools.py`) reaches the worker the same
mechanical way: `import ... with { type: "text" }`, checked directly
against a source containing backticks and `${…}` sequences before
trusting that Bun's escaping is safe to inline into the worker string
via `JSON.stringify`, since a naive inlining here would be exactly
decision 14's `$`-pattern class of bug in a different disguise.
*Cost to change: real but bounded. A future Bun release that resolves
worker `new URL()` references the way Vite does would make this file
unnecessary, at the cost of losing the "keep it plain JS" discipline
that makes the string itself easy to audit; nothing downstream of
`buildWorkerSource()` would need to change.*

**17 — A cell loads only the packages its own code imports, on its own
first run, not a fixed list eagerly at boot.** §5.4 named a `packages:`
front-matter field as the mechanism (dewlab's own), and this slice
shipped a simpler stand-in first: booting every page with
`["numpy", "pandas", "matplotlib"]` already loaded, since no front
matter field exists yet to read from. That was wrong to leave in past a
first look — every page pays multiple megabytes of download and Pyodide
package-init time for two libraries most cells never touch, before a
single cell has even run. Pyodide's own `loadPackagesFromImports(code)`
scans a cell's source for `import` statements and loads exactly the
matching packages, memoised so a second cell that imports the same
thing pays nothing further; `DEFAULT_PACKAGES` in
`worker-source.ts` is now empty, and matplotlib's `AGG` backend is
configured the first time a cell's own imports actually pull it in,
not unconditionally at boot. The `packages:` front-matter field §5.4
names is now read too (`declaredPackages`, `src/cell.ts`), alongside
`loadPackagesFromImports` rather than instead of it — for the real but
narrower gap that mechanism can't close on its own, a cell that depends
on a package without importing it by that name (dewlab's own example
is a package imported under a different name than it's installed
under).
*Cost to change: none currently outstanding; adding the front-matter
field later is additive; the boot handler's `msg.packages` parameter
still exists for that field to hand in.*

**18 — A Playwright test that needs a real, reachable Pyodide CDN gets
its own on-demand, network-only CI workflow, separate from the
sandbox that wrote it.** This step's own verification loop hit a wall
decisions 9 and 15 didn't anticipate: the development sandbox this
session ran in blocks outbound access to `cdn.jsdelivr.net` by policy
(confirmed directly — a `curl` to the exact URL the worker fetches
returns a tunnel failure, and a standalone Playwright script that
clicks Run and watches the page reaches the identical `import()` call
before failing on the same tunnel, not on anything in the app's own
code). `tests/e2e/pyodide.spec.ts` is written and, unlike every other
test this project has, could not itself be run to a passing result from
inside the environment that wrote it — a first for this codebase, and
worth naming rather than quietly leaving unverified. `playwright.config.ts`
also had a real portability bug surfaced by trying to fix this: its
`executablePath` was pinned, unconditionally, to this one sandbox's own
pre-baked Chromium, which does not exist on a contributor's machine or a
GitHub Actions runner — now a fallback (`existsSync` first) rather than
a hard requirement. `.github/workflows/e2e-pyodide.yml`
(`workflow_dispatch` only, deliberately not on push/PR, for the same
reason `tests.yml`'s own comment already gives for keeping the rest of
the e2e suite out of that gate) exists so this one test can actually run
somewhere with a real network — a GitHub-hosted runner — rather than
staying permanently unverified because of where it happened to be
written. One more thing this surfaced, also confirmed directly rather
than assumed: GitHub's `workflow_dispatch` API only recognises a
workflow file that already exists on the repository's default branch —
dispatching it from the branch that introduces it fails with a plain
404, not a permissions error. So this workflow's own first real run
happens only after the pull request that adds it merges to `main`, not
before; the honest state at review time is "written, and confirmed to
fail for the right reason locally," not "passing in CI."
*Cost to change: none; the workflow is additive and off by default. If
Bun or Playwright ever ship a first-class way to vendor Pyodide for
tests without a live CDN fetch, this workflow becomes redundant rather
than wrong.*

**19 — `requestStop` terminates the worker outright when there's no
SharedArrayBuffer to interrupt, rather than leaving Stop a dead button.**
§5.4 already named this as the baseline for a page without cross-origin
isolation; the first version of this slice built the SharedArrayBuffer
path and left the fallback as a silent no-op, which is worse than
looking unfinished — a Stop button that sometimes does nothing, with no
way for a reader to tell which time they're in, is a trap disguised as
a feature. Every hosting mode this step actually ships on today (a
single HTML file opened from disk, GitHub Pages with no
`coi-serviceworker` yet) lacks the isolation headers, so this fallback
is not an edge case here — it is currently the *only* path a reader
ever exercises. `canStop()` changed meaning to match: "a worker exists
to stop" rather than "an interrupt buffer exists," since both of
`requestStop`'s branches are real once a worker does. Terminating
rejects whatever `run-cell` request was in flight, which is why
`app.ts`'s Run handler now has a `catch` around `runCell`, not only its
existing `finally` — an unhandled rejection there would otherwise
surface as a bare console error instead of the "stopped" message a
reader clicked Stop to see.
*Cost to change: none; this is what "Stop is enabled where headers
permit, otherwise terminate-and-restart" (§5.4) already specified.
`tests/e2e/pyodide.spec.ts` exercises exactly this path, since file://
never has the headers — see decision 18 for why it can only be verified
after this merges, same as everything else that test covers.*

**20 — `deploy.yml` checks whether Pages is enabled before trying to
deploy, rather than letting a not-yet-configured repository fail every
run.** Pages has never actually been turned on for this repository —
that needs a one-time, admin-only Settings → Pages → Source: GitHub
Actions toggle, not anything a workflow's own token can do — and
`actions/configure-pages`'s own attempt to enable it on the workflow's
behalf (`enablement: true`, the default) was exactly what failed, every
single push to `main` since decision 13's placeholder was replaced with
a real build: "Resource not accessible by integration." That is a
GitHub Actions email on every push, for a condition that was never going
to resolve itself — no code change fixes a setting only a repository
admin can flip. A "Check whether Pages is enabled" step now calls the
Pages API directly first; a 404 (not enabled yet) skips the rest of the
job with a `::notice::` rather than failing it, while any other error
still fails loudly, so this doesn't quietly swallow a real deploy
problem along with the expected one. The moment the toggle happens, the
same workflow starts deploying with no further changes.
*Cost to change: none; the check becomes a permanent no-op (always
"enabled=true") once Pages is turned on, and costs one cheap API call
per run from then on.*

**21 — dewstack's SQL cells share the one Pyodide interpreter exec cells
already use, and `persist` parses without being honoured.** Researched
directly against dewstack's actual `assets/sql-cell.js` and
`assets/sql_tools.py` before porting anything, the same discipline as
decision 16 for the worker string — DIALECTS.md §2's summary alone
doesn't say that SQL, `py cell=`, `sql-check` and `app=` cells are all
one runtime (dewstack's own SQL runs through Pyodide's stdlib `sqlite3`,
on the *main thread*, not a second interpreter or a Worker of its own).
dewnote's SQL cells reuse the existing Worker instead, since a second
interpreter would double the boot cost for no benefit here; sqlite3
loads lazily on a page's first SQL cell run, matching decision 17's
"load what's used" rule.

`persist` (`cell=name persist`) is built, but not as a straight port —
this was a real design question, put to Josh directly rather than
decided alone, since it touches the same correctness question decision
15 already cost real debugging time over once. On dewstack, `persist`
means: on Run, save the textarea's current text to `localStorage`; on
page load, silently overwrite the textarea with whatever was saved
there, before a reader sees the fence's own authored text at all.
That's safe on dewstack because the textarea's content is *never* the
source of truth — it's generated markup, thrown away and regenerated by
the next build. On dewnote, a fence's live editor content genuinely is
the document's own text: `blockTexts()` reads it back out on every
commit (this file's own architecture, `app.ts`'s header comment).
Porting `persist` unchanged would mean opening a document in a browser
with old localStorage lying around silently rewrites the fence's
authored starter script the moment that block next commits — a real
correctness hazard dewstack never has, not a cosmetic gap.

Three shapes were on the table: automatic restore (dewstack's own,
carrying the risk above), automatic restore gated on the authored text
being unchanged since the script was last saved (a hash comparison —
narrows the risk window but adds real bookkeeping), or an explicit
"Restore saved work" banner the reader clicks themselves. Josh picked
the explicit banner. Run still saves the script it just ran
(`writePersistedSql`); Reset clears the saved entry along with the
connection (`clearPersistedSql`) — restoring is the only thing that
changed from dewstack's shape, since it is the only one of the three
that could silently destroy something. The localStorage key is name-only
(`sqlPersistStorageKey`), the same scope dewstack's own key has and the
same gap it has too — no per-document identity to fold in yet — but
bounded rather than dangerous now that nothing restores without a click:
two documents offering each other's saved script is a mildly confusing
banner, not a silent rewrite.

Also not ported: `sql-check` (five functions hardcoded to one dewlab
tutorial, `data/the-tentacular-plushies-quiz`, with no per-document or
per-check registry — a global Python namespace dewnote has no reason to
inherit).
*Cost to change: sharing the interpreter, none — it is already the
right call. `persist`'s explicit-banner shape could later grow the
hash-gated automatic variant on top without removing the banner (fall
back to it when the hash doesn't match), so choosing the simplest of
the three options first didn't foreclose the others.*

**22 — `read_sql` is pre-seeded into dewnote's one shared exec-cell
namespace, not ported as a per-name bridge the way dewstack's `py cell=`
has it.** Decision 21 named this as unported, for a reason that still
holds exactly: dewstack's `read_sql` lives inside a `py cell=name`'s own
namespace (`python_tools.py`'s `_namespace(name)`, pre-seeded per name),
bridging to the SQL connection of the *same* name — a shape dewnote's
exec cells don't have, since every exec cell already shares one
namespace for the whole page (this session's very first cut of step 3,
made before SQL cells existed at all). Porting the per-name bridge
unchanged had nothing to attach to. The straightforward alternative
turned out to be strictly more useful, not a compromise: put `read_sql`
in the one namespace every exec cell already has
(`dewnote_tools.py`'s `_page_globals`), so any cell can read any SQL
cell's table, not only one sharing its name — the natural shape once
there is only one namespace to begin with, not five. `get_connection`
(`dewnote_sql_tools.py`) is the same public door dewstack's own
`read_sql` uses.

The one real gap this leaves: `loadPackagesFromImports` (decision 17)
sees a cell's `import` lines, not a bare function call, so it has no way
to know a cell calling `read_sql(...)` needs `sqlite3` and `pandas`
loaded. `worker-source.ts`'s `runCell` checks for the literal substring
`"read_sql("` in a cell's own code before running it, and loads both
first if it's there — a plain heuristic, not real static analysis
(`fn = read_sql; fn(...)` would miss it), matching the honesty standard
decision 17 itself set for its own approach.
*Cost to change: none currently outstanding. A `py cell=`-shaped bridge
could still be added later without touching this one, if dewnote ever
grows dewstack's per-name Python-cell concept — they would coexist,
not conflict.*

**23 — A hint/answer fold's own code stays illustrative, deliberately,
never a live Run button.** Put to Josh directly rather than assumed: a
fold's quoted code could plausibly become its own runnable cell,
matching an exec fence anywhere else in the document. His call was no —
a reader adapting a hint's code by hand, retyping it to look like their
own attempt, is the better pedagogical experience than clicking Run on
someone else's answer. Nothing needed building for this: `render-block.ts`'s
`renderFold` already runs a second markdown-it pass over a fold's body,
and a quoted fence already renders as a real `<pre><code class="language-x">`
block there (`render-block.test.ts` already checked this). `blocks.ts`'s
own header comment had gone stale, still describing this as an unsolved
"future editor UI" problem well after `render-block.ts` solved the
rendering half of it — fixed alongside this decision, per `CONTRIBUTING.md`'s
own rule that a stale comment is worse than none. The one real, small
gap that remains: entering edit on a fold still shows its whole body,
any quoted fence included, as one flat markdown-source block, not a
live per-language CodeMirror instance for the fence specifically — minor
editing polish, not a rendering or pedagogical problem.
*Cost to change: none; nothing here forecloses ever adding a live cell
inside a fold later, if a future need for it turns up — it would be new
work, not an undo.*

**24 — The settings panel builds decision 7's own list directly, and
skips the mockup's three named presets rather than inventing new
palettes to fill them.** Asked broadly rather than narrowly — "think
through what a settings panel should hold," not "build this exact
list" — and answered by going back to what was actually already
decided: decision 7 already named family, size, measure, margins, cell
tint and theme as user settings, and dewstack's own `assets/settings.js`
already has a complete, working version of the mechanism (one small
object in localStorage, applied to `<html>` before first paint, a
default value removing its own attribute/property rather than setting
it so the stylesheet's default — including its dark-mode media query —
stays authoritative). `src/settings.ts` ports that mechanism directly;
`src/settings-panel.ts` is the UI around it, closed until asked (plan
§3), a real dialog rather than a hover reveal since adjusting several
controls in a row needs it to stay open between changes.

The mockup (`planning/mockups/dewnote-sketch.html`) sketches three named
presets — `workshop`, `manuscript`, `chalkboard` — each bundling a full
palette and type pairing. That sketch is exploratory, never itself
ratified the way decision 7 is, and choosing what those three (or any)
named looks actually are is real art direction, not an engineering
decision this session should make alone. Built instead: theme
(system/light/dark) over dewlab's own tokens, which already fully define
both a light and a dark set (`theme/dewlab-tokens.css`'s own
`[data-theme="dark"]` block, untouched) — the one "preset" that needs no
new palette work at all. `app.css` layers `--dn-cell-bg`/`--dn-output-bg`
(a `color-mix` against `--dn-cell-tint`) behind every place that used to
read `--dl-cell-bg`/`--dl-output-bg` directly, so a real named-preset
system, whenever it's designed, has one seam to plug colours into rather
than five call sites to find and change.

Two small additions beyond decision 7's own list, both because they were
sitting unbuilt rather than because they needed inventing: a Pyodide
source URL field (plan §5.9 already named "loaded from jsDelivr by
default with a self-host setting" — `pyodide-engine.ts` had the constant
but no way to override it) and a "Restart Python interpreter" button
(`restartInterpreter`, refactored out of `requestStop`'s own
terminate-and-restart branch — the same mechanism, now reachable on
its own rather than only ever firing as Stop's fallback).
*Cost to change: none for the built controls. Named presets are
additive whenever palettes for them exist — the color-mix seam above is
exactly the thing that makes adding one later cheap rather than another
five-call-site hunt.*

**25 — The front-matter form (decision 11) is built from the same
per-dialect scalar field list either way; whether `module`/`series` get
real autocomplete just depends on whether an index exists yet.** Started
from Josh's own "let's build what we can now," aimed at the one item from
the settings-panel discussion still open when this slice began — at that
point step 4's file-opening concept (and so file-index.ts, §5.10's own
index) genuinely didn't exist on `main` yet, so the form was built and
tested with `module` and `series` as plain text, the honestly scoped-down
half of decision 11. By the time this branch went to merge, a separate
run of work (PR #28, "the front-matter index, and the link picker it
unblocks") had landed `file-index.ts` and `distinctValues` on `main` in
the meantime — real concurrent progress on the same plan, not a
duplicate of anything this slice built (that PR's own front matter still
rendered as flat YAML; nobody had built the per-field form itself). With
the index no longer missing, finishing decision 11 properly took one
more small step rather than shipping a form already known to be
second-best: `frontmatter-fields.ts`'s field specs gained `indexedAs:
"module" | "series"`, and `buildFrontMatterRow` in `app.ts` attaches a
plain HTML `<datalist>` — populated from `distinctValues(sharedFileIndex,
field.indexedAs)`, the same module-level index singleton the link picker
already reads — to either field's text input when the index has anything
in it. A `<datalist>` is decision 11's own "picker... with a 'new' escape
hatch" for free: it suggests, never restricts, so typing a value that
isn't in the index still commits normally, and an empty index (no folder
or repository opened yet) just leaves the field an ordinary text input,
exactly as it always was.

What decision 3 ("a dialect is data, not a code path") makes this cheap:
`src/frontmatter-fields.ts` is one data table per dialect — the exact
field list `DIALECTS.md` already names as required or optional for
dewlab and dewstack — and `app.ts`'s form-building code reads that table
rather than branching on dialect name anywhere. Plain markdown's own
"arbitrary keys" dialect (DIALECTS.md §3) gets an empty table, which is
also the signal `renderBlockWrapper` uses to skip the form and fall back
to the plain raw-YAML editor — there is no fixed schema to build a form
from, so there is no form, not an empty one.

Two things stayed intentionally narrow rather than being built out
further this slice. First, only a plain scalar field (string, number,
boolean) gets a row at all — `isScalarField` in the same module is the
gate — so a list or nested mapping (`packages`, `covers`,
`practice_for`, `practice_across`) never gets a row the form would have
to half-understand; the form's own "Edit raw YAML" footer button is the
one and only way to reach those, by switching to the exact CodeMirror
editor every other block already has for its raw source (`app.ts`'s
`frontMatterRawMode`), not a second, form-specific text editor. Second,
"+ Add field" only exists for a `select`-kind optional field (today,
only `status`) — a select always has a first option to seed itself with,
where a hypothetical optional text field would have nothing non-empty to
add itself with, since `setFrontMatterField` already uses an empty
string as its own "field is not set" sentinel (clearing a field to empty
removes its line; that is the whole of decision 1's discipline for this
function, and giving "+ Add" a different empty-string meaning here would
split that in two). Neither dialect has an optional text field today, so
this is a documented gap waiting for one to exist, not a missing feature
anyone has asked for.

`setFrontMatterField` (`src/frontmatter.ts`) is the one new piece of
front-matter-parsing code, and it earns its own care: it finds the one
line a key already owns (or decides there isn't one), edits or removes
or appends that single line, then reconstructs the block by finding
exactly where the raw YAML body sits inside the original fence text and
splicing the new body back into the same opening and closing
delimiters — never touching a byte outside the one line that changed,
and returning the original text completely unchanged (not merely
equivalent) when the new value is identical to what was already there.
`src/frontmatter.test.ts` checks the byte-exact side of this directly,
line by untouched line, the same discipline `roundtrip.test.ts` already
holds `blocks.ts` to.

The commit path needed something genuinely new, not reused: every other
editable block commits from a live `EditorView`'s current text on blur,
but a plain HTML form field has no `EditorView` behind it to read from.
`commitFrontMatterField` is the dedicated path this needs — call
`setFrontMatterField` for the one key that changed, reparse, and patch
just that one block in place exactly the way `commit()` already does for
a shape-preserving edit (which editing a single scalar field always is),
falling back to a full rebuild only in the shape-changed case `commit()`
itself also falls back for. Committing on each field's own `change`
event, not on every keystroke, is a plain HTML form's native "the reader
moved on" signal — no debouncing invented to approximate it.
*Cost to change: low. The scalar-only and select-only-"+Add" narrowings
are both named gaps with a clear trigger for revisiting them (a dialect
gaining a scalar list field with real values behind it; an optional text
field being added to either dialect's own list) rather than an assumption
baked in anywhere language can't reach. A richer picker than a native
`<datalist>` — one that shows title as well as module/series, say, the
way `link-picker.ts`'s own overlay does — is a swap inside
`frontmatter-fields.ts`/`app.ts`'s row-building code, not a rethink of
`setFrontMatterField` or the commit path, both of which are unaffected by
where a field's value ends up coming from.*

**26 — A blank-only prose block gets a real, hoverable placeholder rather
than being absorbed into the block next to it.** `blocks.ts`'s own header
comment already named the gap: a fence, fold or front-matter block
doesn't own a trailing blank line the way a real paragraph does, so the
blank line right after one becomes its own prose block — real, and
correctly round-tripping, but rendering to the empty string
(`md.render()` of pure whitespace) and so collapsing to zero height, with
nothing for a mouse to hover to reach its own delete button. Confirmed
directly rather than assumed to be cosmetic: the pristine starter
document itself already has one, sitting silently between the exec cell
and the hint fold.

The tempting fix — make a fence/fold/front-matter block absorb its own
trailing blank run the same way a prose block already does — was
rejected: that would extend the block's own `text`, which `cell.ts` and
`app.ts` both read as exactly the fence's own delimiters and body with
nothing appended, `mountEditor`'s initial CodeMirror content included.
Extending it would put a stray blank line inside a code cell's own
editable box, worse than the invisible block it would replace, not
better — decision 1's byte-exact block model was never the problem here,
only the rendering.

Built instead, confined entirely to the render layer: `render-block.ts`'s
`renderBlockPreview` renders `<p class="dn-blank-line">&nbsp;</p>` for
*any* prose or math block whose markdown renders to nothing, not only
the fence-adjacent case that first surfaced it — a non-breaking space is
the standard technique for giving an element real height without a
literal character a reader would ever look at directly. This reuses
every other prose block's own hover-toolbar and click-to-edit path
outright: no new interaction code, just a block that finally has a
surface for the existing one to find. Confirmed live, not just built:
the starter document's own orphan block went from a `0`-height, silently
present, silently unreachable entry to a normal hoverable row whose
existing delete button removes exactly the one blank line and nothing
else.
*Cost to change: none. A future rendering pass (the fence-chrome work
this session's own "cleanest and simplest editing experience" thread is
headed toward) can replace this placeholder with something richer
without touching `blocks.ts` or any index arithmetic in `app.ts`.*

**27 — A runnable fence's own header lines become a compact form; the
fence's live editor holds only the code. Chosen from four mocked-up
options, over a full Obsidian-style cursor-aware decoration system.**
Screenshotting the built app directly (decision 9) surfaced the actual
cost of §5.1's own deferred "live-preview decorations" upgrade: every
cell shows its raw ` ```python exec `, `id:` and `hint:` lines forever,
never hidden, for the two things Josh named as mattering most — Python
and prose. Four concrete treatments were mocked up in dewnote's own
tokens (an artifact, not a description) before writing any code: hiding
the fence lines unconditionally behind a badge with a reveal click; the
full Obsidian-style decorations, hidden only while the cursor is
elsewhere; header lines as real form fields; and a badge added on top of
the untouched raw text. Picked: the form-field option, with two further
asks — space efficiency and easy Python editing — that shaped the actual
build more than the mockup did.

Decision 15 is untouched on purpose: a fence is still always a live
CodeMirror instance, never a separate rendered view. What changed is
*which text* that instance holds. `cell.ts` gained `setCellHeaderField`
(mirrors `setFrontMatterField`'s own byte-exact discipline exactly,
touching only one header line) and `replaceCellCode` (the inverse: swaps
the code, leaves every header line untouched). `app.ts`'s fence-code
`EditorView` now holds only `parseCellSourceFromFenceText(block.text).code`
— not the whole fence — so the language extension highlights real code
alone, no more `id: first-cell` lines for CodeMirror's Python mode to
render nonsensically. A second map, `fenceCodeViews`, sits alongside the
existing `liveViews`, since `blockTexts()` now has to know which of a
block's live editors is "the whole block's own text" versus "just this
block's code, headers already committed elsewhere" — `mountEditor`
grew an optional target-map parameter for exactly this, rather than a
second near-identical mounting function.

A genuine correctness trap surfaced building this, not found by
inspection: `parseHeaderAndCode` reads *both* "no code lines at all"
and "a single blank code line" as `code: ""` — collapsing two distinct
byte shapes to the same parsed value. `replaceCellCode`'s first cut
reconstructed unconditionally, which meant simply *mounting* an
untouched cell with no code at all inserted a phantom blank line on
every read — caught immediately by `tests/e2e/surface.spec.ts`'s own
real-fixture round-trip test actually failing, not by review. Fixed
with the same no-op guard every sibling function here already has:
compare against *this* fence's own current code before reconstructing
anything, and return the original bytes untouched when they match.

Two further choices, both about not losing what the split already had.
Editing `hint`/`expect`/`name` patches only the header bar's own DOM
(`commitCellHeaderField`), leaving the code's live editor completely
alone — its cursor position and undo history survive a hint edit, which
a full block re-render (every other commit path's own habit) would have
thrown away for no reason, since a header edit can never change the
document's shape. `id` gets its own path instead
(`commitCellId`): DIALECTS.md §1 calls a cell's id a contract, so a
clear is refused outright, a value already used by another cell is
refused outright with `window.alert` (the same native-dialog idiom
`pickImageFile`'s own alt-text prompt already uses, not a bespoke
modal for something this rare), and an actual rename of a non-empty id
is confirmed first — the same warning dewlab's own authoring editor
gives (§4). `id` changes rebuild the whole block regardless, since the
Run button's own closed-over id needs the same fresh value the header
bar does, and a rename is rare and deliberate enough that losing the
code editor's cursor position over it is a fair trade, unlike a hint
edit.

Scoped to `isRunnableFence` fences only — dewlab's `python exec`/`sql
exec` convention, the one shape with `id:`/`hint:`/`expect:`/`name:`
header lines to begin with. A SQL cell (`sql cell=name`), a site pane,
and a staged-hint fence each carry their own information in the info
string or their own header shape already, not this one, and keep
rendering exactly as before.
*Cost to change: low. The scoping to `isRunnableFence` is a single `if`
in `renderBlockWrapper` — extending the same treatment to another fence
kind's own header shape later is additive, not a rework of
`setCellHeaderField`/`replaceCellCode`, both of which only know about
generic `key: value` header lines and code, never about which fence kind
called them. Reverting to one CodeMirror instance per fence, if that
ever seemed better, is un-doing the `fenceCodeViews` split and its one
call site in `renderBlockWrapper` — contained, not spread through the
file.*

**28 — Every panel's toggle button lives in one shared icon rail
(`icon-rail.ts`), not `document.body` directly.** Eight panels
(`settings-panel.ts`, `folder-panel.ts`, `repo-panel.ts`,
`series-panel.ts`, `dialect-panel.ts`, `outline-panel.ts`,
`source-view.ts`, `link-check.ts`) each mount completely independently
from `main.ts`, with no shared parent. Each one had also picked its own
`position: fixed; top: Nrem` offset by hand, one panel author at a
time — eight numbers, each the "next free slot" down the right edge,
with `.dn-repo-toggle` left on the *left* edge, an inconsistency with
no reason behind it beyond whoever wrote that panel reaching for the
opposite side. `icon-rail.ts` is one lazily-created, memoised
`<div class="dn-icon-rail">`, `position: fixed` itself and laid out as
a flex column; every panel appends its toggle button there instead
(`iconRail().appendChild(toggle)`), and the panel or overlay itself
still goes straight to `document.body` as before — only the toggle
moves. Each `-toggle` CSS rule dropped its own `position`/`top`/
`left`/`right`/`z-index` and kept everything else (shape, colour,
opacity, hover state) untouched, and every toggle also gained a
`title` attribute mirroring its existing `aria-label` — the "unlabeled
glyph buttons" half of the toolbar problem, not just the scattered
layout. No button's class name changed, so none of the many existing
Playwright tests that select a toggle by its exact class needed to
change; the full suite passed unmodified. `.dn-repo-toggle` now sits in
the same rail as the other seven, in main.ts's own mount order.
*Cost to change: low. `icon-rail.ts` is a dozen lines with one exported
function; reverting to per-panel fixed positioning is deleting the file
and putting each panel's own `top`/`left`/`right` back, one rule at a
time, with no other file depending on the rail's own internals.*

**29 — Plain markdown's front matter gets a one-line caption explaining
why it opened as raw YAML, not a form.** Clicking a dewlab/dewstack
document's front matter opens the per-field form built for decision 11;
clicking a plain document's own opens the same raw-source editor as any
other block, with nothing on screen saying why the two look different.
A reader who has only ever seen the form has no way to tell "this
document has no recognised dialect" apart from "the form is broken."
`renderBlockWrapper` now appends a `.dn-frontmatter-plain-caption`
immediately above the raw editor whenever `frontMatterFieldsFor` returns
an empty list — never when a dewlab/dewstack author reached the raw
editor deliberately through the form's own "Edit raw YAML" toggle, since
that reader already knows what they asked for. The caption names the
actual fix (`year:` for dewlab, `module_title:` for dewstack), not just
the absence. Caught while looking at the starter document with fresh
eyes for workstream 4 (the "first five minutes"): `render-block.ts`'s
own `renderFrontMatterPreview` still carried a comment calling the
per-field form "later work," stale since decision 11 shipped it —
fixed alongside this, since a comment that says a built feature doesn't
exist yet is worse than the one this replaced it with.

The bigger question workstream 4 opened — whether the starter document
itself should model a real dialect's front matter rather than staying
plain, so a first-time reader sees the form and not just this caption —
is still open; see `planning/PLAN.md` §6, step 8.
*Cost to change: low. One `if` in `renderBlockWrapper`, one CSS rule,
and a caption string with no state of its own — removing it is deleting
those three things, nothing else reads `.dn-frontmatter-plain-caption`.*

**30 — A prose block's own slash command, alongside the "+" menu, not
instead of it.** Requested directly: "let's use slash commands to help
with cells and code insertions etc." Typing "/" in a block that holds
nothing else (fresh from the "+" menu's own "Paragraph," or an existing
block cleared back to empty) opens a small menu of the same three kinds
the "+" menu itself offers that have nowhere near them to race: Code
cell, Math, Hint. Filtered as more letters follow ("/c" narrows to
"Code cell"), arrow keys move the selection, Enter or a click confirms,
Escape dismisses — and stays dismissed through further keystrokes that
would otherwise still match, until the text stops looking like a slash
command at all (a `dismissed` flag `sync` itself clears, not just the
menu's own visibility). Deliberately whole-block, not per-line the way
Notion's own slash menu is: a block already holding real prose that
happens to contain a literal "/" is not offering to replace itself,
only a block that is nothing else yet reads as one — the check is
against the block's *entire* text (trailing newlines from the "+"
menu's own placeholder stripped first), not the current line. Scoped to
`block.kind === "prose"` only, in `renderBlockWrapper`; front matter's
raw-YAML fallback and a fold's raw HTML have no business turning into a
code cell mid-edit.

Image and Link stay "+"-menu only, not offered here — both are async
(a file picker, a search overlay) with a real blur in the middle of
that wait, unlike Cell/Math/Hint's synchronous, direct-to-`NEW_BLOCK_SPEC`
path; extending the slash menu to them is choosing to solve that race
first, not free once the machinery already exists for the other three.

Confirming a selection reuses exactly the machinery the "+" menu's own
`insertAfter` already had, refactored rather than duplicated:
`spliceNewBlock(spliceIndex, deleteCount, spec)` is `insertAfter`'s own
former body, generalised with a `deleteCount` — 0 for "+" (insert after
an existing block), 1 for the slash menu's own `replaceBlockViaSlash`
(replace the very block being typed into, since there is nothing in it
worth keeping). `insertAfter` itself is now three lines calling it.

A real, reentrancy bug surfaced building this, not from inspection: the
slash menu's own confirm runs from inside the block's own CodeMirror
keymap dispatch (Enter), and `spliceNewBlock`'s `teardownLiveViews()`
call destroys that same view as part of the structural rebuild every
insert path already takes. Destroying a view that currently holds DOM
focus — which never happens on any *other* teardownLiveViews caller,
since a click on the "+" menu, the delete button, or a drag handle
never has focus inside the block it's acting on — fires that view's own
`blur` DOM event synchronously as part of `EditorView.destroy()`, which
`mountEditor`'s own blur handler was treating exactly like a genuine,
user-initiated blur: calling `commit()` for a block already mid-teardown,
reading `blockTexts()` against a `doc` this function hadn't finished
reassigning yet, and overwriting `source` with a stale reconstruction —
the whole splice, silently discarded, with no thrown error to point at
it (found only by tracing `commit()`'s own call stack, which named
`EditorView.destroy()` as the caller). Fixed at `teardownLiveViews()`
itself, not in the slash menu: a module-level `suppressBlurCommit` flag,
set for the exact span of its own destroy loop, that `mountEditor`'s
blur handler checks before calling `commit()`. This is a latent hazard
every future feature that programmatically replaces the currently-
focused block inherits protection from, not a slash-menu-specific patch.

`buildSlashMenu` also exposed a second, smaller gap while testing
against the *realistic* entry point (typing over the "+" menu's own
pre-selected "New paragraph.", not hand-clearing a block with
Ctrl+A+Delete): the block's own trailing `"\n\n"` survives a selection
replace, so the live text right after typing "/c" is `"/c\n\n"`, not
`"/c"` — `sync`'s own match against the *whole* string needed trailing
newlines stripped first, or the menu never opened at all outside a
manufactured, fully-emptied block.
*Cost to change: low, for the menu itself — `buildSlashMenu` and its two
call sites (the extension wiring in `renderBlockWrapper`,
`replaceBlockViaSlash`) come out cleanly, and `insertAfter` reverts to
owning its old body directly. The `suppressBlurCommit` guard is worth
keeping regardless of the slash menu's own fate — it fixes a real class
of bug in `teardownLiveViews`, not a workaround tied to this feature.*

**31 — The starter document is dewlab, not plain markdown.** Decision
29's own "still open" note asked this directly: `main.ts`'s
`STARTER_DOCUMENT` carried no `year:` or `module_title:`, so
`detectDialect` read it as plain and a first-time reader never saw the
per-field form, dialect-aware preview styling, or anything else gated
on a real dialect — the very things most worth showing in a first five
minutes, and dewnote's own default *texture* is already dewlab's
regardless of a document's front matter (§5.3), so the front matter
staying dialect-less was a gap, not a neutral default. Answered
directly rather than picked unilaterally, choosing this over dewstack
or a first-open dialect chooser. `module: getting-started`,
`module_title: "Getting Started"`, `year: "2026"`,
`series: first-notebook`, `version: 1` were added to the starter's own
front matter — plausible, harmless placeholder values in the same shape
real dewlab tutorials use (`fixtures/dewlab/*.md`'s own quoting
conventions), not a real module a document could actually collide with.
A reader who wants plain markdown instead loses nothing: the
dialect-convert panel (⇄, already built) drops every one of these
fields in one click, the same as converting any real dewlab document
down to plain.
*Cost to change: low. Six front-matter lines in one template literal —
reverting is deleting them, and nothing else reads STARTER_DOCUMENT's
own field values by name.*
