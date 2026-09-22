import "@milkdown/crepe/theme/common/style.css";
import "./style.css";
import "./brand.css";

import { mountShell } from "./shell.ts";
import { mountEditor, type Document } from "./editor.ts";
import { canOpenFolder, openFolder, openRepo } from "./store.ts";
import {
  listRepositories,
  loadLastRepo,
  loadToken,
  saveLastRepo,
  saveToken,
  suggestedBranch,
  type RepoChoice,
} from "./github.ts";
import { messageOf } from "./save-problem.ts";
import { SAMPLE_TUTORIAL, sampleStore } from "./sample.ts";
import { applyTokens } from "./theme/tokens.ts";

// dewlab's tokens, as a stylesheet. They arrive as text because the
// exported page needs the same bytes to inline — see theme/tokens.ts.
applyTokens();

// The one question dewnote opens on: where the files are. Everything
// else waits behind it, because there is nothing useful to show until
// something is open.

const page = document.querySelector<HTMLElement>("#dn-page");
const shell = page ? mountShell(page) : null;

/** The mark, inline rather than an `<img>`, so its three parts take the
 * theme from `brand.css` — the field and the mark swap colour in the
 * dark theme, and a file with fixed fills could not. The name beside it
 * is ordinary text, so it is set in whatever face the reader chose in
 * Appearance. `assets/branding/downloads/` holds the self-contained
 * files, wordmark baked in, for anywhere outside the app. */
const BRAND_MARK = `
  <svg viewBox="0 0 512 512" aria-hidden="true">
    <rect class="dn-brand-field" width="512" height="512" rx="104"/>
    <path class="dn-brand-mark" d="M256 76c-67 68-111 132-111 210 0 65 41 111 88 132l23 31 23-31c47-21 88-67 88-132 0-78-44-142-111-210Z"/>
    <circle class="dn-brand-cut-fill" cx="256" cy="256" r="22"/>
    <path class="dn-brand-cut-stroke" d="M256 278v126"/>
  </svg>`;

function gate(): HTMLElement {
  const box = document.createElement("div");
  box.className = "dn-gate";
  box.innerHTML = `
    <h1 class="dn-brand">${BRAND_MARK}<span class="dn-brand-name">dewnote</span></h1>
    <p>Where are the tutorials you want to edit?</p>
    <div class="dn-gate-choices">
      <button type="button" data-choice="folder">Open a folder on this computer</button>
      <button type="button" data-choice="repo">Connect a GitHub repository</button>
    </div>
    <p class="dn-gate-aside">
      Or <button type="button" data-choice="sample">try the sample document</button>.
      Nothing you do in it is saved.
    </p>
    <form class="dn-gate-repo" hidden>
      <label>GitHub token <input name="token" type="password" autocomplete="off" required></label>
      <p class="dn-gate-note">
        A token lets dewnote read and commit on your behalf.
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create a fine-grained token</a>
        for just this repository, with <strong>Contents</strong> and <strong>Pull requests</strong>
        set to read and write. dewnote keeps it in this browser only.
      </p>
      <label>Repository
        <select name="repo" required disabled>
          <option value="">Paste a token first</option>
        </select>
      </label>
      <label>Working branch <input name="branch" required></label>
      <p class="dn-gate-note">
        Every save is a commit on this branch. dewnote never commits to the
        repository's main branch; when you are done, open a pull request
        to merge your work into it. The suggested name starts a new branch
        each day.
      </p>
      <button type="submit">Connect</button>
    </form>
    <p class="dn-gate-problem" role="status"></p>
  `;
  return box;
}

