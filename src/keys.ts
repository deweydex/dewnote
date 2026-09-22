// How a shortcut is written for the person reading it: ⌘K on a Mac,
// Ctrl+K everywhere else. The handlers accept either key on every
// platform; this is only about what the screen says.

function onApple(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const APPLE = onApple();

/** A shortcut with the platform's own modifier: `shortcut("K")` is
 * "⌘K" on a Mac and "Ctrl+K" elsewhere. */
export function shortcut(key: string): string {
  return APPLE ? `⌘${key}` : `Ctrl+${key}`;
}
