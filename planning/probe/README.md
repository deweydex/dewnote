# The round-trip probe

What established that Milkdown could hold dewlab's markdown at all
(`planning/REBUILD.md` §1). It is kept because the numbers in that
document are only worth as much as the thing that produced them, and
because re-running it against a new Milkdown version is the fastest way
to find out whether an upgrade is safe.

`tests/e2e/roundtrip.spec.ts` is the version that runs in CI, against
`fixtures/` and the real build. This one runs against a whole dewlab
checkout, which CI does not have.

```bash
npm install
npx esbuild entry.js --bundle --format=iife --outfile=bundle.js --loader:.css=text
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node corpus.mjs
```

`corpus.mjs` reads `/home/user/dewlab` and reports, for all 184 markdown
files: how many round-trip byte-for-byte, how many are idempotent, and
how many keep every fence info string, cell id, heading, fold and maths
block. `entry.js` is the standalone Crepe harness the investigation used;
`corpus.mjs` drives dewnote's own built `dist/index.html`, so it measures
the shipped configuration rather than a copy of it.
