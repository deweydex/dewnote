# Vocabulary

The words dewnote's interface uses, what each one means, and the words it
avoids. Read this before adding or changing any text a user sees: a
command label, a dialog, an error, a checker message. The user guide's
glossary (`docs/USING_DEWNOTE.md`, Part 3) is the reader-facing version
of the same list.

The rule behind all of it: **one word per action, and one action per
word.** If two commands share a verb, they must do the same kind of
thing.

---

## Decisions

### Save, download, import

| Word | Means | Never used for |
|---|---|---|
| **Save** | Write the open document to where it came from: the file in a folder, or a commit on the working branch. | Exports. |
| **Download** | Make a file in the browser's downloads folder: **Download as HTML**, **Download as a Jupyter notebook**. | Anything that touches the workspace. |
| **Import** | Replace the open document's content with a file from elsewhere: **Import a Jupyter notebook…**. | Opening a workspace document. |
| **Open** | Show a document from the workspace, or open a folder or repository. | Import. |

*Retired:* "Save as an HTML page" and "Save as a Jupyter notebook" (both
were downloads), "Open a Jupyter notebook…" (an import).

### Release and pull request

| Word | Means |
|---|---|
| **Release** | dewlab's two-file versioning: keep the current version as `v<version>.md` and make the edits the next version. **Release a new version…**. |
| **Pull request** | Ask for the working branch to be merged into the main branch. **Open a pull request…**. |

*Retired:* **Publish**. It meant three things: releasing a version, the
palette group holding the exports, and opening a pull request. None of
them makes anything public, which is what a reader hears in the word.

### Courses, series, tutorials

| Word | Means |
|---|---|
| **Course** | A file in `courses/` listing series. The code says *course* too (`courses.ts`, `Course`). The one *module* left is a dewstack page's `module:` front-matter field, which is data dewnote reads, not a name it chose. |
| **Series** | An ordered list of tutorial ids inside a course. |
| **Tutorial** | A page in `tutorials/<id>/<id>.md`. |
| **Practice page** | `tutorials/<id>/<id>-practice.md`. |
| **Site page** | One of dewlab's own pages in `pages/`. |
| **Add to a series… / Remove from a series…** | Edit a course file's list. |
| **Id** | A tutorial's folder name, file name and address. **Rename this tutorial…** changes it. |
| **Rename / Move / Delete** | *Rename* changes a tutorial's id; *Move or rename this file* changes any other page's path; *Delete* removes a file. A tutorial is never *moved*: where it sits is the course files' business. |

*Retired:* **Place this tutorial…**, which also silently removed a
tutorial when the chosen series already listed it. Adding and removing
are now two commands, each offering only the series it can act on.

### Document, page, workspace

| Word | Means |
|---|---|
| **Document** | A markdown file, as dewnote holds it. What the editor edits, what the checker checks. |
| **Page** | What a reader sees on the site. Used in **Preview as a reader** and in checker messages about what the site does. |
| **Workspace** | The folder or repository dewnote has open. |

*Retired:* **Check every page** (it checks documents, and some documents
are not pages). It is now **Check every document**.

### Problems

| Word | Means |
|---|---|
| **Problem** | One finding from the checker. The margin count reads *3 problems*. |
| **Stops the site building** | A blocking problem. dewlab's build fails on it. |
| **Worth fixing** | A problem the build tolerates. |

*Retired:* "3 to fix", "things to fix", "would stop the build". *Build* is
a developer's word; the author cares whether the site works.

### Cells and Python

| Word | Means |
|---|---|
| **Cell** | A code block with `exec` in its info string, which runs. |
| **Run / Run again / Stop** | A cell's button. |
| **Restart Python** | Throw away the interpreter's state. |

*Retired:* "the interpreter" (in labels), "Stop whatever is running".

### Editing the markdown

| Word | Means |
|---|---|
| **Edit the markdown** | The plain-text view of the whole file (Ctrl+/). |
| **Apply changes / Cancel** | Its two buttons. |

*Retired:* "Show the whole file", "Keep these changes", "Leave it as it
was".

### Dialog buttons

Buttons name the action they take: **Create tutorial**, **Release**,
**Apply changes**, **Save and continue**, **Discard changes**. The way
out of any dialog is **Cancel** or **Keep editing**.

*Retired:* "Make it", "Publish it", "Not now" (which suggests the app
will ask again later).

### Palette groups

Commands are grouped as **Document**, **Cells**, **Tutorial**,
**Workspace**, **Import and export**, **GitHub** and **Appearance**
(`CommandSection` in `commands.ts`). The palette heading over all of them
is **Commands**.

*Retired:* the heading **Do**, and the groups **Publish** and the old
three-way **Document / Workspace / Publish** split, which put exports
under Publish and the import under Document.

---

## Writing rules

1. **Say what happens, in the user's terms.** "Keeps a copy of the
   current version and makes your edits the next one", not "Freezes what
   is published and dates what is open."
2. **A problem message says what is wrong, then what to do.** "A card
   with no `url:` line, so clicking it goes nowhere. Add the address it
   should open."
3. **An error says whether the action happened.** Save failures begin
   "Not saved:".
4. **Shortcuts come from `shortcut()` in `keys.ts`**, never a literal ⌘,
   so Windows and Linux users see Ctrl.
5. **Count with the right plural**: "1 problem", "2 problems".
6. **No design arguments in the interface.** Why a behaviour is right
   belongs in `ARCHITECTURE.md` or a code comment, not in a dialog note.
7. **An ellipsis on a command** means it asks something before acting.
