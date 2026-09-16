// Every panel mounts independently (main.ts calls eight `mount*Panel`
// functions with no shared parent), and until now each one picked its own
// `position: fixed; top: Nrem` offset by hand — eight numbers, hand-spaced
// by whoever wrote that panel, with the repository toggle left stranded on
// the opposite side of the screen from the rest. This is the one shared
// container all of them append their toggle button into instead, so the
// stack lays itself out and a ninth panel costs nothing to place.
//
// Lazily created and memoised: the first panel to mount creates the rail,
// every later one reuses it. Nothing tears it down, matching every panel's
// own "mounted once, independently of any particular document" lifecycle.

let rail: HTMLDivElement | null = null;
let resizer: HTMLDivElement | null = null;
interface DockEntry {
  toggle: HTMLButtonElement;
  panel: HTMLElement;
  onActivate?: () => void;
  onDeactivate?: () => void;
}
const docked: DockEntry[] = [];

function setPanelWidth(width: number): void {
  const max = Math.min(720, window.innerWidth * 0.7);
  const next = Math.max(280, Math.min(max, width));
  document.documentElement.style.setProperty("--dn-inspector-width", `${next}px`);
  localStorage.setItem("dewnote.inspectorWidth", String(next));
}

function ensureResizer(): void {
  if (resizer) return;
  document.documentElement.classList.add("dn-has-inspector");
  const saved = Number(localStorage.getItem("dewnote.inspectorWidth"));
  if (Number.isFinite(saved) && saved > 0) setPanelWidth(saved);
  resizer = document.createElement("div");
  resizer.className = "dn-inspector-resizer";
  resizer.tabIndex = 0;
  resizer.setAttribute("role", "separator");
  resizer.setAttribute("aria-orientation", "vertical");
  resizer.setAttribute("aria-label", "Resize sidebar");
  const grip = document.createElement("span");
  grip.className = "dn-inspector-resizer-grip";
  grip.textContent = "•••";
  resizer.appendChild(grip);
  resizer.addEventListener("pointerdown", (event) => {
    resizer?.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => setPanelWidth(window.innerWidth - next.clientX - 104);
    const up = () => {
      resizer?.removeEventListener("pointermove", move);
      resizer?.removeEventListener("pointerup", up);
    };
    resizer?.addEventListener("pointermove", move);
    resizer?.addEventListener("pointerup", up);
  });
  resizer.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const current = docked.find((item) => !item.panel.hidden)?.panel.getBoundingClientRect().width ?? 352;
    setPanelWidth(current + (event.key === "ArrowLeft" ? 24 : -24));
  });
  document.body.appendChild(resizer);
}

function activate(entry: DockEntry): void {
  const previous = docked.find((item) => !item.panel.hidden);
  if (previous && previous !== entry) previous.onDeactivate?.();
  for (const item of docked) {
    const active = item === entry;
    item.panel.hidden = !active;
    item.toggle.setAttribute("aria-expanded", String(active));
    item.toggle.setAttribute("aria-selected", String(active));
    item.toggle.classList.toggle("is-active", active);
  }
  if (previous !== entry) entry.onActivate?.();
}

/** Returns the shared toggle rail, creating and appending it to
 * `document.body` on first use. Each panel appends its own toggle button
 * here instead of `document.body` directly — the button's class name,
 * label and click handling are unchanged, only its parent moves. */
export function iconRail(): HTMLDivElement {
  if (rail) return rail;
  rail = document.createElement("div");
  rail.className = "dn-icon-rail";
  rail.setAttribute("role", "tablist");
  document.body.appendChild(rail);
  return rail;
}

/** Registers a right-hand panel as a persistent dock tab. */
export function dockPanel(
  toggle: HTMLButtonElement,
  panel: HTMLElement,
  defaultOpen = false,
  lifecycle: Pick<DockEntry, "onActivate" | "onDeactivate"> = {},
): void {
  ensureResizer();
  panel.classList.add("dn-docked-panel");
  toggle.setAttribute("role", "tab");
  const entry = { toggle, panel, ...lifecycle };
  docked.push(entry);
  toggle.addEventListener("click", () => activate(entry));
  panel.querySelector<HTMLButtonElement>('[class$="-close"]')?.addEventListener("click", () => {
    const fallback = docked.find((item) => item !== entry && !item.toggle.disabled);
    if (fallback) activate(fallback);
  });
  if (defaultOpen || docked.length === 1) activate(entry);
}

/** Gives a toggle a word to sit under its glyph on the bottom bar.
 *
 * A row of eight unlabelled glyphs is a memory test — ▤ and ⌂ and ≡ mean
 * nothing until you have opened each one and learned it, and on a phone
 * there is no tooltip to hover for the answer. The label is rendered from
 * this attribute by CSS (`::after`) rather than as a second element, so
 * the button stays one node with one accessible name and nothing here
 * has to know whether the rail is currently a column or a bar.
 *
 * Deliberately shorter than the panel's own heading where that heading is
 * long: this is a tab bar's worth of space, and a word that wraps or
 * truncates is worse than a shorter word that doesn't. */
export function labelToggle(toggle: HTMLElement, word: string): void {
  toggle.dataset["label"] = word;
}
