// Making things dewlab builds: a tutorial, its practice page, its place
// in a series, a release.
//
// Each is a question or two, a write, and the shell told what changed.
// The rules for what is written are in authoring.ts and placement.ts;
// this is the asking and the writing.

import { newPracticePage, newTutorial, prepareRelease } from "./authoring.ts";
import { addToSeries, placementsOf, removeFromSeries } from "./placement.ts";
import { extractFrontMatter } from "./frontmatter.ts";
import { messageOf } from "./save-problem.ts";
import type { ShellContext } from "./shell-context.ts";

export interface AuthoringFlows {
  createTutorial(): Promise<void>;
  createPracticePage(): Promise<void>;
  /** The open document's id, when it has one a course can list. */
  openTutorialId(): string | undefined;
  placeTutorial(mode: "add" | "remove"): Promise<void>;
  releaseVersion(): Promise<void>;
}

export function authoringFlows(ctx: ShellContext): AuthoringFlows {
  const { spine, asker } = ctx;

  /** A file written and opened: a new tutorial or a practice page. */
  async function writeAndOpen(path: string, content: string): Promise<void> {
    const store = ctx.store();
    if (!store) return;
    try {
      await store.write(path, content, `Add ${path}`);
    } catch (error) {
      spine.setProblem({ message: messageOf(error) });
      return;
    }
    ctx.files().set(path, content);
    ctx.reindex();
    await ctx.showPath(path);
  }

  /** The `year:` most tutorials in the workspace carry, which is the one
   * a new tutorial belongs with. Undefined when none has one. */
  function workspaceYear(): string | undefined {
    const counts = new Map<string, number>();
    for (const [path, content] of ctx.files()) {
      if (!/^tutorials\/[^/]+\/[^/]+\.md$/.test(path)) continue;
      const year = extractFrontMatter(content).fields["year"];
      if (year === undefined || year === null) continue;
      counts.set(String(year), (counts.get(String(year)) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  function openTutorialId(): string | undefined {
    const open = ctx.open();
    return open ? ctx.index().find((entry) => entry.path === open.path)?.id : undefined;
  }

  return {
    openTutorialId,

    /** A new tutorial, written and opened. A draft, because a
     * half-written page should never be served. */
    async createTutorial() {
      if (!ctx.store()) return;
      if (!(await ctx.readyToLeave())) return;
      const title = await asker.ask("New tutorial", {
        label: "Title. It also makes the tutorial's id: the name of its folder and its web address.",
        confirm: "Create tutorial",
      });
      if (!title) return;
      const made = newTutorial(title, new Date(), workspaceYear());
      if (ctx.files().has(made.path)) {
        spine.setProblem({ message: `There is already a tutorial at ${made.path}.` });
        return;
      }
      await writeAndOpen(made.path, made.content);
    },

    /** A practice page beside the open tutorial, written and opened. */
    async createPracticePage() {
      const open = ctx.open();
      if (!ctx.store() || !open) return;
      if (!(await ctx.readyToLeave())) return;
      const made = newPracticePage(open.path, ctx.files().get(open.path) ?? "");
      if ("error" in made) {
        spine.setProblem({ message: made.error });
        return;
      }
      if (ctx.files().has(made.path)) {
        await ctx.showPath(made.path);
        return;
      }
      await writeAndOpen(made.path, made.content);
    },

    /** Which series lists the open tutorial, and putting it in one or
     * taking it out. Only the course file changes. */
    async placeTutorial(mode) {
      const store = ctx.store();
      if (!store || !ctx.open()) return;
      const id = openTutorialId();
      if (!id) {
        spine.setProblem({ message: "This file is not a tutorial, so it cannot be added to a series." });
        return;
      }
      const modules = ctx.modules();

      const already = placementsOf(id, modules);
      const choices = modules.flatMap((module) =>
        module.contents
          .filter((series) => series.tutorials.includes(id) === (mode === "remove"))
          .map((series) => ({
            value: `${module.id}\u0000${series.title}`,
            label: `${module.title ?? module.id} › ${series.title}`,
            note: `${series.tutorials.length} tutorial${series.tutorials.length === 1 ? "" : "s"}`,
          })),
      );

      const picked = await asker.choose(
        mode === "add" ? "Add this tutorial to a series" : "Remove this tutorial from a series",
        choices,
        already.length === 0
          ? "It is not in any series yet, so readers cannot reach it from a course."
          : `It is in ${already.map((where) => `${where.courseTitle} › ${where.seriesTitle}`).join(", ")}.`,
      );
      if (!picked) return;

      const [courseId, seriesTitle] = picked.split("\u0000") as [string, string];
      const module = modules.find((each) => each.id === courseId);
      const series = module?.contents.find((each) => each.title === seriesTitle);
      if (!module || !series) return;

      const content = ctx.files().get(module.path);
      if (content === undefined) return;

      const changed = series.tutorials.includes(id)
        ? removeFromSeries(content, series, id)
        : addToSeries(content, series, id);
      if (typeof changed !== "string") {
        spine.setProblem({ message: changed.error });
        return;
      }

      try {
        await store.write(
          module.path,
          changed,
          mode === "add" ? `Add ${id} to ${series.title}` : `Remove ${id} from ${series.title}`,
        );
      } catch (error) {
        spine.setProblem({ message: messageOf(error) });
        return;
      }
      ctx.files().set(module.path, changed);
      ctx.reindex();
      ctx.refreshSpine();
    },

    /** dewlab's two-file release: the published bytes are frozen under
     * their own version, and what is open keeps the address readers
     * have. */
    async releaseVersion() {
      const store = ctx.store();
      const open = ctx.open();
      if (!store || !open) return;
      let published: string | null | undefined;
      try {
        published = store.readPublished
          ? await store.readPublished(open.path)
          : ctx.opened().get(open.path);
      } catch (error) {
        spine.setProblem({ message: `Could not read the published version: ${messageOf(error)}` });
        return;
      }
      if (published === null || published === undefined) {
        spine.setProblem({
          message: store.readPublished
            ? "This tutorial is not on the main branch yet, so there is no published version to keep. Merge it first, then release new versions of it."
            : "This tutorial is new since the folder was opened, so there is no published version to keep.",
        });
        return;
      }
      const folder = open.path.split("/").slice(0, -1).join("/");
      const versions = ctx.index()
        .filter((entry) => entry.path.startsWith(folder))
        .map((entry) => entry.version);
      const made = prepareRelease(open.path, published, open.document.markdown(), versions);
      if ("error" in made) {
        spine.setProblem({ message: made.error });
        return;
      }
      const going = await asker.ask(`Release a new version`, {
        label:
          `The current version, ${made.previousVersion}, is copied unchanged to ${made.frozenPath}. ` +
          `Your edits become the new version, below. Readers' links and saved work keep working.`,
        value: made.nextVersion,
        confirm: "Release",
      });
      if (!going) return;
      try {
        await store.write(made.frozenPath, made.frozenContent, `Freeze ${made.previousVersion}`);
        await store.write(made.livePath, made.liveContent, `Release ${made.nextVersion}`);
      } catch (error) {
        spine.setProblem({ message: messageOf(error) });
        return;
      }
      ctx.files().set(made.frozenPath, made.frozenContent);
      ctx.files().set(made.livePath, made.liveContent);
      await ctx.dropDraftOf(made.livePath);
      if (!store.readPublished) {
        // In a folder, what was just written is what readers now get, and
        // a second release counts on from it.
        ctx.opened().set(made.frozenPath, made.frozenContent);
        ctx.opened().set(made.livePath, made.liveContent);
      }
      ctx.reindex();
      await ctx.showPath(made.livePath);
    },
  };
}
