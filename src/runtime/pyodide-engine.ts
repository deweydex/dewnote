// The main-thread half of running a cell, adapted from dewlab's own
// assets/pyodide-engine.js.
//
// Boot, run-cell, the request/response envelope, and the
// SharedArrayBuffer interrupt convention — byte 0 = 2, Pyodide's own
// SIGINT signal — with a terminate-and-restart fallback for a page
// without cross-origin isolation.
//
// There is no main-thread fallback for a browser that cannot construct a
// Worker: dewnote is served over http(s), so a Worker is always
// available. A build opened straight from disk over `file://` is the one
// case this does not cover.

import { buildWorkerSource, DEFAULT_PACKAGES } from "./worker-source.ts";

const DEFAULT_PYODIDE_BASE = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
let pyodideBaseOverride: string | null = null;

/** A settings-panel override for where Pyodide loads from — jsDelivr by
 * default, self-hosted if the reader says so. Only takes effect on the *next* `ensureBooted()` — a
 * worker already running keeps using whatever base it booted with, which
 * is exactly why the settings panel pairs this with `restartInterpreter`
 * rather than trying to hot-swap a running interpreter's own source. */
export function setPyodideBase(base: string | null): void {
  pyodideBaseOverride = base && base.trim() ? base : null;
}

export interface OutputEvent {
  kind: "stream" | "append" | "clear";
  cssClass: string;
  text: string;
  markup: string;
}
export type OutputListener = (event: OutputEvent) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

let worker: Worker | null = null;
let bootPromise: Promise<void> | null = null;
let interruptBuffer: SharedArrayBuffer | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();
const outputListeners = new Map<string, OutputListener>();
let onStatus: ((text: string) => void) | null = null;

function createWorker(): Worker {
  const blobUrl = URL.createObjectURL(new Blob([buildWorkerSource()], { type: "text/javascript" }));
  const w = new Worker(blobUrl);
  w.onmessage = (event: MessageEvent) => {
    const message = event.data;
    if (message.type === "status") {
      onStatus?.(message.text);
    } else if (message.type === "output") {
      outputListeners.get(message.cellId)?.({ kind: message.kind, cssClass: message.cssClass, text: message.text, markup: message.markup });
    } else if (message.type === "response") {
      const pending = pendingRequests.get(message.id);
      if (!pending) return;
      pendingRequests.delete(message.id);
      if ("error" in message) pending.reject(new Error(message.error));
      else pending.resolve(message.result);
    }
  };
  return w;
}

function request(type: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    worker!.postMessage({ type, id, ...payload });
  });
}

/** Boots the interpreter once; a second call while booting, or after,
 * reuses the same promise/worker rather than starting a second one. */
export function ensureBooted(packages: string[] = DEFAULT_PACKAGES): Promise<void> {
  if (bootPromise) return bootPromise;
  worker = createWorker();
  bootPromise = (async () => {
    await request("boot", { pyodideBase: pyodideBaseOverride ?? DEFAULT_PYODIDE_BASE, packages });
    if (typeof SharedArrayBuffer !== "undefined" && (globalThis as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated) {
      interruptBuffer = new SharedArrayBuffer(4);
      worker!.postMessage({ type: "set-interrupt-buffer", buffer: interruptBuffer });
    }
  })();
  return bootPromise;
}

export function setStatusListener(listener: ((text: string) => void) | null): void {
  onStatus = listener;
}

/** Runs one cell, streaming its output through `onOutput` as it happens —
 * a cell's print() should appear as the cell runs, not all at once when
 * it finishes. Resolves once the cell has finished (or been stopped).
 * `sql`, set for a `sql exec` cell (app.ts's own cell runner, deciding
 * from `execCellLanguage`), tells the worker this run needs sqlite3 and
 * the shared `db` connection — `code` itself is already the wrapped
 * Python `wrapSqlExecCode` produces, not raw SQL; this flag only tells
 * the worker what to load and seed *before* running it. */
export async function runCell(cellId: string, code: string, onOutput: OutputListener, opts: { sql?: boolean } = {}): Promise<{ ok: boolean }> {
  await ensureBooted();
  outputListeners.set(cellId, onOutput);
  try {
    return (await request("run-cell", { cellId, code, sql: !!opts.sql })) as { ok: boolean };
  } finally {
    outputListeners.delete(cellId);
  }
}

/** Runs a dewstack-style SQL cell's script against `dbName`'s own shared
 * connection (every SQL cell using that name, across the page, hits the
 * same one) and returns the complete HTML fragment the Python side
 * already rendered — a table, an affected-row count, or an error, never
 * streamed, since a SQL cell's own contract (dewstack's own) is one
 * result per run, not running output. */
export async function runSql(dbName: string, sql: string): Promise<{ html: string }> {
  await ensureBooted();
  return (await request("run-sql", { dbName, sql })) as { html: string };
}

/** A SQL cell's own Reset — closes and discards `dbName`'s connection, so
 * a `CREATE TABLE` can run again from scratch. Does nothing to any other
 * name's connection. */
export async function resetSql(dbName: string): Promise<void> {
  await ensureBooted();
  await request("reset-sql", { dbName });
}

/** True once a worker exists at all — requestStop always does *something*
 * from that point on, just not always the same thing (see there). */
export function canStop(): boolean {
  return worker !== null;
}

/** Interrupts the running cell if cross-origin isolation made a
 * SharedArrayBuffer available at boot (Pyodide's own SIGINT convention);
 * otherwise terminates the worker outright and discards it, the plan's
 * own documented baseline (§5.4) for a page without cross-origin
 * isolation, since nothing else can stop a Python loop that never checks
 * an interrupt buffer. Terminating loses the shared namespace — the next
 * cell run boots a fresh interpreter from nothing, same as a first run —
 * and rejects whatever run-cell request was in flight, which is why
 * app.ts's Run handler always has a catch around `runCell`, not only a
 * `finally`. */
export function requestStop(): void {
  if (interruptBuffer) {
    new Int32Array(interruptBuffer)[0] = 2;
    return;
  }
  terminateWorker("Stopped: the interpreter was restarted");
}

function terminateWorker(reason: string): void {
  if (!worker) return;
  worker.terminate();
  worker = null;
  bootPromise = null;
  interruptBuffer = null;
  for (const pending of pendingRequests.values()) pending.reject(new Error(reason));
  pendingRequests.clear();
}

/** The settings panel's own "Restart Python interpreter" — unlike
 * `requestStop`, this always terminates, even when an interrupt buffer
 * would let it interrupt in place, since restarting is the whole point
 * (a fresh interpreter, e.g. to pick up a changed Pyodide base URL, or
 * simply to clear a shared namespace that has gotten into a state a
 * reader wants to abandon rather than debug). A no-op if nothing has
 * booted yet — there is nothing to restart. */
export function restartInterpreter(): void {
  terminateWorker("Stopped: the interpreter was restarted");
}
