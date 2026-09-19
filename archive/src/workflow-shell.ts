import type { FileBarState } from "./file-bar.ts";
import type { RepoSessionContext } from "./repo-panel.ts";
import type { WorkspaceLocation } from "./workspace-nav.ts";
import type { SaveProblem } from "./save-problem.ts";

export type SessionKind = "local" | "github";

export interface WorkflowShellHost {
  chooseLocal(): Promise<boolean>;
  chooseGithub(): void;
  saveCurrent(): Promise<boolean>;
  openPullRequest(): Promise<string | null>;
  /** Brings whichever store refused a save forward, so a choice only it
   * can offer — a push conflict's two versions — is reachable. */
  revealStore(reason: "conflict"): void;
  closePanels(): void;
  panelContains(target: Node): boolean;
  resetWorkspace(): void;
}

export interface WorkflowShell {
  setSession(kind: SessionKind, label: string, detail?: string): void;
  setRepoContext(context: RepoSessionContext): void;
  setFileState(state: FileBarState): void;
  setLocation(location: WorkspaceLocation): void;
  noteBranchChange(path: string): void;
  documentSaved(): void;
  /** A store refused a save. Shown until it is dismissed or another
   * save succeeds — never as a notice that fades while the document is
   * still unsaved. */
  reportProblem(problem: SaveProblem): void;
  /** Whether the working branch has anything on it, so the palette can
   * leave the review command out until there is something to review. */
  hasBranchChanges(): boolean;
  openReview(): void;
  /** Change workspace, with the unsaved-work question asked once. */
  requestReset(): void;
  cancelSourceChoice(): void;
  closeTransient(): void;
  destroy(): void;
}

function button(label: string, className = ""): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.textContent = label;
  item.className = className;
  return item;
}

/** The workflow shell owns *when* controls exist. Store and editor
 * components still own the operations; the shell presents only the next
 * decision and keeps the document as the resting state. */
