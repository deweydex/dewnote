# remark

A minimal editor for notebooks written as markdown: prose, LaTeX maths, and
code cells that run in the page. The file on disk is a plain markdown file
in whichever dialect a target site expects (dewlab, dewstack, or none), so
nothing the editor writes is private to the editor. It runs as a single
HTML file in a browser, and as a Mac application built from the same code.

Nothing is built yet. `planning/PLAN.md` is the design and the order of
work; `planning/DIALECTS.md` is the inventory of what the files it must
open and save look like; `DECISIONS.md` records what was decided and why,
in the same spirit as dewlab's `DECISIONS_LOG.md`.

The name is provisional. It collides with `remark`, the widely used
JavaScript markdown processor, and with `remark.js`, a slideshow tool.
`DECISIONS.md` entry 3 has the options.
