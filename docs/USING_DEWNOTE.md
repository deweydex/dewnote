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
2. At the top of the tutorial, change **Status** from *draft* to
   *live*, then press **Ctrl+S** to save.

### Step 8: Send it for review (GitHub only)

Open the palette and run **Open a pull request…**. dewnote first checks
every document in the workspace. If it finds problems that would stop the
site building, it tells you and offers to show them. Then it asks for a
title, suggesting one from what you changed, and opens the pull request
on GitHub in a new tab, where a reviewer can read your changes and merge
them into the main branch.

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
| `name.md` | The file you are editing. Hover over it for its whole path. A dot after the name means it has unsaved changes. |
| *Course › Series › Title* | Where this tutorial is listed. Click it to open the palette. If the tutorial is not in any series, this reads *Open another document*. |
| `dewlab · main → dewnote/2026-09-22` | The workspace. For GitHub, this also shows the main branch and the working branch your saves go to. |
| A list of headings | Every heading in the document. Click one to scroll to it. |
| A warning in orange | Something failed, usually a save. It stays until you open another document; see [When a save fails](#when-a-save-fails). |
| **3 problems** | How many problems **Check this document** would report. It has an orange dot if any would stop the site building. Click it to see them. It disappears when there are none. |
| *Saved* or **Save (Ctrl+S)** | Whether your changes are saved. Click **Save** to save. |
| *Ctrl+K to open or do anything* | A reminder of the palette shortcut. |

On a narrow window the margin becomes a strip across the top, without the
list of headings.

When no document is open, the page offers **Open a document** and **New
tutorial…**, and lists the documents you opened most recently in this
workspace. The list is kept in this browser only.

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
| **New practice page** | Tutorial | Creates the tutorial's practice page, as a draft, and opens it. Once it exists, **Open the practice page** takes its place. |
| **Rename this tutorial…** | Tutorial | Changes the tutorial's id, and every file that names it. See [Renaming a tutorial](#renaming-a-tutorial). |
| **Delete this tutorial…** | Tutorial | Deletes the tutorial's folder and takes it out of every course. See [Deleting](#deleting). |
| **Move or rename this file…** | Document | Gives a page outside `tutorials/` a new path. |
| **Delete this document…** | Document | Deletes a file that is not a tutorial's own, such as a practice page. |
| **Release a new version…** | Tutorial | Keeps a copy of the current version and makes your edits the next one. See [Releasing a new version](#releasing-a-new-version). |
| **New tutorial…** | Workspace | Creates a draft tutorial. |
| **Find and replace in every document…** | Workspace | Searches every document, and replaces every match at once. Same as Ctrl+Shift+F. See [Finding and replacing](#finding-and-replacing). |
| **Check every document** | Workspace | Runs the same checks on every document in the workspace. |
| **Download as HTML** | Import and export | Downloads the page as one self-contained file. |
| **Download as a Jupyter notebook** | Import and export | Downloads the document as an `.ipynb` file. |
| **Import a Jupyter notebook…** | Import and export | Replaces the open document's content with a notebook's. |
| **Open a pull request…** | GitHub | Opens a draft pull request for your working branch, under a title you choose. GitHub workspaces only. See [Pull requests](#pull-requests). |
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
**front matter**. It holds settings for the page rather than its content.
dewnote shows it at the top of the document as three fields: **Title**
and **Status**, which you can change there, and **Version**, which is set
when you release a new version. **Show all fields** shows the whole
block, which you can edit directly. In the file, it looks like this:

```
---
title: Storing and Computing
year: "2026-2027"
status: live
version: 2026.09.22.1
---
```

| Field | Meaning |
|---|---|
| `title` | The page's title. Required. |
| `year` | The academic year, such as `"2026-2027"`. Required for tutorials. |
| `version` | The release this is, as year.month.day.number. Required for tutorials. dewnote sets it when you create a tutorial or release a new version. |
| `status` | `draft`: not on the site at all. `beta`: on the site, with a notice that it is a trial, but not listed on its course. `live`: on the site and its course. `archived`: still reachable, so readers keep their saved work, but no longer on the course. Leaving it out means `live`. |

The site will not build if a tutorial is missing a required field or has
any other `status`. dewlab reads other fields too; `planning/DIALECTS.md`
lists them all.

Some fields from older tutorials are no longer allowed: `slug`, `module`,
`module_title`, `series` and `order`. Where a tutorial appears is now
decided only by the course files.

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

### Help while you write

In a Python block, dewnote helps as you type:

- **Completion.** Suggestions appear as you type a name, or after a `.`.
  Press **Ctrl+Space** to ask for them. They include names defined in
  the cells above, even before anything has run.
- **Documentation.** Hover over a name to see what it is and its
  documentation.
- **Signatures.** Inside a function call, the function's parameters are
  shown, with the one you are typing in bold.

This help comes from Jedi, a Python analysis tool, running alongside
Python in your browser. dewlab's tutorial pages and dewmini use the same
tool. It starts the first time you type in a cell and takes a few seconds
to load; until then, you get simpler suggestions from the editor itself.

Python runs in your browser using Pyodide, which is downloaded the first
time you run a cell, or type in one. If Pyodide cannot be downloaded, for example on a
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

dewnote shows them the same way: a tab for each pane above the code,
one pane showing at a time, and the page they make, live, underneath.
The preview updates a moment after you stop typing, and runs the page's
JavaScript. Drag its bottom corner to make it taller. In the file, they
stay three code blocks.

## Hints

The **Hint** item inserts a fold that the reader clicks to open:

```
<details class="dl-hint"><summary>stuck? here are some steps</summary>

First step.

</details>
```

In dewnote it shows as a fold: a **HINT** label and its summary, what
the fold holds marked with a rule down its left side, and a small *end*
where it closes. Write the hint under the label as ordinary text. To
change the summary, use **Edit the markdown** (Ctrl+/). On the dewlab
site, readers see the summary and open the fold to read the hint. An
answer fold, `class="dl-answer"`, shows the same way, labelled
**ANSWER**.

## Checking for problems

dewnote checks documents for anything that would stop the dewlab site
building, or confuse a reader:

- **Check this document** checks the open document.
- **Check every document** checks the whole workspace. It is the only way
  to find a broken link in a page nobody has open. Click a problem to
  open its file.
- The **problems** count in the left margin updates as you type and
  opens the same list when clicked.
- **Open a pull request…** checks every document first.

Each problem says what is wrong, what to do, and which line it is on.
Problems marked in orange **stop the site building**; the rest are
**worth fixing**. Saving is never blocked, so you can always save a
half-finished draft.

What is checked:

- **Front matter**: a title on every page; for tutorials, a `year:`, a
  valid `version:` and `status:`, and none of the retired fields.
- **Ids**: every cell, question and web page pane has one, and no two on
  a page are the same.
- **Links and images**: every `tutorial:` link names a real tutorial, and
  every image in the text exists. Images inside code blocks are not
  checked, since tutorials teaching HTML include them as examples.
- **Questions, web pages and cards**: each has what the site needs to
  show and mark it.

Only pages are checked: every `.md` file under `tutorials/`, and every
other file with front matter. dewlab's build reads every `.md` file in a
tutorial's folder as a page, so a note left there without front matter is
reported; a README at the top of the repository is not.

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

While a document has unsaved changes, dewnote also keeps a copy of them
in this browser. If the tab crashes or is closed anyway, the next time you
open that file dewnote offers to **Restore my changes**. The copy is
deleted when you save or discard. It is never sent anywhere, and it is
not kept for the sample document.

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

### Pull requests

Every save is its own commit on the working branch, named `Edit <path>`,
so a day's work can be dozens of commits. They are named when they are
reviewed instead: **Open a pull request…** asks for a title, suggesting
one from what the branch changes ("Edit "Lists" and 2 other documents"),
and writes a description listing every document added, edited, moved or
deleted, by title. Change the title to say what the edits are for; it is
what a reviewer reads first.

Merge the pull request with GitHub's **Squash and merge**. The main
branch then gets one commit, named by the title, instead of every save.

- If the document you have open has unsaved changes, dewnote asks
  whether to save them first or leave them out.
- If a pull request for the working branch is already open, dewnote
  shows it instead of opening another. Later saves go into it.
- If the working branch has nothing the main branch does not, there is
  nothing to review, and dewnote says so.
- The pull request opens as a draft. Mark it ready for review on GitHub
  when it is.

### When a save fails

If a save fails, an orange warning appears in the left margin and stays
there until you open another document. It says what went wrong and what to do. The common cases:

- **The file was changed on the branch after you opened it**, for example
  from another tab or by someone else. dewnote shows what differs between
  the saved version and yours, and asks what to keep:
  - **Keep both** saves one version with your changes and the other ones
    in it. It is offered only when the two sets of changes are on
    different lines, for example when you each edited a different
    paragraph.
  - **Keep mine** saves your version over the other one.
  - **Keep the saved version** discards your changes and opens the other
    one.
  - **Cancel** leaves your changes on screen, unsaved. Save again when you
    are ready to choose.

  When both of you changed the same lines, **Keep both** is not offered,
  and whichever version you keep, the other's changes are lost. If both
  matter, copy the parts you need before choosing.
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
`tutorials/<id>/<id>.md` with a title, the same `year:` as the workspace's
other tutorials, `status: draft`, today's version,
a heading, and one empty Python cell, and opens it.

### Adding a practice page

With a tutorial open, run **New practice page**. dewnote creates
`tutorials/<id>/<id>-practice.md` beside it, titled "<tutorial title> —
Practice", with `practice_for: <id>` so dewlab links the two, the
tutorial's `year:`, `status: draft`, and one empty cell, and opens it.
A practice page is never listed in a course: readers reach it from its
tutorial.

When the tutorial already has one, the palette offers **Open the
practice page** instead.

### Adding a tutorial to a series

Run **Add to a series…**. The list shows every series the tutorial is not
already in, with how many tutorials each has. Choose one, and dewnote adds
the tutorial to the end of that series in the course file and saves it.

**Remove from a series…** does the reverse. It only appears when the
tutorial is in at least one series.

### Renaming a tutorial

A tutorial's id is the name of its folder and its file, and it is the
page's web address. To change it, run **Rename this tutorial…**. dewnote
suggests an id made from the title, which is usually what you want after
changing the title. Type another if you like: lower-case letters, digits
and single hyphens.

Before anything changes, dewnote lists what it will do:

- Move the tutorial's folder, renaming its file, its practice page and
  their glossaries. Images and old versions keep their names.
- Update every course list that includes the tutorial.
- Update every link to it (`tutorial:<id>`) and every `practice_for:`,
  `practice_across:` or `context_for:` that names it, in every page.
- Add a line to `courses/redirects.yaml` so the old address still leads
  to the page. A draft gets no line, because no reader has its address.

On GitHub all of this is one commit. Rename a live tutorial only when
you need to: readers' saved answers are stored under the id, so anyone
part-way through it will find their answers gone.

To move or rename any other page, such as one in `pages/`, run **Move or
rename this file…** and type its new path.

### Deleting

**Delete this tutorial…** deletes the tutorial's whole folder (its
practice page, glossary, images and old versions) and takes it out of
every course. **Delete this document…** deletes any other file, such as a
practice page on its own.

dewnote refuses to delete a page while another file still points at it,
and says which files do. Change those first. A deleted live tutorial
breaks every reader's link to it, so for a tutorial that is no longer
taught, setting its status to `archived` is usually better: it stays on
the site and its links keep working, but the course shows it in its
Archive rather than in the reading order.

On GitHub the deleted files stay in the repository's history. In a
folder they are gone.

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

## Finding and replacing

**Find and replace in every document…** (Ctrl+Shift+F) opens a panel
that searches every markdown document in the workspace, front matter
included. Course files are not searched; change those with **Add to a
series…** and **Remove from a series…**.

- Type in **Find**. The matches appear as you type, each with its file
  and line. Click one to open that document.
- The search is for the text exactly as typed: `f(x)` finds those four
  characters. It ignores case unless you tick **Match case**.
- To replace, type in **Replace with**. **Replace all** replaces every
  match the panel shows, in every document, and saves them. On GitHub
  that is one commit, so it can be reviewed, or reverted, as one change.
- If the open document has unsaved changes, dewnote asks about them
  first, as it does before opening another document.

Replacing with nothing (deleting every match) is not offered: an empty
**Replace with** means you are only finding.

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
| Ctrl+Shift+F | Find and replace in every document |
| Ctrl+Enter | Apply changes, in Edit the markdown |
| / | Open the block menu, in an empty line |
| ↑ ↓ | Move through a list |
| Enter | Choose the highlighted item |
| Esc | Close whatever is open, without changing anything |

## Known limitations

These are planned but not built yet (see `planning/ROADMAP.md`):

- When a save conflict has both sides changing the same lines, you keep
  one version or the other. There is no way to pick line by line.

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
