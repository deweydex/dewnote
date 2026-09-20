# The old dewnote

The editor dewnote had before it was rebuilt on Milkdown — 12,274 lines of
TypeScript across 41 modules, plus its tests. `planning/REBUILD.md` says
why it was replaced and what came across.

Nothing here is imported by the running app, and nothing here is kept
for sentiment. Everything superseded outright has been deleted — the
block model and its offsets, the per-block editor lifecycle, both file
browsers, the icon rail, the file bar, the workflow shell, the outline
panel, the front-matter form, and the twenty e2e specs that drove
surfaces which no longer exist. That was 9,690 lines.

What is left is the list of features not yet rebuilt, each with a working
implementation to read: the placement view and the module writer, the
hint/card/question/site fences, the two exports, link checking and
picking, images beside a document, releases, and the dialect test.
`planning/REBUILD.md` §7 is the table, with line counts.

`tests/e2e/` keeps the eleven specs for exactly those features. Each is a
description of behaviour that still has to exist.

Most modules open with a comment saying which plan step they answer and
which measurement forced their shape. That is often worth more than the
code, and it is why these are read rather than guessed at.

A module leaves here when the thing it describes is rebuilt.
