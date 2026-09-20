// A GitHub repository, over the REST API.
//
// Plain `fetch` rather than an SDK, because the two things that matter
// here are both protocol details an SDK would hide: the blob SHA that
// makes a write optimistic-concurrency checked, and the 409 that comes
// back when it fails. Reads a repository's markdown tree, fetches one
// file's content and SHA, writes it back as a commit on a working
// branch — never the base branch — and hands the change back as a draft
// pull request.
//
// The token lives in localStorage, scoped to this app's origin, and is
// never written to a file.

import { isImageName } from "./images.ts";

const API = "https://api.github.com";
const TOKEN_KEY = "dewnote:github-token";
const REPO_KEY = "dewnote:github-repo";

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface RepoFile {
  /** Path within the repository, e.g. "content/tutorials/foo.md". */
  path: string;
  sha: string;
}

export class GithubApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "GithubApiError";
  }
}

export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private browsing or blocked storage: the token just won't persist
    // past this page load, same tradeoff as everywhere else this app
    // touches localStorage.
  }
}

/** The owner, repo and base branch last connected to, so the second
 * session does not retype them. Never the token's neighbour in anything
 * that leaves this origin. */
export interface LastRepo {
  owner: string;
  repo: string;
  base: string;
}

export function loadLastRepo(): LastRepo | null {
  try {
    const raw = localStorage.getItem(REPO_KEY);
    return raw ? (JSON.parse(raw) as LastRepo) : null;
  } catch {
    return null;
  }
}

export function saveLastRepo(value: LastRepo): void {
  try {
    localStorage.setItem(REPO_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked. Retyping is the cost, and it is not worth failing over.
  }
}

/** A working branch nobody has to invent: dated, so a day's edits share
 * one branch and one pull request, and a new day starts a new one. */
export function suggestedBranch(today = new Date()): string {
  return `dewnote/${today.toISOString().slice(0, 10)}`;
}

export function forgetToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to do if storage is blocked; there was nothing saved.
  }
}

/** Base64, the way GitHub's Contents API wants it — built on `TextEncoder`
 * rather than the `unescape(encodeURIComponent(...))` trick, so it holds
 * up for real Unicode content (a tutorial with an em dash or a µ is not
 * an edge case here). Exported and unit-tested directly, since a broken
 * encoder here means silent corruption of every file this ever saves. */
export function toBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

/** The same encoding for bytes that were never text — an image copied in
 * beside a tutorial. Not `toBase64` with the bytes read as a string:
 * that UTF-8 encodes first, which rewrites every byte above 0x7F into
 * two and corrupts the file. Chunked because `String.fromCharCode` is
 * called with one argument per byte, and a few hundred thousand of them
 * at once overflows the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(base64: string): string {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function api(token: string, method: string, path: string, body?: unknown): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return fetch(`${API}${path}`, init);
}

/** GitHub answers with a JSON body carrying a `message`. That sentence is
 * the useful part; the envelope around it is not something to put on
 * screen. */
async function messageFrom(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message) return parsed.message;
  } catch {
    // Not JSON. Fall through to the status line.
  }
  return `${response.status} ${response.statusText}`.trim();
}

async function apiJson<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await api(token, method, path, body);
  if (!response.ok) throw new GithubApiError(response.status, await messageFrom(response));
  return response.json() as Promise<T>;
}

interface TreeEntry {
  path: string;
  type: string;
  sha: string;
}
interface TreeResponse {
  tree: TreeEntry[];
  truncated?: boolean;
}

function matchingBlobs(entries: TreeEntry[], prefix: string, matches: (path: string) => boolean): RepoFile[] {
  return entries
    .filter((entry) => entry.type === "blob")
    .map((entry) => ({ path: prefix ? `${prefix}/${entry.path}` : entry.path, sha: entry.sha }))
    .filter((file) => matches(file.path));
}

/** A repository too large for one recursive tree call to cover — GitHub
 * truncates rather than erroring — falls back to walking directory by
 * directory, each of which GitHub does not truncate on its own. Slower
 * (one call per directory instead of one call total), but this is the
 * honest fix for the gap the first version of this function had: a
 * truncated response was silently treated as complete, which for a
 * large repository means files simply never showing up in search with
 * no indication anything was missing. Takes the same `matches` predicate
 * `listMarkdownFiles` and `listOrderFiles` each pass their own suffix
 * check as, so the walk itself is written once. */
