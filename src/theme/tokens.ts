// dewlab's tokens, read once and used twice.
//
// The editor needs them as a stylesheet; the exported page needs them as
// text to inline, since a `var(--dl-*)` with nothing behind it is how an
// exported page ends up in the browser's default serif at full window
// width. A file cannot be imported both ways — the bundler picks one
// loader per specifier — so it is imported as text here and turned into
// a stylesheet by hand.
//
// Order does not matter against `style.css`: these are `:root` custom
// properties, and `style.css` only reads them. It defines `--dn-*` and
// nothing else.

import tokensCss from "./dewlab-tokens.css" with { type: "text" };

export { tokensCss };

export function applyTokens(): void {
  const style = document.createElement("style");
  style.textContent = tokensCss;
  document.head.prepend(style);
}
