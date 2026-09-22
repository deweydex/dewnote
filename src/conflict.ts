// A save that GitHub refused because the file changed underneath it.
//
// Both versions exist, and only the author can say which wins. The
// dialog shows what separates them, as changed lines with a little
// context, and offers the three honest answers: keep mine, take theirs,
// or decide later.

import { diffLines, hunks } from "./diff.ts";

export type ConflictChoice = "mine" | "theirs";

export interface Conflict {
  /** Resolves with the author's choice, or null if they left it. */
  resolve(path: string, theirs: string, mine: string): Promise<ConflictChoice | null>;
  destroy(): void;
}

export function mountConflict(): Conflict {
  const overlay = document.createElement("dialog");
  overlay.className = "dn-overlay dn-conflict-overlay";
  document.body.appendChild(overlay);

  let settle: ((value: ConflictChoice | null) => void) | null = null;

  function finish(value: ConflictChoice | null): void {
    const done = settle;
    settle = null;
    overlay.close();
    done?.(value);
  }

  // Escape closes the dialog without going through `finish`.
  overlay.addEventListener("close", () => {
    settle?.(null);
    settle = null;
  });

  return {
    resolve(path, theirs, mine) {
      return new Promise<ConflictChoice | null>((resolve) => {
        settle = resolve;

        const box = document.createElement("div");
        box.className = "dn-panel dn-conflict";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-label", "This file changed since you opened it");

        const heading = document.createElement("h2");
        heading.textContent = "This file changed since you opened it";
        const note = document.createElement("p");
        note.textContent =
          `${path} was saved somewhere else, probably from another tab or by someone else, ` +
          "after you opened it. Choose which version to keep. The other is lost.";

        const legend = document.createElement("p");
        legend.className = "dn-conflict-legend";
        const theirsKey = document.createElement("span");
        theirsKey.className = "dn-conflict-theirs";
        theirsKey.textContent = "Only in the saved version";
        const mineKey = document.createElement("span");
        mineKey.className = "dn-conflict-mine";
        mineKey.textContent = "Only in yours";
        legend.append(theirsKey, mineKey);

        const changes = document.createElement("div");
        changes.className = "dn-conflict-changes";
        const found = hunks(diffLines(theirs, mine));
        if (found.length === 0) {
          const same = document.createElement("p");
          same.textContent = "The two versions are the same. Either choice keeps this text.";
          changes.appendChild(same);
        }
        for (const hunk of found) {
          const block = document.createElement("div");
          block.className = "dn-conflict-hunk";
          const where = document.createElement("p");
          where.className = "dn-conflict-where";
          where.textContent = `Around line ${hunk.line}`;
          const pre = document.createElement("pre");
          for (const line of hunk.lines) {
            const row = document.createElement("span");
            row.className = `dn-conflict-${line.kind}`;
            const mark = line.kind === "theirs" ? "−" : line.kind === "mine" ? "+" : " ";
            row.textContent = `${mark} ${line.text}\n`;
            pre.appendChild(row);
          }
          block.append(where, pre);
          changes.appendChild(block);
        }

        const actions = document.createElement("div");
        actions.className = "dn-ask-actions";
        const keepMine = document.createElement("button");
        keepMine.type = "button";
        keepMine.className = "dn-ask-go";
        keepMine.textContent = "Keep mine";
        keepMine.title = "Save your version over the other one.";
        keepMine.addEventListener("click", () => finish("mine"));
        const takeTheirs = document.createElement("button");
        takeTheirs.type = "button";
        takeTheirs.textContent = "Keep the saved version";
        takeTheirs.title = "Discard your changes and open the saved version.";
        takeTheirs.addEventListener("click", () => finish("theirs"));
        const later = document.createElement("button");
        later.type = "button";
        later.textContent = "Cancel";
        later.title = "Keep your changes on screen, unsaved.";
        later.addEventListener("click", () => finish(null));
        actions.append(keepMine, takeTheirs, later);

        box.append(heading, note, legend, changes, actions);
        overlay.replaceChildren(box);
        overlay.showModal();
        keepMine.focus();
      });
    },

    destroy() {
      finish(null);
      overlay.remove();
    },
  };
}