function start(): void {
  if (!page || !shell) return;
  const box = gate();
  document.body.appendChild(box);

  const problem = box.querySelector<HTMLElement>(".dn-gate-problem")!;
  const form = box.querySelector<HTMLFormElement>(".dn-gate-repo")!;
  const folderButton = box.querySelector<HTMLButtonElement>('[data-choice="folder"]')!;

  // Safari has no directory picker, and saying so is kinder than a
  // button that does nothing.
  if (!canOpenFolder()) {
    folderButton.disabled = true;
    folderButton.title = "This browser cannot open folders. Use Chrome or Edge, or connect a GitHub repository.";
  }

  const done = () => box.remove();

  /** Reading a repository is hundreds of requests, so Connect sits there
   * doing nothing visible for several seconds. Saying so is what stops
   * somebody pressing it twice. */
  function busy(control: HTMLButtonElement, label: string) {
    const was = control.textContent;
    control.disabled = true;
    control.textContent = label;
    problem.textContent = "";
    box.classList.add("is-busy");
    return {
      /** Counts up as files arrive, so a long read looks like work
       * rather than like a hang. */
      progress(done: number, total: number) {
        control.textContent = `${label} ${done} of ${total}`;
      },
      restore() {
        control.disabled = false;
        control.textContent = was;
        box.classList.remove("is-busy");
      },
    };
  }

  const failed = (error: unknown) => { problem.textContent = messageOf(error); };

  folderButton.addEventListener("click", async () => {
    const state = busy(folderButton, "Reading");
    try {
      const store = await openFolder();
      if (!store) return;
      await shell.useStore(store, state.progress);
      done();
    } catch (error) { failed(error); } finally { state.restore(); }
  });

  const sampleButton = box.querySelector<HTMLButtonElement>('[data-choice="sample"]')!;
  sampleButton.addEventListener("click", async () => {
    const state = busy(sampleButton, "Opening…");
    try {
      await shell.useStore(sampleStore());
      done();
    } catch (error) { failed(error); } finally { state.restore(); }
  });

  box.querySelector<HTMLButtonElement>('[data-choice="repo"]')!
    .addEventListener("click", () => {
      form.hidden = false;
      const field = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
      field("token").value = loadToken() ?? "";
      field("branch").value = suggestedBranch();
      // A remembered token fills the list without being asked twice.
      if (field("token").value) findRepositories();
      field("token").focus();
    });

  const connect = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  /** The repositories a token can reach, keyed by the value the select
   * carries, so choosing one hands back its owner and default branch
   * without anybody typing either. */
  let reachable = new Map<string, RepoChoice>();
  const repoSelect = form.querySelector<HTMLSelectElement>('[name="repo"]')!;
  const tokenField = form.querySelector<HTMLInputElement>('[name="token"]')!;

  function offerRepositories(choices: readonly RepoChoice[]): void {
    reachable = new Map(choices.map((choice) => [`${choice.owner}/${choice.repo}`, choice]));
    repoSelect.replaceChildren();
    if (choices.length === 0) {
      repoSelect.disabled = true;
      repoSelect.append(new Option("This token cannot write to any repository", ""));
      return;
    }
    for (const key of reachable.keys()) repoSelect.append(new Option(key, key));
    repoSelect.disabled = false;
    // Last time's repository if the token still reaches it; otherwise the
    // one pushed to most recently, which is where a session usually
    // carries on from.
    const last = loadLastRepo();
    const remembered = last ? `${last.owner}/${last.repo}` : "";
    repoSelect.value = reachable.has(remembered) ? remembered : (repoSelect.options[0]?.value ?? "");
  }

  /** Reading the list is a request, so it waits until the token stops
   * changing rather than firing on every keystroke. */
  let lookup: ReturnType<typeof setTimeout> | undefined;
  function findRepositories(): void {
    clearTimeout(lookup);
    const token = tokenField.value.trim();
    if (!token) {
      repoSelect.disabled = true;
      repoSelect.replaceChildren(new Option("Paste a token first", ""));
      return;
    }
    lookup = setTimeout(async () => {
      repoSelect.disabled = true;
      repoSelect.replaceChildren(new Option("Reading repositories…", ""));
      try {
        offerRepositories(await listRepositories(token));
        problem.textContent = "";
      } catch (error) {
        repoSelect.replaceChildren(new Option("GitHub did not accept that token", ""));
        failed(error);
      }
    }, 400);
  }
  tokenField.addEventListener("input", findRepositories);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (connect.disabled) return;
    const chosen = reachable.get(repoSelect.value);
    if (!chosen) {
      problem.textContent = "Choose a repository first.";
      return;
    }
    const token = tokenField.value.trim();
    const branch = form.querySelector<HTMLInputElement>('[name="branch"]')!.value.trim();
    if (branch === chosen.defaultBranch) {
      problem.textContent =
        `The working branch has to be something other than ${chosen.defaultBranch}, which is the repository's main branch. Saves never go there directly.`;
      return;
    }
    const state = busy(connect, "Reading");
    try {
      saveToken(token);
      saveLastRepo({ owner: chosen.owner, repo: chosen.repo, base: chosen.defaultBranch });
      const store = await openRepo({
        repo: { owner: chosen.owner, repo: chosen.repo },
        base: chosen.defaultBranch,
        branch,
        token,
      });
      await shell.useStore(store, state.progress);
      done();
    } catch (error) { failed(error); } finally { state.restore(); }
  });
}

