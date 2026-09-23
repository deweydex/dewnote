// Making a tutorial, and freezing one.
//
// Two operations that write a file rather than edit one, and both have
// rules dewlab's build enforces: an id is a folder name and a file name
// at once, and a release is two files — the old bytes frozen under their
// version, the new ones keeping the address readers already have.

import { load as parseYaml } from "js-yaml";
import { extractFrontMatter } from "./frontmatter.ts";

const VERSION_RE = /^(\d{4})\.(\d{2})\.(\d{2})\.(\d+)$/;

/** A released version is a date and a counter: `2026.03.04.1`. */
export function isReleaseVersion(version: unknown): version is string {
  return typeof version === "string" && VERSION_RE.test(version);
}
const FRONT_MATTER_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/;

/** A value YAML reads back as the string it is.
 *
 * Asked of the parser rather than guessed at: `2026.09.20.1` looks like
 * a number and is not one, `yes` looks like a word and is not one, and a
 * rule written from either intuition gets the other wrong. Quoting only
 * where it is needed keeps a file readable, which matters because a
 * person edits these by hand too. */
const YAML_1_1_WORDS = /^(y|n|yes|no|on|off|true|false|null|~)$/i;

function asYamlScalar(value: string): string {
  if (value !== value.trim() || value === "") return JSON.stringify(value);
  // js-yaml reads YAML 1.2, where `yes` is a string. dewlab's build
  // reads it with PyYAML, which is 1.1, where `yes` is a boolean. A file
  // has to survive both readers, so quote for the stricter one.
  if (YAML_1_1_WORDS.test(value)) return JSON.stringify(value);
  try {
    if (parseYaml(`v: ${value}`) instanceof Object) {
      const read = (parseYaml(`v: ${value}`) as { v: unknown }).v;
      if (read === value) return value;
    }
  } catch {
    // Not writable bare.
  }
  return JSON.stringify(value);
}

/** Set one top-level field, touching only its own line. Every other
 * byte — key order, quoting, the body — is left as it was. */
export function setFrontMatterField(source: string, key: string, value: string): string {
  const match = FRONT_MATTER_RE.exec(source);
  if (!match) return source;
  const [whole, open, body, close] = match as unknown as [string, string, string, string];
  const line = `${key}: ${asYamlScalar(value)}`;
  const lines = body.split("\n");
  const at = lines.findIndex((text) => new RegExp(`^${key}\\s*:`).test(text));
  if (at >= 0) lines[at] = line;
  else lines.push(line);
  return source.replace(whole, `${open}${lines.join("\n")}${close}`);
}

/** The same, for front matter held as its bare YAML (the editor's
 * front-matter node holds it without the `---` lines). */
export function setYamlField(yaml: string, key: string, value: string): string {
  const wrapped = setFrontMatterField(`---\n${yaml}\n---\n`, key, value);
  return wrapped.slice(4, -5);
}

/** dewlab's id rule: the folder's name and the file's name are the same
 * word, and it is what the page's address is made of. */
export function idFromTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    // After the cut, not before: a cut that lands on a hyphen would
    // otherwise leave the address ending in one.
    .replace(/^-+|-+$/g, "");
}

export interface NewTutorial {
  path: string;
  content: string;
  id: string;
}

/** A tutorial with the front matter dewlab's build expects and a first
 * cell, so the page runs the moment it opens. */
export function newTutorial(title: string, now: Date = new Date(), year = academicYear(now)): NewTutorial {
  const id = idFromTitle(title);
  const content = [
    "---",
    `title: ${asYamlScalar(title)}`,
    `year: ${JSON.stringify(year)}`,
    "status: draft",
    `version: ${nextVersion([], now)}`,
    "---",
    "",
    `# ${title}`,
    "",
    "",
    "",
    "```python exec",
    "id: cell-1",
    "",
    "```",
    "",
  ].join("\n");
  return { path: `tutorials/${id}/${id}.md`, content, id };
}

/** dewlab's `year:` is an academic year, "2026-2027", which turns over
 * in September. Only the fallback: a workspace that already has
 * tutorials says which year it is using. */
export function academicYear(now: Date = new Date()): string {
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

/** The next release on a date, counting a second one made the same day
 * rather than always assuming `.1`. */
export function nextVersion(existing: readonly (string | undefined)[], now: Date = new Date()): string {
  const stem = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join(".");
  const counters = existing.flatMap((version) => {
    const match = VERSION_RE.exec(version ?? "");
    return match && match.slice(1, 4).join(".") === stem ? [Number(match[4])] : [];
  });
  return `${stem}.${counters.length ? Math.max(...counters) + 1 : 1}`;
}

export interface PreparedRelease {
  /** The live file, which keeps its address so a reader's link and their
   * saved work both still resolve. */
  livePath: string;
  liveContent: string;
  /** The bytes as they were, under the version they were. */
  frozenPath: string;
  frozenContent: string;
  previousVersion: string;
  nextVersion: string;
}

/** dewlab's two-file release: freeze what is published as `v<old>.md`,
 * and give the edited file the new version plus `supersedes`. */
export function prepareRelease(
  path: string,
  published: string,
  edited: string,
  existingVersions: readonly (string | undefined)[],
  now: Date = new Date(),
): PreparedRelease | { error: string } {
  const match = /^tutorials\/([^/]+)\/\1\.md$/.exec(path);
  if (!match) return { error: "Only a tutorial's main file, tutorials/<id>/<id>.md, can have versions." };
  if (published === edited) return { error: "There are no changes since the published version, so there is nothing to release." };

  const publishedFields = extractFrontMatter(published).fields;
  const previous = typeof publishedFields["version"] === "string" ? publishedFields["version"] : "";
  if (!VERSION_RE.test(previous)) return { error: "The current version has no `version:` line in its front matter, so there is nothing to count on from." };

  const status = typeof publishedFields["status"] === "string" ? publishedFields["status"] : "live";
  if (status !== "live") return { error: "Only a tutorial with `status: live` can be released. A draft needs no versions: save it, and set `status: live` when it is ready." };

  const next = nextVersion([...existingVersions, previous], now);
  let released = setFrontMatterField(edited, "version", next);
  released = setFrontMatterField(released, "supersedes", previous);

  return {
    livePath: path,
    liveContent: released,
    frozenPath: `tutorials/${match[1]}/v${previous}.md`,
    frozenContent: published,
    previousVersion: previous,
    nextVersion: next,
  };
}
