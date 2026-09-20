// The whole file, as text.
//
// The editor shows a document; sometimes what is wanted is the file — to
// fix front matter, to paste a fence in whole, to see exactly what a
// save will write. Nothing else here can show that.
//
// A plain textarea, not a second CodeMirror. Crepe carries its own copy
// of `@codemirror/state`, and a second one in the bundle breaks its
// `instanceof` checks: "Unrecognized extension value in extension set",
// and no editor at all. Syntax colour in a panel somebody opens to fix
// one line is not worth that.

export interface SourceView {
  /** Show `text`; `onApply` is called with what the author kept. */
  open(text: string, onApply: (next: string) => void): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

export function mountSourceView(): SourceView {
  const overlay = document.createElement("div");
  overlay.className = "dn-source-overlay";
  overlay.hidden = true;

  const box = document.createElement("div");
  box.className = "dn-source";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "The whole file");

  const heading = document.createElement("h2");
  heading.textContent = "The whole file";
  const note = document.createElement("p");
  note.textContent = "Front matter, fence markers and all. ⌘↵ keeps it, Esc leaves it.";

  const area = document.createElement("textarea");
  area.className = "dn-source-text";
  area.spellcheck = false;
  area.setAttribute("aria-label", "The document's markdown");

  const actions = document.createElement("div");
  actions.className = "dn-source-actions";
  const keepButton = document.createElement("button");
  keepButton.type = "button";
  keepButton.className = "dn-source-keep";
  keepButton.textContent = "Keep these changes";
  const leaveButton = document.createElement("button");
  leaveButton.type = "button";
  leaveButton.textContent = "Leave it as it was";
  actions.append(keepButton, leaveButton);

  box.append(heading, note, area, actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  let apply: ((next: string) => void) | null = null;

  function close(): void {
    overlay.hidden = true;
    apply = null;
  }

  function keep(): void {
    apply?.(area.value);
    close();
  }

  keepButton.addEventListener("click", keep);
  leaveButton.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  area.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      keep();
      return;
    }
    // A textarea would otherwise move focus out of the panel, which is
    // the wrong thing when the content is indented code.
    if (event.key === "Tab") {
      event.preventDefault();
      const { selectionStart: from, selectionEnd: to, value } = area;
      area.value = `${value.slice(0, from)}  ${value.slice(to)}`;
      area.selectionStart = area.selectionEnd = from + 2;
    }
  });

  return {
    isOpen: () => !overlay.hidden,

    open(text, onApply) {
      apply = onApply;
      area.value = text;
      overlay.hidden = false;
      area.focus();
      area.setSelectionRange(0, 0);
    },

    close,

    destroy() {
      close();
      overlay.remove();
    },
  };
}
