import { describe, expect, test } from "bun:test";
import { appPage, foldLine, paneGroups } from "./fences.ts";

describe("foldLine", () => {
  test("reads a hint's opening line", () => {
    expect(foldLine('<details class="dl-hint"><summary>stuck? here are some steps</summary>')).toEqual({
      kind: "open",
      label: "Hint",
      summary: "stuck? here are some steps",
    });
  });

  test("reads an answer's, and names any other fold plainly", () => {
    expect(foldLine('<details class="dl-answer"><summary>answer</summary>')).toMatchObject({ label: "Answer" });
    expect(foldLine("<details><summary>More</summary>")).toMatchObject({ label: "Fold", summary: "More" });
  });

  test("reads the close", () => {
    expect(foldLine("</details>")).toEqual({ kind: "close" });
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
