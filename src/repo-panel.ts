// The repository rail — step 5's first slice: browse a real GitHub
// repository's markdown (dewlab's tutorials and practice pages, by
// default any repo the token can reach), search it by path, open one
// into the editor, and push an edit back as a commit on a working
// branch with a draft PR to hand it back — never a silent push to the
// base branch. Mounted the same quiet, independent way settings-panel.ts
// and file-bar.ts are; this is the plan's own "left rail for files"
// (§5.3), closed until asked.
//
// A push that lands on a 409 (someone — another dewnote tab, or a commit
// made straight on GitHub — changed the file on this branch since it was
// opened) shows both versions rather than picking one, FAQ's own rule:
// the reader chooses to keep their edit and overwrite, or take the
// remote copy and lose theirs, but nothing is ever silently clobbered.
//
// Decision 32's own slice: a document composed in dewnote from nothing
// (the starter document, or anything typed fresh) had no way into a
// repository at all before this — every push here used to require
// `opened` to already carry a real file's own sha, which only existed
// because some earlier `openRepoFile` had fetched it. "New file" sets
// `opened` to a path with no sha instead, and `putFileContent` treats
// that as GitHub's own create-not-update case.
//
// What this slice still does not do, on purpose rather than by
// oversight: no front-matter index or module/series picker (decision 11
// — needs step 4's fuller multi-file concept); no OPFS or local-clone
// mode, only the REST API.

import {
  ensureBranch,
  forgetToken,
  getFileContent,
  GithubApiError,
  listMarkdownFiles,
  listOrderFiles,
  loadToken,
  openPullRequest,
  putFileContent,
  saveToken,
  type RepoFile,
  type RepoRef,
} from "./github.ts";
import { buildFileIndex, type FileIndexEntry } from "./file-index.ts";
import { parseSeriesFiles, type Series } from "./series.ts";
import { setActiveStore } from "./active-store.ts";
import { iconRail } from "./icon-rail.ts";

export interface RepoPanelHost {
  getSource(): string;
  loadDocument(source: string, name: string): void;
  /** §5.10's own front-matter index, handed the same list every time
   * loadRepoFiles rebuilds it — optional, since a caller with no link
   * picker (a test host, say) has nothing to do with it. */
  onIndexChange?(index: FileIndexEntry[]): void;
  /** series.ts's own read of every `.order.yaml` file in the repository,
   * handed the same way, for series-panel.ts. */
  onSeriesChange?(series: Series[]): void;
}

export interface RepoPanel {
  destroy(): void;
}

const REPO_STORAGE_KEY = "dewnote:github-repo";

interface SavedRepoSettings {
  owner: string;
  repo: string;
  base: string;
  branch: string;
}

function loadRepoSettings(): SavedRepoSettings {
  try {
    const raw = localStorage.getItem(REPO_STORAGE_KEY);
    if (raw) return { base: "main", branch: "dewnote-edits", ...JSON.parse(raw) };
  } catch {
    // fall through to defaults
  }
  return { owner: "", repo: "", base: "main", branch: "dewnote-edits" };
}

