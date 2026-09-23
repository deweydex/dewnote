// The Pyodide worker's source, as a string.
//
// It has to run from a Blob URL: the build is one HTML file, so there is
// no worker.js on disk to point `new Worker(url)` at, and Bun's bundler
// does not follow a `new Worker(new URL(...))` reference the way Vite's
// does.
//
// Adapted from dewlab's assets/pyodide-worker.js — boot, run a cell,
// support Stop. SQL cells share this one interpreter.
//
// TypeScript cannot check a string, so keep this small and literal.
// Anything that can live in real TypeScript belongs in
// pyodide-engine.ts.

import pythonToolsSource from "./dewnote_tools.py" with { type: "text" };
import sqlToolsSource from "./dewnote_sql_tools.py" with { type: "text" };

// Nothing loads eagerly at boot any more — a document that never imports
// pandas or matplotlib shouldn't pay for either. runCell's own
// loadPackagesFromImports call (Pyodide's own mechanism for this) loads
// exactly what a given cell's `import` lines ask for, the first time it
// asks for it, and is a no-op every time after.
export const DEFAULT_PACKAGES: string[] = [];

export function buildWorkerSource(): string {
  const pythonSourceLiteral = JSON.stringify(pythonToolsSource);
  const sqlSourceLiteral = JSON.stringify(sqlToolsSource);
  return `
"use strict";

let pyodide = null;
let tools = null;
let sqlTools = null;
let sqliteLoading = null;
let matplotlibConfigured = false;
let sharedDbSeeded = false;
// Jedi, for help while writing a cell: completion, a name's
// documentation, the signature of the call being typed. Loaded after boot
// and never awaited by a run, since jedi and parso are a download no cell
// depends on. Until it is ready, a help request answers nothing.
let jediReady = false;

function post(message) {
  self.postMessage(message);
}

function respond(id, result) {
  post({ type: "response", id, result });
}

function fail(id, error) {
  post({ type: "response", id, error: String((error && error.message) || error) });
}

async function boot(message) {
  post({ type: "status", text: "Loading Python…" });
  const { loadPyodide } = await import(message.pyodideBase + "pyodide.mjs");
  pyodide = await loadPyodide({ indexURL: message.pyodideBase });

  if (message.packages && message.packages.length) {
    post({ type: "status", text: "Loading packages…" });
    await pyodide.loadPackage(message.packages);
  }

  pyodide.FS.writeFile("/home/pyodide/dewnote_tools.py", ${pythonSourceLiteral}, { encoding: "utf8" });
  tools = pyodide.pyimport("dewnote_tools");
  loadJedi();
}

async function loadJedi() {
  try {
    await pyodide.loadPackage(["jedi", "parso"]);
    jediReady = true;
  } catch (error) {
    console.warn("dewnote worker: Jedi did not load; cells get no completion from it", error);
  }
}

function help(message) {
  if (!jediReady || !tools) return null;
  const answer = tools[message.kind](message.source, message.context, message.line, message.column);
  return JSON.parse(answer);
}

async function runCell(message) {
  await pyodide.loadPackagesFromImports(message.code, {
    messageCallback: (text) => post({ type: "status", text }),
  });
  if (!matplotlibConfigured && pyodide.loadedPackages && pyodide.loadedPackages["matplotlib"]) {
    await pyodide.runPythonAsync("import matplotlib; matplotlib.use('AGG')");
    matplotlibConfigured = true;
  }
  // A cell reading a SQL cell's table (dewnote_tools.py's read_sql,
  // pre-seeded into every exec cell's namespace) isn't a Python import
  // line loadPackagesFromImports can see — the literal substring check
  // is a plain heuristic standing in for it, same limitation dewstack's
  // own build-time "a py cell= on this page always gets sqlite3" rule
  // has, just applied per cell instead of per page.
  if (message.code.indexOf("read_sql(") !== -1 || message.sql) {
    await ensureSqlTools();
    if (!pyodide.loadedPackages || !pyodide.loadedPackages["pandas"]) {
      post({ type: "status", text: "Loading pandas…" });
      await pyodide.loadPackage(["pandas"]);
    }
  }
  // A sql exec cell (message.sql, set by pyodide-engine.ts's own runCell
  // call — dewnote_sql_tools.run_sql_cell's own first argument, wrapped
  // into the cell's code by cell.ts's wrapSqlExecCode) needs the one
  // shared, page-wide "db" connection dewlab's own sql exec model uses
  // (DIALECTS.md §1) seeded into the same namespace every python exec
  // cell already shares — seeded once, lazily, on whichever cell (SQL
  // or Python) actually needs it first, the same "pay for what's used"
  // discipline read_sql's own sqlite3 load already follows.
  if (message.sql && !sharedDbSeeded) {
    // This code lives inside the JavaScript source string returned by
    // buildWorkerSource. Keep the newline escaped in that generated
    // program; a literal newline inside its quoted string prevents the
    // worker from parsing, which leaves every Python cell at “Running…”.
    await pyodide.runPythonAsync("import sqlite3, dewnote_tools\\ndewnote_tools._page_globals['db'] = sqlite3.connect(':memory:')");
    sharedDbSeeded = true;
  }
  post({ type: "status", text: "" });
  const emit = (kind, cssClass, text, markup) =>
    post({ type: "output", cellId: message.cellId, kind, cssClass, text, markup });
  const ok = await tools.run_cell(message.cellId, emit, message.code);
  return { ok: !!ok };
}

// sqlite3 is only ever loaded once, on the first SQL cell any page
// actually runs — a document with no sql cell= fence never pays for it,
// the same "load what's actually used" discipline as runCell's own
// loadPackagesFromImports, just triggered by a different kind of cell
// instead of a Python import line.
async function ensureSqlTools() {
  if (sqlTools) return;
  if (!sqliteLoading) sqliteLoading = pyodide.loadPackage(["sqlite3"]);
  await sqliteLoading;
  pyodide.FS.writeFile("/home/pyodide/dewnote_sql_tools.py", ${sqlSourceLiteral}, { encoding: "utf8" });
  sqlTools = pyodide.pyimport("dewnote_sql_tools");
}

async function runSql(message) {
  await ensureSqlTools();
  return { html: sqlTools.run_sql(message.dbName, message.sql) };
}

async function resetSql(message) {
  await ensureSqlTools();
  sqlTools.reset(message.dbName);
  return true;
}

// An app page's query. Python's error arrives as a whole traceback; a
// page wants its last line, which says what went wrong.
function queryRows(message) {
  if (!tools) throw new Error("Python is still starting. Try again in a moment.");
  try {
    return JSON.parse(tools.query_rows(message.sql, JSON.stringify(message.params ?? [])));
  } catch (error) {
    const lines = String((error && error.message) || error).trim().split("\\n");
    throw new Error(lines[lines.length - 1].replace(/^\\w+(Error|Exception): /, ""));
  }
}

self.onmessage = async (event) => {
  const message = event.data;
  if (message.type === "set-interrupt-buffer") {
    if (pyodide) pyodide.setInterruptBuffer(new Int32Array(message.buffer));
    return;
  }
  try {
    let result;
    if (message.type === "boot") {
      await boot(message);
      result = true;
    } else if (message.type === "run-cell") {
      result = await runCell(message);
    } else if (message.type === "run-sql") {
      result = await runSql(message);
    } else if (message.type === "reset-sql") {
      result = await resetSql(message);
    } else if (message.type === "help") {
      result = help(message);
    } else if (message.type === "query-rows") {
      result = queryRows(message);
    } else {
      throw new Error("unknown message type: " + message.type);
    }
    respond(message.id, result);
  } catch (error) {
    fail(message.id, error);
  }
};
`;
}
