// Why a save did not happen, on its way to the author.
//
// A refused save that looks like a successful one is the worst failure
// this application can have: the next thing an author does is close the
// tab. So a store throws one of these and the shell shows it.

export interface SaveProblem {
  /** One sentence, written for the author rather than for a log. */
  message: string;
  /** Both versions exist and the author has to pick which one wins. */
  conflict: boolean;
}

export function saveProblem(message: string, conflict = false): SaveProblem {
  return { message, conflict };
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
