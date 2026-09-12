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

/** Returns the shared toggle rail, creating and appending it to
 * `document.body` on first use. Each panel appends its own toggle button
 * here instead of `document.body` directly — the button's class name,
 * label and click handling are unchanged, only its parent moves. */
export function iconRail(): HTMLDivElement {
  if (rail) return rail;
  rail = document.createElement("div");
  rail.className = "dn-icon-rail";
  document.body.appendChild(rail);
  return rail;
}
