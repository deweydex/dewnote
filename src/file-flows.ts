// Changing several files at once: renaming a tutorial, moving or
// deleting a document, replacing text across the workspace.
//
// Each is planned over the workspace's text (rename.ts, find.ts),
// confirmed, and applied as one change (`Store.apply`), after which the
// shell's own copies are brought into line with it.

import { idFromTitle } from "./authoring.ts";
import { applyToFiles, planDeleteFile, planDeleteTutorial, planMove, planRename, tutorialIdOf, type Plan } from "./rename.ts";
import { findAll, replaceAll } from "./find.ts";
import { mountFindPanel, type FindPanel } from "./find-panel.ts";
import { extractFrontMatter } from "./frontmatter.ts";
import { messageOf } from "./save-problem.ts";
import type { ShellContext } from "./shell-context.ts";

export interface FileFlows {
  renameTutorial(): Promise<void>;
  moveDocument(): Promise<void>;
  deleteDocument(): Promise<void>;
  readonly finder: FindPanel;
}

export function fileFlows(ctx: ShellContext): FileFlows {
  const { spine, asker } = ctx;

  /** A plan applied: the store first, as one commit where it has
   * commits, then dewnote's own copies of what moved. */
  async function carryOut(plan: Plan, message: string): Promise<boolean> {
    const store = ctx.store();
    if (!store) return false;
    try {
      await store.apply(plan.changes, message);
    } catch (error) {
      spine.setProblem({ message: messageOf(error) });
      return false;
    }
    applyToFiles(ctx.files(), plan.changes);
    const images = ctx.images();
    for (const change of plan.changes) {
      if (change.kind === "remove") images.delete(change.path);
      if (change.kind === "move" && images.delete(change.from)) images.add(change.to);
    }
    const opened = ctx.opened();
    for (const [from, to] of plan.moves) {
      if (opened.has(from)) opened.set(to, opened.get(from)!);
      opened.delete(from);
    }
    for (const change of plan.changes) {
      if (change.kind === "remove") void ctx.dropDraftOf(change.path);
    }
    ctx.followMoves(plan.moves);
    ctx.reindex();
    return true;
  }

  const finder = mountFindPanel({
    search: (query, options) => findAll(ctx.files(), query, options),
    open: (path) => void ctx.openPath(path),
    async replace(query, replacement, options) {
      if (!ctx.store()) return null;
      // The open document's unsaved edits are not in `files`, and a
      // replacement written over them would lose them.
      if (!(await ctx.readyToLeave())) return null;
      const { changes, count } = replaceAll(ctx.files(), query, replacement, options);
      if (changes.length === 0) return 0;
      const plan: Plan = { changes, summary: [], moves: new Map() };
      if (!(await carryOut(plan, `Replace "${query}" with "${replacement}"`))) return null;
      spine.setProblem(null);
      const open = ctx.open();
      if (open && changes.some((change) => change.kind === "write" && change.path === open.path)) {
        await ctx.showPath(open.path);
      }
      return count;
    },
  });

  return {
    finder,

    /** A tutorial's id changed: its folder, its files, and everything
     * that names it. Asks for the new id, then shows what will change. */
    async renameTutorial() {
      const store = ctx.store();
      const open = ctx.open();
      if (!store || !open) return;
      const from = tutorialIdOf(open.path);
      if (!from) return;
      if (!(await ctx.readyToLeave())) return;
      const files = ctx.files();
      const content = files.get(open.path) ?? "";
      const title = extractFrontMatter(content).fields["title"];
      const suggested = typeof title === "string" && idFromTitle(title) !== from ? idFromTitle(title) : from;
      const answer = await asker.ask("Rename this tutorial", {
        label: "New id. It names the tutorial's folder and files, and it is the page's web address.",
        value: suggested,
        confirm: "Next",
      });
      if (!answer) return;
      const to = answer.trim();
      const plan = planRename({ files, folderNames: await store.listFolder(`tutorials/${from}`), from, to });
      if ("error" in plan) {
        spine.setProblem({ message: plan.error });
        return;
      }
      const draft = extractFrontMatter(content).fields["status"] === "draft";
      const going = await asker.choose(
        `Rename ${from} to ${to}`,
        [
          { value: "go", label: "Rename", note: plan.summary.join(" ") },
          { value: "stay", label: "Keep the old id" },
        ],
        draft
          ? "It is a draft, so no reader has it yet."
          : "Old links keep working. Readers' saved answers are kept under the old id, so anyone part-way through it starts again.",
      );
      if (going !== "go") return;
      if (!(await carryOut(plan, `Rename ${from} to ${to}`))) return;
      spine.setProblem(null);
      await ctx.showPath(plan.moves.get(open.path) ?? open.path);
    },

    /** A page outside tutorials/ to another path. */
    async moveDocument() {
      const open = ctx.open();
      if (!ctx.store() || !open) return;
      if (!(await ctx.readyToLeave())) return;
      const from = open.path;
      const to = await asker.ask("Move or rename this file", {
        label: "New path, from the top of the workspace.",
        value: from,
        confirm: "Move",
      });
      if (!to) return;
      const plan = planMove(ctx.files(), from, to);
      if ("error" in plan) {
        spine.setProblem({ message: plan.error });
        return;
      }
      if (!(await carryOut(plan, `Move ${from} to ${plan.moves.get(from)}`))) return;
      spine.setProblem(null);
      await ctx.showPath(plan.moves.get(from)!);
    },

    /** The open document gone: a tutorial with its whole folder,
     * anything else on its own. Refused while anything still points at
     * it. */
    async deleteDocument() {
      const store = ctx.store();
      const open = ctx.open();
      if (!store || !open) return;
      const files = ctx.files();
      const path = open.path;
      const id = tutorialIdOf(path);
      const folder = path.split("/").slice(0, -1).join("/");
      const names = folder ? await store.listFolder(folder) : [];
      const plan = id
        ? planDeleteTutorial({ files, folderNames: names, id })
        : planDeleteFile(files, names, path);
      if ("error" in plan) {
        spine.setProblem({ message: plan.error });
        return;
      }
      const status = extractFrontMatter(files.get(path) ?? "").fields["status"];
      const notes = [
        id && status !== "draft" && status !== "archived"
          ? "It is published, so readers' links to it stop working. Setting its status to archived keeps them working instead."
          : "",
        ctx.isDirty() ? "Its unsaved changes go with it." : "",
        store.kind === "repo" ? "It stays in the repository's history." : "A folder keeps no copy.",
      ].filter(Boolean);
      const going = await asker.choose(
        id ? `Delete the tutorial ${id}` : `Delete ${path}`,
        [
          { value: "go", label: "Delete", note: plan.summary.join(" ") },
          { value: "stay", label: "Keep it" },
        ],
        notes.join(" "),
      );
      if (going !== "go") return;
      if (!(await carryOut(plan, id ? `Delete ${id}` : `Delete ${path}`))) return;
      spine.setProblem(null);
      ctx.closeDocument();
    },
  };
}
