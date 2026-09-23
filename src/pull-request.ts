// What a pull request says about itself.
//
// Every save is a commit, so a working branch after an afternoon is
// thirty commits named `Edit <path>`. Nobody reviews those one by one;
// they review the pull request, and a squash merge turns it into one
// commit named by its title. So the title and description are where the
// naming happens, and dewnote suggests both from what the branch
// changes. Pure, over what the store says the branch changed.

import { extractFrontMatter } from "./frontmatter.ts";
import { tutorialIdOf } from "./rename.ts";

export interface BranchChange {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  /** Where a renamed file was before. */
  previous?: string;
}

const VERB: Record<BranchChange["status"], string> = {
  added: "Add",
  modified: "Edit",
  removed: "Delete",
  renamed: "Move",
};

const HEADING: Record<BranchChange["status"], string> = {
  added: "Added",
  modified: "Edited",
  removed: "Deleted",
  renamed: "Moved",
};

/** A document's title, from the text dewnote holds, or its file name. */
export function titleFrom(path: string, content: string | undefined): string {
  const title = content === undefined ? undefined : extractFrontMatter(content).fields["title"];
  if (typeof title === "string" && title.trim()) return title.trim();
  return path.split("/").pop()!.replace(/\.md$/, "");
}

const isDocument = (change: BranchChange) => change.path.endsWith(".md");

/** One line a reviewer can read: what changed, named by the document
 * that matters most. A tutorial's own file comes first, since a
 * practice page or a course list usually changes because of it. */
export function suggestTitle(changes: readonly BranchChange[], titleOf: (path: string) => string): string {
  const documents = changes.filter(isDocument);
  if (documents.length === 0) {
    return changes.some((change) => /(^|\/)courses\//.test(change.path))
      ? "Update course lists"
      : `Update ${changes.length} file${changes.length === 1 ? "" : "s"}`;
  }
  const lead = documents.find((change) => tutorialIdOf(change.path)) ?? documents[0]!;
  const statuses = new Set(documents.map((change) => change.status));
  const verb = statuses.size === 1 ? VERB[lead.status] : "Change";
  const others = documents.length - 1;
  return `${verb} "${titleOf(lead.path)}"` +
    (others === 0 ? "" : ` and ${others} other document${others === 1 ? "" : "s"}`);
}

/** The description: every file the branch changes, grouped by what
 * happened to it, documents by title. */
export function describeChanges(changes: readonly BranchChange[], titleOf: (path: string) => string): string {
  const lines = ["Made in dewnote.", ""];
  for (const status of ["added", "modified", "renamed", "removed"] as const) {
    const here = changes.filter((change) => change.status === status && isDocument(change));
    if (here.length === 0) continue;
    lines.push(`**${HEADING[status]}**`, "");
    for (const change of here) {
      const from = change.previous ? ` (was \`${change.previous}\`)` : "";
      lines.push(`- ${titleOf(change.path)}: \`${change.path}\`${from}`);
    }
    lines.push("");
  }
  const other = changes.filter((change) => !isDocument(change));
  if (other.length > 0) {
    lines.push("**Other files**", "");
    for (const change of other) lines.push(`- \`${change.path}\` (${change.status})`);
    lines.push("");
  }
  lines.push("Every save in dewnote is its own commit. **Squash and merge** keeps these as one commit, named by this pull request's title.");
  return lines.join("\n");
}
