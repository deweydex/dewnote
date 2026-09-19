import type { FileBarState } from "./file-bar.ts";
import type { RepoSessionContext } from "./repo-panel.ts";
import type { WorkspaceLocation } from "./workspace-nav.ts";
import type { SaveProblem } from "./save-problem.ts";

export type SessionKind = "local" | "github";

export interface WorkflowShellHost {
  chooseLocal(): Promise<boolean>;
  chooseGithub(): void;
  saveCurrent(): Promise<boolean>;
  saveNewVersion(): Promise<boolean>;
  canSaveNewVersion(): boolean;
  openPullRequest(): Promise<string | null>;
  /** Brings whichever store refused a save forward, so a choice only it
   * can offer — a push conflict's two versions — is reachable. */
  revealStore(reason: "conflict"): void;
  toggleLocation(): void;
  openLocation(): void;
  closeLocation(): void;
  locationIsOpen(): boolean;
  locationContains(target: Node): boolean;
  closePanels(): void;
  panelContains(target: Node): boolean;
  openRawFiles(): void;
  openDocumentSource(): void;
  openOutline(): void;
  openLinkCheck(): void;
  openModuleOrganizer(): void;
  openSettings(): void;
  openDeviceFile(): Promise<void>;
  importNotebook(): Promise<void>;
  exportNotebook(): void;
  exportHtml(): void;
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

  const header = document.createElement("header");
  header.className = "dn-workflow-header";
  header.hidden = true;
  const workspaceButton = button("☰", "dn-workflow-menu-button");
  workspaceButton.setAttribute("aria-label", "Workspace and file menu");
  workspaceButton.setAttribute("aria-expanded", "false");
  const identity = document.createElement("div");
  identity.className = "dn-workflow-identity";
  const identityName = document.createElement("strong");
  const identityDetail = document.createElement("span");
  identity.append(identityName, identityDetail);
  const locationButton = button("Choose a document", "dn-workflow-location");
  locationButton.setAttribute("aria-expanded", "false");
  const documentIdentity = document.createElement("div");
  documentIdentity.className = "dn-workflow-document";
  const fileName = document.createElement("strong");
  fileName.className = "dn-workflow-file-name";
  documentIdentity.append(fileName, locationButton);
  const saveArea = document.createElement("div");
  saveArea.className = "dn-workflow-save-area";
  const saveState = document.createElement("span");
  saveState.className = "dn-workflow-save-state";
  const saveButton = button("Save", "dn-workflow-save");
  const saveMore = button("▾", "dn-workflow-save-more");
  saveMore.setAttribute("aria-label", "More save options");
  saveMore.setAttribute("aria-expanded", "false");
  const changesButton = button("Changes", "dn-workflow-changes");
  changesButton.hidden = true;
  saveArea.append(changesButton, saveState, saveButton, saveMore);
  const left = document.createElement("div");
  left.className = "dn-workflow-left";
  left.append(workspaceButton, identity);
  header.append(left, documentIdentity, saveArea);
  document.body.appendChild(header);

  const workspaceMenu = document.createElement("div");
  workspaceMenu.className = "dn-workflow-popover dn-workflow-menu";
  workspaceMenu.hidden = true;
  workspaceMenu.setAttribute("role", "menu");
  const section = (label: string, ...items: HTMLButtonElement[]) => {
    const group = document.createElement("section");
    group.className = "dn-workflow-menu-section";
    const heading = document.createElement("h2");
    heading.textContent = label;
    group.append(heading, ...items);
    return group;
  };
  const findDocument = button("Find a document…");
  const rawFiles = button("Browse workspace files…");
  const openFile = button("Open a Markdown or YAML file…");
  const importNotebook = button("Import Jupyter notebook…");
  const exportNotebook = button("Export Jupyter notebook");
  const exportHtml = button("Export standalone HTML");
  const source = button("Whole-file source");
  const outline = button("Document outline");
  const links = button("Check tutorial links");
  const modules = button("Arrange modules and series");
  const settings = button("Settings");
  const changeWorkspace = button("Change workspace…", "dn-workflow-change-workspace");
  workspaceMenu.append(
    section("Open", findDocument, rawFiles, openFile),
    section("Transfer", importNotebook, exportNotebook, exportHtml),
    section("Document", outline, source, links),
    section("Workspace", modules, settings, changeWorkspace),
  );
  document.body.appendChild(workspaceMenu);

  const saveMenu = document.createElement("div");
  saveMenu.className = "dn-workflow-popover dn-workflow-save-menu";
  saveMenu.hidden = true;
  saveMenu.setAttribute("role", "menu");
  const saveCurrent = button("Save current file");
  const saveVersion = button("Save as a new version…");
  saveMenu.append(saveCurrent, saveVersion);
  document.body.appendChild(saveMenu);

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

  function closeTransient(): void {
    workspaceMenu.hidden = true;
    saveMenu.hidden = true;
    workspaceButton.setAttribute("aria-expanded", "false");
    saveMore.setAttribute("aria-expanded", "false");
    if (host.locationIsOpen()) host.closeLocation();
    locationButton.setAttribute("aria-expanded", "false");
    host.closePanels();
  }

  function toggle(menu: HTMLElement, trigger: HTMLButtonElement): void {
    const opening = menu.hidden;
    closeTransient();
    menu.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
    if (opening) menu.querySelector<HTMLButtonElement>("button")?.focus();
  }

