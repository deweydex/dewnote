# Using dewnote

For the person writing tutorials. For how dewnote is built, see
`ARCHITECTURE.md`.

---

## 1. Start

dewnote opens on one question: local folder, or GitHub repository.

**Open a local folder.** Chrome and Edge only. You pick a folder; dewnote
reads every `.md` and every course descriptor in it. Save writes straight
back to the file.

**Connect a GitHub repository.** Any browser. You give a token, an owner
and a repository. The two branch fields are filled in for you:

- **Base branch** is what you are working from, usually `main`. dewnote
  only ever reads it.
- **Working branch** is where saves go. It is filled in as
  `dewnote/<today's date>`, so a day's edits land on one branch and go
  back as one pull request, and tomorrow starts a fresh one. Change it if
  you would rather name it after what you are doing.

They cannot be the same. A save never writes to the base branch, which is
the point of having two.

dewnote remembers the owner, repository and base branch for next time.

Safari has no folder picker. Use a repository.

---

## 2. What is on screen

Two things: the document, and a column of small text in the left margin.

The margin column, top to bottom:

| Line | What it is |
|---|---|
| `tutorials/…/name.md` | The file you are editing. A dot after it means unsaved. |
| *Module › Series › Title* | Where this page sits. Click it to open the palette. |
| `dewlab · main → branch` | The workspace, and for GitHub the branch Save commits to. |
| Headings | Every heading in this document. Click one to jump to it. |
| *Saved* / **Save this** | Whether your work is written. Click it to save. |
| `⌘K anywhere` | The palette key. |

Nothing else is on screen. There is no toolbar, no menu bar and no
sidebar.

If the window is too narrow for a margin column, those lines move to a
single row across the top and the headings are dropped.

---

## 3. The palette

**The palette is one box that finds anything in your workspace and does
anything dewnote can do.**

Press **⌘K** (Ctrl+K on Windows and Linux). It also opens by itself when
you first open a workspace, because choosing a document is the next thing
to do.

Type, and it narrows to what you mean. It searches four things at once:

- **Tutorials** — every tutorial and practice page, by title.
- **Pages** — dewlab's `pages/` files: About, Home, Features.
- **Series** — every series in every course. Opens at its first tutorial.
- **Do** — everything dewnote can do.

The right-hand half tells you what the highlighted row is before you
commit: its path, its status and version, its first sentence, and its
headings.

| Key | What happens |
|---|---|
| ⌘K | Open. Press again to close. |
| Type | Narrow the list. |
| ↑ ↓ | Move the highlight. |
| ↵ | Open the highlighted row, or run the highlighted command. |
| Esc | Close, change nothing. |

You do not have to type letters that are next to each other. `wamat`
finds *What a Matrix Does to a Picture*.

The list is always in the same order — Tutorials, Pages, Series, Do — so
a kind of thing is always in the same place. The **highlight** is on the
best match wherever it is, so ↵ takes what you typed rather than whatever
is at the top.

---

## 4. Writing

The document is what you edit. A heading looks like a heading, bold looks
bold, a link looks like a link. Type `# ` at the start of a line and the
line becomes a heading as you type it.

