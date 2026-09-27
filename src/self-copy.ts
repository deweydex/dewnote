// dewnote as a file of its own, for someone who would rather keep a copy
// on their computer than visit the site.
//
// The build writes the application twice: as the page the site serves,
// and as `dewnote.html` beside it, which differs only in carrying its
// icon inside it (scripts/inline-single-file.ts). A download fetches that
// second file, so what arrives is exactly what the build made, rather
// than the page as it stands after the application has run over it.

/** The file the build writes beside the page, and the name it downloads
 * under. */
export const SELF_COPY_NAME = "dewnote.html";

/** Only a copy served from a site has a file beside it to fetch. Opened
 * from disk, this is already the downloaded copy. */
export function canDownloadDewnote(): boolean {
  return location.protocol === "http:" || location.protocol === "https:";
}

export async function downloadDewnote(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(new URL(SELF_COPY_NAME, location.href), { cache: "no-cache" });
  } catch {
    throw new Error("Not downloaded: dewnote could not reach its own file. Check the connection and try again.");
  }
  if (!response.ok) {
    throw new Error("Not downloaded: this copy of dewnote was built without a file to download.");
  }
  const blob = new Blob([await response.arrayBuffer()], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = SELF_COPY_NAME;
  link.click();
  // Revoked on the next turn, once the click has been taken up.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
