// The main-thread half of running a cell — a trimmed adaptation of
// dewlab's assets/pyodide-engine.js. Kept: boot, run-cell, the
// SharedArrayBuffer interrupt convention (byte 0 = 2, Pyodide's own
// SIGINT signal), and the request/response envelope. Dropped: the entire
// main-thread fallback for when a Worker can't be constructed (dewlab
// needs it for a file:// tutorial page; dewnote's browser and GitHub
// Pages targets are both served over http(s), so this is a real,
// documented gap for the single-file-opened-from-disk mode — see
// DECISIONS.md), filesystem mounting, autocomplete, and every message
// type that exists only for those.

import { buildWorkerSource, DEFAULT_PACKAGES } from "./worker-source.ts";

const PYODIDE_BASE = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";

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
    const msg = event.data;
    if (msg.type === "status") {
      onStatus?.(msg.text);
    } else if (msg.type === "output") {
      outputListeners.get(msg.cellId)?.({ kind: msg.kind, cssClass: msg.cssClass, text: msg.text, markup: msg.markup });
    } else if (msg.type === "response") {
      const pending = pendingRequests.get(msg.id);
      if (!pending) return;
      pendingRequests.delete(msg.id);
      if ("error" in msg) pending.reject(new Error(msg.error));
      else pending.resolve(msg.result);
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
    await request("boot", { pyodideBase: PYODIDE_BASE, packages });
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
 * it finishes. Resolves once the cell has finished (or been stopped). */
export async function runCell(cellId: string, code: string, onOutput: OutputListener): Promise<{ ok: boolean }> {
  await ensureBooted();
  outputListeners.set(cellId, onOutput);
  try {
    return (await request("run-cell", { cellId, code })) as { ok: boolean };
  } finally {
    outputListeners.delete(cellId);
  }
}

/** Only meaningful once booted with cross-origin isolation in effect
 * (SharedArrayBuffer requires it) — there is no fallback interrupt for a
 * page that isn't isolated, matching dewlab's own limitation exactly. */
export function canStop(): boolean {
  return interruptBuffer !== null;
}

export function requestStop(): void {
  if (!interruptBuffer) return;
  new Int32Array(interruptBuffer)[0] = 2; // Pyodide's own SIGINT convention
}
