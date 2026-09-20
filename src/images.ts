// An image that lives beside the document that names it.
//
// Both builds resolve `![](diagram.svg)` against the folder the markdown
// sits in, so that is what the file says and what the editor has to
// reproduce. The markdown is never rewritten: the resolved URL goes on
// the `<img>` element, and the document keeps the bare name.

/** A src the document owns, rather than one pointing at the web. */
export function isLocalAsset(src: string): boolean {
  return src !== "" && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src);
}

/** Where a document's own `src` resolves to, as a store path. Relative
 * segments are honoured so a shared `../assets/x.png` works. */
export function assetPathFor(documentPath: string, src: string): string {
  const folder = documentPath.split("/").slice(0, -1);
  const parts = src.split("/");
  const out = [...folder];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

const TYPES: Record<string, string> = {
  apng: "image/apng",
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

/** The media type a browser needs to draw the bytes, from the name. An
 * unknown extension gets no type rather than a wrong one. */
export function imageTypeOf(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[extension] ?? "";
}

export function isImageName(name: string): boolean {
  return imageTypeOf(name) !== "";
}

/** A file name free in `taken`, keeping the original where it is free
 * and numbering it where it is not. An image is named after what it
 * shows, and a name that already means something else is the one thing
 * that must not happen. */
export function freeAssetName(taken: readonly string[], fileName: string): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  const clean = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!used.has(clean)) return clean;
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const suffix = dot > 0 ? clean.slice(dot) : "";
  for (let at = 2; ; at += 1) {
    const candidate = `${stem}-${at}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