function saveRepoSettings(settings: SavedRepoSettings): void {
  try {
    localStorage.setItem(REPO_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not persisted this session; the fields just start blank next time.
  }
}

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "dn-repo-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

function textInput(placeholder: string, value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.value = value;
  input.autocomplete = "off";
  input.spellcheck = false;
  return input;
}

/** Mounted once, independently of any particular document. */
export function mountRepoPanel(host: RepoPanelHost): RepoPanel {
  const settings = loadRepoSettings();
  let files: RepoFile[] = [];
  /** `file.sha` is only absent for a document `startNewFile` just pointed
   * at a path with nothing there yet (decision 32) — every other path
   * here (`openRepoFile`, a conflict's own keep/take) always has a real
   * sha, since it came from a file GitHub already told us about. */
  let opened: { repo: RepoRef; file: { path: string; sha?: string }; ref: string } | null = null;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "dn-repo-toggle";
  toggle.setAttribute("aria-label", "Repository");
  toggle.setAttribute("aria-expanded", "false");
  toggle.title = "Repository";
  toggle.textContent = "⌂";

  const panel = document.createElement("div");
  panel.className = "dn-repo-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", "Repository");
  panel.hidden = true;
  toggle.setAttribute("aria-controls", (panel.id = "dn-repo-panel"));

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });

  const header = document.createElement("div");
  header.className = "dn-repo-header";
  const heading = document.createElement("h2");
  heading.textContent = "Repository";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "dn-repo-close";
  closeButton.setAttribute("aria-label", "Close repository panel");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  });
  header.append(heading, closeButton);
  panel.appendChild(header);

  // ------------------------------------------------------------- token
  const tokenSection = document.createElement("section");
  tokenSection.className = "dn-repo-section";
  const tokenInput = document.createElement("input");
  tokenInput.type = "password";
  tokenInput.placeholder = "GitHub token";
  tokenInput.autocomplete = "off";
  tokenInput.value = loadToken() ?? "";
  const forgetButton = document.createElement("button");
  forgetButton.type = "button";
  forgetButton.className = "dn-repo-forget";
  forgetButton.textContent = "Forget";
  forgetButton.title = "Removes the saved token from this browser.";
  forgetButton.addEventListener("click", () => {
    forgetToken();
    tokenInput.value = "";
  });
  tokenInput.addEventListener("change", () => saveToken(tokenInput.value.trim()));
  const tokenRow = document.createElement("div");
  tokenRow.className = "dn-repo-token-row";
  tokenRow.append(tokenInput, forgetButton);
  tokenSection.appendChild(field("Token", tokenRow));
  tokenSection.appendChild(
    (() => {
      const p = document.createElement("p");
      p.className = "dn-repo-hint";
      p.textContent = "A fine-grained personal access token, scoped to contents and pull requests. Kept in this browser only.";
      return p;
    })(),
  );
  panel.appendChild(tokenSection);

  // -------------------------------------------------------- repository
  const repoSection = document.createElement("section");
  repoSection.className = "dn-repo-section";
  const ownerInput = textInput("owner", settings.owner);
  const repoInput = textInput("repo", settings.repo);
  const baseInput = textInput("main", settings.base);
  const ownerRepoRow = document.createElement("div");
  ownerRepoRow.className = "dn-repo-owner-row";
  ownerRepoRow.append(ownerInput, repoInput);
  repoSection.appendChild(field("Owner / repo", ownerRepoRow));
  repoSection.appendChild(field("Base branch", baseInput));

  const loadButton = document.createElement("button");
  loadButton.type = "button";
  loadButton.className = "dn-repo-load";
  loadButton.textContent = "Load files";
  repoSection.appendChild(loadButton);

  const repoStatus = document.createElement("p");
  repoStatus.className = "dn-repo-hint dn-repo-status";
  repoSection.appendChild(repoStatus);
  panel.appendChild(repoSection);

  // -------------------------------------------------------- search
  const searchSection = document.createElement("section");
  searchSection.className = "dn-repo-section";
  const searchInput = textInput("Search files…", "");
  searchInput.className = "dn-repo-search";
  searchSection.appendChild(searchInput);

  const fileList = document.createElement("ul");
  fileList.className = "dn-repo-files";
  searchSection.appendChild(fileList);
  panel.appendChild(searchSection);

  // ----------------------------------------------------------- new file
  // Decision 32: the counterpart to opening one of the files listed
  // above. Doesn't touch the editor's own content (host.getSource() at
  // push time is whatever the reader already composed, starter document
  // or not) — this only decides where a push, whenever it happens, lands.
  const newFileSection = document.createElement("section");
  newFileSection.className = "dn-repo-section";
  const newFileInput = textInput("tutorials/module/new-tutorial.md", "");
  newFileInput.className = "dn-repo-new-file-path";
  newFileSection.appendChild(field("New file path", newFileInput));

  const newFileButton = document.createElement("button");
  newFileButton.type = "button";
  newFileButton.className = "dn-repo-new-file";
  newFileButton.textContent = "Start new file";
  newFileButton.title = "Points a later push at this path instead of an existing file — nothing is created until you push.";
  newFileSection.appendChild(newFileButton);
  panel.appendChild(newFileSection);

  newFileButton.addEventListener("click", () => {
    const repo = currentRepo();
    if (!repo.owner || !repo.repo) {
      repoStatus.textContent = "Enter an owner and repo.";
      return;
    }
    const path = newFileInput.value.trim();
    if (!path) {
      repoStatus.textContent = "Enter a path for the new file.";
      return;
    }
    const ref = baseInput.value.trim() || "main";
    opened = { repo, file: { path }, ref };
    hideConflict();
    renderPush();
    repoStatus.textContent = `Ready to push a new file at ${path}.`;
  });

  function currentRepo(): RepoRef {
    return { owner: ownerInput.value.trim(), repo: repoInput.value.trim() };
  }

  function currentToken(): string | null {
    const token = tokenInput.value.trim();
    return token.length > 0 ? token : null;
  }

  function renderFiles() {
    const query = searchInput.value.trim().toLowerCase();
    const matches = query ? files.filter((f) => f.path.toLowerCase().includes(query)) : files;
    fileList.replaceChildren();
    for (const file of matches.slice(0, 300)) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dn-repo-file";
      button.textContent = file.path;
      button.addEventListener("click", () => openRepoFile(file));
      item.appendChild(button);
      fileList.appendChild(item);
    }
    if (files.length > 0 && matches.length === 0) {
      const empty = document.createElement("li");
      empty.className = "dn-repo-empty";
      empty.textContent = "No files match.";
      fileList.appendChild(empty);
    }
  }
  searchInput.addEventListener("input", renderFiles);

  /** §5.10's own index, over the repository this time — one
   * getFileContent per markdown file, the only way to read front matter
   * through the REST API at all (there is no "just the first few lines"
   * endpoint). A real cost for a large repository, same as
   * folder-panel.ts's own version of this, and the same "one file's
   * failure doesn't fail the rest" handling. Takes `markdownFiles`
   * explicitly rather than reading the shared `files` — that list also
   * carries `.order.yaml` files now (loadRepoFiles's own comment
   * explains why), and an order file has no front matter worth indexing
   * at all, so fetching its content again here would spend a real API
   * call on a bare `{path}` entry. */
  async function refreshIndex(repo: RepoRef, ref: string, token: string, markdownFiles: RepoFile[]) {
    if (!host.onIndexChange) return;
    const entries = await Promise.all(
      markdownFiles.map(async (file) => {
        try {
          const { content } = await getFileContent(repo, file.path, ref, token);
          return { path: file.path, content };
        } catch {
          return null;
        }
      }),
    );
    host.onIndexChange(buildFileIndex(entries.filter((e): e is { path: string; content: string } => e !== null)));
  }

  /** Mirrors refreshIndex's own shape, over the `.order.yaml` files
   * loadRepoFiles's own tree walk already listed — no separate fetch of
   * the tree a second time just for this. */
  async function refreshSeries(repo: RepoRef, ref: string, token: string, orderFiles: RepoFile[]) {
    if (!host.onSeriesChange) return;
    const entries = await Promise.all(
      orderFiles.map(async (file) => {
        try {
          const { content } = await getFileContent(repo, file.path, ref, token);
          return { path: file.path, content };
        } catch {
          return null;
        }
      }),
    );
    host.onSeriesChange(parseSeriesFiles(entries.filter((e): e is { path: string; content: string } => e !== null)));
  }

  async function loadRepoFiles() {
    const token = currentToken();
    const repo = currentRepo();
    if (!token) {
      repoStatus.textContent = "Enter a token first.";
      return;
    }
    if (!repo.owner || !repo.repo) {
      repoStatus.textContent = "Enter an owner and repo.";
      return;
    }
    const ref = baseInput.value.trim() || "main";
    saveRepoSettings({ owner: repo.owner, repo: repo.repo, base: ref, branch: settings.branch });
    loadButton.disabled = true;
    repoStatus.textContent = "Loading…";
    try {
      // Listed separately (github.ts's own two functions, one tree fetch
      // each), but merged into one browsable/searchable list: an
      // `.order.yaml` file is a plain text file like any other, and
      // opening one hands it to the same editor and push path every
      // other file already gets — the whole-file source view (Cmd+/)
      // shows its raw YAML untouched by any markdown rendering, exactly
      // what hand-editing a reading order actually wants, no new UI.
      const [markdownFiles, orderFiles] = await Promise.all([listMarkdownFiles(repo, ref, token), listOrderFiles(repo, ref, token)]);
      files = [...markdownFiles, ...orderFiles];
      repoStatus.textContent = `${markdownFiles.length} markdown file${markdownFiles.length === 1 ? "" : "s"}, ${orderFiles.length} order file${orderFiles.length === 1 ? "" : "s"}.`;
      renderFiles();
      // active-store.ts's own "open this path" hook — the repository's
      // own version of the same registration folder-panel.ts makes,
      // reusing openRepoFile itself (the branch/token/ref it needs are
      // read fresh from the form on every call, the same as loadRepoFiles
      // itself already does, so a later change to any of them is seen
      // without registering again).
      setActiveStore({
        async openPath(path) {
          const file = files.find((f) => f.path === path);
          if (!file) return false;
          await openRepoFile(file);
          return true;
        },
        // decision 33: closes the gap series-panel.ts's own "New series"
        // named directly ("today: a local folder, since repo-panel.ts
        // doesn't implement createFile yet"). Deliberately does not
        // touch `opened`/renderPush/repoStatus — a reader clicking "New
        // series" while a real edit is already open in this same panel
        // should never have that edit's own push target silently
        // swapped out from under them; the caller (series-panel.ts's own
        // status line) is what reports success or failure here, the same
        // as it already does for a local folder. Writes straight to the
        // working branch, not the base `ref` this panel browses — a
        // freshly created file exists only there until a PR merges it,
        // so it deliberately never appears in `files`/the browsable list
        // the way a folder's own newly created file immediately would;
        // opening it back up through this same panel is follow-up scope,
        // not silently promised here.
        async createFile(path, content) {
          const token = currentToken();
          if (!token) throw new Error("Enter a GitHub token first.");
          const repo = currentRepo();
          const branch = branchInput.value.trim() || "dewnote-edits";
          const base = baseInput.value.trim() || "main";
          await ensureBranch(repo, branch, base, token);
          await putFileContent(repo, path, content, undefined, branch, `Add ${path} from dewnote`, token);
        },
      });
      await refreshIndex(repo, ref, token, markdownFiles);
      await refreshSeries(repo, ref, token, orderFiles);
    } catch (err) {
      repoStatus.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      loadButton.disabled = false;
    }
  }
  loadButton.addEventListener("click", () => loadRepoFiles());

  async function openRepoFile(file: RepoFile) {
    const token = currentToken();
    if (!token) {
      repoStatus.textContent = "Enter a token first.";
      return;
    }
    const repo = currentRepo();
    const ref = baseInput.value.trim() || "main";
    repoStatus.textContent = `Opening ${file.path}…`;
    try {
      const { content, sha } = await getFileContent(repo, file.path, ref, token);
      opened = { repo, file: { path: file.path, sha }, ref };
      host.loadDocument(content, file.path);
      hideConflict();
      renderPush();
      repoStatus.textContent = `Opened ${file.path}.`;
    } catch (err) {
      repoStatus.textContent = err instanceof Error ? err.message : String(err);
    }
  }

  // ------------------------------------------------------------- push
  const pushSection = document.createElement("section");
  pushSection.className = "dn-repo-section";
  const branchInput = textInput("dewnote-edits", settings.branch);
  pushSection.appendChild(field("Working branch", branchInput));

  const pushButton = document.createElement("button");
  pushButton.type = "button";
  pushButton.className = "dn-repo-push";
  pushSection.appendChild(pushButton);

  const prButton = document.createElement("button");
  prButton.type = "button";
  prButton.className = "dn-repo-pr";
  prButton.textContent = "Open pull request";
  prButton.hidden = true;
  pushSection.appendChild(prButton);

  const pushStatus = document.createElement("p");
  pushStatus.className = "dn-repo-hint dn-repo-status";
  pushSection.appendChild(pushStatus);
  panel.appendChild(pushSection);

  // ---------------------------------------------------------- conflict
  // FAQ's own rule, ported here rather than invented: on a 409 (the
  // branch moved under this file since it was opened, or since the last
  // push), show both versions and let the reader choose — never pick
  // one, and never silently overwrite either.
  interface Conflict {
    mine: string;
    theirsContent: string;
    theirsSha: string;
    branch: string;
  }
  let conflict: Conflict | null = null;

  const conflictSection = document.createElement("section");
  conflictSection.className = "dn-repo-section dn-repo-conflict";
  conflictSection.hidden = true;

  const conflictHeading = document.createElement("p");
  conflictHeading.className = "dn-repo-hint";
  conflictHeading.textContent = "Someone changed this file on the branch since it was opened.";
  conflictSection.appendChild(conflictHeading);

  const mineLabel = document.createElement("p");
  mineLabel.className = "dn-repo-hint";
  mineLabel.textContent = "Your edit:";
  const minePre = document.createElement("pre");
  minePre.className = "dn-repo-conflict-text";
  const theirsLabel = document.createElement("p");
  theirsLabel.className = "dn-repo-hint";
  theirsLabel.textContent = "Theirs, currently on the branch:";
  const theirsPre = document.createElement("pre");
  theirsPre.className = "dn-repo-conflict-text";
  conflictSection.append(mineLabel, minePre, theirsLabel, theirsPre);

  const keepMineButton = document.createElement("button");
  keepMineButton.type = "button";
  keepMineButton.className = "dn-repo-conflict-keep";
  keepMineButton.textContent = "Keep mine, overwrite theirs";
  const takeTheirsButton = document.createElement("button");
  takeTheirsButton.type = "button";
  takeTheirsButton.className = "dn-repo-conflict-take";
  takeTheirsButton.textContent = "Discard mine, load theirs";
  conflictSection.append(keepMineButton, takeTheirsButton);
  panel.appendChild(conflictSection);

  function showConflict(next: Conflict) {
    conflict = next;
    minePre.textContent = next.mine;
    theirsPre.textContent = next.theirsContent;
    conflictSection.hidden = false;
    pushStatus.textContent = "Conflict — choose a version below.";
  }
  function hideConflict() {
    conflict = null;
    conflictSection.hidden = true;
  }

  keepMineButton.addEventListener("click", async () => {
    if (!opened || !conflict) return;
    const token = currentToken();
    if (!token) {
      pushStatus.textContent = "Enter a token first.";
      return;
    }
    const { mine, theirsSha, branch } = conflict;
    keepMineButton.disabled = true;
    try {
      const result = await putFileContent(opened.repo, opened.file.path, mine, theirsSha, branch, `Edit ${opened.file.path} from dewnote`, token);
      opened = { ...opened, file: { path: opened.file.path, sha: result.sha } };
      hideConflict();
      renderPush();
      pushStatus.textContent = `Pushed to ${branch}.`;
      prButton.hidden = false;
    } catch (err) {
      pushStatus.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      keepMineButton.disabled = false;
    }
  });

  takeTheirsButton.addEventListener("click", () => {
    if (!opened || !conflict) return;
    host.loadDocument(conflict.theirsContent, opened.file.path);
    opened = { ...opened, file: { path: opened.file.path, sha: conflict.theirsSha } };
    pushStatus.textContent = "Loaded their version — your edit was discarded.";
    hideConflict();
  });

  function renderPush() {
    pushSection.hidden = !opened;
    if (!opened) return;
    const branch = branchInput.value.trim() || "dewnote-edits";
    pushButton.textContent = opened.file.sha ? `Push to ${branch}` : `Push new file to ${branch}`;
  }
  branchInput.addEventListener("input", renderPush);

  pushButton.addEventListener("click", async () => {
    if (!opened) return;
    const token = currentToken();
    if (!token) {
      pushStatus.textContent = "Enter a token first.";
      return;
    }
    const branch = branchInput.value.trim() || "dewnote-edits";
    const base = baseInput.value.trim() || "main";
    saveRepoSettings({ owner: opened.repo.owner, repo: opened.repo.repo, base, branch });
    const mine = host.getSource();
    const isNewFile = !opened.file.sha;
    pushButton.disabled = true;
    pushStatus.textContent = `Pushing to ${branch}…`;
    try {
      await ensureBranch(opened.repo, branch, base, token);
      const message = `${isNewFile ? "Add" : "Edit"} ${opened.file.path} from dewnote`;
      const result = await putFileContent(opened.repo, opened.file.path, mine, opened.file.sha, branch, message, token);
      opened = { ...opened, file: { path: opened.file.path, sha: result.sha } };
      renderPush();
      pushStatus.textContent = `Pushed to ${branch}.`;
      prButton.hidden = false;
    } catch (err) {
      if (err instanceof GithubApiError && err.status === 409 && !isNewFile) {
        try {
          const theirs = await getFileContent(opened.repo, opened.file.path, branch, token);
          showConflict({ mine, theirsContent: theirs.content, theirsSha: theirs.sha, branch });
        } catch (fetchErr) {
          pushStatus.textContent = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        }
      } else if (err instanceof GithubApiError && err.status === 422 && isNewFile) {
        // No sha was ever fetched for this path, so there is no "theirs"
        // to show the way an edit's own 409 conflict has — a plain
        // message and a different path or a real open is the fix here,
        // not a diff view built for a case with nothing to diff against.
        pushStatus.textContent = `A file already exists at ${opened.file.path} on ${branch} — pick a different path, or open that file from the list above to edit it instead.`;
      } else {
        pushStatus.textContent = err instanceof Error ? err.message : String(err);
      }
    } finally {
      pushButton.disabled = false;
    }
  });

  prButton.addEventListener("click", async () => {
    if (!opened) return;
    const token = currentToken();
    if (!token) {
      pushStatus.textContent = "Enter a token first.";
      return;
    }
    const branch = branchInput.value.trim() || "dewnote-edits";
    const base = baseInput.value.trim() || "main";
    prButton.disabled = true;
    try {
      const pr = await openPullRequest(opened.repo, branch, base, `Edit ${opened.file.path} from dewnote`, token);
      pushStatus.textContent = `Draft PR: ${pr.html_url}`;
      window.open(pr.html_url, "_blank", "noopener");
    } catch (err) {
      pushStatus.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      prButton.disabled = false;
    }
  });

  iconRail().appendChild(toggle);
  document.body.appendChild(panel);
  renderFiles();
  renderPush();

  return {
    destroy() {
      toggle.remove();
      panel.remove();
    },
  };
}
