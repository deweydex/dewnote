import "@milkdown/crepe/theme/common/style.css";
import "./theme/dewlab-tokens.css";
import "./style.css";

import { mountShell } from "./shell.ts";
import { mountEditor, type Document } from "./editor.ts";
import { canOpenFolder, openFolder, openRepo } from "./store.ts";
import { loadLastRepo, loadToken, saveLastRepo, saveToken, suggestedBranch } from "./github.ts";
import { messageOf } from "./save-problem.ts";
import { SAMPLE_TUTORIAL, sampleStore } from "./sample.ts";

// The one question dewnote opens on: where the files are. Everything
// else waits behind it, because there is nothing useful to show until
// something is open.

const page = document.querySelector<HTMLElement>("#dn-page");
const shell = page ? mountShell(page) : null;

function gate(): HTMLElement {
  const box = document.createElement("div");
  box.className = "dn-gate";
  box.innerHTML = `
    <h1>dewnote</h1>
    <p>Where are the files?</p>
    <div class="dn-gate-choices">
      <button type="button" data-choice="folder">Open a local folder</button>
      <button type="button" data-choice="repo">Connect a repository</button>
    </div>
    <p class="dn-gate-aside">
      Or <button type="button" data-choice="sample">try a sample document</button>
      — nothing is saved anywhere.
    </p>
    <form class="dn-gate-repo" hidden>
      <label>Token <input name="token" type="password" autocomplete="off" required></label>
      <label>Owner <input name="owner" required></label>
      <label>Repository <input name="repo" required></label>
      <label>Base branch <input name="base" value="main" required></label>
      <label>Working branch <input name="branch" required></label>
      <p class="dn-gate-note">
        Saves commit to the working branch, never to the base. One branch
        per day keeps a day's edits in one pull request.
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
    folderButton.title = "This browser has no folder picker. Use a repository.";
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
      const last = loadLastRepo();
      if (last) {
        field("owner").value = last.owner;
        field("repo").value = last.repo;
        field("base").value = last.base;
      }
      field("branch").value = suggestedBranch();
      (field("owner").value ? field("token") : field("owner")).focus();
    });

  const connect = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (connect.disabled) return;
    const state = busy(connect, "Reading");
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    if (value("branch") === value("base")) {
      problem.textContent =
        "The working branch has to be different from the base branch — saves never write to the base.";
      state.restore();
      return;
    }
    try {
      saveToken(value("token"));
      saveLastRepo({ owner: value("owner"), repo: value("repo"), base: value("base") });
      const store = await openRepo({
        repo: { owner: value("owner"), repo: value("repo") },
        base: value("base"),
        branch: value("branch"),
        token: value("token"),
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
    held = await mountEditor(page, {
      markdown,
      // The round-trip suite drives this without an interpreter; the
      // sample and the stores pass a real one.
      ...(((globalThis as unknown as Record<string, unknown>).__dewnoteRunCell as boolean)
        ? { runCell: async () => ({ ok: true, markup: "<pre>stub</pre>" }) }
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
  async useStubStore(files: Record<string, string>): Promise<void> {
    const held_ = new Map(Object.entries(files));
    const written: { path: string; text: string }[] = [];
    (globalThis as unknown as Record<string, unknown>).__dewnoteWrites = written;
    document.querySelector(".dn-gate")?.remove();
    await shell?.useStore({
      kind: "folder",
      label: "stub",
      list: async () => [...held_].map(([path, content]) => ({ path, content })),
      read: async (path: string) => held_.get(path) ?? "",
      readBytes: async () => null,
      listFolder: async () => [],
      async write(path: string, text: string) {
        held_.set(path, text);
        written.push({ path, text });
      },
      writeBytes: async () => {},
    });
  },
};
