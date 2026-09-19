// Why a save did not happen, on its way to wherever the author is
// actually looking.
//
// The repository store writes every failure — a missing token, a 409
// against a file changed underneath it, a 422 on a path already taken —
// into its own panel's status line. That was the whole interface when
// the panel was the interface. Under the progressive shell the panel is
// closed while a document is open, so those messages were landing on a
// surface nobody could see: the author pressed Save, the push failed,
// and the only trace was the dirty marker staying lit. A refused save
// that looks exactly like a successful one is the worst failure this
// app can have, since the next thing an author does is close the tab.
//
// So a store reports a problem rather than only writing one down, and
// the shell decides how to show it. `conflict` is the one kind that
// needs more than a sentence: both versions exist and the author has to
// pick, which only the store's own panel can offer, so the shell opens
// it rather than paraphrasing the choice.

export interface SaveProblem {
  /** One sentence, already written for the author rather than for a log. */
  message: string;
  /** Both versions are in hand and the store is waiting to be told which
   * one wins. The shell reveals the store's panel instead of leaving the
   * choice somewhere the author cannot reach. */
  conflict: boolean;
}

export function saveProblem(message: string, conflict = false): SaveProblem {
  return { message, conflict };
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