Between blocks, hover for a **+** to add one. In an empty paragraph,
typing **/** offers the same menu from the keyboard, and filters as you
type — `/py` reaches a Python cell in three keystrokes.

Under **Tutorial** in that menu are the blocks a tutorial is made of:

| Item | What it writes |
|---|---|
| Python cell | A `python exec` fence with an `id:` nobody is using |
| SQL cell | The same in dewlab's other language |
| Hint | The `<details class="dl-hint">` fold the build looks for |

## Starting a tutorial

⌘K, **New tutorial…**, and give it a title. dewnote writes
`tutorials/<id>/<id>.md`, where the id comes from the title — that id is
the page's address, so the title is worth getting right before you press
Make it.

It starts as a **draft**, so a half-written page is never served, and it
opens with a heading and one cell ready to run. Change `status:` to
`live` in ⌘/ when it is ready.

## Publishing a new version

⌘K, **Publish as a new version…**, on a live tutorial you have edited.

dewlab keeps two files. The version that is published is frozen at
`v<version>.md` exactly as it was, and the file you are editing keeps its
own address and gets today's date plus a `supersedes:` line. A reader's
link still works, and so does their saved work, because both are keyed to
the address rather than to the version.

## The whole file

**⌘/** shows the file as text — front matter, fence markers and all. It
is the place to fix something the document cannot express, or to see
exactly what a save will write.

⌘↵ keeps what you changed; Esc leaves it. Either way nothing is written
until you save.

## Images

Paste or drop an image into the document. It is written beside the
markdown file, named after the file you pasted, and the document gets
`![](name.png)` — the same bare name the site's build resolves. If that
name is already taken, the new one is numbered rather than overwriting
what is there.

An image already named in a file draws from the folder it sits in. One
that cannot be found stays as written, so you can see which name is
wrong.

## Sending a document to somebody

⌘K, then **Save as an HTML page**. You get one file: the document, its
stylesheet, its maths already typeset, and every image inside the file
rather than beside it. It needs nothing else to open.

A cell appears as its code. A cell's output is not part of the document —
it lives in the tab for as long as the tab is open — so there is nothing
truthful to put in its place.

## Jupyter

⌘K, **Save as a Jupyter notebook**, writes an `.ipynb`. Prose becomes
markdown cells, fences become code cells, and every cell quietly keeps
the text it came from — so **Open a Jupyter notebook…** brings the same
file back, byte for byte.

An import replaces what is on screen. Nothing is written until you save.

## Checking links

⌘K, then **Check links**. It reads every file in the workspace, not just
the one you have open, and lists every `tutorial:` link that names a page
nothing claims. Click a row to open the file it is written in.

`tutorial:` is the only scheme the build resolves. A `module:` or
`series:` link would ship as a literal broken address.

---

## 5. Cells

A fence marked `exec` is a cell you can run:

````
```python exec
id: first-sum
print(2 + 2)
```
````

Under it is a **Run** button. Press it, and the output appears below the
code. Python is a real Python — Pyodide — running in this tab; the first
run takes a few seconds while it loads, and every run after that is
immediate.

The lines at the top of a cell are part of the file, and you type them
like any other line:

| Line | What it does |
|---|---|
| `id:` | Names the cell. Required. It is the key a student's saved work lives under, so never change one that has been in front of a class. |
| `hint:` | When to offer a hint — `errors:5`, say. |
| `expect:` | What a correct answer satisfies. |
| `name:` | A short label. |

A fence with no `exec` is illustrative code. It has no Run button and
never runs.

After you edit a cell, its last output stays on screen, faded, until you
run it again — it belongs to the code you had a moment ago, not to the
code on screen.

Once a cell has run, **Hide** puts the code away and leaves the output,
which is how a finished cell reads.

---

## 6. Saving

**⌘S saves.** So does clicking **Save this** in the margin.

- Local folder: writes the file.
- GitHub: commits to the working branch.

The margin says *Saved* when it is written, and **Save this** when it is
not.

**The first time dewnote saves a file, it tidies it.** Bullet markers
become `-`, blank lines settle into one shape, a maths block is written
on three lines. Nothing about what the page *shows* changes, and it
happens once: every save after that writes exactly what you see.

**If a save does not happen, the margin says so and keeps saying so.** It
will not clear itself. The message names what went wrong — a file changed
on the branch under you, an expired token, a path already taken.

---

## 7. Reading and editing dewlab

dewnote opens every markdown file in a dewlab checkout or repository:

- `tutorials/<id>/<id>.md` — a tutorial.
- `tutorials/<id>/<id>-practice.md` — its practice page.
- `pages/about.md`, `pages/home.md`, `pages/features.md` — the site's
  own pages.
- `courses/*.yaml` — course descriptors.

A tutorial with several versions on disk resolves to the one dewlab's
build would serve: the newest `live` version, or the newest there is.

---

## 8. Appearance

Press ⌘K, type `appearance`, press ↵.

| Setting | Range |
|---|---|
| Theme | Match system, light, dark |
| Body font | Serif, sans, mono |
| Text size | 14–24px |
| Line width | 24–48rem |
| Line height | 1.2–2.2 |
| Paragraph spacing | Tight, normal, loose |
| Margins | Comfortable, compact |
| Tinted cells | On, off |
| Code size | 11–20px |
| Code font | Three monospace stacks |
| Pyodide source | Blank for the default |

Every change applies at once and is remembered in this browser. **Reset
to defaults** is at the bottom.

Line width and margins move the margin column with them. Widen the
measure far enough and the column narrows; widen it past the point where
both fit and the column folds to a row across the top.

---

## 9. Publishing to GitHub

Saving commits. Publishing opens a pull request: ⌘K, then **Open a pull
request**.

Two things to know:

- Each save is its own commit, named after the file.
- A working branch whose pull request has already merged should not be
  reused. The dated default handles this on its own; a branch you named
  yourself does not.

---

## 10. Every key

| Key | What it does |
|---|---|
| ⌘K / Ctrl+K | Palette |
| ⌘S / Ctrl+S | Save |
| ⌘/ / Ctrl+/ | The whole file, as text |
| / | Block menu, in an empty paragraph |
| Esc | Close whatever is open |
