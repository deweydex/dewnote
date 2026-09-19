# Using dewnote

For the person writing tutorials. For how dewnote is built, see
`README.md`.

---

## 1. Start

dewnote opens on one question: local folder, or GitHub repository.

**Open a local folder.** Chrome and Edge only. You pick a folder; dewnote
reads every `.md` and every course descriptor in it. Save writes straight
back to the file.

**Connect a GitHub repository.** Any browser. You give a token, an owner
and repo, a base branch and a working branch. Save commits to the working
branch. It never writes to the base branch.

Safari has no folder picker. Use the repository, or open one file at a
time from the palette.

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
- **Series** — every series in every module. Opens at its first tutorial.
- **Do** — everything dewnote can do. Settings, exports, imports, link
  checking, the whole-file source view, the module organiser.

The right-hand half tells you what the highlighted row is before you
commit: its path, its status and version, its first sentence, and its
headings.

Keys:

| Key | What happens |
|---|---|
| ⌘K | Open. Press again to close. |
| Type | Narrow the list. |
| ↑ ↓ | Move the highlight. |
| ↵ | Open the highlighted row, or run the highlighted command. |
| Esc | Close, change nothing. |

You do not have to type letters that are next to each other. `wamat`
finds *What a Matrix Does to a Picture*. `ipynb` finds *Export a Jupyter
notebook*, even though the word is not in the title.

The list is always in the same order — Tutorials, Pages, Series, Do — so
a kind of thing is always in the same place. The **highlight** is on the
best match wherever it is, so ↵ takes what you typed rather than whatever
is at the top.

---

## 4. Writing

Click any paragraph to edit it. Nothing moves: the text stays in exactly
the same place, in the same typeface, at the same size. Bold stays bold,
italic stays italic, links stay links, inline code keeps its box.

Markdown punctuation stays hidden until your caret enters the thing it
marks. Put the caret in a bold phrase and its `**` appear, around that
phrase only. Move away and they go again.

Type `# ` at the start of a line and the line becomes a heading as you
type it, at the size it will be on the page. `##` and `###` likewise.
Click away and the hashes fold; the size stays.

A link is the one exception worth knowing: the caret in its words shows
`[the words]()`, and the address stays folded. Arrow right past the `(`
to see and edit the address. This is so that clicking a link's words
never re-wraps the paragraph.

A list's `-` and a quotation's `>` do stay visible. Hiding them would
leave nothing where the page has a bullet or a rule.

Between blocks, hover for a **+** to add a paragraph, a code cell, maths,
a hint, an image or a link. In an empty paragraph, typing **/** offers the
same menu from the keyboard.

A code cell has one line of controls: the language, its `id`, buttons to
add `hint`, `expect` or `name`, and Run. Output appears under the cell.

Press **⌘/** for the whole file in one editor — front matter, fence
markers and all. Press it again to go back.

---

## 5. Saving

**⌘S saves.** So does clicking **Save this** in the margin.

- Local folder: writes the file.
- GitHub: commits to the working branch.

The margin says *Saved* when it is written, and **Save this** when it is
not. Only your edits change; every other byte of the file is left exactly
as it was.

**If a save does not happen, the margin says so and stays saying so.** It
will not clear itself. Two cases:

- *Someone changed this file on the branch.* Both versions are shown.
  Choose one. Nothing is overwritten until you do.
- *Anything else* — an expired token, a path already taken — is named in
  the same place.

---

## 6. Reading and editing dewlab

dewnote opens every markdown file in a dewlab checkout or repository:

- `tutorials/<id>/<id>.md` — a tutorial.
- `tutorials/<id>/<id>-practice.md` — its practice page.
- `pages/about.md`, `pages/home.md`, `pages/features.md` — the site's
  own pages.
- `courses/*.yaml` — module descriptors. Open one from **Browse
  workspace files…** and edit it with ⌘/.

A tutorial with several versions on disk resolves to the one dewlab's
build would serve: the newest `live` version, or the newest version there
is.

---

## 7. Appearance

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
| Code font size | 11–20px |
| Code font | Three monospace stacks |
| Pyodide source URL | Blank for the default |

Every change applies at once and is remembered in this browser. **Reset
to defaults** is at the bottom of the panel.

Line width and margins move the margin column with them. Widen the
measure far enough and the column narrows; widen it past the point where
both fit and the column folds to a row across the top.

---

## 8. Publishing to GitHub

Saving commits. Publishing opens a pull request.

After a save, dewnote offers **Review repository changes**. That screen
lists what is on the working branch and opens a draft pull request from
it.

Known limits, so you are not surprised:

- Each save is its own commit, named after the file.
- The review screen lists what this window pushed. A push from another
  tab, or a commit made on GitHub, will not be in the list.
- The working branch is reused. If its pull request has already merged,
  name a new branch before you start.

---

## 9. Every key

| Key | What it does |
|---|---|
| ⌘K / Ctrl+K | Palette |
| ⌘S / Ctrl+S | Save |
| ⌘/ / Ctrl+/ | Whole-file source |
| / | Block menu, in an empty paragraph |
| Esc | Close whatever is open |
