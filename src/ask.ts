// One question, in the overlay everything else uses.
//
// A `window.prompt` would do the job and look like 1997 in the middle of
// a page that otherwise looks like a book.

export interface Choice {
  value: string;
  label: string;
  /** One line under the label: where this leads, or what it already is. */
  note?: string;
}

export interface Ask {
  /** Resolves with what was typed, or null if the author left. */
  ask(question: string, options?: { label?: string; value?: string; confirm?: string }): Promise<string | null>;
  /** Resolves with the chosen value, or null. A list rather than a text
   * field, because the answer is one of a known set and typing it out
   * would only be a way to get it wrong. */
  choose(question: string, choices: readonly Choice[], note?: string): Promise<string | null>;
  destroy(): void;
}

export function mountAsk(): Ask {
  const overlay = document.createElement("div");
  overlay.className = "dn-ask-overlay";
  overlay.hidden = true;
  document.body.appendChild(overlay);

  let settle: ((value: string | null) => void) | null = null;

  function close(value: string | null): void {
    overlay.hidden = true;
    overlay.replaceChildren();
    settle?.(value);
    settle = null;
  }

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close(null);
  });

  return {
    ask(question, options = {}) {
      return new Promise<string | null>((resolve) => {
        settle = resolve;

        const form = document.createElement("form");
        form.className = "dn-ask";
        form.setAttribute("role", "dialog");
        form.setAttribute("aria-label", question);

        const heading = document.createElement("h2");
        heading.textContent = question;

        const label = document.createElement("label");
        label.className = "dn-ask-field";
        const name = document.createElement("span");
        name.textContent = options.label ?? "";
        const input = document.createElement("input");
        input.type = "text";
        input.value = options.value ?? "";
        input.required = true;
        label.append(name, input);

        const actions = document.createElement("div");
        actions.className = "dn-ask-actions";
        const go = document.createElement("button");
        go.type = "submit";
        go.className = "dn-ask-go";
        go.textContent = options.confirm ?? "Continue";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Not now";
        cancel.addEventListener("click", () => close(null));
        actions.append(go, cancel);

        form.append(heading, label, actions);
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          const value = input.value.trim();
          if (value) close(value);
        });
        form.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close(null);
          }
        });

        overlay.replaceChildren(form);
        overlay.hidden = false;
        input.focus();
        input.select();
      });
    },

    choose(question, choices, note) {
      return new Promise<string | null>((resolve) => {
        settle = resolve;

        const box = document.createElement("div");
        box.className = "dn-ask dn-ask-choices";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-label", question);

        const heading = document.createElement("h2");
        heading.textContent = question;
        box.appendChild(heading);
        if (note) {
          const line = document.createElement("p");
          line.className = "dn-ask-note";
          line.textContent = note;
          box.appendChild(line);
        }

        if (choices.length === 0) {
          const empty = document.createElement("p");
          empty.className = "dn-ask-note";
          empty.textContent = "There is nothing to choose from.";
          box.appendChild(empty);
        }

        for (const choice of choices) {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "dn-ask-choice";
          const label = document.createElement("span");
          label.className = "dn-ask-choice-label";
          label.textContent = choice.label;
          row.appendChild(label);
          if (choice.note) {
            const detail = document.createElement("span");
            detail.className = "dn-ask-choice-note";
            detail.textContent = choice.note;
            row.appendChild(detail);
          }
          row.addEventListener("click", () => close(choice.value));
          box.appendChild(row);
        }

        box.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close(null);
          }
        });

        overlay.replaceChildren(box);
        overlay.hidden = false;
        box.querySelector<HTMLElement>("button")?.focus();
      });
    },

    destroy() {
      close(null);
      overlay.remove();
    },
  };
}
