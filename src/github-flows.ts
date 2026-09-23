// What only a repository workspace does: open a pull request, and
// forget the token.

import { checkWorkspace } from "./checks.ts";
import { describeChanges, suggestTitle, titleFrom } from "./pull-request.ts";
import { messageOf } from "./save-problem.ts";
import type { ShellContext } from "./shell-context.ts";

export interface GithubFlows {
  publish(): Promise<void>;
  disconnect(): Promise<void>;
}

export function githubFlows(ctx: ShellContext): GithubFlows {
  const { spine, asker } = ctx;

  return {
    /** A draft pull request for the working branch, named by the author.
     * Anything blocking in the workspace stops the build once it is
     * merged, so it is said first, but not enforced: a pull request on
     * unfinished work is reasonable, and a reviewer is the point of one. */
    async publish() {
      const store = ctx.store();
      if (!store?.publish) return;
      if (ctx.isDirty()) {
        const choice = await asker.choose(
          "This document has unsaved changes",
          [
            { value: "save", label: "Save them first", note: "They go into the pull request." },
            { value: "leave", label: "Leave them out", note: "They stay on screen, unsaved." },
          ],
        );
        if (choice === null) return;
        if (choice === "save" && !(await ctx.saveNow())) return;
      }

      const files = ctx.files();
      const all = [...files].map(([path, content]) => ({ path, content }));
      const blocking = checkWorkspace(all, ctx.around())
        .filter((problem) => problem.severity === "blocking");

      if (blocking.length > 0) {
        const going = await asker.choose(
          `${blocking.length} problem${blocking.length === 1 ? "" : "s"} in this workspace would stop the site building`,
          [
            { value: "look", label: "Show the problems", note: "The same list Check every document shows." },
            { value: "go", label: "Open the pull request anyway", note: "Reviewers will see the problems too." },
          ],
          blocking[0]!.message,
        );
        if (going === null) return;
        if (going === "look") {
          ctx.checkWholeWorkspace();
          return;
        }
      }

      try {
        const existing = await store.existingPullRequest?.();
        if (existing) {
          spine.setProblem(null);
          window.open(existing, "_blank", "noopener");
          return;
        }
        const changes = (await store.branchChanges?.()) ?? [];
        if (changes.length === 0) {
          spine.setProblem({
            message: "There is nothing to review yet: the working branch has no changes the main branch does not. Save something first.",
          });
          return;
        }
        const titleOf = (path: string) => titleFrom(path, files.get(path) ?? ctx.opened().get(path));
        const title = await asker.ask("Open a pull request", {
          label:
            `Title, for the reviewer. ${changes.length} file${changes.length === 1 ? "" : "s"} changed; ` +
            "the description lists them.",
          value: suggestTitle(changes, titleOf),
          confirm: "Open pull request",
        });
        if (!title) return;
        const url = await store.publish(title, describeChanges(changes, titleOf));
        spine.setProblem(null);
        window.open(url, "_blank", "noopener");
      } catch (error) {
        spine.setProblem({ message: `The pull request was not opened: ${messageOf(error)}` });
      }
    },

    /** Forgets the GitHub token this browser keeps, and closes the
     * workspace by reloading, which is the only way to be sure nothing
     * holds it in memory either. */
    async disconnect() {
      const store = ctx.store();
      if (!store?.disconnect) return;
      if (!(await ctx.readyToLeave())) return;
      const going = await asker.choose(
        "Disconnect from GitHub",
        [
          { value: "go", label: "Forget the token and disconnect", note: "Connecting again needs the token." },
          { value: "stay", label: "Stay connected" },
        ],
        "dewnote keeps your GitHub token in this browser so you do not paste it each time. " +
          "Disconnect on a shared or borrowed computer. The token itself still works until you delete it on GitHub.",
      );
      if (going !== "go") return;
      store.disconnect();
      ctx.reload();
    },
  };
}
