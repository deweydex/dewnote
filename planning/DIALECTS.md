# The dialects dewnote must open and save

An inventory, taken 2026-09-06 from `build.py` in each site and from the
tutorials themselves, and updated 2026-09-12 against dewlab's own commits
since (§1's `sql exec`, `hint` fence, and `html/css/js site` fence
entries, and dewstack's changed status in §2 — see
`deweydex/dewlab@planning/DEWSTACK_MERGE.md`, written there 2026-09-10).
Each dialect becomes one module in the editor that declares its front
matter, its block kinds, what the add-block menu offers, and which
runtime a cell needs. This file is the reference those modules are
written from and checked against; when a build script changes, this file
changes first.

Everything is CommonMark underneath. A dialect is the set of additions.

---

## 1. dewlab

**File layout.** `tutorials/<module>/<slug>/<slug>.md`, with optional
`<slug>-practice.md`, `<slug>.glossary.yaml`, frozen `v<version>.md`
releases, and images beside it. Reading order is
`tutorials/<module>/<series>.order.yaml`, never a front matter field —
checked directly against dewlab's own `build.py` (`order_files()`,
`series_titles()`) rather than assumed: it's a real two-key mapping,
`series: <human title>` and `order:` as a YAML list of slugs, one per
line, not the flat "one slug per line" file this section first
described. A module may also carry a `series.yaml` (`order:` a list of
series names) chaining several series' own glossaries together for
cross-series reference accumulation, and `tutorials/modules.yaml`
(`order:` a list of module names) orders the modules themselves —
both optional, and neither built into dewnote's own series view (plan
§6 step 4) yet, which groups by module alphabetically and lists each
series independently rather than reading either chain.

**Front matter.** Required: `title`, `slug`, `module`, `module_title`,
`year`, `series`, `version` (`2026.09.04.1` form). Optional: `status`
(`live` or `archived`), `packages` (a list, e.g. `[sympy]`),
`practice_for`, `practice_across`, `covers` (sections mapped to learning
outcomes). Slug must equal the file name; module must equal the parent
folder.

**Cells.** Two cell languages as of `d2a21ed` (2026-09-10), both exec
fences sharing one header grammar: `python exec` and `sql exec`.

````markdown
```python exec
id: filter-evening
hint: Try printing readings["evening"] > 14 on its own first.
readings[readings["evening"] > 14]
```

```sql exec
id: total-readings
expect: len(_) > 0
select count(*) from readings;
```
````

The `id:` line is required and is a contract: saved student work is keyed
on it, so renaming one throws that work away. The editor must warn before
a rename and never generate ids that could collide. Header lines, in the
order dewlab's own `HEADER_RE` accepts them: `id:` (required), `hint:`,
`expect:`, `name:` (all optional) — `cell.ts` must recognise and preserve
all four verbatim, not just `id`/`hint`; a real dewlab tutorial using
`expect:` or `name:` currently has that line swallowed into the cell's
own *code* by dewnote's header parser, which then fails to run (§8 has
the fix). `expect:` is a Python expression checked after a run, driving a
staged hint's trigger (`planning/CELL_HINTS.md` in dewlab); `name:` is
reserved there for a related feature dewnote does not need to act on yet,
only preserve. A fence without `exec` is illustrative, read-only code.
Counted across the repository as of 2026-09-06: 806 `python exec`, 252
plain `python`, nothing else — `sql exec` and the newer headers postdate
that count.

A `sql exec` cell's body is SQL text, not Python, and runs against one
shared, page-wide SQLite connection (`tutorial-runtime.js`'s
`SEED_SQL_DB_SOURCE`, seeded into the same shared namespace every
`python exec` cell already uses, under the name `db`) — not a per-cell
named database the way dewstack's SQL cells work (§2). Running it means
wrapping the fence's raw SQL as
`tutorial_tools._run_sql_cell(db, <script>)` before handing it to the
same Python-exec pipeline every other cell already uses, exactly the way
`tutorial-runtime.js`'s own `wrapSqlCode()` does — not a second execution
path. `_run_sql_cell` is already dewmini's own SQL cell function
(`tutorial_tools.py`), which is also what dewnote's existing
`dewnote_sql_tools.py` was trimmed from for dewstack's cells, so the
runtime work is a second call site, not new plumbing.

