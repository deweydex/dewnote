// One place a command exists, and one place it is named.
//
// Before this there were two: the workflow shell's own menu and
// `command-palette.ts`, each holding its own list, each reaching the
// same hidden rail buttons by CSS selector, and each calling them
// something different — what the menu called "Open a Markdown or YAML
// file…" the palette called "Import Markdown file…", and what the menu
// called "Arrange modules and series" the palette called "Modules". Two
// vocabularies for one set of actions is how an interface stops being
// learnable: there is no name to remember, because there are two.
//
// So a command is registered once, by whoever owns the operation, and
// whatever wants to offer it reads this. The registry holds no DOM and
// no opinion about presentation — the palette draws these as rows, and
// anything else that wants them later gets the same list.

export type CommandSection = "Document" | "Workspace" | "Appearance" | "Publish";

export interface Command {
  /** Stable across renames, so a keybinding or a test can name one. */
  id: string;
  /** What a reader sees, everywhere. An ellipsis means "this opens
   * something that asks a question", the same convention a menu uses. */
  label: string;
  section: CommandSection;
  /** Extra words to match on that the label does not contain — the old
   * palette's real use, kept: somebody looking for "ipynb" should find
   * "Export a Jupyter notebook". Never shown. */
  keywords?: string[];
  /** One line under the label. Say what happens, not what it is. */
  detail?: string;
  /** False hides it entirely rather than showing it disabled: a command
   * that cannot run is noise in a list people scan. */
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
 * Whether `query` matches `text`, and how well. Subsequence matching —
 * the letters in order, gaps allowed — so "expjup" finds "Export a
 * Jupyter notebook" and "wamat" finds "What a Matrix Does to a
 * Picture". A higher score is a better match; `null` is no match.
 *
 * The scoring is deliberately simple and explainable rather than clever:
 * a match at the start of the text beats one in the middle, a match at
 * the start of a word beats one inside a word, and a run of adjacent
 * letters beats the same letters scattered. That is enough to put the
 * thing somebody meant at the top, and it is the whole of the ranking —
 * there is no tie-break on recency or frequency, because a list that
 * reorders itself under you is a list you cannot learn.
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
