import "@milkdown/crepe/theme/common/style.css";
import "./theme/dewlab-tokens.css";
import "./style.css";

import { mountShell } from "./shell.ts";
import { mountEditor, type Document } from "./editor.ts";
import { canOpenFolder, openFolder, openRepo } from "./store.ts";
import { loadToken, saveToken } from "./github.ts";
import { messageOf } from "./save-problem.ts";

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
    <form class="dn-gate-repo" hidden>
      <label>Token <input name="token" type="password" autocomplete="off" required></label>
      <label>Owner <input name="owner" required></label>
      <label>Repository <input name="repo" required></label>
      <label>Base branch <input name="base" value="main" required></label>
      <label>Working branch <input name="branch" required></label>
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
  const failed = (error: unknown) => { problem.textContent = messageOf(error); };

  folderButton.addEventListener("click", async () => {
    try {
      const store = await openFolder();
      if (!store) return;
      await shell.useStore(store);
      done();
    } catch (error) { failed(error); }
  });

  box.querySelector<HTMLButtonElement>('[data-choice="repo"]')!
    .addEventListener("click", () => {
      form.hidden = false;
      const token = form.querySelector<HTMLInputElement>('[name="token"]')!;
      token.value = loadToken() ?? "";
      token.focus();
    });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    try {
      saveToken(value("token"));
      const store = await openRepo({
        repo: { owner: value("owner"), repo: value("repo") },
        base: value("base"),
        branch: value("branch"),
        token: value("token"),
      });
      await shell.useStore(store);
      done();
    } catch (error) { failed(error); }
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
    held = await mountEditor(page, { markdown });
  },
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
      async write(path: string, text: string) {
        held_.set(path, text);
        written.push({ path, text });
      },
    });
  },
};