**Shared setup.** `{{include: setup/load_readings.py}}` inside a cell,
spliced in at build time. Preserve verbatim; optionally show the included
text greyed beneath it.

**Folds.** Raw HTML, and the build fails on any `<details>` whose class is
not one of two:

```markdown
<details class="dl-hint"><summary>hint</summary>

Name the columns you want, separated by commas, in place of `*`.

</details>
```

`dl-answer` is the other. The blank lines inside are required for the
markdown within to render. These are the whole of the practice-problem
syntax; a problem is `**2.**` followed by prose, then a fold.

**Staged hints — a second, fence-based fold**, added `5b4bfaa`
(2026-09-07) and reworked into its final fence form by `d2a21ed`
(2026-09-10). Not the same thing as the `dl-hint` fold above, and not a
replacement for it — a staged hint waits for a real attempt (errors, a
repeated identical error, an unchanged run, or a failing `expect:`)
before it appears at all, where a hand-written `dl-hint` fold is always
there to open. Its own fence:

````markdown
```hint
after: 3 errors
title: Let's slow down a moment…

Check that every column name matches the table exactly, including case.
```
````

`for:` is optional (defaults to the exec cell immediately above it in
the source — `for:` names one explicitly, needed only when a hint
doesn't directly follow its cell); `after:` and `title:` are each
optional too, defaulting to `errors:5` and "Let's slow down a moment…".
Everything after the header lines is the hint's own markdown body. It
compiles to `<details class="dl-hint dl-hint-staged" data-cell="..."
data-after="..." hidden>` — a third fold shape, alongside `dl-hint` and
`dl-answer`, that dewnote's block splitter already passes through safely
as an opaque fence (its round-trip guarantee never depended on knowing
what a fence's info string means), but that `render-block.ts` currently
shows as a plain, unstyled code block rather than a fold, since nothing
reads the fence's `hint` info word yet (§8 has the plan).

**Notes.** `<aside class="dl-note" id="...">`, lifted out of the body into
the reference panel by the build. Built, currently unused by any tutorial.

**Links.** `[text](tutorial:slug#anchor)`, resolved at build time; a dead
slug or anchor fails the build. The editor should offer a picker over real
slugs and anchors and check links on save.

**Images.** `![alt](name.png)`, a bare file name resolved against the
tutorial's folder; `alt` is required. Built, currently unused.

**Maths.** `$…$` and `$$…$$`, extracted before markdown runs. `\$`
escapes. Inline maths does not match across a newline or against
whitespace on either side, so prices survive; the editor's renderer must
use the same rule or previews will differ from the site.

**Generated, never authored.** Table of contents (a closed `<details
class="dl-toc">`, emitted only with two or more sections), previous and
next, series navigation, the reference panel.

**Runtime.** Pyodide 0.28.3 in a module Worker; `numpy`, `pandas`,
`matplotlib` baseline; `packages:` adds more. Output rendering lives in
`assets/tutorial_tools.py`.

**Live-preview site cells**, added `4ac0176`/later commits through
2026-09-11 as dewlab's own answer to the web track dewstack's merge is
retiring (see §2's new header) — not a copy of dewstack's `site=name`
spelling, and deliberately so: dewlab's own authoring editor keeps only
the *first word* of a fence's info string on a round trip, so an
identity carried in the info string (`site=hero`) would come back inert.
The grouping key instead lives on a header line, the same place every
other exec-family fence already keeps its own identity:

````markdown
```html site
id: hero-markup
site: hero
<button>Hover me</button>
```

```css site
id: hero-style
site: hero
.btn { padding: 0.5rem 1rem; }
```
````

Fence language is one of `html`, `css`, `js` (`SITE_LANGS`); `id:` is
required (cells and panes share one id namespace — a build fails if any
two collide) and `site:` is the grouping key. Panes are grouped by
*consecutive* fences sharing the same `site:` value — nothing else may
sit between them, and the same `site:` name may not reappear later in
the document once its run has ended (the same "keep it together" rule
dewstack's own `site=` enforced). At most one pane per language per
site; panes are otherwise optional (an HTML+CSS site with no JS pane is
normal). A `js site` pane gets a Run button and a console; `html site`
and `css site` panes stay live, rebuilding the preview on every edit.
This is exactly the block-model gap plan §6 step 3 named and deliberately
deferred ("`site=`/`app=` cells... need consecutive-fence grouping
dewnote's block model doesn't have yet") — now with a real, stable target
grammar to build it against, since dewlab settled its own spelling rather
than dewstack's (§8 has the plan).

## 2. dewstack — being retired into dewlab, 2026-09-10 onward

`deweydex/dewlab@planning/DEWSTACK_MERGE.md` (written 2026-09-10) records
Josh's decision to fold dewstack's two live tracks — `data` and `web` —
into dewlab itself as `database-methods` and `web-authoring`, rebuilt
against dewlab's own conventions rather than imported, and to retire
dewstack as a hosted site once both have run in front of a class. As of
2026-09-12 both tracks are staged, ported, and merged to dewlab's `main`
(`planning/DEWSTACK_MERGE.md` §9's own ledger) — not yet linked from
dewlab's homepage, but no longer "coming soon" as engineering. This
section stays as the record of dewstack's *own* grammar — still real for
as long as dewstack itself is live, and the shape dewnote's dialect
converter (§5) needs to read *from* for exactly this migration — but it
is no longer a second dialect dewnote should treat as an equally live
authoring target the way §1 is. Where dewstack and dewlab now both have
an answer to the same problem (SQL cells, site cells), dewlab's own
spelling in §1 is the one to write new tutorials in, in dewnote or
anywhere else — dewstack's spelling below is legacy dewstack could not
avoid once it existed, and it was never adopted by dewlab in the first
place, for reasons §1 gives at each entry.

**File layout.** `tutorials/<module>/<slug>/<slug>.md`, optional
`<slug>.glossary.yaml`. Same `order.yaml` convention as dewlab.

**Front matter.** Required: `title`, `slug`, `module`, `module_title`,
`series`, `version`. Optional: `status` (`live` or `draft`). No `year`,
no `covers`. Detection rule between the two sites: `year` present means
dewlab; `module_title` without `year` means dewstack.

**Cells.** Five fence forms, all pulled out before markdown sees them.

| Fence | Meaning |
|---|---|
| ` ```html site=name `, ` ```css site=name `, ` ```js site=name ` | Web track. Panes sharing a name form one site with a live preview in a sandboxed iframe. JS runs on Run only. |
| ` ```sql cell=name ` and ` ```sql cell=name persist ` | Data track. Cells sharing a name share one SQLite connection; `persist` keeps the script across visits. |
| ` ```sql-check db=name task=check_foo ` | An empty fence that renders a self-check button. |
| ` ```py cell=name ` | pandas and matplotlib, sharing a namespace by name; `read_sql("name", …)` reaches a SQL cell's connection. |
| ` ```html app=name `, ` ```css app=name `, ` ```js app=name ` | Full-stack track, rendered into the page, with `window.dlQuery(db, sql, params)`. |

The info string carries everything; the body has no header lines. This
is the case that broke Milkdown in dewlab and it is why the block
splitter keeps the info string whole.

**Folds.** Same two classes as dewlab, same spelling.

**Links.** Same `tutorial:` scheme.

**Images.** `<img>` without `alt` fails the build. No tutorial uses one.

**Maths.** None. No KaTeX, no `$` anywhere. A dewstack document with `$`
in it should render the dollar signs as text.

**Markdown extensions in the build.** `fenced_code`, `tables`, `toc`,
`sane_lists`, `attr_list`. No tutorial uses `attr_list` syntax
(`{: .class }`) as of 2026-09-06, so the renderer needs no plugin for it
until one does.

**Runtime.** One Pyodide interpreter per page serves SQL (`sqlite3`),
Python and app cells; the HTML/CSS/JS preview is an iframe with
`sandbox="allow-scripts"` and no `allow-same-origin`.

**Look.** Same tokens as dewlab, measure 30rem instead of 34rem.

## 3. Plain markdown (writing-content, and anything else)

YAML front matter with arbitrary keys, preserved in order and quoting
(`created`/`updated` are quoted ISO-8601 strings; a YAML re-dump would
unquote them). CommonMark with GFM tables and task lists, inline HTML
passed through, `$…$` maths on. No cells run; fences are highlighted.
The prompt-deck fields in writing-content (`prompt: 62`) are that app's
business and dewnote leaves them alone.

## 4. Jupyter (import and export only)

nbformat 4.5. Mapping from the block model:

- A run of prose blocks → one markdown cell, joined by blank lines.
- A code cell → a code cell. `id` from the dewlab `id:` line where there
  is one, else generated. The full fence info string, the `hint:` line,
  and the dialect name go in `metadata.dewnote` so import can rebuild the
  fence exactly.
- Illustrative (non-exec) fences stay inside markdown cells.
- Folds stay as raw HTML inside markdown cells; Jupyter renders
  `<details>` natively.
- Outputs, if included: `stream` for text, `display_data` with
  `image/png` for figures, taken from the last run.

Import inverts this. A notebook without `metadata.dewnote` becomes a plain
markdown document with `python exec` fences in the dewlab dialect if the
user chose dewlab as the target, else plain `python` fences.

## 5. Conversions between dialects

Block by block, with a report of what did not map:

| From | To | Rule |
|---|---|---|
| dewlab `python exec` with `id: x` | dewstack | `py cell=x`; `hint:`, `expect:`, `name:` have no home, report each |
| dewstack `py cell=x` | dewlab | `python exec` with `id: x` |
| dewstack `sql cell=x` | dewlab | `sql exec` with a fresh `id:` (dewstack's per-cell named database has no dewlab equivalent — dewlab's cells all share one `db` — report the name lost); `persist` has no home either, report it |
| dewstack `sql-check` | dewlab | no equivalent; keep as illustrative fence, report |
| dewstack `html/css/js site=name` | dewlab | `html/css/js site`, each pane getting its own fresh `id: <name>-<language>` and `site: <name>` |
| dewstack `html/css/js app=name` | dewlab | no equivalent (dewlab has no full-stack track yet — `planning/DEWSTACK_MERGE.md` §2 in dewlab defers this); keep as illustrative fences, report |
| dewlab `sql exec` | dewstack | no equivalent (dewstack's SQL cells are per-name databases dewlab's shared-`db` model can't address as one); keep as illustrative fence, report |
| dewlab `hint` fence | dewstack | no equivalent (dewstack has no staged-hint mechanism); keep as illustrative fence, report |
| dewlab `html/css/js site` | dewstack | `html/css/js site=<name>` (`id:` has no home — `site=name`'s own info string is the whole identity there — dropped, reported); a pane with no `site:` at all has nothing to carry over, kept as illustrative, reported |
| either | plain | drop attributes, keep language |
| dewlab front matter | dewstack | drop `year`, `covers`, `practice_*`; keep the rest |
| dewstack front matter | dewlab | add `year` (ask), `covers` empty |

All of the above is implemented in `dialect-convert.ts` as of plan §8's
own items 1-3.
