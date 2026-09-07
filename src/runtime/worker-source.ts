// Builds the Pyodide worker's source as a string, the same way dewstack's
// site-editor.js builds its iframe RELAY script: code for a different
// execution context, embedded as text rather than imported as a module,
// because it has to end up runnable from a Blob URL inside dewnote's
// single-file build — there is no separate worker.js file on disk to
// point a real `new Worker(url)` at once everything is one HTML file.
// Bun's bundler doesn't follow a `new Worker(new URL(...))` reference the
// way Vite's does (checked directly against a browser-target build,
// which left the reference unresolved rather than producing a second
// chunk), so a hand-authored string is the plain fix, not a workaround.
//
// This is a trimmed adaptation of dewlab's assets/pyodide-worker.js —
// boot, run a cell, and support Stop — not a port of its filesystem
// mounting, autocomplete, or SQL-seeding message types, none of which
// dewnote's cells need yet. See DECISIONS.md for the fuller comparison.
//
// Because this is a plain string, not a module TypeScript can check, keep
// it as small and literal as reasonably possible — anything that can live
// in real, type-checked TypeScript instead (the main-thread side, in
// pyodide-engine.ts) should.

import pythonToolsSource from "./dewnote_tools.py" with { type: "text" };

// Nothing loads eagerly at boot any more — a document that never imports
// pandas or matplotlib shouldn't pay for either. runCell's own
// loadPackagesFromImports call (Pyodide's own mechanism for this) loads
// exactly what a given cell's `import` lines ask for, the first time it
// asks for it, and is a no-op every time after.
export const DEFAULT_PACKAGES: string[] = [];

export function buildWorkerSource(): string {
  const pythonSourceLiteral = JSON.stringify(pythonToolsSource);
  return `
"use strict";

let pyodide = null;
let tools = null;
let matplotlibConfigured = false;

function post(message) {
  self.postMessage(message);
}

function respond(id, result) {
  post({ type: "response", id, result });
}

function fail(id, error) {
  post({ type: "response", id, error: String((error && error.message) || error) });
}

async function boot(msg) {
  post({ type: "status", text: "Loading Python…" });
  const { loadPyodide } = await import(msg.pyodideBase + "pyodide.mjs");
  pyodide = await loadPyodide({ indexURL: msg.pyodideBase });

  if (msg.packages && msg.packages.length) {
    post({ type: "status", text: "Loading packages…" });
    await pyodide.loadPackage(msg.packages);
  }

  pyodide.FS.writeFile("/home/pyodide/dewnote_tools.py", ${pythonSourceLiteral}, { encoding: "utf8" });
  tools = pyodide.pyimport("dewnote_tools");
}

async function runCell(msg) {
  await pyodide.loadPackagesFromImports(msg.code, {
    messageCallback: (text) => post({ type: "status", text }),
  });
  if (!matplotlibConfigured && pyodide.loadedPackages && pyodide.loadedPackages["matplotlib"]) {
    await pyodide.runPythonAsync("import matplotlib; matplotlib.use('AGG')");
    matplotlibConfigured = true;
  }
  post({ type: "status", text: "" });
  const emit = (kind, cssClass, text, markup) =>
    post({ type: "output", cellId: msg.cellId, kind, cssClass, text, markup });
  const ok = await tools.run_cell(msg.cellId, emit, msg.code);
  return { ok: !!ok };
}

self.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type === "set-interrupt-buffer") {
    if (pyodide) pyodide.setInterruptBuffer(new Int32Array(msg.buffer));
    return;
  }
  try {
    let result;
    if (msg.type === "boot") {
      await boot(msg);
      result = true;
    } else if (msg.type === "run-cell") {
      result = await runCell(msg);
    } else {
      throw new Error("unknown message type: " + msg.type);
    }
    respond(msg.id, result);
  } catch (err) {
    fail(msg.id, err);
  }
};
`;
}
