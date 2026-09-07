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
