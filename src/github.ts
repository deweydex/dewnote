// The GitHub store (plan §5.5's third store, decision 5.7's token —
// step 5, previously untouched). A thin `fetch` client against the REST
// API, in FAQ's own shape (plain fetch, SHA-conflict semantics) rather
// than an SDK: read a repository's markdown tree, fetch one file's
// content and SHA, and write it back as a commit on a working branch
// (never straight to the base branch), with a draft pull request as the
// way to hand the change back. The token lives in localStorage, scoped
// to this app's origin, and is never written to a file — decision 5.7's
// own rule, carried over from FAQ and dewlab.

const API = "https://api.github.com";
const TOKEN_KEY = "dewnote:github-token";

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
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
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

async function apiJson<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await api(token, method, path, body);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GithubApiError(response.status, `${method} ${path} → ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

/** Every markdown file in a repository at `ref`, via one recursive tree
 * call rather than walking directories one fetch at a time — this is the
 * search command's own index, built fresh on every "Load repository"
 * rather than cached, since the tree is cheap and staleness would be the
 * worse trade for a tool used across an afternoon of edits elsewhere. A
 * repository large enough that GitHub truncates the tree response is a
 * real, known limitation this doesn't handle — `truncated: true` on the
 * response is silently ignored rather than paginated around. */
export async function listMarkdownFiles(repo: RepoRef, ref: string, token: string): Promise<RepoFile[]> {
  const data = await apiJson<{ tree: { path: string; type: string; sha: string }[] }>(
    token,
    "GET",
    `/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
  return data.tree.filter((entry) => entry.type === "blob" && entry.path.endsWith(".md")).map((entry) => ({ path: entry.path, sha: entry.sha }));
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

async function branchSha(repo: RepoRef, branch: string, token: string): Promise<string | null> {
  const response = await api(token, "GET", `/repos/${repo.owner}/${repo.repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new GithubApiError(response.status, `GET ref/heads/${branch} → ${response.status}`);
  const data = (await response.json()) as { object: { sha: string } };
  return data.object.sha;
}

/** Creates `branch` from `base`'s current tip if it doesn't already
 * exist. Never writes to `base` directly — decision 5.7 and the plan's
 * step 5 both put a working branch, not the default branch, as the save
 * target; a draft pull request is the honest way to hand the result
 * back, not a silent push to `main`. */
export async function ensureBranch(repo: RepoRef, branch: string, base: string, token: string): Promise<void> {
  const existing = await branchSha(repo, branch, token);
  if (existing) return;
  const baseSha = await branchSha(repo, base, token);
  if (!baseSha) throw new GithubApiError(404, `Base branch "${base}" not found`);
  await apiJson(token, "POST", `/repos/${repo.owner}/${repo.repo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  });
}

export interface PutFileResult {
  sha: string;
}

/**
 * Writes `content` to `path` on `branch`, matching `sha` — GitHub's own
 * optimistic-concurrency check, which is what turns "someone else (or a
 * second dewnote tab) changed this file since it was opened" into a
 * clear 409 rather than a silent overwrite. This function does not catch
 * that error; the caller reports it, since recovering from it (FAQ's
 * "show both, never pick") is real UI work this slice doesn't build yet.
 */
export async function putFileContent(
  repo: RepoRef,
  path: string,
  content: string,
  sha: string,
  branch: string,
  message: string,
  token: string,
): Promise<PutFileResult> {
  const data = await apiJson<{ content: { sha: string } }>(token, "PUT", `/repos/${repo.owner}/${repo.repo}/contents/${path}`, {
    message,
    content: toBase64(content),
    sha,
    branch,
  });
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
  } catch (err) {
    if (!(err instanceof GithubApiError) || err.status !== 422) throw err;
    const existing = await apiJson<PullRequest[]>(
      token,
      "GET",
      `/repos/${repo.owner}/${repo.repo}/pulls?head=${encodeURIComponent(`${repo.owner}:${head}`)}&state=open`,
    );
    const [pr] = existing;
    if (!pr) throw err;
    return pr;
  }
}
