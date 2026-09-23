// Every command the palette offers once a workspace is open, in the
// order it lists them. What each one does lives in the flows; this is
// where each is named, described, and said to apply or not.

import type { Command } from "./commands.ts";
import { canStop, requestStop, restartInterpreter } from "./runtime/pyodide-engine.ts";
import { placementsOf } from "./placement.ts";
import { tutorialIdOf } from "./rename.ts";
import { shortcut } from "./keys.ts";
import type { ShellContext } from "./shell-context.ts";
import type { AuthoringFlows } from "./authoring-flows.ts";
import type { FileFlows } from "./file-flows.ts";
import type { ExportFlows } from "./export-flows.ts";
import type { GithubFlows } from "./github-flows.ts";

/** What the shell does itself, rather than through a flow. */
export interface ShellActions {
  openAppearance(): void;
  showSource(): void;
  checkThisDocument(): void;
  checkWholeWorkspace(): void;
  runEveryCell(): Promise<void>;
}

export function shellCommands(
  ctx: ShellContext,
  shell: ShellActions,
  authoring: AuthoringFlows,
  files: FileFlows,
  exports: ExportFlows,
  github: GithubFlows,
): Command[] {
  const store = ctx.store();
  const hasDocument = () => ctx.open() !== null;
  /** The open tutorial's own id, from its path: undefined on a practice
   * page, a frozen release or anything outside `tutorials/`. */
  const tutorialId = () => {
    const open = ctx.open();
    return open ? tutorialIdOf(open.path) : undefined;
  };
  const practicePath = (id: string) => `tutorials/${id}/${id}-practice.md`;

  return [
    {
      id: "appearance",
      label: "Appearance…",
      section: "Appearance",
      keywords: ["settings", "theme", "dark", "font", "size", "width", "preferences"],
      detail: "Theme, fonts, text size, line width and spacing. Only changes how dewnote looks to you.",
      run: () => shell.openAppearance(),
    },
    {
      id: "stop",
      label: "Stop the running cell",
      section: "Cells",
      keywords: ["interrupt", "halt", "cancel", "loop", "hang"],
      detail: "Interrupts it. Variables from earlier cells are kept.",
      available: () => canStop(),
      run: () => requestStop(),
    },
    {
      id: "restart",
      label: "Restart Python",
      section: "Cells",
      keywords: ["reset", "pyodide", "interpreter", "clear", "fresh"],
      detail: "Clears every variable, as if no cell had run.",
      available: () => canStop(),
      run: () => restartInterpreter(),
    },
    {
      id: "new-tutorial",
      label: "New tutorial…",
      section: "Workspace",
      keywords: ["create", "add", "write", "start"],
      detail: "Creates a draft tutorial with its own folder, front matter and one cell.",
      run: () => void authoring.createTutorial(),
    },
    {
      id: "place",
      label: "Add to a series…",
      section: "Tutorial",
      keywords: ["course", "series", "module", "place", "contents", "list"],
      detail: "Lists this tutorial in a series on a course. Only the course file changes.",
      available: () => authoring.openTutorialId() !== undefined,
      run: () => void authoring.placeTutorial("add"),
    },
    {
      id: "unplace",
      label: "Remove from a series…",
      section: "Tutorial",
      keywords: ["course", "series", "module", "take out", "contents", "unlist"],
      detail: "Takes this tutorial out of a series. The tutorial itself is not deleted.",
      available: () => {
        const id = authoring.openTutorialId();
        return id !== undefined && placementsOf(id, ctx.modules()).length > 0;
      },
      run: () => void authoring.placeTutorial("remove"),
    },
    {
      id: "new-practice",
      label: "New practice page",
      section: "Tutorial",
      keywords: ["create", "add", "exercises", "problems", "practice"],
      detail: "Creates this tutorial's practice page as a draft, beside it, and opens it.",
      available: () => {
        const id = tutorialId();
        return id !== undefined && !ctx.files().has(practicePath(id));
      },
      run: () => void authoring.createPracticePage(),
    },
    {
      id: "open-practice",
      label: "Open the practice page",
      section: "Tutorial",
      keywords: ["exercises", "problems", "practice"],
      detail: "Opens the practice page that goes with this tutorial.",
      available: () => {
        const id = tutorialId();
        return id !== undefined && ctx.files().has(practicePath(id));
      },
      run: () => {
        const id = tutorialId();
        if (id) void ctx.openPath(practicePath(id));
      },
    },
    {
      id: "rename-tutorial",
      label: "Rename this tutorial…",
      section: "Tutorial",
      keywords: ["id", "address", "url", "folder", "move", "slug"],
      detail: "Changes its id, folder and web address, and every course list, link and redirect that names it.",
      available: () => tutorialId() !== undefined,
      run: () => void files.renameTutorial(),
    },
    {
      id: "move-document",
      label: "Move or rename this file…",
      section: "Document",
      keywords: ["path", "rename", "folder", "move"],
      detail: "Gives the file a new path. For pages outside tutorials/; a tutorial is renamed by its id.",
      available: () => {
        const open = ctx.open();
        return open !== null && !open.path.startsWith("tutorials/");
      },
      run: () => void files.moveDocument(),
    },
    {
      id: "delete-tutorial",
      label: "Delete this tutorial…",
      section: "Tutorial",
      keywords: ["remove", "trash", "folder"],
      detail: "Removes its folder and its place in every course. Refused while other pages link to it.",
      available: () => tutorialId() !== undefined,
      run: () => void files.deleteDocument(),
    },
    {
      id: "delete-document",
      label: "Delete this document…",
      section: "Document",
      keywords: ["remove", "trash"],
      detail: "Removes the file. Refused while other pages link to it.",
      available: () => hasDocument() && tutorialId() === undefined,
      run: () => void files.deleteDocument(),
    },
    {
      id: "release",
      label: "Release a new version…",
      section: "Tutorial",
      keywords: ["publish", "freeze", "version", "supersedes"],
      detail: "Keeps a copy of the current version and makes your edits the next one.",
      // Only a tutorial's own live file has versions to count.
      available: () => tutorialId() !== undefined,
      run: () => void authoring.releaseVersion(),
    },
    {
      id: "preview",
      label: "Preview as a reader",
      section: "Document",
      keywords: ["read", "look", "reader", "html", "how it looks", "page"],
      detail: "Opens the page in a new tab, styled the way the site shows it.",
      available: hasDocument,
      run: () => void exports.previewPage(),
    },
    {
      id: "source",
      label: "Edit the markdown",
      section: "Document",
      keywords: ["source", "whole file", "raw", "text", "front matter"],
      detail: `${shortcut("/")}. The file exactly as it will be saved, front matter included.`,
      available: hasDocument,
      run: () => shell.showSource(),
    },
    {
      id: "export-html",
      label: "Download as HTML",
      section: "Import and export",
      keywords: ["export", "html", "send", "share", "save as"],
      detail: "One self-contained file, with styles and images inside it, to send to someone.",
      available: hasDocument,
      run: () => void exports.saveAsHtml(),
    },
    {
      id: "export-ipynb",
      label: "Download as a Jupyter notebook",
      section: "Import and export",
      keywords: ["export", "ipynb", "jupyter", "notebook", "save as"],
      detail: "An .ipynb file. Importing it back gives the same markdown, exactly.",
      available: hasDocument,
      run: () => exports.saveAsNotebook(),
    },
    {
      id: "import-ipynb",
      label: "Import a Jupyter notebook…",
      section: "Import and export",
      keywords: ["open", "ipynb", "jupyter", "notebook"],
      detail: "Replaces this document's content with the notebook's. Nothing is saved until you save.",
      available: hasDocument,
      run: () => exports.openNotebook(),
    },
    {
      id: "check-document",
      label: "Check this document",
      section: "Document",
      keywords: ["problems", "validate", "ids", "duplicate", "lint"],
      detail: "Lists anything that would break the site build or confuse a reader.",
      available: hasDocument,
      run: () => shell.checkThisDocument(),
    },
    {
      id: "run-all",
      label: "Run every cell",
      section: "Cells",
      keywords: ["execute", "all", "check", "top to bottom"],
      detail: "Top to bottom, stopping at the first that fails.",
      available: () => (ctx.open()?.document.cellIds().length ?? 0) > 0,
      run: () => void shell.runEveryCell(),
    },
    {
      id: "find",
      label: "Find and replace in every document…",
      section: "Workspace",
      keywords: ["search", "find", "replace", "text", "grep", "everywhere"],
      detail: `${shortcut("Shift+F")}. Every match in every document, and replace them all at once.`,
      run: () => files.finder.open(),
    },
    {
      id: "check-workspace",
      label: "Check every document",
      section: "Workspace",
      keywords: ["broken", "links", "ids", "front matter", "build", "page", "all"],
      detail: "The same checks, across the whole workspace.",
      run: () => shell.checkWholeWorkspace(),
    },
    {
      id: "save",
      label: "Save",
      section: "Document",
      keywords: ["write", "commit"],
      detail: `${shortcut("S")}.`,
      available: () => ctx.isDirty(),
      run: () => void ctx.saveNow(),
    },
    ...(store?.disconnect
      ? [{
          id: "disconnect",
          label: "Disconnect from GitHub…",
          section: "GitHub" as const,
          keywords: ["token", "log out", "sign out", "forget", "logout", "security"],
          detail: "Forgets the token this browser keeps, and closes the workspace.",
          run: () => void github.disconnect(),
        }]
      : []),
    ...(store?.publish
      ? [{
          id: "publish",
          label: "Open a pull request…",
          section: "GitHub" as const,
          keywords: ["pr", "github", "review", "publish"],
          detail: "Checks every document, then opens a draft pull request under a title you choose. Shows the one already open, if there is one.",
          run: () => void github.publish(),
        }]
      : []),
  ];
}
