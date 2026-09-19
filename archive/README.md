# The old dewnote

The editor dewnote had before it was rebuilt on Milkdown — 12,274 lines of
TypeScript across 41 modules, plus its tests. `planning/REBUILD.md` says
why it was replaced and what came across.

Nothing here is imported by the running app. It is kept for two reasons,
and both are about reading rather than running.

**It is the specification for the parts still being ported.**
`src/cell.ts` holds the parse of a dewlab exec cell's `id:`, `hint:`,
`expect:` and `name:` header lines, matched to dewlab's own `HEADER_RE`.
`src/github.ts` and `src/folder-store.ts` are the two stores.
`src/spine.ts`, `src/workspace-palette.ts` and `src/commands.ts` are the
interface that is being kept. Porting them means reading them, not
guessing at them.

**It records what was learned the hard way.** Most modules open with a
comment saying which plan step they answer and which measurement forced
their shape — the palette's ranking, in particular, took three faults
found only by running it against 181 real tutorials rather than a
fixture. That is worth more than the code.

It goes once the port is finished and the notes worth keeping have moved
into `DECISIONS.md`.
