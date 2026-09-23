// The spine: the left margin doing a book's job.
//
// A document answers three questions about itself — where am I, what
// state is this in, how do I get somewhere else. The first two want a
// caption, not a toolbar. The third is what one key is for
// (workspace-palette.ts).
//
// So this is a caption, set in the document's own face at caption size,
// in the margin the page already had and was not using: at 1440px with a
// 34rem measure there is about 450px of empty gutter each side. One side
// carries it; the other stays empty.

import { shortcut } from "./keys.ts";

export interface SpineHost {
  /** The open document's own headings. They come from the editor's tree
   * rather than from a second parse of the text. There is one answer to
   * "is this `#` inside a fence", and the editor already holds it. */
  getHeadings(): { level: number; text: string }[];
  /** ⌘K's own surface. The filename and the breadcrumb both open it:
   * "where am I" and "take me elsewhere" are one gesture. */
  openPalette(): void;
  /** Save, for a click on the state line. Returns false when it did not
   * happen, so the line can stop claiming it did. */
  save(): Promise<boolean>;
  /** Opens the report behind the count of things to fix. */
  showProblems(): void;
}

export interface SpineFile {
  name: string;
  dirty: boolean;
}

export interface SpineLocation {
  module: string;
  series: string;
  page: string;
}

export interface SpineWorkspace {
  /** "dewlab", or a folder's own name. Empty before a session opens. */
  label: string;
  /** "main → typography-pass" for a repository; empty for a folder. */
  detail: string;
}

export interface Spine {
  /** Null once no document is open, as after deleting one. */
  setFile(file: SpineFile | null): void;
  setLocation(location: SpineLocation): void;
  setWorkspace(workspace: SpineWorkspace): void;
  /** Re-reads the document's headings. Cheap — one parse of text this
   * app already holds — so callers fire it on whatever they have rather
   * than trying to detect a heading change. */
  refreshOutline(): void;
  /** How many faults the open document has, and whether any of them
   * would stop the build. Zero hides the line: a document with nothing
   * wrong should say nothing. */
  setHealth(health: { total: number; blocking: number }): void;
  /** A held state that outlives a confirmation: a refused save, with
   * an optional way to reach whatever can resolve it. Null clears it. */
  setProblem(problem: { message: string; action?: { label: string; run(): void } } | null): void;
  show(): void;
  destroy(): void;
}

interface Heading {
  level: number;
  text: string;
  /** Which heading this is, counted from the top — the handle the spine
   * hands back when one is clicked. */
  ordinal: number;
}

/** The narrowest margin worth putting a spine in. Below it the column
 * would be too tight for a tutorial title to survive on two lines, and
 * a squeezed desktop layout is the failure the folded mode exists to
 * avoid rather than reproduce. */
const MARGIN_MINIMUM = 250;
const SPINE_MAXIMUM = 310;
const SPINE_GAP = 28;