async function walkTree(repo: RepoRef, ref: string, token: string, matches: (path: string) => boolean): Promise<RepoFile[]> {
  const results: RepoFile[] = [];
  const queue: { sha: string; prefix: string }[] = [{ sha: ref, prefix: "" }];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const { sha, prefix } = next;
    const node = await apiJson<TreeResponse>(token, "GET", `/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(sha)}`);
    results.push(...matchingBlobs(node.tree, prefix, matches));
    for (const entry of node.tree) {
      if (entry.type !== "tree") continue;
      queue.push({ sha: entry.sha, prefix: prefix ? `${prefix}/${entry.path}` : entry.path });
    }
  }
  return results;
}

async function listMatchingFiles(repo: RepoRef, ref: string, token: string, matches: (path: string) => boolean): Promise<RepoFile[]> {
  const data = await apiJson<TreeResponse>(
    token,
    "GET",
    `/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
  if (!data.truncated) return matchingBlobs(data.tree, "", matches);
  return walkTree(repo, ref, token, matches);
}

export interface RepoChoice {
  owner: string;
  repo: string;
  /** The repository's own default branch, which is what a working branch
   * should be cut from. Assuming `main` is wrong for any repository that
   * never renamed `master`, and for anyone who works off `develop`. */
  defaultBranch: string;
}

interface RepoResponse {
  name: string;
  owner: { login: string };
  default_branch: string;
  permissions?: { push?: boolean };
}

/** Every repository this token can commit to, most recently pushed
 * first.
 *
 * A token says who you are, not which repository you mean — a classic
 * one reaches everything the account reaches, and a fine-grained one is
 * scoped to a set chosen when it was made, which may be one or may be
 * all. So the repository still has to be named; it just does not have to
 * be typed.
 *
 * Repositories without push permission are left out: dewnote's whole
 * purpose there is to commit, and offering one it cannot write to only
 * moves the failure later.
 *
 * Three pages at most. The list is sorted by when each was last pushed
 * to, so the one somebody wants is at the top, and an account with
 * thousands of repositories should not make the opening screen wait. */
export async function listRepositories(token: string): Promise<RepoChoice[]> {
  const found: RepoChoice[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const batch = await apiJson<RepoResponse[]>(
      token,
      "GET",
      `/user/repos?per_page=100&sort=pushed&page=${page}`,
    );
    for (const entry of batch) {
      if (entry.permissions && entry.permissions.push === false) continue;
      found.push({
        owner: entry.owner.login,
        repo: entry.name,
        defaultBranch: entry.default_branch || "main",
      });
    }
    if (batch.length < 100) break;
  }
  return found;
}

/** Every markdown file in a repository at `ref`. The common case is one
 * recursive tree call — this is the search command's own index, built
 * fresh on every "Load repository" rather than cached, since the tree is
 * cheap and staleness would be the worse trade for a tool used across an
 * afternoon of edits elsewhere. A repository large enough that GitHub
 * truncates that single response falls back to `walkTree` rather than
 * returning an incomplete list silently. */
export async function listMarkdownFiles(repo: RepoRef, ref: string, token: string): Promise<RepoFile[]> {
  return listMatchingFiles(repo, ref, token, (path) => path.endsWith(".md"));
}

/** Every image in a repository at `ref`. The editor never opens one, so
 * neither of the lists above sees them — but knowing which exist is what
 * tells an image whose file was renamed apart from one that is fine.
 * One more tree fetch, on the same reasoning as the one above. */
export async function listImageFiles(repo: RepoRef, ref: string, token: string): Promise<RepoFile[]> {
  return listMatchingFiles(repo, ref, token, isImageName);
}

/** Every module file (dewlab's own `modules/*.yaml`, modules.ts) in a
 * repository at `ref` — series-panel.ts's own source, alongside
 * `listMarkdownFiles`'s front-matter index. A second, separate tree
 * fetch rather than one call serving both lists: simpler than threading
 * a second predicate through every caller of `listMarkdownFiles`, at the
 * cost of one extra (cheap, per the same reasoning above) request when
 * both are actually needed. */
export async function listModuleFiles(repo: RepoRef, ref: string, token: string): Promise<RepoFile[]> {
  return listMatchingFiles(repo, ref, token, (path) => /(^|\/)(?:courses|modules)\/[^/]+\.yaml$/.test(path));
}

export async function getFileContent(
  repo: RepoRef,
  path: string,
  ref: string,
  token: string,
): Promise<{ content: string; sha: string }> {
  const data = await apiJson<{ content: string; sha: string }>(
    token,
    "GET",
    `/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
  );
  return { content: fromBase64(data.content), sha: data.sha };
}

/** Every file name directly inside `path` at `ref` — GitHub's own
 * directory listing, for picking an asset name that isn't already
 * taken. Distinct from `listMarkdownFiles`/`listModuleFiles`, which walk
 * the whole tree and filter to what this editor opens; a picture beside
 * a tutorial is in neither of those. */
export async function listDirectory(repo: RepoRef, path: string, ref: string, token: string): Promise<string[]> {
  const data = await apiJson<{ name: string; type: string }[]>(
    token,
    "GET",
    `/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
  );
  if (!Array.isArray(data)) return [];
  return data.filter((entry) => entry.type === "file").map((entry) => entry.name);
}

/** The same call, kept as bytes — an image, not text. `getFileContent`
 * decodes as UTF-8, which is right for every file it was written for and
 * destroys a PNG. */
export async function getFileBytes(repo: RepoRef, path: string, ref: string, token: string): Promise<Uint8Array<ArrayBuffer>> {
  const data = await apiJson<{ content: string }>(
    token,
    "GET",
    `/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
  );
  const binary = atob(data.content.replace(/\n/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function branchSha(repo: RepoRef, branch: string, token: string): Promise<string | null> {
  const response = await api(token, "GET", `/repos/${repo.owner}/${repo.repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new GithubApiError(response.status, await messageFrom(response));
  const data = (await response.json()) as { object: { sha: string } };
  return data.object.sha;
}

/** Creates `branch` from `base`'s current tip if it doesn't already
 * exist. Never writes to `base` directly: the save target is always a
 * working branch, and a draft pull request is the way to hand the result
 * back, not a silent push to `main`. */
export async function ensureBranch(repo: RepoRef, branch: string, base: string, token: string): Promise<void> {
  const existing = await branchSha(repo, branch, token);
  if (existing) return;
  const baseSha = await branchSha(repo, base, token);
  if (!baseSha) throw new GithubApiError(404, `There is no branch called "${base}" in this repository.`);
  try {
    await apiJson(token, "POST", `/repos/${repo.owner}/${repo.repo}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });
  } catch (error) {
    // "Reference already exists" — somebody else, another tab, or a
    // second press of Connect got there first. The branch being there is
    // the outcome this function wanted.
    if (error instanceof GithubApiError && error.status === 422) return;
    throw error;
  }
}

export interface PutFileResult {
  sha: string;
}

/**
 * Write `content` to `path` on `branch`.
 *
 * With `sha`, GitHub matches it against the blob already there — the
 * optimistic-concurrency check that turns "changed under you" into a 409
 * instead of a silent overwrite. Not caught here; the caller reports it.
 *
 * Without `sha`, this is a new file: GitHub creates it, or answers 422
 * if something is already there.
 */
export async function putFileContent(
  repo: RepoRef,
  path: string,
  content: string | Uint8Array,
  sha: string | undefined,
  branch: string,
  message: string,
  token: string,
): Promise<PutFileResult> {
  const body: { message: string; content: string; branch: string; sha?: string } = {
    message,
    content: typeof content === "string" ? toBase64(content) : bytesToBase64(content),
    branch,
  };
  if (sha !== undefined) body.sha = sha;
  const data = await apiJson<{ content: { sha: string } }>(token, "PUT", `/repos/${repo.owner}/${repo.repo}/contents/${path}`, body);
  return { sha: data.content.sha };
}

export interface PullRequest {
  html_url: string;
  number: number;
}

/** Opens a draft PR from `head` to `base`; if one already exists for that
 * branch pair, finds and returns it instead of failing — GitHub's own
 * 422 for "already exists" names the PR number in prose, not a field, so
 * this asks the list endpoint rather than parsing that message. */
export async function openPullRequest(
  repo: RepoRef,
  head: string,
  base: string,
  title: string,
  token: string,
): Promise<PullRequest> {
  try {
    return await apiJson<PullRequest>(token, "POST", `/repos/${repo.owner}/${repo.repo}/pulls`, {
      title,
      head,
      base,
      draft: true,
    });
  } catch (error) {
    if (!(error instanceof GithubApiError) || error.status !== 422) throw error;
    const existing = await apiJson<PullRequest[]>(
      token,
      "GET",
      `/repos/${repo.owner}/${repo.repo}/pulls?head=${encodeURIComponent(`${repo.owner}:${head}`)}&state=open`,
    );
    const [pr] = existing;
    if (!pr) throw error;
    return pr;
  }
}