  function render(): void {
    fileName.textContent = location.page ? fileState.name : "No document selected";
    saveState.textContent = fileState.dirty ? "Unsaved changes" : "Saved";
    saveState.classList.toggle("is-dirty", fileState.dirty);
    identityName.textContent = session === "github" ? repoContext.label : identityName.textContent || "Local workspace";
    identityDetail.textContent = session === "github" ? `${repoContext.base} → ${repoContext.branch}` : "Local folder";
    const parts = [location.module, location.series, location.page].filter(Boolean);
    locationButton.textContent = parts.length ? parts.join(" › ") : location.available ? "Choose a document" : "Browse files";
    locationButton.setAttribute("aria-label", location.available ? `Current location: ${parts.join(", ")}. Choose another document.` : "Browse workspace files");
    saveVersion.hidden = session !== "github" || !host.canSaveNewVersion();
    modules.hidden = !location.available;
    // A refusal takes the same slot a confirmation uses, so the
    // branch-review offer steps aside while one is showing rather than
    // sitting beside a sentence saying nothing was saved.
    const offerReview = problem === null && session === "github" && changedPaths.size > 0;
    reviewButton.hidden = !offerReview;
    changesButton.hidden = !offerReview;
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

  async function save(primary = true): Promise<void> {
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
    if (primary) saveButton.focus();
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
  workspaceButton.addEventListener("click", () => toggle(workspaceMenu, workspaceButton));
  saveMore.addEventListener("click", () => toggle(saveMenu, saveMore));
  saveButton.addEventListener("click", () => { void save(); });
  saveCurrent.addEventListener("click", () => { void save(false); });
  saveVersion.addEventListener("click", async () => {
    closeTransient();
    if (await host.saveNewVersion()) showToast(`Created a new version on ${repoContext.branch}`);
    else if (!problem) showProblem({ message: "That version was not created. Nothing has changed on the branch.", conflict: false });
  });
  locationButton.addEventListener("click", () => {
    closeTransient();
    if (!location.available) {
      host.openRawFiles();
      return;
    }
    host.toggleLocation();
    locationButton.setAttribute("aria-expanded", String(host.locationIsOpen()));
  });
  findDocument.addEventListener("click", () => {
    closeTransient();
    if (location.available) {
      host.openLocation();
      locationButton.setAttribute("aria-expanded", "true");
    } else host.openRawFiles();
  });
  rawFiles.addEventListener("click", () => { closeTransient(); host.openRawFiles(); });
  openFile.addEventListener("click", () => { closeTransient(); void host.openDeviceFile(); });
  importNotebook.addEventListener("click", () => { closeTransient(); void host.importNotebook(); });
  exportNotebook.addEventListener("click", () => { closeTransient(); host.exportNotebook(); });
  exportHtml.addEventListener("click", () => { closeTransient(); host.exportHtml(); });
  source.addEventListener("click", () => { closeTransient(); host.openDocumentSource(); });
  outline.addEventListener("click", () => { closeTransient(); host.openOutline(); });
  links.addEventListener("click", () => { closeTransient(); host.openLinkCheck(); });
  modules.addEventListener("click", () => { closeTransient(); host.openModuleOrganizer(); });
  settings.addEventListener("click", () => { closeTransient(); host.openSettings(); });
  changeWorkspace.addEventListener("click", () => {
    closeTransient();
    if (fileState.dirty && !window.confirm("Discard unsaved changes and choose another workspace?")) return;
    host.resetWorkspace();
  });
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
  changesButton.addEventListener("click", openReview);
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
    const target = event.target as Node;
    if (workspaceMenu.contains(target) || saveMenu.contains(target) || header.contains(target) || host.locationContains(target) || host.panelContains(target)) return;
    closeTransient();
  });

  render();
  localChoice.focus();

  return {
    setSession(kind, label, detail) {
      session = kind;
      gate.hidden = true;
      gate.classList.remove("is-choosing-repository");
      document.body.classList.remove("dn-choosing-repository");
      header.hidden = false;
      identityName.textContent = label;
      identityDetail.textContent = detail ?? (kind === "github" ? `${repoContext.base} → ${repoContext.branch}` : "Local folder");
      render();
      host.closePanels();
      if (location.available) {
        host.openLocation();
        locationButton.setAttribute("aria-expanded", "true");
      } else host.openRawFiles();
    },
    setRepoContext(context) { repoContext = context; render(); },
    setFileState(state) { fileState = state; render(); },
    setLocation(next) { location = next; render(); },
    noteBranchChange(path) { changedPaths.add(path); showToast(`Saved change on ${repoContext.branch}`); },
    documentSaved() { saveState.textContent = "Saved"; render(); },
    reportProblem: showProblem,
    cancelSourceChoice() {
      gate.classList.remove("is-choosing-repository");
      document.body.classList.remove("dn-choosing-repository");
    },
    closeTransient,
    destroy() {
      window.clearTimeout(toastTimer);
      document.body.classList.remove("dn-progressive");
      document.body.classList.remove("dn-choosing-repository");
      gate.remove(); header.remove(); workspaceMenu.remove(); saveMenu.remove(); toast.remove(); review.remove();
    },
  };
}
