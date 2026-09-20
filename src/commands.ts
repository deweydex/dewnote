// One place a command exists, and one place it is named. Two names for
// one action is how an interface stops being learnable.
//
// No DOM, no opinion about presentation. The palette draws these as
// rows.

export type CommandSection = "Document" | "Workspace" | "Appearance" | "Publish";

export interface Command {
  /** Stable across renames, so a keybinding or a test can name one. */
  id: string;
  /** An ellipsis means it opens something that asks a question. */
  label: string;
  section: CommandSection;
  /** Words to match that the label does not contain — "ipynb" finds
   * "Export a Jupyter notebook". Never shown. */
  keywords?: string[];
  /** One line under the label: what happens, not what it is. */
  detail?: string;
  /** False hides it rather than disabling it. */
  available?(): boolean;
  run(): void | Promise<void>;
}

const commands = new Map<string, Command>();

export function registerCommand(command: Command): void {
  commands.set(command.id, command);
}

export function registerCommands(list: readonly Command[]): void {
  for (const command of list) registerCommand(command);
}

/** Every command that can run right now, in registration order — which
 * is the order the modules mount in, so it is stable between reloads
 * rather than whatever a hash map felt like. */
export function availableCommands(): Command[] {
  return [...commands.values()].filter((command) => command.available?.() !== false);
}

export function runCommand(id: string): void {
  const command = commands.get(id);
  if (!command) return;
  void command.run();
}

/** Only for tests and teardown; nothing in the app un-registers. */
export function clearCommands(): void {
  commands.clear();
}

/**
 * How well `query` matches `text`. Subsequence matching — letters in
 * order, gaps allowed — so "wamat" finds "What a Matrix Does to a
 * Picture". Higher is better; `null` is no match.
 *
 * Start of the text beats the middle, start of a word beats inside one,
 * adjacent letters beat scattered ones. No tie-break on recency or
 * frequency: a list that reorders itself under you cannot be learned.
 */
export function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 0;
  const needle = query.toLowerCase();
  const haystack = text.toLowerCase();

  /** What one matched character is worth where it landed. */
  const worth = (found: number, previous: number): number => {
    if (found === 0) return 12;
    if (found === previous + 1) return 8;
    if (!/[a-z0-9]/.test(haystack[found - 1] ?? "")) return 6;
    return 1;
  };

  // The scan is greedy — it takes the leftmost letter that fits — and a
  // greedy scan can miss the alignment a reader means. "grid" against
  // "Multiplying Grids" takes the g in "Multiplying" and then has to
  // scatter the rest, scoring it below "A Grid of Numbers" even though
  // the word is right there. So the whole query as a contiguous run is
  // scored separately, on the same scale, and the better of the two
  // wins. Backtracking properly would cost a real algorithm; this costs
  // one `indexOf` and fixes the case that actually comes up.
  let best: number | null = null;
  const whole = haystack.indexOf(needle);
  if (whole !== -1) best = worth(whole, -2) + 8 * (needle.length - 1);

  let score = 0;
  let at = 0;
  let previous = -2;
  for (const character of needle) {
    const found = haystack.indexOf(character, at);
    if (found === -1) {
      if (best === null) return null;
      score = Number.NEGATIVE_INFINITY;
      break;
    }
    score += worth(found, previous);
    previous = found;
    at = found + 1;
  }
  if (best === null || score > best) best = score;

  // A short text that matched is a closer match than a long one that
  // happened to contain the same letters somewhere.
  return best - Math.min(haystack.length, 60) / 20;
}
