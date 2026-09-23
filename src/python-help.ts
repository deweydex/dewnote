// Help while writing a Python cell: completion, a name's documentation
// on hover, and the signature of the call being typed. All three come
// from Jedi, running in the Pyodide worker (runtime/pyodide-engine.ts's
// `editorHelp`), which reads both the cell's source and the page's live
// namespace. dewlab's own tutorial pages and dewmini use Jedi the same
// way for hover and signatures.
//
// Crepe gives every code block CodeMirror's `basicSetup`, which already
// has autocompletion; Jedi joins it as one more completion source for
// the Python language, so before Python has loaded (and in a block that
// is not Python) the editor's own suggestions carry on alone.
//
// Nothing here imports a CodeMirror package Crepe does not already use,
// and every one resolves to Crepe's own copy (see ARCHITECTURE.md).

import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { language } from "@codemirror/language";
import { pythonLanguage } from "@codemirror/lang-python";
import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, hoverTooltip, showTooltip, ViewPlugin, type Tooltip, type ViewUpdate } from "@codemirror/view";
import { codeOnItsLines } from "./cells.ts";

export interface PythonHelpHost {
  /** Asks Jedi. Null when there is no answer, or none in time. */
  ask(
    kind: "complete" | "hover" | "signature",
    source: string,
    context: string,
    line: number,
    column: number,
    options?: { boot?: boolean },
  ): Promise<unknown>;
  /** The code of the cells above the one holding `source`, so a name
   * defined there is known here before anything has run. */
  contextFor(source: string): string;
}

const isPython = (state: EditorState): boolean => state.facet(language)?.name === "python";

/** Where `pos` is, in the terms Jedi takes. */
function positionOf(state: EditorState, pos: number): { source: string; line: number; column: number } {
  const line = state.doc.lineAt(pos);
  return { source: codeOnItsLines(state.doc.toString()), line: line.number, column: pos - line.from };
}

function completionSource(host: PythonHelpHost) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const word = context.matchBefore(/\w*/);
    if (!word) return null;
    const afterDot = context.state.sliceDoc(word.from - 1, word.from) === ".";
    if (word.from === word.to && !afterDot && !context.explicit) return null;

    const at = positionOf(context.state, context.pos);
    const found = await host.ask("complete", at.source, host.contextFor(context.state.doc.toString()), at.line, at.column, {
      boot: true,
    });
    if (context.aborted || !Array.isArray(found) || found.length === 0) return null;
    return {
      from: word.from,
      options: (found as { label: string; type: string }[]).map(({ label, type }) => ({ label, type })),
      validFor: /^\w*$/,
    };
  };
}

function hoverDocs(host: PythonHelpHost): Extension {
  return hoverTooltip(async (view, pos) => {
    if (!isPython(view.state)) return null;
    const word = view.state.wordAt(pos);
    if (!word) return null;
    const at = positionOf(view.state, pos);
    const text = await host.ask("hover", at.source, host.contextFor(view.state.doc.toString()), at.line, at.column);
    if (typeof text !== "string" || !text.trim()) return null;
    return {
      pos: word.from,
      end: word.to,
      above: true,
      create: () => {
        const dom = document.createElement("div");
        dom.className = "dn-help dn-help-doc";
        dom.textContent = text;
        return { dom };
      },
    };
  });
}

/** A call's parameters, split at the top-level commas, so the one being
 * typed can be picked out. */
function parameters(label: string): { head: string; params: string[]; tail: string } | null {
  const open = label.indexOf("(");
  if (open === -1) return null;
  let depth = 0;
  let close = -1;
  for (let at = open; at < label.length; at += 1) {
    const character = label[at]!;
    if ("([{".includes(character)) depth += 1;
    else if (")]}".includes(character)) {
      depth -= 1;
      if (depth === 0) {
        close = at;
        break;
      }
    }
  }
  if (close === -1) return null;
  const params: string[] = [];
  let start = open + 1;
  depth = 0;
  for (let at = open + 1; at < close; at += 1) {
    const character = label[at]!;
    if ("([{".includes(character)) depth += 1;
    else if (")]}".includes(character)) depth -= 1;
    else if (character === "," && depth === 0) {
      params.push(label.slice(start, at).trim());
      start = at + 1;
    }
  }
  if (label.slice(start, close).trim()) params.push(label.slice(start, close).trim());
  return { head: label.slice(0, open + 1), params, tail: label.slice(close) };
}

const setSignature = StateEffect.define<Tooltip | null>();

const signatureField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(setSignature)) return effect.value;
    // A signature for where the cursor was a moment ago is wrong once
    // the text under it has moved; the plugin asks again.
    return transaction.docChanged ? null : value;
  },
  provide: (field) => showTooltip.from(field),
});

function signatureTooltip(pos: number, answer: { label: string; index: number | null }): Tooltip {
  return {
    pos,
    above: true,
    create: () => {
      const dom = document.createElement("div");
      dom.className = "dn-help dn-help-signature";
      const split = parameters(answer.label);
      if (!split || answer.index === null || answer.index === undefined) {
        dom.textContent = answer.label;
        return { dom };
      }
      dom.append(split.head);
      split.params.forEach((param, at) => {
        if (at > 0) dom.append(", ");
        if (at === answer.index) {
          const current = document.createElement("strong");
          current.textContent = param;
          dom.append(current);
        } else {
          dom.append(param);
        }
      });
      dom.append(split.tail);
      return { dom };
    },
  };
}

function signatureHelp(host: PythonHelpHost): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      private timer: ReturnType<typeof setTimeout> | undefined;
      private asked = 0;

      constructor(private readonly view: EditorView) {}

      update(update: ViewUpdate): void {
        if (!update.docChanged && !update.selectionSet) return;
        clearTimeout(this.timer);
        if (!update.view.hasFocus || !isPython(update.state)) return;
        this.timer = setTimeout(() => void this.ask(), 200);
      }

      private async ask(): Promise<void> {
        const state = this.view.state;
        const pos = state.selection.main.head;
        // Only inside an open call: an unclosed "(" before the cursor on
        // this line or the ones above it in this cell.
        const before = state.sliceDoc(0, pos);
        let depth = 0;
        for (const character of before) {
          if (character === "(") depth += 1;
          else if (character === ")") depth = Math.max(0, depth - 1);
        }
        const ticket = ++this.asked;
        if (depth === 0) {
          if (state.field(signatureField)) this.view.dispatch({ effects: setSignature.of(null) });
          return;
        }
        const at = positionOf(state, pos);
        const answer = await host.ask("signature", at.source, host.contextFor(state.doc.toString()), at.line, at.column, {
          boot: true,
        });
        // The author has typed on since; a later request will answer.
        if (ticket !== this.asked || this.view.state.selection.main.head !== pos) return;
        const tooltip =
          answer && typeof answer === "object" && typeof (answer as { label?: unknown }).label === "string"
            ? signatureTooltip(pos, answer as { label: string; index: number | null })
            : null;
        this.view.dispatch({ effects: setSignature.of(tooltip) });
      }

      destroy(): void {
        clearTimeout(this.timer);
      }
    },
  );
  return [signatureField, plugin];
}

/** Everything a code block needs for Python help. Harmless in a block of
 * any other language: each part checks the language first. */
export function pythonHelp(host: PythonHelpHost): Extension {
  return [pythonLanguage.data.of({ autocomplete: completionSource(host) }), hoverDocs(host), signatureHelp(host)];
}
