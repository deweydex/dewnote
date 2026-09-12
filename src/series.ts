// Step 4's own "the series view from order.yaml" (PLAN.md §6 step 4) —
// read against dewlab's own build.py (order_files(), series_titles()),
// not guessed from DIALECTS.md's summary of it alone: one
// `<series-slug>.order.yaml` file per series, under `tutorials/<module>/`,
// shaped `{series: "Human title", order: [slug, slug, ...]}`. A real,
// found-while-building correction to DIALECTS.md §1's own wording ("one
// slug per line, never a nested map") is folded into that file alongside
// this — it IS a two-key mapping; only `order:`'s own value is a flat
// list of slugs, one per line.
//
// Read-only, on purpose: this shows a series' own reading order, cross-
// referenced against whatever the folder or repository's own front-matter
// index (file-index.ts) already knows about each slug. Reordering a
// series, creating a new one, or opening a listed tutorial with one
// click are each their own real piece of work — PLAN.md §6 step 4 lists
// "new tutorial from a template" and "new series" as separate items, and
// opening-by-slug needs a store-agnostic hook neither folder-panel.ts
// nor repo-panel.ts exposes today — none of that is folded in here.

import { load as parseYaml } from "js-yaml";

export interface Series {
  /** The parent directory's own name in the mounted folder or
   * repository — whatever it's actually called there. Never assumed to
   * be literally "tutorials/", since a plain-markdown folder or a
   * differently laid out checkout is exactly why this comes from the
   * path rather than being hardcoded. */
  module: string;
  /** The order file's own name, minus the `.order.yaml` suffix — a
   * series' own slug, not necessarily equal to any tutorial's. */
  slug: string;
  title: string;
  order: string[];
}

const ORDER_SUFFIX = ".order.yaml";

/** One order file, or `null` for anything that isn't one, or one this
 * can't make sense of. dewlab's own build.py calls a malformed order
 * file a hard failure; this is a read-only viewer, not a build, so a
 * file it can't parse is left out of the series list silently rather
 * than blocking a document that has nothing to do with it. */
export function parseSeriesFile(path: string, content: string): Series | null {
  if (!path.endsWith(ORDER_SUFFIX)) return null;
  const segments = path.split("/");
  const fileName = segments[segments.length - 1]!;
  const module = segments.length >= 2 ? segments[segments.length - 2]! : "";
  const slug = fileName.slice(0, -ORDER_SUFFIX.length);

  let data: unknown;
  try {
    data = parseYaml(content);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { series, order } = data as Record<string, unknown>;
  if (typeof series !== "string" || !series.trim()) return null;
  if (!Array.isArray(order) || !order.every((entry) => typeof entry === "string")) return null;
  return { module, slug, title: series.trim(), order: order as string[] };
}

/** Every real series among `files` — the shape folder-panel.ts's and
 * repo-panel.ts's own order-file reads already produce, one entry per
 * file regardless of whether it turned out to be a real series. */
export function parseSeriesFiles(files: { path: string; content: string }[]): Series[] {
  return files.flatMap((file) => {
    const series = parseSeriesFile(file.path, file.content);
    return series ? [series] : [];
  });
}
