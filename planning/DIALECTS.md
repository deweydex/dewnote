# The dialects remark must open and save

An inventory, taken 2026-09-06 from `build.py` in each site and from the
tutorials themselves. Each dialect becomes one module in the editor that
declares its front matter, its block kinds, what the add-block menu
offers, and which runtime a cell needs. This file is the reference those
modules are written from and checked against; when a build script
changes, this file changes first.

Everything is CommonMark underneath. A dialect is the set of additions.

---

## 1. dewlab

**File layout.** `tutorials/<module>/<slug>/<slug>.md`, with optional
`<slug>-practice.md`, `<slug>.glossary.yaml`, frozen `v<version>.md`
releases, and images beside it. Reading order is
`tutorials/<module>/<series>.order.yaml`, one slug per line, never a
front matter field.

**Front matter.** Required: `title`, `slug`, `module`, `module_title`,
`year`, `series`, `version` (`2026.09.04.1` form). Optional: `status`
(`live` or `archived`), `packages` (a list, e.g. `[sympy]`),
`practice_for`, `practice_across`, `covers` (sections mapped to learning
outcomes). Slug must equal the file name; module must equal the parent
folder.

**Cells.** One fence attribute: `exec`.

````markdown
```python exec
id: filter-evening
hint: Try printing readings["evening"] > 14 on its own first.
readings[readings["evening"] > 14]
```
````

The `id:` line is required and is a contract: saved student work is keyed
on it, so renaming one throws that work away. The editor must warn before
a rename and never generate ids that could collide. `hint:` is optional.
A fence without `exec` is illustrative, read-only code. Counted across the
repository: 806 `python exec`, 252 plain `python`, nothing else.

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

## 2. dewstack

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
business and remark leaves them alone.

## 4. Jupyter (import and export only)

nbformat 4.5. Mapping from the block model:

- A run of prose blocks → one markdown cell, joined by blank lines.
- A code cell → a code cell. `id` from the dewlab `id:` line where there
  is one, else generated. The full fence info string, the `hint:` line,
  and the dialect name go in `metadata.remark` so import can rebuild the
  fence exactly.
- Illustrative (non-exec) fences stay inside markdown cells.
- Folds stay as raw HTML inside markdown cells; Jupyter renders
  `<details>` natively.
- Outputs, if included: `stream` for text, `display_data` with
  `image/png` for figures, taken from the last run.

Import inverts this. A notebook without `metadata.remark` becomes a plain
markdown document with `python exec` fences in the dewlab dialect if the
user chose dewlab as the target, else plain `python` fences.

## 5. Conversions between dialects

Block by block, with a report of what did not map:

| From | To | Rule |
|---|---|---|
| dewlab `python exec` with `id: x` | dewstack | `py cell=x`; `hint:` has no home, report it |
| dewstack `py cell=x` | dewlab | `python exec` with `id: x` |
| dewstack `sql`, `site=`, `app=`, `sql-check` | dewlab | no equivalent; keep as illustrative fences, report |
| either | plain | drop attributes, keep language |
| dewlab front matter | dewstack | drop `year`, `covers`, `practice_*`; keep the rest |
| dewstack front matter | dewlab | add `year` (ask), `covers` empty |
