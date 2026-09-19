# dewnote

A minimal editor for notebooks written as markdown: prose, LaTeX maths, and
code cells that run in the page. The file on disk is a plain markdown file
in whichever dialect a target site expects (dewlab, dewstack, or none), so
nothing the editor writes is private to the editor. It runs as a single
HTML file in a browser, and as a Mac application built from the same code.

`planning/PLAN.md` is the design and the order of work; `planning/DIALECTS.md`
is the inventory of what the files it must open and save look like;
`DECISIONS.md` records what was decided and why, in the same spirit as
dewlab's `DECISIONS_LOG.md`. `planning/mockups/` has design sketches.

Named `dewnote`, to sit beside `dewlab`, `dewstack`, `dewmini` and `dewmark`.

## Running things

```bash
bun install       # first time only
bun test          # the document model's tests, fixtures/ included
bun run typecheck
```

## Where things are

`planning/PLAN.md` §6 is the order of work and records what each step
built; `planning/UI_REVIEW.md` is a review of the shipped interface
against that plan, with what has been fixed and what has not.

Built: the document model (`lines.ts`, `frontmatter.ts`, `dialect.ts`,
`blocks.ts` — every tutorial in `fixtures/`, and in dewlab and dewstack
when checked out alongside, round-trips byte for byte); the block
editing surface, with prose, maths, folds, front matter and cell headers
rendering when blurred and editing when focused; Python and SQL cells
that run on Pyodide in the page; a local-folder store and a GitHub store
with branches, conflicts and draft pull requests; Jupyter import and
export, standalone HTML export, and conversion between dialects; the
progressive shell — one source choice (`workflow-shell.ts`), a caption
in the left margin carrying identity, location, outline and save state
(`spine.ts`), and one key that reaches every tutorial, page, series and
command in the workspace (`workspace-palette.ts`, over `commands.ts`).

Not built: the Mac app (plan step 7), an OPFS private vault, and
dewstack's `site=`/`app=` cells. `planning/PLAN.md` has the full list of
what each step deliberately left open.

`src/full-corpus.test.ts` round-trips every tutorial in `../dewlab` and
`../dewstack` when those repositories are checked out as siblings of
this one; it skips itself otherwise. The Playwright suite
(`bun run test:e2e`) drives the real built app and stays out of CI, the
same split dewlab makes.
