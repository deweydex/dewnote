# dewnote

An editor for the tutorials on **dewlab**. A tutorial is a markdown file
that mixes text, LaTeX maths, questions the page marks, and Python or SQL
cells that run in the browser. dewnote edits those files as documents,
runs their code, checks them against what dewlab's build accepts, and
saves them back as plain markdown that dewlab reads unchanged.

It runs in a browser as a single HTML file. There is no server: files come
from a folder on your computer or from a GitHub repository, and Python
runs in the tab via Pyodide.

Named `dewnote`, to sit beside `dewlab`, `dewstack`, `dewmini` and
`dewmark`.

## Using it

Read **[docs/USING_DEWNOTE.md](docs/USING_DEWNOTE.md)**. It starts with a
ten-minute walkthrough of writing and saving a tutorial.

To try it without connecting anything, choose **try the sample document**
on the opening screen. The sample holds one of every block dewnote
supports, and nothing you do in it is saved.

## Developing it

```bash
bun install
bun run dev          # development server with hot reload
bun run build        # builds dist/index.html, one self-contained file
bun run test         # unit tests
bun run typecheck
bun run test:e2e     # builds, then runs the Playwright tests against dist/index.html
```

`tests/e2e/roundtrip.spec.ts` matters most. Every construct dewlab
writes has to survive being opened and saved by dewnote, and a second
open-and-save must change nothing. If that test cannot be kept passing,
the document model is wrong.

## Documents

| File | For | What it covers |
|---|---|---|
| [docs/USING_DEWNOTE.md](docs/USING_DEWNOTE.md) | Authors | How to use dewnote, with a walkthrough, a reference and a glossary. |
| [docs/VOCABULARY.md](docs/VOCABULARY.md) | Contributors | The words the interface uses and avoids. Read it before changing any text a user sees. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Contributors | How dewnote is built, and the Milkdown behaviours it depends on. |
| [planning/DIALECTS.md](planning/DIALECTS.md) | Contributors | The file formats dewnote reads and writes, from dewlab's and dewstack's builds. |
| [planning/ROADMAP.md](planning/ROADMAP.md) | Contributors | Known problems and planned work. |
| [planning/probe/](planning/probe/) | Contributors | The round-trip measurement, run against a whole dewlab checkout. |
