// A single drag handle, shared by every fixed-width side panel — the
// repository, settings, series, folder, outline, dialect and link-check
// panels all read the one `--dn-panel-width` custom property
// (settings.ts's own root-property mechanism), so dragging any one of
// them widens or narrows them all. They open one at a time from the same
// icon rail (icon-rail.ts), so a reader who drags one wider almost
// certainly wants the next one they open just as wide, not back at
// whatever the stylesheet's own default is.
//
// Pointer capture, not a plain mousemove/mouseup pair on the handle
// itself: the drag keeps tracking even once the cursor leaves the
// handle's own few pixels mid-gesture, which capture is exactly for.

import { clampPanelWidth, loadSettings, saveSettings } from "./settings.ts";

/** Which side of the panel the handle sits on, and so which direction of
 * drag widens it: `"right"` for a left-docked panel (the repository
 * panel, so far the only one), `"left"` for every right-docked one. */
export type PanelEdge = "left" | "right";

/** The rem width a drag would produce, given the pointer's clientX, the
 * viewport width, which edge the handle sits on, and the root font size
 * in px (so a browser's own zoom level still converts pixels to rem
 * correctly). Kept free of the DOM so it can be unit-tested directly —
 * attachResizeHandle, below, is the only thing that actually touches
 * `document`. */
export function widthFromPointer(clientX: number, viewportWidth: number, edge: PanelEdge, rootFontSizePx: number): number {
  const px = edge === "right" ? clientX : viewportWidth - clientX;
  return clampPanelWidth(px / rootFontSizePx);
}

function rootFontSizePx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

function applyPanelWidth(rem: number): void {
  document.documentElement.style.setProperty("--dn-panel-width", `${rem}rem`);
}

/** Appends a drag handle to `panel`'s own inner edge. A drag only writes
 * to storage once, on release — every intermediate position just updates
 * the live `--dn-panel-width`, so a reader who cancels a drag mid-gesture
 * (Escape has no special handling here, but dragging back to where they
 * started does) never pays for a settings write on every pointermove. */
export function attachResizeHandle(panel: HTMLElement, edge: PanelEdge): void {
  const handle = document.createElement("div");
  handle.className = `dn-panel-resize dn-panel-resize-${edge}`;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", "Resize panel");
  handle.tabIndex = 0;
  panel.appendChild(handle);

  let width = loadSettings().panelWidth;

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      width = widthFromPointer(moveEvent.clientX, window.innerWidth, edge, rootFontSizePx());
      applyPanelWidth(width);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      saveSettings({ ...loadSettings(), panelWidth: width });
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  });

  // Left/Right, for a reader who can't or won't drag — a separator this
  // small has no other keyboard story otherwise. Which key widens the
  // panel depends on `edge` the same way the drag direction does.
  const WIDEN_KEY: Record<PanelEdge, string> = { right: "ArrowRight", left: "ArrowLeft" };
  const NARROW_KEY: Record<PanelEdge, string> = { right: "ArrowLeft", left: "ArrowRight" };
  handle.addEventListener("keydown", (event) => {
    let delta = 0;
    if (event.key === WIDEN_KEY[edge]) delta = 1;
    else if (event.key === NARROW_KEY[edge]) delta = -1;
    else return;
    event.preventDefault();
    width = clampPanelWidth(loadSettings().panelWidth + delta);
    applyPanelWidth(width);
    saveSettings({ ...loadSettings(), panelWidth: width });
  });
}
