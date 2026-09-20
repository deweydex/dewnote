// What holds the document: the spine in the margin, the palette on ⌘K,
// the command registry both read, and save.
//
// One overlay and one margin. Everything that appears over the document
// — the palette, the settings — goes through the overlay; everything
// that says where you are goes in the margin.

import { mountEditor, type Document } from "./editor.ts";
import { mountSpine, type Spine } from "./spine.ts";
import { mountWorkspacePalette, type WorkspacePalette } from "./workspace-palette.ts";
import { registerCommands, clearCommands } from "./commands.ts";
import { buildFileIndex, locationOf, type FileIndexEntry } from "./workspace.ts";
import { parseModuleFiles, isModuleFile } from "./modules.ts";
import type { Module } from "./modules.ts";
import { messageOf, type SaveProblem } from "./save-problem.ts";
import { runCell } from "./runtime/pyodide-engine.ts";
import type { CellOutput } from "./cells.ts";
import type { Store, StoreFile } from "./store.ts";
import { mountSettingsPanel } from "./settings-panel.ts";

interface OpenDocument {
  path: string;
  /** The bytes the store gave us, so "is this dirty" is a comparison
   * rather than a flag somebody has to remember to clear. */
  saved: string;
  document: Document;
}

export interface Shell {
  /** Mount a store's contents and offer the palette, which is the next
   * thing to do once a workspace exists. */
  useStore(store: Store): Promise<void>;
  destroy(): void;
}

/** A stream's plain text on its way into a panel that holds HTML. The
 * engine sends `markup` for anything it rendered itself; a bare `text`
 * event is stdout, and stdout is not markup. */
function escapeText(text: string): string {
  const holder = document.createElement("pre");
  holder.textContent = text;
  return holder.outerHTML;
}

export function mountShell(page: HTMLElement): Shell {
  let store: Store | null = null;
  let files = new Map<string, string>();
  let index: FileIndexEntry[] = [];
  let modules: Module[] = [];
  let open: OpenDocument | null = null;

  const isDirty = (): boolean => open !== null && open.document.markdown() !== open.saved;

  // ── the spine ──────────────────────────────────────────────────────

  const spine: Spine = mountSpine({
    getHeadings: () => open?.document.headings() ?? [],
    openPalette: () => palette.open(),
    save: () => saveNow(),
  });

  function refreshSpine(): void {
    if (!open) return;
    spine.setFile({ name: open.path, dirty: isDirty() });
    const where = locationOf(open.path, index, modules);
    spine.setLocation(where ?? { module: "", series: "", page: "" });
    spine.refreshOutline();
  }

  // ── the palette ────────────────────────────────────────────────────

  const settings = mountSettingsPanel();

  const palette: WorkspacePalette = mountWorkspacePalette({
    getIndex: () => index,
    getModules: () => modules,
    openPath: (path) => openPath(path),
    readPath: async (path) => files.get(path) ?? (store ? await store.read(path) : null),
  });

  // ── opening and saving ─────────────────────────────────────────────

  async function openPath(path: string): Promise<boolean> {
    if (!store) return false;
    const source = files.get(path) ?? (await store.read(path).catch(() => null));
    if (source === null || source === undefined) return false;

    open?.document.destroy();
    page.replaceChildren();
    const document_ = await mountEditor(page, {
      markdown: source,
      onChange: () => refreshSpine(),
      runCell: runOneCell,
    });
    // `saved` is what the editor made of the file, not the file — a
    // document is normalised on the way in (editor.ts), and comparing
    // against the bytes on disk would show every file as dirty the
    // moment it opened.
    open = { path, saved: document_.markdown(), document: document_ };
    spine.setProblem(null);
    refreshSpine();
    return true;
  }

  /** One cell, run in the worker. Streams arrive as they are produced
   * and are concatenated; the engine's own `run-cell` reply says whether
   * it ended well. The interpreter boots on the first Run and stays up,
   * which is why nothing here is started when a document opens. */
  async function runOneCell(request: { id: string; code: string; sql: boolean }): Promise<CellOutput> {
    let markup = "";
    const result = await runCell(
      request.id,
      request.code,
      (event) => {
        if (event.kind === "clear") markup = "";
        else markup += event.markup || escapeText(event.text);
      },
      { sql: request.sql },
    );
    return { ok: result.ok, markup };
  }

  async function saveNow(): Promise<boolean> {
    if (!store || !open || !isDirty()) return false;
    const text = open.document.markdown();
    try {
      await store.write(open.path, text, `Edit ${open.path}`);
    } catch (error) {
      const problem: SaveProblem =
        typeof error === "object" && error !== null && "conflict" in error
          ? (error as SaveProblem)
          : { message: messageOf(error), conflict: false };
      // It holds until it is resolved. A refused save that looks like a
      // successful one is the worst failure this app can have, because
      // the next thing an author does is close the tab.
      spine.setProblem({ message: problem.message });
      return false;
    }
    open.saved = text;
    files.set(open.path, text);
    reindex();
    refreshSpine();
    return true;
  }

  function reindex(): void {
    const all: StoreFile[] = [...files].map(([path, content]) => ({ path, content }));
    modules = parseModuleFiles(all.filter((file) => isModuleFile(file.path)));
    index = buildFileIndex(
      all.filter((file) => file.path.endsWith(".md")),
      modules,
    );
  }

  // ── keys ───────────────────────────────────────────────────────────

  function onKeyDown(event: KeyboardEvent): void {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveNow();
    }
  }
  window.addEventListener("keydown", onKeyDown);

  return {
    async useStore(next) {
      store = next;
      const listed = await next.list();
      files = new Map(listed.map((file) => [file.path, file.content]));
      reindex();
      spine.setWorkspace({
        label: next.kind === "folder" ? next.label : next.label.split(" · ")[0] ?? next.label,
        detail: next.kind === "repo" ? (next.label.split(" · ")[1] ?? "") : "",
      });
      spine.show();
      registerCommands([
        {
          id: "appearance",
          label: "Appearance…",
          section: "Appearance",
          keywords: ["settings", "theme", "dark", "font", "size", "width"],
          detail: "Theme, type, measure, spacing.",
          run: () => settings.open(),
        },
        {
          id: "save",
          label: "Save this document",
          section: "Document",
          keywords: ["write", "commit"],
          available: () => isDirty(),
          run: () => void saveNow(),
        },
        ...(next.publish
          ? [{
              id: "publish",
              label: "Open a pull request…",
              section: "Publish" as const,
              keywords: ["pr", "github", "review"],
              run: async () => {
                const url = await next.publish!();
                window.open(url, "_blank", "noopener");
              },
            }]
          : []),
      ]);
      // Choosing a document is the next thing to do.
      palette.open();
    },

    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      open?.document.destroy();
      palette.destroy();
      settings.destroy();
      spine.destroy();
      clearCommands();
    },
  };
}
