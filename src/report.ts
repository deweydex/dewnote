// The list of problems, for one document or the whole workspace.
//
// One overlay for both checks. A row names the file when the report
// spans more than one, and clicking it opens that file.

import type { Problem } from "./checks.ts";

export interface Report {
  show(found: Problem[], scope: "this document" | "the workspace"): void;
  destroy(): void;
}

export function mountReport(openPath: (path: string) => void): Report {
  const overlay = document.createElement("dialog");
  overlay.className = "dn-overlay dn-report-overlay";
  // Escape, the focus trap and the background going inert are the
  // dialog's own. Clicking away is the one thing it does not give.
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.close();
  });
  document.body.appendChild(overlay);

  return {
    show(found, scope) {
      const box = document.createElement("div");
      box.className = "dn-panel dn-report";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-label", `What is wrong with ${scope}`);

      const blocking = found.filter((problem) => problem.severity === "blocking").length;

      const heading = document.createElement("h2");
      heading.textContent = found.length === 0
        ? `No problems found in ${scope}.`
        : `${found.length} problem${found.length === 1 ? "" : "s"}`;
      box.appendChild(heading);

      if (blocking > 0) {
        const note = document.createElement("p");
        note.textContent =
          blocking === found.length
            ? `${blocking === 1 ? "It stops" : "All of them stop"} the site from building.`
            : `${blocking} of them stop the site from building. The others are worth fixing but will not stop it.`;
        box.appendChild(note);
      }

      for (const problem of found) {
        const row = document.createElement(problem.path ? "button" : "div");
        row.className = `dn-report-row is-${problem.severity === "blocking" ? "blocking" : "minor"}`;

        const what = document.createElement("span");
        what.className = "dn-report-what";
        what.textContent = problem.message;
        row.appendChild(what);

        const at = [problem.path, problem.line === undefined ? null : `line ${problem.line}`]
          .filter(Boolean)
          .join(" · ");
        if (at) {
          const where = document.createElement("span");
          where.className = "dn-report-where";
          where.textContent = at;
          row.appendChild(where);
        }

        if (row instanceof HTMLButtonElement) {
          row.type = "button";
          const path = problem.path!;
          row.addEventListener("click", () => {
            overlay.close();
            openPath(path);
          });
        }
        box.appendChild(row);
      }

      overlay.replaceChildren(box);
      overlay.showModal();
      (box.querySelector<HTMLElement>("button") ?? box).focus();
    },

    destroy() {
      overlay.remove();
    },
  };
}