start();

// The Playwright hook. It drives the editor directly rather than the
// shell: the round-trip suite is about what a document survives, and a
// store behind it would only be a way for the test to fail for an
// unrelated reason.
let held: Document | null = null;
(globalThis as unknown as Record<string, unknown>).__dewnote = {
  async open(markdown: string): Promise<void> {
    if (!page) return;
    held?.destroy();
    page.replaceChildren();
    const hooks = globalThis as unknown as Record<string, unknown>;
    // The round-trip suite drives the editor without an interpreter. A
    // test that needs one sets `__dewnoteRunCell`: "never" holds a run
    // open so the Stop path can be driven, since Pyodide itself needs a
    // network the test sandbox does not have.
    const mode = hooks["__dewnoteRunCell"] as string | boolean | undefined;
    let release: (() => void) | null = null;
    hooks["__dewnoteFinishRun"] = () => release?.();
    held = await mountEditor(page, {
      markdown,
      ...(mode
        ? {
            runCell: () =>
              mode === "never"
                ? new Promise<{ ok: boolean; markup: string }>((resolve) => {
                    release = () => resolve({ ok: true, markup: "<pre>done</pre>" });
                  })
                : Promise.resolve({ ok: true, markup: "<pre>stub</pre>" }),
            stopCell: () => {
              hooks["__dewnoteStopped"] = true;
              release?.();
            },
          }
        : {}),
    });
  },
  sample: (): string => SAMPLE_TUTORIAL,
  markdown: (): string => held?.markdown() ?? "",
  headings: () => held?.headings() ?? [],

  /** Mounts the shell over a store held in memory, so the spine, the
   * palette and the save path can be driven without a folder picker or a
   * GitHub token — neither of which a headless browser has. The stub is
   * a real `Store`: it satisfies the same interface the two real ones
   * do, so a test that passes here is testing the shell rather than a
   * simplified copy of it. */
  async useStubStore(
    files: Record<string, string>,
    canPublish = false,
    images: string[] = [],
    /** When given, the stub behaves as a repository whose base branch
     * holds these files: a release reads its published copy from here. */
    published?: Record<string, string>,
  ): Promise<void> {
    const held_ = new Map(Object.entries(files));
    const written: { path: string; text: string }[] = [];
    const hooks = globalThis as unknown as Record<string, unknown>;
    hooks["__dewnoteWrites"] = written;
    hooks["__dewnotePublished"] = false;
    document.querySelector(".dn-gate")?.remove();
    await shell?.useStore({
      ...(canPublish
        ? {
            publish: async () => {
              hooks["__dewnotePublished"] = true;
              return "about:blank";
            },
          }
        : {}),
      ...(published
        ? { readPublished: async (path: string) => published[path] ?? null }
        : {}),
      kind: "folder",
      label: "stub",
      list: async () => [...held_].map(([path, content]) => ({ path, content })),
      read: async (path: string) => held_.get(path) ?? "",
      readBytes: async () => null,
      listFolder: async () => [],
      imagePaths: async () => images,
      async write(path: string, text: string) {
        held_.set(path, text);
        written.push({ path, text });
      },
      writeBytes: async () => {},
    });
  },
};
