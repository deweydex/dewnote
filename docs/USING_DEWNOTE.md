# Using dewnote

This guide is for people writing tutorials in dewnote. It has three parts:

- **[Part 1: Your first tutorial](#part-1-your-first-tutorial)** walks through
  one session from start to finish. Read this first.
- **[Part 2: Reference](#part-2-reference)** explains each part of dewnote in
  detail. Use it to look things up.
- **[Part 3: Glossary](#part-3-glossary)** defines the words dewnote uses.

If you want to know how dewnote is built, read `ARCHITECTURE.md` instead.

Shortcuts are written for Windows and Linux (**Ctrl**). On a Mac, use **⌘**
(Command) wherever this guide says Ctrl. dewnote itself shows the right key
for your computer.

---

## What dewnote is

dewnote is an editor for tutorials written in markdown. A tutorial can
contain ordinary text, mathematics, code that runs in the page, and
questions that a reader answers.

dewnote is built for **dewlab**, a site that publishes tutorials from a
folder of markdown files. It understands dewlab's layout: where tutorials
live, how courses list them, and what the site needs in order to build a
page. It saves plain markdown files that dewlab can read directly. Nothing
dewnote writes is private to dewnote.

dewnote runs entirely in your browser. There is no dewnote server: your
files stay on your computer or in your GitHub repository, and Python runs
inside the browser tab.

---

# Part 1: Your first tutorial

This walkthrough takes about ten minutes. To try dewnote without connecting
anything, choose **try the sample document** on the opening screen instead.
Nothing you do in the sample is saved.

### Step 1: Open your tutorials

When dewnote opens, it asks where your tutorials are. You have two choices.

**Open a folder on this computer.** Choose this if you have a copy of the
dewlab files on your computer. It works in Chrome and Edge only; Safari
and Firefox cannot open folders. Choose the top folder of your dewlab copy
(the one that contains `tutorials/` and `courses/`). Saving writes
directly to the files in that folder.

**Connect a GitHub repository.** Choose this to work on the dewlab
repository on GitHub. It works in any browser. You need a **GitHub
token**, which is a password that lets dewnote act on your behalf:

1. Follow the **Create a fine-grained token** link on the opening screen.
2. Under *Repository access*, choose *Only select repositories* and pick
   the dewlab repository.
3. Under *Permissions*, set **Contents** and **Pull requests** to
   *Read and write*.
4. Create the token, copy it, and paste it into dewnote's **GitHub token**
   field.

dewnote then lists every repository the token can write to. Choose one.

The **Working branch** field is already filled in, with a name like
`dewnote/2026-09-22`. Every save goes to this branch, never to the
repository's main branch. Leave the suggested name unless you have a
reason to change it (see [Saving](#saving) for why).

Choose **Connect**. dewnote reads the files, which can take a few seconds
for a large repository, and remembers the token and repository in this
browser for next time.

### Step 2: Create a tutorial

Once the files are read, the **palette** opens. The palette is a search
box that finds tutorials and runs commands. You can open it at any time
with **Ctrl+K**.

1. Type `new tutorial` and press **Enter**.
2. Type the tutorial's title and choose **Create tutorial**.

Choose the title carefully. dewnote builds the tutorial's folder name
and web address from it, and changing them later breaks links to the
tutorial.

dewnote creates the file `tutorials/<id>/<id>.md`, where `<id>` is the
title in lower case with hyphens, and opens it. The new tutorial is a
**draft**: the site will not show it to readers until you mark it live
(Step 7).

### Step 3: Write

The tutorial opens with a heading and one empty Python cell. Type as you
would in a word processor:

- Start a line with `#` and a space for a heading, `##` for a smaller one.
- Select text to get a small toolbar for **bold**, *italic*, `code`,
  maths and links.
- In an empty line, type **/** to open the **block menu**. Keep typing to
  filter it: `/py` finds *Python cell*. The menu also has questions,
  hints and web page editors.

### Step 4: Run your code

Type some Python into the cell below the `id:` line, for example
`print(2 + 2)`, and choose **Run** under the cell. The first run takes a
few seconds while Python loads; after that, runs are quick. The output
appears under the code.

### Step 5: Save

Press **Ctrl+S**. The bottom of the left margin changes from
**Save (Ctrl+S)** to *Saved*.

If you connected GitHub, each save is a commit on your working branch.

### Step 6: Add the tutorial to a course

A new tutorial is not listed on any course yet, so readers cannot find it
by browsing. Open the palette, type `add to a series`, press **Enter**,
and choose a series. dewnote adds the tutorial to that course's list and
saves the course file.

### Step 7: Check it and make it live

1. Open the palette and run **Check this document**. dewnote lists
   anything that would stop the site building the page, or confuse a
   reader. Fix what it finds.
2. Press **Ctrl+/** to see the raw markdown. At the top, change
   `status: draft` to `status: live`. Choose **Apply changes**, then
   press **Ctrl+S** to save.

### Step 8: Send it for review (GitHub only)

Open the palette and run **Open a pull request…**. dewnote first checks
every document in the workspace. If it finds problems that would stop the
site building, it tells you and offers to show them. Otherwise, it opens
the pull request on GitHub in a new tab, where a reviewer can read your
changes and merge them into the main branch.

That is the whole cycle. The rest of this guide explains each part in
more detail.

---

# Part 2: Reference

## The screen

dewnote shows three things: the document, a narrow column of text in the
left margin, and a small round button in the top right corner that opens
**Appearance**. There is no toolbar or menu bar; commands are in the
palette.

### The left margin

From top to bottom:

| What you see | What it means |
|---|---|
| `tutorials/…/name.md` | The file you are editing. A dot after the name means it has unsaved changes. |
| *Course › Series › Title* | Where this tutorial is listed. Click it to open the palette. If the tutorial is not in any series, this reads *Open another document*. |
| `dewlab · main → dewnote/2026-09-22` | The workspace. For GitHub, this also shows the main branch and the working branch your saves go to. |
| A list of headings | Every heading in the document. Click one to scroll to it. |
| A warning in orange | Something failed, usually a save. It stays until you open another document; see [When a save fails](#when-a-save-fails). |
| **3 problems** | How many problems **Check this document** would report. It has an orange dot if any would stop the site building. Click it to see them. It disappears when there are none. |
| *Saved* or **Save (Ctrl+S)** | Whether your changes are saved. Click **Save** to save. |
| *Ctrl+K to open or do anything* | A reminder of the palette shortcut. |

On a narrow window the margin becomes a strip across the top, without the
list of headings.

## The palette

Press **Ctrl+K** to open the palette, and **Ctrl+K** or **Esc** to close it.
It also opens by itself when you first connect, because choosing a document
is the first thing to do.

Type to search. The palette searches four kinds of thing, always shown in
this order:

| Section | What it lists |
|---|---|
| **Tutorials** | Every tutorial and practice page, by title. The note on the right says which series it is in and where, for example *First Steps · 2 of 5*. |
| **Site pages** | dewlab's own pages from the `pages/` folder, such as About and Home. |
| **Series** | Every series on every course. Choosing one opens its first tutorial. |
| **Commands** | Everything dewnote can do. The note on the right says what kind of command it is. |

You do not have to type whole words. Letters in order are enough:
`wamat` finds *What a Matrix Does to a Picture*.

The highlighted row is the best match for what you typed, even if it is
not at the top of the list. **Enter** opens or runs it. **↑** and **↓**
move the highlight. The right half of the palette previews the highlighted
row: a tutorial's path, status, version, first sentence and headings, or
a command's description.

Commands that act on a document, such as **Check this document**, only
appear while a document is open.

### Every command

| Command | Group | What it does |
|---|---|---|
| **Save** | Document | Saves the open document. Same as Ctrl+S. Only listed when there is something to save. |
| **Preview as a reader** | Document | Opens the page in a new tab, styled as the site shows it. Nothing is saved. |
| **Edit the markdown** | Document | Shows the file as plain text. Same as Ctrl+/. See [Editing the markdown](#editing-the-markdown). |
| **Check this document** | Document | Lists problems in the open document. See [Checking for problems](#checking-for-problems). |
| **Run every cell** | Cells | Runs every cell from top to bottom, and stops at the first one that fails. |
| **Stop the running cell** | Cells | Interrupts a cell that is taking too long. Variables from earlier cells are kept. |
| **Restart Python** | Cells | Clears every variable, as if no cell had run. |
| **Add to a series…** | Tutorial | Lists the tutorial in a series on a course. |
| **Remove from a series…** | Tutorial | Takes the tutorial out of a series. The tutorial itself is not deleted. |
| **Release a new version…** | Tutorial | Keeps a copy of the current version and makes your edits the next one. See [Releasing a new version](#releasing-a-new-version). |
| **New tutorial…** | Workspace | Creates a draft tutorial. |
| **Check every document** | Workspace | Runs the same checks on every document in the workspace. |
| **Download as HTML** | Import and export | Downloads the page as one self-contained file. |
| **Download as a Jupyter notebook** | Import and export | Downloads the document as an `.ipynb` file. |
| **Import a Jupyter notebook…** | Import and export | Replaces the open document's content with a notebook's. |
| **Open a pull request…** | GitHub | Asks for your working branch to be merged. GitHub workspaces only. |
| **Appearance…** | Appearance | Changes how dewnote looks to you. |

A command whose name ends in **…** asks you something before it acts.

## Writing

The document looks roughly as it will on the site: headings look like
headings, bold looks bold. You edit it directly.

### Formatting

- Type `#`, `##` or `###` and a space at the start of a line to make a
  heading.
- Type `-` and a space for a bulleted list, `1.` and a space for a
  numbered one.
- Select text to get a toolbar for bold, italic, inline code, inline
  maths and links.
- Hover between two blocks to get a **+** button, which opens the block
  menu.
- In an empty line, type **/** to open the same block menu from the
  keyboard. Keep typing to filter it.

An empty line shows a faint reminder: *Type / for a cell, a question or a
hint*.

### The block menu

Besides ordinary blocks such as headings, lists and tables, the block menu
has a **Tutorial** group:

| Item | What it inserts |
|---|---|
| **Python cell** | A code cell that runs Python. |
| **SQL cell** | A code cell that runs SQL. |
| **Multiple choice** | A question with options and one correct answer. |
| **Fill in the blank** | A question with a gap for the reader to fill. |
| **Web page** | An HTML, CSS and JavaScript editor that shows a live page. |
| **Hint** | A fold the reader opens when stuck. |

Every item is inserted with a unique `id:` already filled in, and passes
**Check this document** as inserted.

### Maths

Write inline maths between single dollar signs: `$x^2 + 1$`.

Write a block of maths between double dollar signs, each on its own line:

```
$$
\int_0^1 x^2 \, dx
$$
```

A dollar sign with a space next to it is treated as money, not maths:
"it costs $5 and $6" stays as written. This matches how the dewlab site
reads dollar signs.

### Images

Paste or drag an image into the document. dewnote saves the image file
in the same folder as the tutorial and inserts a reference to it by name.
If a file with that name already exists, dewnote adds a number to the new
name rather than replacing the old file.

If an image in a document cannot be found, it is left as written, and
**Check this document** reports it, so you can see which name is wrong.

### Editing the markdown

Press **Ctrl+/** (or use **Edit the markdown**) to see the whole file as
plain text, including the front matter at the top and the ``` lines
around code. Use it to change front matter, to paste in a whole block, or
to see exactly what a save will write.

**Ctrl+Enter** or **Apply changes** puts your edits into the document.
**Esc** or **Cancel** discards them. Either way, nothing is saved until
you save.

### Front matter

The block between the two `---` lines at the top of a file is the
**front matter**. It holds settings for the page rather than its content:

```
---
title: Storing and Computing
status: live
version: 2026.09.22.1
---
```

| Field | Meaning |
|---|---|
| `title` | The page's title. Required. |
| `status` | `draft` (not shown to readers) or `live` (shown). |
| `version` | The release this is, as year.month.day.number. dewnote sets this when you release a new version. |

dewlab reads other fields too; `planning/DIALECTS.md` lists them all.

## Cells

A **cell** is a block of code that runs in the page. In the markdown, a
cell is a code block whose first line includes `exec`:

````
```python exec
id: first-sum
print(2 + 2)
```
````

A code block without `exec` is only an example. It is shown, but has no
**Run** button and never runs.

### Settings lines

The first lines of a cell can be settings, written as `name: value`:

| Line | What it does |
|---|---|
| `id:` | Names the cell. **Required**, and must be unique on the page. dewlab saves each reader's work under this name, so do not change the id of a cell readers have already used, or their work will be lost. |
| `hint:` | When to offer the reader a hint, for example `errors:5` (after five errors). |
| `expect:` | A condition a correct answer satisfies, for example `total == 6`. |
| `name:` | A short label for the cell. |

The code starts on the first line that is not a setting.

### Running

- **Run** runs the cell. Output appears underneath.
- While a cell runs, its button reads **Stop**. Stopping interrupts the
  code but keeps variables from earlier cells.
- After a cell has run, its button reads **Run again**.
- If you edit a cell after running it, the old output stays but fades,
  because it came from the old code.
- The **Hide** control, beside a cell's copy button, hides a cell's
  code and leaves its output, which is how a finished cell reads.

All cells on a page share one Python session, so a variable set in one
cell is available in the cells below it. **Run every cell** runs them from
the top, in order, and stops at the first one that fails, because later
cells usually depend on earlier ones. It is the quickest way to check a
tutorial still works after an edit.

Python runs in your browser using Pyodide, which is downloaded the first
time you run a cell. If Pyodide cannot be downloaded, for example on a
restricted network, set **Python runtime URL** in Appearance to a copy
you can reach.

## Questions

A **question** is an exercise the page marks automatically. There are two
kinds. Insert them from the block menu, or write them by hand.

### Multiple choice

````
```question
id: which-one
type: multiple-choice
correct: 2

Which counts this correctly?

- A permutation.
- A combination.
```
````

The text above the list is the question; each bullet is an option.
`correct:` gives the number of the right option, counting from 1 in the
order the options are written. Here, the right answer is *A combination*.

### Fill in the blank

````
```question
id: name-it
type: fill-in-the-blank

A list you can change is called a {list|tuple|set}.
```
````

Each pair of braces `{…}` is a gap.

- With `|` inside, the gap is a drop-down list of the choices.
- Without `|`, the gap is a box the reader types into.
- Either way, the **first** item is the correct answer.

### Ids are shared

Cells, questions and web page panes all share one set of ids on a page,
because dewlab saves a reader's work in all of them the same way. No two
of them on one page can have the same `id:`.

## Web pages

The **Web page** item in the block menu inserts three code blocks:
`html site`, `css site` and `js site`. Each has a `site:` line with the
same name. On the dewlab site, blocks with the same `site:` name become
one editor with a tab for each language and a live preview.

In dewnote, they currently show as three separate code blocks.

## Hints

The **Hint** item inserts a fold that the reader clicks to open:

```
<details class="dl-hint"><summary>stuck? here are some steps</summary>

First step.

</details>
```

Change the summary line and replace *First step.* with your hint. On the
dewlab site this shows as a closed fold. In dewnote it currently shows as
the HTML above.

## Checking for problems

dewnote can check a document for anything that would stop the dewlab site
building it, or that would confuse a reader.

- **Check this document** checks the open document.
- **Check every document** checks the whole workspace, which is the only
  way to find a broken link in a page nobody has open.
- The **problems** count in the left margin updates as you type (a
  moment behind) and opens the same list when clicked.
- **Open a pull request…** checks every document first.

Each problem says what is wrong and what to do, and gives its line
number. In the workspace check, click a problem to open its file.

Problems come in two kinds:

- **Stops the site building**: the dewlab build will fail until this is
  fixed. Shown with an orange mark.
- **Worth fixing**: the page builds, but something is not right.

What is checked:

| Problem | Why it matters |
|---|---|
| No front matter, or no `title:` | The site cannot build the page. |
| A `version:` not in year.month.day.number form | Releasing a new version counts on from it. |
| A cell, question or web page pane with no `id:` | A reader's work in it cannot be saved. |
| Two blocks with the same `id:` | A reader's work in one overwrites the other. |
| A `tutorial:` link to a tutorial that does not exist | Readers get a broken link. |
| An image whose file is missing | Readers get a broken image. |
| A question with no `type:`, or an unknown type | The question cannot be marked. |
| A multiple-choice question with fewer than two options, no question text, or a `correct:` that names no option | The question cannot be marked. |
| A fill-in-the-blank question with no gap, or a `{` with no `}` | There is nothing to fill in. |
| A web page pane with no `site:` line | It cannot be joined with its other panes. |
| A card with no `url:`, or not starting with a heading | The card goes nowhere, or has no title. |

Notes:

- Only `tutorial:` links are checked, because they are the only kind the
  dewlab build turns into addresses.
- Images are only checked in the text, not inside code blocks, because
  many tutorials teach HTML and include image tags as examples.
- Files that are not pages, such as a README in a tutorial folder, are
  not checked. Every `.md` file under `tutorials/` is a page, so one with
  no front matter is reported.

Saving is never blocked by problems. You can always save a half-finished
draft.

## Saving

Press **Ctrl+S**, or click **Save** at the bottom of the left margin.

- In a folder, saving writes the file.
- On GitHub, saving makes a commit on your working branch. Each save is
  a separate commit, named after the file.

dewnote never saves by itself. If you try to open another document, start
a new tutorial or import a notebook while you have unsaved changes,
dewnote asks whether to **Save and continue**, **Discard changes**, or
**Keep editing**. If you close or reload the tab with unsaved changes,
the browser asks you to confirm.

### The first save tidies the file

The first time dewnote saves a file, it may change how the markdown is
written without changing what the page shows: bullet markers become `-`,
blank lines are made consistent, and a maths block is written over three
lines. This happens once. After that, saving writes exactly what you
see.

### The working branch

On GitHub, dewnote saves to a **working branch**, a separate line of
changes, and never to the repository's main branch. Your changes reach
the main branch when a pull request is merged.

The suggested branch name includes today's date, so each day's edits go
into their own pull request. If you choose your own branch name, do not
reuse a branch whose pull request has already been merged; start a new
one.

### When a save fails

If a save fails, an orange warning appears in the left margin and stays
there until you open another document. It says what went wrong and what to do. The common cases:

- **The file was changed on the branch after you opened it**, for example
  from another tab. Your changes are still on screen. Copy them somewhere
  safe, reload dewnote, and apply them again.
- **GitHub refused the token.** It may have expired. Reload dewnote and
  connect with a new token.
- **A file already exists at that path.** Open that file instead.

## Tutorials and courses

### How dewlab organises tutorials

- Each tutorial lives in its own folder: `tutorials/<id>/<id>.md`.
- A tutorial can have a practice page beside it:
  `tutorials/<id>/<id>-practice.md`.
- A **course** is described by a file in `courses/`, such as
  `courses/maths-for-it.yaml`. It lists **series**, and each series lists
  tutorials by id, in order.
- A tutorial is not placed by anything in its own file. Only the course
  files say where it appears.
- dewlab's own site pages are in `pages/`.

### Creating a tutorial

Run **New tutorial…** and give it a title. dewnote creates
`tutorials/<id>/<id>.md` with a title, `status: draft`, today's version,
a heading, and one empty Python cell, and opens it.

### Adding a tutorial to a series

Run **Add to a series…**. The list shows every series the tutorial is not
already in, with how many tutorials each has. Choose one, and dewnote adds
the tutorial to the end of that series in the course file and saves it.

**Remove from a series…** does the reverse. It only appears when the
tutorial is in at least one series.

### Releasing a new version

Once a tutorial is live, readers may have saved work in it. Releasing a
new version lets you change it without breaking their links or their
saved work.

Edit the live tutorial, saving as often as you like, then run **Release
a new version…**. dewnote:

1. Copies the **published** version, unchanged, to
   `tutorials/<id>/v<old version>.md`.
2. Saves your edits in the tutorial's own file, with a new `version:`
   and a `supersedes:` line naming the old version.

The published version is the one readers have now:

- On GitHub, the file on the repository's main branch. Your saves on the
  working branch are not published until the pull request is merged.
- In a folder, the file as it was when you opened the folder.

The tutorial keeps its address, so readers' links and saved work still
work.

This is only available for a tutorial's main file whose published
version has `status: live`. A draft has no readers yet, so it does not
need versions: save it as normal. On GitHub, a tutorial that is not on
the main branch yet has no published version either; merge it first.

### Which version dewnote opens

If a tutorial folder holds several versions, dewnote opens the one dewlab
would show: the newest `live` version, or if none is live, the newest.

## Import and export

- **Preview as a reader** opens the page in a new browser tab, styled the
  way the dewlab site shows it, with maths typeset and images included.
  Cells show their code but not their output, and without their `id:` and
  `hint:` lines. Nothing is saved.
- **Download as HTML** downloads the same page as one file, with its
  styles and images inside it. It opens without an internet connection,
  so you can send it to anyone.
- **Download as a Jupyter notebook** downloads an `.ipynb` file. Text
  becomes markdown cells and code blocks become code cells. Each cell
  also keeps its original markdown, so importing the notebook back gives
  the same file exactly.
- **Import a Jupyter notebook…** replaces the open document's content
  with a notebook's. The document keeps its file name, and nothing is
  saved until you save.

## Appearance

Open it with the round button in the top right corner, or the
**Appearance…** command. These settings only change how dewnote looks in
this browser. They do not change your files or what readers see.

| Setting | Choices |
|---|---|
| Theme | Match system, light, dark |
| Body font | Serif, sans, mono |
| Text size | 14–24 px |
| Line width | 24–48 rem |
| Line height | 1.2–2.2 |
| Paragraph spacing | Tight, normal, loose |
| Margins | Comfortable, compact |
| Shade code cells | On, off |
| Code size | 11–20 px |
| Code font | System mono, humanist, slab |
| Python runtime URL | Leave blank to use the default |

Changes apply at once. **Reset to defaults** is at the bottom of the
panel.

A wide line width leaves less room for the left margin. If there is not
enough room, the margin moves to a strip across the top.

## Keyboard shortcuts

| Shortcut | What it does |
|---|---|
| Ctrl+K | Open or close the palette |
| Ctrl+S | Save |
| Ctrl+/ | Edit the markdown |
| Ctrl+Enter | Apply changes, in Edit the markdown |
| / | Open the block menu, in an empty line |
| ↑ ↓ | Move through a list |
| Enter | Choose the highlighted item |
| Esc | Close whatever is open, without changing anything |

## Known limitations

These are planned but not built yet (see `planning/ROADMAP.md`):

- Web page panes show as three code blocks rather than one editor with
  tabs.
- Hints show as HTML in the editor rather than as a fold.
- When a save fails because the file changed on GitHub, there is no way
  to compare the two versions; you have to copy your changes and reload.
- Files cannot be renamed, moved or deleted from dewnote.
- There is no find and replace across the workspace.

---

# Part 3: Glossary

**Block menu.** The menu of things you can insert, opened with **/** in
an empty line or the **+** between blocks.

**Cell.** A block of code that runs in the page. Written as a code block
with `exec` in its first line.

**Commit.** One saved change on GitHub. Each save in a GitHub workspace
makes one.

**Course.** A set of series, described by a file in `courses/`. The code
sometimes calls a course a *module*; they are the same thing.

**Draft.** A tutorial with `status: draft`. The site does not show it to
readers.

**Front matter.** The block between two `---` lines at the top of a file,
holding the page's title, status and version.

**Id.** The name of a tutorial (from its folder), or of a cell, question
or pane (from its `id:` line). Readers' saved work is stored under ids,
so they should not change once readers have used them.

**Live.** A tutorial with `status: live`. The site shows it to readers.

**Main branch.** The repository's own branch, usually `main`, that the
site is built from. dewnote never saves to it directly.

**Markdown.** The plain-text format tutorials are written in.

**Palette.** The search box opened with Ctrl+K, which finds documents and
runs commands.

**Pane.** One of the three code blocks (HTML, CSS, JavaScript) that make
up a web page editor.

**Practice page.** A page of exercises that goes with a tutorial, saved
beside it as `<id>-practice.md`.

**Problem.** Something **Check this document** reports. It either stops
the site building, or is worth fixing.

**Pull request.** A request, on GitHub, to merge your working branch into
the main branch, so that a reviewer can read the changes first.

**Release.** Freezing a live tutorial's current version and making your
edits the next one. See [Releasing a new version](#releasing-a-new-version).

**Series.** An ordered list of tutorials within a course.

**Site page.** One of dewlab's own pages in `pages/`, such as About.

**Token.** A password-like key from GitHub that lets dewnote read and
commit on your behalf.

**Tutorial.** One page of teaching material, in its own folder under
`tutorials/`.

**Working branch.** The branch your saves go to on GitHub. Its changes
reach the main branch through a pull request.

**Workspace.** Everything dewnote has open: a folder on your computer, or
a GitHub repository.
