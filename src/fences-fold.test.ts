import { describe, expect, test } from "bun:test";
import { appPage, foldLine, paneGroups } from "./fences.ts";

describe("foldLine", () => {
  test("reads a hint's opening line", () => {
    expect(foldLine('<details class="dl-hint"><summary>stuck? here are some steps</summary>')).toEqual({
      kind: "open",
      label: "Hint",
      summary: "stuck? here are some steps",
      tag: "details",
      wrapper: false,
    });
  });

  test("reads an answer's, and names any other fold plainly", () => {
    expect(foldLine('<details class="dl-answer"><summary>answer</summary>')).toMatchObject({ label: "Answer" });
    expect(foldLine("<details><summary>More</summary>")).toMatchObject({ label: "Fold", summary: "More" });
  });

  test("reads the close", () => {
    expect(foldLine("</details>")).toEqual({ kind: "close", tag: "details" });
  });

  test("reads a hand-written page's section wrappers, each with the tag that closes it", () => {
    expect(foldLine('<div class="dl-hero">')).toEqual({ kind: "open", label: "Hero", summary: "", tag: "div", wrapper: true });
    expect(foldLine('<ul class="dl-feature-list">')).toMatchObject({ label: "Feature list", tag: "ul" });
    expect(foldLine("</div>")).toEqual({ kind: "close", tag: "div" });
    // Only the wrappers dewlab's build converts the inside of.
    expect(foldLine('<div class="note">')).toBeNull();
  });

  test("is not fooled by other HTML", () => {
    expect(foldLine("<br />")).toBeNull();
    expect(foldLine('<p class="dl-bs-sum">x</p>')).toBeNull();
  });
});

import { siteGroups, sitePage } from "./fences.ts";

describe("siteGroups", () => {
  const pane = (language: string, site: string, code: string) => ({
    info: `${language} site`,
    body: `id: ${language}-${site}\nsite: ${site}\n${code}`,
  });

  test("consecutive panes naming one site are one editor, in order", () => {
    const groups = siteGroups([pane("html", "demo", "<p>hi</p>"), pane("css", "demo", "p { color: red; }")]);
    expect(groups).toEqual([
      {
        site: "demo",
        panes: [
          { at: 0, language: "html", code: "<p>hi</p>" },
          { at: 1, language: "css", code: "p { color: red; }" },
        ],
      },
    ]);
  });

  test("anything between them, or a different name, starts a new editor", () => {
    const groups = siteGroups([pane("html", "a", "1"), null, pane("css", "a", "2"), pane("js", "b", "3")]);
    expect(groups.map((group) => [group.site, group.panes.map((each) => each.at)])).toEqual([
      ["a", [0]],
      ["a", [2]],
      ["b", [3]],
    ]);
  });

  test("a pane with no site belongs to no editor", () => {
    expect(siteGroups([{ info: "html site", body: "id: x\n<p></p>" }])).toEqual([]);
  });
});

describe("sitePage", () => {
  test("puts the CSS in the head, the HTML in the body and the JavaScript last", () => {
    const page = sitePage({
      site: "demo",
      panes: [
        { at: 0, language: "js", code: "go();" },
        { at: 1, language: "html", code: "<p>hi</p>" },
        { at: 2, language: "css", code: "p{}" },
      ],
    });
    expect(page).toContain("<style>p{}</style></head><body><p>hi</p><script>go();</script></body>");
  });

  test("a closing script tag in the JavaScript cannot end the script early", () => {
    const page = sitePage({ site: "d", panes: [{ at: 0, language: "js", code: 'x = "</script>";' }] });
    expect(page.match(/<\/script>/g)).toHaveLength(1);
  });
});

describe("app panes", () => {
  const pane = (language: string, app: string | null, code: string) => ({
    info: `${language} app`,
    body: `id: ${language}-pane\n${app ? `app: ${app}\n` : ""}${code}`,
  });

  test("group by their app: line, as site panes group by site:, and never with site panes", () => {
    const groups = paneGroups("app", [pane("html", "list", "<ul></ul>"), pane("js", "list", "go()"), { info: "css site", body: "id: s\nsite: list\np {}" }]);
    expect(groups).toEqual([{ site: "list", panes: [
      { at: 0, language: "html", code: "<ul></ul>" },
      { at: 1, language: "js", code: "go()" },
    ] }]);
    expect(paneGroups("site", [pane("html", "list", "x")])).toEqual([]);
  });

  test("the page leaves the script out until Run, then calls it with root and dlQuery", () => {
    const group = { site: "list", panes: [{ at: 0, language: "html", code: "<ul></ul>" }, { at: 1, language: "js", code: "go(\"</script>\")" }] };
    expect(appPage(group, false)).toContain('<div id="dn-app-root"><ul></ul></div>');
    expect(appPage(group, false)).not.toContain("go(");
    const ran = appPage(group, true);
    expect(ran).toContain('(async function (root, dlQuery) {\ngo("<\\/script>")\n})(document.getElementById("dn-app-root"), dlQuery)');
  });

  test("the checker wants an id and an app: line, as dewlab's build does", async () => {
    const { checkDocument } = await import("./checks.ts");
    const messages = checkDocument("---\ntitle: T\n---\n\n```js app\nid: j\ngo()\n```\n\n```css app\napp: a\np {}\n```\n", { ids: new Set() })
      .map((problem) => problem.message);
    expect(messages[0]).toContain("An app pane with no `app:` line");
    expect(messages[1]).toContain("An app pane with no `id:`");
  });
});

describe("generated blocks", () => {
  test("are read from a line holding only [[name]], known or not", async () => {
    const { generatedBlockIn } = await import("./fences.ts");
    expect(generatedBlockIn("[[search-box]]")).toEqual({ name: "search-box", description: "The site-wide search box" });
    expect(generatedBlockIn("[[search-bar]]")).toEqual({ name: "search-bar", description: null });
    expect(generatedBlockIn("See [[search-box]] above.")).toBeNull();
  });

  test("an unknown one stops the build on a hand-written page, and means nothing in a tutorial", async () => {
    const { checkDocument } = await import("./checks.ts");
    const source = "---\ntitle: Home\n---\n\nIntro.\n\n[[search-bar]]\n\n[[search-box]]\n";
    const onPage = checkDocument(source, { ids: new Set(), path: "pages/home.md" });
    expect(onPage).toEqual([{
      message: "`[[search-bar]]` is not a block the site knows how to build. Use `[[search-box]]` or `[[course-cards]]`.",
      line: 7,
      severity: "blocking",
    }]);
    expect(checkDocument(source, { ids: new Set(), path: "notes/home.md" })).toEqual([]);
  });
});
