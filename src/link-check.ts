// Step 5's own "link checking against real slugs" (PLAN.md §6 step 5),
// and DIALECTS.md §1's "The editor should offer a picker over real slugs
// and anchors and check links on save." link-picker.ts is the picker
// half, already built; this is the checking half — reading every
// `tutorial:slug` link already in the document and reporting any whose
// slug isn't in the current file index, the same index link-picker.ts
// itself searches.
//
// Anchor checking (DIALECTS.md's own "a dead slug or anchor fails the
// build") is deliberately not attempted here: a slug's anchors are the
// headings of some *other* document, which the index (file-index.ts)
// never reads — only front matter, for the same "stays fast on a large
// folder" reason link-picker.ts's own search already depends on.
// Checking anchors for real would mean reading and parsing every linked
// file's body, a materially bigger piece of work than comparing a slug
// against a list already sitting in memory, and is left for later
// rather than folded in here.
//
// "Check on save" — DIALECTS.md's own suggested trigger — isn't wired
// up either: that would mean this module reaching into file-bar.ts's,
// folder-panel.ts's, and repo-panel.ts's separate save paths, three
// places that don't otherwise know this exists. A manual check, the
// same "closed until asked" shape every other panel here already has,
// covers the same need without that coupling; wiring it to fire
// automatically on save is a follow-up, not a cut corner.

import { distinctValues, type FileIndexEntry } from "./file-index.ts";
import { iconRail } from "./icon-rail.ts";

export type LinkKind = "tutorial" | "module" | "series";

export interface BrokenLink {
  kind: LinkKind;
  /** The name after the colon — a slug for `tutorial:`, a module or
   * series name for the other two. */
  target: string;
  /** The link's own visible text, so a report can name which link is
   * broken rather than only which target. */
  text: string;
}

const LINK_RE = /\[([^\]]*)\]\((tutorial|module|series):([^)#\s]+)(?:#[^)]*)?\)/g;

/** Every `tutorial:slug`, `module:name`, or `series:name` link in `source`
 * whose target matches nothing in `index` — a link to a document, module,
 * or series that doesn't exist, or hasn't been indexed yet (an unopened
 * folder or repository leaves `index` empty, which reports every such
 * link as broken; the caller already knows this, the same way
 * link-picker.ts's own empty-index case is a real, expected state rather
 * than an error). `module:`/`series:` are checked against
 * `distinctValues`, the same set link-picker.ts's own picker offers —
 * there is no single file a module or series "is," only tutorials that
 * name it. */
export function findBrokenLinks(source: string, index: FileIndexEntry[]): BrokenLink[] {
  const known: Record<LinkKind, Set<string>> = {
    tutorial: new Set(index.flatMap((entry) => (entry.slug ? [entry.slug] : []))),
    module: new Set(distinctValues(index, "module")),
    series: new Set(distinctValues(index, "series")),
  };
  const broken: BrokenLink[] = [];
  for (const match of source.matchAll(LINK_RE)) {
    const [, text, kind, target] = match as unknown as [string, string, LinkKind, string];
    if (!known[kind].has(target)) broken.push({ kind, target, text });
  }
  return broken;
}

export interface LinkCheckHost {
  getSource(): string;
  getFileIndex(): FileIndexEntry[];
}

export interface LinkCheckPanel {
  destroy(): void;
}

/** Mounted once, independently of any particular document — the same
 * shape dialect-panel.ts's own report list already has, reused here
 * rather than invented a second way to show "here's what didn't check
 * out." */
export function mountLinkCheckPanel(host: LinkCheckHost): LinkCheckPanel {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "dn-linkcheck-toggle";
  toggle.setAttribute("aria-label", "Check links");
  toggle.setAttribute("aria-expanded", "false");
  toggle.title = "Check links";
  toggle.textContent = "🔗";

  const panel = document.createElement("div");
  panel.className = "dn-linkcheck-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", "Check links");
  panel.hidden = true;
  toggle.setAttribute("aria-controls", (panel.id = "dn-linkcheck-panel"));

  const header = document.createElement("div");
  header.className = "dn-linkcheck-header";
  const heading = document.createElement("h2");
  heading.textContent = "Check links";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "dn-linkcheck-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  });
  header.append(heading, closeButton);
  panel.appendChild(header);

  const hint = document.createElement("p");
  hint.className = "dn-linkcheck-hint";
  hint.textContent = "Checks every tutorial:, module:, and series: link against the open folder or repository's own index.";
  panel.appendChild(hint);

  const checkButton = document.createElement("button");
  checkButton.type = "button";
  checkButton.className = "dn-linkcheck-run";
  checkButton.textContent = "Check links";
  panel.appendChild(checkButton);

  const report = document.createElement("ul");
  report.className = "dn-linkcheck-report";
  panel.appendChild(report);

  checkButton.addEventListener("click", () => {
    const broken = findBrokenLinks(host.getSource(), host.getFileIndex());
    report.replaceChildren();
    if (broken.length === 0) {
      const item = document.createElement("li");
      item.className = "dn-linkcheck-report-clean";
      item.textContent = "No broken links found.";
      report.appendChild(item);
    } else {
      for (const link of broken) {
        const item = document.createElement("li");
        const noun = link.kind === "tutorial" ? "document with this slug" : `${link.kind} with this name`;
        item.textContent = `"${link.text}" → ${link.kind}:${link.target} — no ${noun} in the index`;
        report.appendChild(item);
      }
    }
  });

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });

  iconRail().appendChild(toggle);
  document.body.appendChild(panel);

  return {
    destroy() {
      toggle.remove();
      panel.remove();
    },
  };
}