export function mountSpine(host: SpineHost): Spine {
  /** Null until a document opens: before then there is nothing to be
   * saved, and saying "Saved" would be a claim about nothing. */
  let file: SpineFile | null = null;
  let location: SpineLocation = { module: "", series: "", page: "" };
  let workspace: SpineWorkspace = { label: "", detail: "" };
  let problem: { message: string; action?: { label: string; run(): void } } | null = null;
  let headings: Heading[] = [];

  const spine = document.createElement("aside");
  spine.className = "dn-spine";
  spine.setAttribute("aria-label", "This document");
  spine.hidden = true;

  const identity = document.createElement("div");
  identity.className = "dn-spine-identity";

  // A button, not a div with a click handler: "where am I" and "take me
  // elsewhere" are the same gesture, and it has to be reachable by Tab.
  const nameButton = document.createElement("button");
  nameButton.type = "button";
  nameButton.className = "dn-spine-name";
  const breadcrumb = document.createElement("span");
  breadcrumb.className = "dn-spine-breadcrumb";
  const context = document.createElement("span");
  context.className = "dn-spine-context";
  nameButton.append(breadcrumb, context);

  const fileName = document.createElement("span");
  fileName.className = "dn-spine-file";
  identity.append(fileName, nameButton);

  const rule = document.createElement("div");
  rule.className = "dn-spine-rule";

  const problemBox = document.createElement("div");
  problemBox.className = "dn-spine-problem";
  problemBox.hidden = true;
  problemBox.setAttribute("role", "status");
  const problemText = document.createElement("p");
  const problemAction = document.createElement("button");
  problemAction.type = "button";
  problemAction.className = "dn-spine-problem-action";
  problemAction.hidden = true;
  problemBox.append(problemText, problemAction);

  const outline = document.createElement("nav");
  outline.className = "dn-spine-outline";
  outline.setAttribute("aria-label", "Headings in this document");

  /** A running count of what is wrong, kept at the foot with the save
   * line: both say what state the document is in, and a fault is worth
   * finding while you are writing rather than at the moment you
   * publish. */
  const health = document.createElement("button");
  health.type = "button";
  health.className = "dn-spine-health";
  health.hidden = true;
  health.addEventListener("click", () => host.showProblems());

  const foot = document.createElement("div");
  foot.className = "dn-spine-foot";
  const state = document.createElement("button");
  state.type = "button";
  state.className = "dn-spine-state";
  const hint = document.createElement("span");
  hint.className = "dn-spine-hint";
  hint.textContent = `${shortcut("K")} to open or do anything`;
  foot.append(health, state, hint);

  spine.append(identity, rule, problemBox, outline, foot);
  document.body.appendChild(spine);

  function renderIdentity(): void {
    fileName.textContent = file ? (file.name.split("/").pop() ?? file.name) : "";
    fileName.title = file?.name ?? "";
    fileName.hidden = file === null;
    fileName.classList.toggle("is-dirty", file?.dirty ?? false);
    const parts = [location.module, location.series, location.page].filter(Boolean);
    breadcrumb.textContent = parts.length
      ? parts.join(" › ")
      : `${file === null ? "Open a document" : "Open another document"} (${shortcut("K")})`;
    breadcrumb.classList.toggle("is-empty", parts.length === 0);
    context.textContent = [workspace.label, workspace.detail].filter(Boolean).join(" · ");
    context.hidden = context.textContent === "";
    nameButton.setAttribute(
      "aria-label",
      parts.length ? `${parts.join(", ")}. Open another document.` : "Choose a document to open",
    );
  }

  function renderOutline(): void {
    outline.replaceChildren();
    // One heading is the title and tells a reader nothing they cannot
    // already see at the top of the page; an outline of it is furniture.
    if (headings.length < 2) return;
    const top = Math.min(...headings.map((heading) => heading.level));
    for (const heading of headings) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "dn-spine-heading";
      item.dataset["level"] = String(heading.level);
      item.style.paddingInlineStart = `${(heading.level - top) * 14}px`;
      item.textContent = heading.text;
      item.addEventListener("click", () => {
        // The nth heading element in the editor, counted the same way
        // the outline counted them. Milkdown renders a heading as a
        // plain `h1`–`h6`, so this needs no cooperation from it.
        const rendered = document.querySelectorAll(".milkdown :is(h1,h2,h3,h4,h5,h6)");
        rendered[heading.ordinal]?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
      outline.appendChild(item);
    }
  }

  function renderState(): void {
    state.hidden = file === null;
    if (!file) return;
    state.textContent = file.dirty ? `Save (${shortcut("S")})` : "Saved";
    state.classList.toggle("is-dirty", file.dirty);
    // Nothing to save is nothing to press. It stays in the tab order
    // only while it is a real action.
    state.disabled = !file.dirty;
    state.setAttribute("aria-label", file.dirty ? `Save ${file.name}` : `${file.name} is saved`);
  }

  function renderProblem(): void {
    problemBox.hidden = problem === null;
    if (!problem) return;
    problemText.textContent = problem.message;
    problemAction.hidden = !problem.action;
    if (problem.action) problemAction.textContent = problem.action.label;
  }

  function render(): void {
    renderIdentity();
    renderState();
    renderProblem();
  }

  /** The real gutter, read off the page rather than computed from the
   * settings — `measure`, `margins` and the window all move it, and the
   * element already knows the answer to all three at once. */
  function measureLayout(): void {
    const page = document.querySelector<HTMLElement>("#dn-page");
    if (!page) return;
    const gutter = page.getBoundingClientRect().left;
    const folded = gutter < MARGIN_MINIMUM;
    document.documentElement.setAttribute("data-spine", folded ? "folded" : "margin");
    document.documentElement.style.setProperty(
      "--dn-spine-width",
      folded ? "auto" : `${Math.min(SPINE_MAXIMUM, Math.round(gutter) - SPINE_GAP)}px`,
    );
  }

  nameButton.addEventListener("click", host.openPalette);
  state.addEventListener("click", () => { void host.save(); });
  problemAction.addEventListener("click", () => problem?.action?.run());

  const onResize = () => measureLayout();
  window.addEventListener("resize", onResize);
  // Catches a settings change too: measure and margins both resize this
  // very element, so there is no second thing to subscribe to.
  const observer = new ResizeObserver(onResize);
  const page = document.querySelector<HTMLElement>("#dn-page");
  if (page) observer.observe(page);

  render();
  measureLayout();

  return {
    setFile(next) { file = next; render(); },
    setLocation(next) { location = next; renderIdentity(); },
    setWorkspace(next) { workspace = next; renderIdentity(); },
    refreshOutline() {
      headings = host.getHeadings().map((heading, ordinal) => ({ ...heading, ordinal }));
      renderOutline();
    },
    setHealth({ total, blocking }) {
      health.hidden = total === 0;
      health.classList.toggle("is-blocking", blocking > 0);
      health.textContent = `${total} problem${total === 1 ? "" : "s"}`;
      health.setAttribute(
        "aria-label",
        blocking > 0
          ? `${total} problem${total === 1 ? "" : "s"} in this document, ${blocking} of which stop the site building. Show them.`
          : `${total} problem${total === 1 ? "" : "s"} in this document. Show them.`,
      );
    },
    setProblem(next) { problem = next; renderProblem(); },
    show() {
      spine.hidden = false;
      measureLayout();
    },
    destroy() {
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      document.documentElement.removeAttribute("data-spine");
      document.documentElement.style.removeProperty("--dn-spine-width");
      spine.remove();
    },
  };
}
