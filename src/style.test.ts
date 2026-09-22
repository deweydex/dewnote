import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// A `var(--x)` with nothing behind it does not fall back — the whole
// declaration is dropped, silently. That has cost this editor three
// visible faults: no caret, a palette with no border, and two panels
// with no shadow. This is the cheap guard for the class.

// Comments are prose about the rules, and this file's own comments
// quote the mistakes it guards against.
const CSS = readFileSync("src/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Names written from TypeScript at runtime, which the stylesheet reads
 * but does not define: the spine's measured width, the appearance
 * settings. */
function setAtRuntime(): Set<string> {
  const found = new Set<string>();
  for (const name of readdirSync("src")) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    for (const match of readFileSync(join("src", name), "utf8").matchAll(/"(--[\w-]+)"/g)) {
      found.add(match[1]!);
    }
  }
  return found;
}

/** Every custom property a stylesheet dewnote loads defines. */
function definedInStylesheets(): Set<string> {
  const sheets = [
    "src/style.css",
    "src/brand.css",
    ...readdirSync("src/theme").filter((name) => name.endsWith(".css")).map((name) => join("src/theme", name)),
  ];
  const found = new Set<string>();
  for (const sheet of sheets) {
    for (const match of readFileSync(sheet, "utf8").matchAll(/(--[\w-]+)\s*:/g)) found.add(match[1]!);
  }
  return found;
}

test("every custom property the stylesheet reads is one something defines", () => {
  const defined = definedInStylesheets();
  const runtime = setAtRuntime();
  // A read with its own literal fallback, `var(--x, 290px)`, says what
  // to do when it is absent, so it is not a leftover.
  const bare = [...CSS.matchAll(/var\((--[\w-]+)\s*\)/g)].map((m) => m[1]!);
  expect([...new Set(bare)].filter((name) => !defined.has(name) && !runtime.has(name))).toEqual([]);
});