export function mountWorkflowShell(host: WorkflowShellHost): WorkflowShell {
  document.body.classList.add("dn-progressive");
  let session: SessionKind | null = null;
  let fileState: FileBarState = { name: "Untitled", dirty: false, external: false, status: "" };
  let location: WorkspaceLocation = { module: "", series: "", page: "", available: false };
  let repoContext: RepoSessionContext = { label: "GitHub repository", base: "main", branch: "dewnote-edits" };
  const changedPaths = new Set<string>();

  const gate = document.createElement("section");
  gate.className = "dn-source-gate";
  gate.setAttribute("aria-labelledby", "dn-source-title");
  const gateInner = document.createElement("div");
  gateInner.className = "dn-source-gate-inner";
  const brand = document.createElement("p");
  brand.className = "dn-source-brand";
  brand.textContent = "dewnote";
  const gateTitle = document.createElement("h1");
  gateTitle.id = "dn-source-title";
  gateTitle.textContent = "What are you working on?";
  const gateCopy = document.createElement("p");
  gateCopy.textContent = "Choose the source once. Dewnote will then show only the navigation and saving behaviour that belongs to that workspace.";
  const choices = document.createElement("div");
  choices.className = "dn-source-choices";
  const localChoice = button("Open a local folder", "dn-source-choice");
  localChoice.innerHTML = "<strong>Open a local folder</strong><span>Browse its modules and edit files directly on this computer.</span>";
  const githubChoice = button("Connect a GitHub repository", "dn-source-choice");
  githubChoice.innerHTML = "<strong>Connect a GitHub repository</strong><span>Browse its modules and save through a working branch.</span>";
  choices.append(localChoice, githubChoice);
  gateInner.append(brand, gateTitle, gateCopy, choices);
  gate.appendChild(gateInner);
  document.body.appendChild(gate);

  // One slot, two jobs with opposite lifetimes. A confirmation is a
  // courtesy and leaves on its own; a refusal is the only thing standing
  // between an author and a lost edit, so it stays until it is dismissed
  // or another save succeeds.
  const toast = document.createElement("div");
  toast.className = "dn-workflow-toast";
  toast.hidden = true;
  toast.setAttribute("aria-live", "polite");
  const toastMessage = document.createElement("span");
  const resolveButton = button("Show me");
  resolveButton.hidden = true;
  const reviewButton = button("Review repository changes");
  const dismissToast = button("×", "dn-workflow-toast-dismiss");
  dismissToast.setAttribute("aria-label", "Dismiss notification");
  toast.append(toastMessage, resolveButton, reviewButton, dismissToast);
  document.body.appendChild(toast);

  const review = document.createElement("section");
  review.className = "dn-change-review";
  review.hidden = true;
  const reviewHeader = document.createElement("header");
  const back = button("← Document");
  const reviewHeading = document.createElement("strong");
  reviewHeading.textContent = "Review repository changes";
  reviewHeader.append(back, reviewHeading);
  const reviewMain = document.createElement("main");
  const reviewTitle = document.createElement("h1");
  reviewTitle.textContent = "Ready to publish";
  const reviewCopy = document.createElement("p");
  const changes = document.createElement("ul");
  changes.className = "dn-change-review-list";
  const reviewActions = document.createElement("div");
  reviewActions.className = "dn-change-review-actions";
  const keepEditing = button("Keep editing");
  const openPr = button("Open pull request", "dn-workflow-primary");
  reviewActions.append(keepEditing, openPr);
  reviewMain.append(reviewTitle, reviewCopy, changes, reviewActions);
  review.append(reviewHeader, reviewMain);
  document.body.appendChild(review);

  /** The shell owns no menus of its own any more — the spine carries
   * identity and state, and the palette carries every command that used
   * to hang off the header. What is left to close is whichever dock
   * panel a command opened. */
  function closeTransient(): void {
    host.closePanels();
  }

  function render(): void {
    // A refusal takes the same slot a confirmation uses, so the
    // branch-review offer steps aside while one is showing rather than
    // sitting beside a sentence saying nothing was saved.
    const offerReview = problem === null && session === "github" && changedPaths.size > 0;
    reviewButton.hidden = !offerReview;
  }

  // One slot, two jobs with opposite lifetimes. A confirmation is a
  // courtesy and leaves on its own; a refusal is the only thing standing
  // between an author and a lost edit, so it stays until it is dismissed
  // or another save succeeds.
  const CONFIRMATION_MS = 5000;
  let toastTimer = 0;
  let problem: SaveProblem | null = null;

  function hideToast(): void {
    window.clearTimeout(toastTimer);
    toastTimer = 0;
    problem = null;
    toast.hidden = true;
    toast.classList.remove("is-problem");
    resolveButton.hidden = true;
    render();
  }

  function showToast(message: string): void {
    window.clearTimeout(toastTimer);
    problem = null;
    toast.classList.remove("is-problem");
    resolveButton.hidden = true;
    toastMessage.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(hideToast, CONFIRMATION_MS);
    render();
  }

  function showProblem(next: SaveProblem): void {
    window.clearTimeout(toastTimer);
    toastTimer = 0;
    problem = next;
    toastMessage.textContent = next.message;
    toast.classList.add("is-problem");
    resolveButton.hidden = !next.conflict;
    toast.hidden = false;
    render();
  }

  async function save(): Promise<void> {
    closeTransient();
    const ok = await host.saveCurrent();
    // A store that refused reports why through `reportProblem`, which
    // has already run by the time this resolves. Never announce a save
    // that did not happen, and never let a refusal pass unsaid: a
    // store with nothing to say still leaves the author with an
    // unexplained dirty marker, so say something generic rather than
    // nothing at all.
    if (!ok) {
      if (!problem) showProblem({ message: "That save did not go through. The document is still unsaved.", conflict: false });
      return;
    }
    showToast(session === "github" ? `Saved to ${repoContext.branch}` : `Saved ${fileState.name}`);
  }

  localChoice.addEventListener("click", async () => {
    localChoice.disabled = true;
    try { await host.chooseLocal(); } finally { localChoice.disabled = false; }
  });
  githubChoice.addEventListener("click", () => {
    gate.classList.add("is-choosing-repository");
    document.body.classList.add("dn-choosing-repository");
    host.chooseGithub();
  });

  /** Change workspace, asked for from the palette now rather than a
   * menu. The unsaved-work question is asked here, once, so the reset
   * path cannot lose work whichever surface reached it. */
  function requestReset(): void {
    closeTransient();
    if (fileState.dirty && !window.confirm("Discard unsaved changes and choose another workspace?")) return;
    host.resetWorkspace();
  }

  resolveButton.addEventListener("click", () => {
    host.revealStore("conflict");
    hideToast();
  });
  const openReview = () => {
    closeTransient();
    reviewCopy.textContent = `Changes on ${repoContext.branch}, ready to compare with ${repoContext.base}.`;
    changes.replaceChildren(...[...changedPaths].map((path) => {
      const item = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = path;
      const kind = document.createElement("span");
      kind.textContent = /(?:courses|modules)\/.*\.ya?ml$/i.test(path) ? "Module descriptor" : "Document or asset";
      item.append(name, kind);
      return item;
    }));
    review.hidden = false;
  };
  reviewButton.addEventListener("click", openReview);
  dismissToast.addEventListener("click", hideToast);
  const closeReview = () => { review.hidden = true; };
  back.addEventListener("click", closeReview);
  keepEditing.addEventListener("click", closeReview);
  openPr.addEventListener("click", async () => {
    openPr.disabled = true;
    try {
      const url = await host.openPullRequest();
      if (url) showToast(`Pull request opened: ${url}`);
      else if (!problem) showProblem({ message: "The pull request was not opened.", conflict: false });
    } finally { openPr.disabled = false; }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!review.hidden) closeReview();
    else if (!toast.hidden && problem) hideToast();
    else closeTransient();
  });
  document.addEventListener("pointerdown", (event) => {
    if (host.panelContains(event.target as Node)) return;
    closeTransient();
  });

  render();
  localChoice.focus();

  return {
    setSession(kind, _label, _detail) {
      session = kind;
      gate.hidden = true;
      gate.classList.remove("is-choosing-repository");
      document.body.classList.remove("dn-choosing-repository");
      document.body.classList.add("dn-has-session");
      render();
      host.closePanels();
    },
    setRepoContext(context) { repoContext = context; render(); },
    setFileState(state) { fileState = state; render(); },
    setLocation(next) { location = next; render(); },
    noteBranchChange(path) { changedPaths.add(path); showToast(`Saved change on ${repoContext.branch}`); },
    documentSaved() { render(); },
    reportProblem: showProblem,
    hasBranchChanges: () => changedPaths.size > 0,
    openReview,
    requestReset,
    cancelSourceChoice() {
      gate.classList.remove("is-choosing-repository");
      document.body.classList.remove("dn-choosing-repository");
    },
    closeTransient,
    destroy() {
      window.clearTimeout(toastTimer);
      document.body.classList.remove("dn-progressive");
      document.body.classList.remove("dn-choosing-repository");
      document.body.classList.remove("dn-has-session");
      gate.remove(); toast.remove(); review.remove();
    },
  };
}
