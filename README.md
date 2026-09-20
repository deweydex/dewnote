# dewnote

An editor for tutorials written as markdown: prose, LaTeX maths, and code
cells that run in the page. The file on disk is a plain markdown file in
whichever dialect the target site expects, so nothing the editor writes is
private to the editor.

It runs as a single HTML file in a browser. There is no server.

Named `dewnote`, to sit beside `dewlab`, `dewstack`, `dewmini` and
`dewmark`.

## Running things

```bash
bun install
bun run dev                  # hot reload
bun run build                # dist/index.html, one file
bun run test                 # unit
bun run typecheck
bunx playwright test         # against the built file
```

There is a sample workspace on the opening screen — one document holding
every construct the editor knows, saved nowhere — for trying it without
connecting anything.

`tests/e2e/roundtrip.spec.ts` is the test this application stands on:
every construct dewlab writes has to survive a pass through the editor,
and the pass has to be idempotent. If it cannot be kept green, the
document model is wrong.

## Where things are

| | |
|---|---|
| `ARCHITECTURE.md` | how it is built, and the three things the editor has to know about Milkdown |
| `docs/USING_DEWNOTE.md` | the guide for the person writing tutorials |
| `planning/DIALECTS.md` | what the files it opens and saves look like |
| `planning/probe/` | the round-trip measurement, run against a whole dewlab checkout |

## Not built yet

Jupyter export, the placement view for moving a tutorial between series,
freezing a release, the whole-file source view, and the hint, card,
question and grouped site-pane fences.
