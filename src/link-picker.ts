// Step 8's link picker — plan §6's own "the link picker... has the same
// multi-file dependency as the front-matter picker and waits on the
// same thing": file-index.ts's index, built once a folder or repository
// is open. Mirrors app.ts's own pickImageFile in shape: a self-contained
// async prompt, built and torn down around one decision, returning the
// markdown to insert (or null on cancel) rather than inserting anything
// itself — app.ts still owns where in the document that markdown lands.

import type { FileIndexEntry } from "./file-index.ts";

/** dewlab and dewstack's own convention (plan §6 step 2's note: "tutorial:
 * links round-trip and render fine as ordinary markdown links already") —
 * used whenever the picked file has a slug, since a `tutorial:` link
 * survives a tutorial being moved to a different path in a way a plain
 * relative path never would. Falls back to the file's own path only for
 * an entry with no slug in its front matter. */
function targetFor(entry: FileIndexEntry): string {
  return entry.slug ? `tutorial:${entry.slug}` : entry.path;
}

/**
 * Opens a small overlay over the given file index: search by title or
 * path, pick one, or fall back to a custom link typed by hand — every
 * document has this even with an empty index, since a URL to somewhere
 * else entirely is a real, common case a slug-only picker would leave
 * with no way in. Resolves to the `[text](target)` markdown to insert,
 * or null if the reader cancels (Escape, or a click outside the box).
 */
export function pickLink(index: FileIndexEntry[]): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "dn-link-overlay";

    const box = document.createElement("div");
    box.className = "dn-link-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Insert link");
    overlay.appendChild(box);

    function finish(markdown: string | null) {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
      resolve(markdown);
    }

    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") finish(null);
    }
    document.addEventListener("keydown", onKeydown);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(null);
    });

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "dn-link-search";
    searchInput.placeholder = "Search tutorials by title…";
    box.appendChild(searchInput);

    const list = document.createElement("ul");
    list.className = "dn-link-list";
    box.appendChild(list);

    function renderList() {
      const query = searchInput.value.trim().toLowerCase();
      const matches = query
        ? index.filter((e) => (e.title ?? e.path).toLowerCase().includes(query) || e.path.toLowerCase().includes(query))
        : index;
      list.replaceChildren();
      for (const entry of matches.slice(0, 100)) {
        const li = document.createElement("li");
        li.className = "dn-link-item";
        const button = document.createElement("button");
        button.type = "button";
        const label = entry.title ?? entry.path;
        button.textContent = label;
        button.addEventListener("click", () => finish(`[${label}](${targetFor(entry)})`));
        li.appendChild(button);
        list.appendChild(li);
      }
      if (index.length > 0 && matches.length === 0) {
        const empty = document.createElement("li");
        empty.className = "dn-link-empty";
        empty.textContent = "No matches — use a custom link below.";
        list.appendChild(empty);
      }
    }
    searchInput.addEventListener("input", renderList);
    renderList();

    const customHint = document.createElement("p");
    customHint.className = "dn-link-hint";
    customHint.textContent =
      index.length === 0 ? "No indexed tutorials yet — open a folder or repository first, or link anywhere directly:" : "Or link anywhere directly:";
    box.appendChild(customHint);

    const textField = document.createElement("input");
    textField.type = "text";
    textField.className = "dn-link-text";
    textField.placeholder = "Link text";
    const urlField = document.createElement("input");
    urlField.type = "text";
    urlField.className = "dn-link-url";
    urlField.placeholder = "URL or tutorial:slug";
    const customRow = document.createElement("div");
    customRow.className = "dn-link-custom-row";
    customRow.append(textField, urlField);
    box.appendChild(customRow);

    const insertButton = document.createElement("button");
    insertButton.type = "button";
    insertButton.className = "dn-link-insert";
    insertButton.textContent = "Insert";
    insertButton.addEventListener("click", () => {
      const url = urlField.value.trim();
      if (!url) return;
      const text = textField.value.trim() || url;
      finish(`[${text}](${url})`);
    });
    box.appendChild(insertButton);

    document.body.appendChild(overlay);
    queueMicrotask(() => searchInput.focus());
  });
}
