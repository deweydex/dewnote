import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  blobSha,
  commitChanges,
  CommitRefused,
  ensureBranch,
  fromBase64,
  listMarkdownFiles,
  listRepositories,
  listModuleFiles,
  putFileContent,
  suggestedBranch,
  toBase64,
} from "./github.ts";

describe("toBase64/fromBase64", () => {
  test("round-trips plain ASCII", () => {
    const text = "# A Rule\n\nWhere it lives.\n";
    expect(fromBase64(toBase64(text))).toBe(text);
  });

  test("round-trips real Unicode — an em dash, a µ, a checkmark", () => {
    const text = "A tutorial — with µs and ✓, not just ASCII.\n";
    expect(fromBase64(toBase64(text))).toBe(text);
  });

  test("round-trips an empty string", () => {
    expect(fromBase64(toBase64(""))).toBe("");
  });

  test("fromBase64 tolerates GitHub's own newline-wrapped base64", () => {
    const text = "line one\nline two\n";
    const wrapped = toBase64(text).replace(/(.{4})/g, "$1\n");
    expect(fromBase64(wrapped)).toBe(text);
  });
});

describe("listMarkdownFiles", () => {
  const originalFetch = globalThis.fetch;
  let calls: string[] = [];

  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function respond(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  test("the common case is one recursive call, filtered to .md blobs", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      expect(url).toContain("/git/trees/main?recursive=1");
      return respond({
        truncated: false,
        tree: [
          { path: "README.md", type: "blob", sha: "s1" },
          { path: "content/a.md", type: "blob", sha: "s2" },
          { path: "assets/logo.png", type: "blob", sha: "s3" },
        ],
      });
    }) as typeof fetch;

    const files = await listMarkdownFiles({ owner: "dewlab", repo: "dewlab" }, "main", "tok");
    expect(files).toEqual([
      { path: "README.md", sha: "s1" },
      { path: "content/a.md", sha: "s2" },
    ]);
    expect(calls).toHaveLength(1);
  });

  test("a truncated response falls back to walking every directory, missing nothing", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("recursive=1")) {
        return respond({ truncated: true, tree: [] });
      }
      if (url.endsWith("/git/trees/main")) {
        return respond({
          tree: [
            { path: "README.md", type: "blob", sha: "s1" },
            { path: "content", type: "tree", sha: "tree-content" },
          ],
        });
      }
      if (url.endsWith("/git/trees/tree-content")) {
        return respond({
          tree: [
            { path: "a.md", type: "blob", sha: "s2" },
            { path: "sub", type: "tree", sha: "tree-sub" },
            { path: "image.png", type: "blob", sha: "s3" },
          ],
        });
      }
      if (url.endsWith("/git/trees/tree-sub")) {
        return respond({ tree: [{ path: "b.md", type: "blob", sha: "s4" }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const files = await listMarkdownFiles({ owner: "dewlab", repo: "dewlab" }, "main", "tok");
    expect(files.map((f) => f.path).sort()).toEqual(["README.md", "content/a.md", "content/sub/b.md"]);
    // One recursive probe plus one call per directory (root, content, sub) — never silently incomplete.
    expect(calls).toHaveLength(4);
  });
});

describe("listModuleFiles", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function respond(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  test("filters to current courses/*.yaml and legacy modules/*.yaml blobs", async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL) =>
      respond({
        truncated: false,
        tree: [
          { path: "modules/computational-methods.yaml", type: "blob", sha: "s1" },
          { path: "courses/web-authoring.yaml", type: "blob", sha: "s5" },
          { path: "tutorials/filtering/filtering.md", type: "blob", sha: "s2" },
          // Yaml outside modules/, and yaml a level deeper inside it,
          // are both something else.
          { path: "tutorials/filtering/filtering.glossary.yaml", type: "blob", sha: "s3" },
          { path: "modules/archive/old.yaml", type: "blob", sha: "s4" },
        ],
      })) as typeof fetch;

    const files = await listModuleFiles({ owner: "dewlab", repo: "dewlab" }, "main", "tok");
    expect(files).toEqual([
      { path: "modules/computational-methods.yaml", sha: "s1" },
      { path: "courses/web-authoring.yaml", sha: "s5" },
    ]);
  });
});

describe("putFileContent", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function respond(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  // A brand-new file has no sha to match against yet — the
  // request body itself has to leave the field out entirely, not send it
  // as an explicit `null` or `undefined`, since GitHub's own "create"
  // vs. "update" branch keys off whether the JSON key is present at all.
  test("with no sha given, the request body omits the field entirely", async () => {
    let sentBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return respond({ content: { sha: "new-sha" } });
    }) as typeof fetch;

    const result = await putFileContent(
      { owner: "dewlab", repo: "dewlab" },
      "tutorials/new.md",
      "# New\n",
      undefined,
      "dewnote-edits",
      "Add tutorials/new.md from dewnote",
      "tok",
    );
    expect(result).toEqual({ sha: "new-sha" });
    expect(sentBody).not.toBeNull();
    expect(Object.keys(sentBody!)).not.toContain("sha");
  });

  test("with a sha given, the request body includes it, matching the existing blob", async () => {
    let sentBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return respond({ content: { sha: "updated-sha" } });
    }) as typeof fetch;

    await putFileContent(
      { owner: "dewlab", repo: "dewlab" },
      "tutorials/existing.md",
      "# Existing\n",
      "old-sha",
      "dewnote-edits",
      "Edit tutorials/existing.md from dewnote",
      "tok",
    );
    expect(sentBody!).toEqual({
      message: "Edit tutorials/existing.md from dewnote",
      content: toBase64("# Existing\n"),
      branch: "dewnote-edits",
      sha: "old-sha",
    });
  });
});

describe("ensureBranch", () => {
  const repo = { owner: "deweydex", repo: "dewlab" };

  function withFetch(handler: (url: string, init: RequestInit) => Response) {
    const original = globalThis.fetch;
    globalThis.fetch = ((url: string, init: RequestInit) =>
      Promise.resolve(handler(String(url), init))) as typeof fetch;
    return () => { globalThis.fetch = original; };
  }

  test("a branch that already exists is the outcome, not an error", async () => {
    // The 404-then-422 race: the ref lookup says the branch is not there,
    // and the create says it is. Two tabs, or two presses of Connect.
    const restore = withFetch((url, init) => {
      if (init.method === "POST") {
        return new Response(JSON.stringify({ message: "Reference already exists" }), { status: 422 });
      }
      if (url.includes("heads/alt")) return new Response("", { status: 404 });
      return new Response(JSON.stringify({ object: { sha: "base-sha" } }), { status: 200 });
    });
    try {
      await ensureBranch(repo, "alt", "main", "token");
    } finally { restore(); }
  });

  test("a missing base branch is named in a sentence", async () => {
    const restore = withFetch(() => new Response("", { status: 404 }));
    try {
      await ensureBranch(repo, "alt", "nope", "token");
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).message).toBe('There is no branch called "nope" in this repository.');
    } finally { restore(); }
  });

  test("an API failure reports GitHub's own sentence, not its envelope", async () => {
    const restore = withFetch((url, init) => {
      if (init.method === "POST") {
        return new Response(JSON.stringify({ message: "Resource not accessible by personal access token" }), { status: 403 });
      }
      if (url.includes("heads/alt")) return new Response("", { status: 404 });
      return new Response(JSON.stringify({ object: { sha: "base-sha" } }), { status: 200 });
    });
    try {
      await ensureBranch(repo, "alt", "main", "token");
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).message).toBe("Resource not accessible by personal access token");
    } finally { restore(); }
  });
});

describe("suggestedBranch", () => {
  test("is dated, so a day's edits share one branch and one pull request", () => {
    expect(suggestedBranch(new Date("2026-09-20T23:15:00Z"))).toBe("dewnote/2026-09-20");
  });

});

describe("listRepositories", () => {
  const originalFetch = globalThis.fetch;
  let calls: string[] = [];

  beforeEach(() => { calls = []; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  function serve(pages: unknown[][]): void {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const page = Number(new URL(url, "https://x").searchParams.get("page") ?? "1");
      return new Response(JSON.stringify(pages[page - 1] ?? []), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  }

  const entry = (owner: string, name: string, branch: string, push = true) => ({
    name,
    owner: { login: owner },
    default_branch: branch,
    permissions: { push },
  });

  test("hands back the owner and the repository's own default branch, so neither is typed", async () => {
    serve([[entry("deweydex", "dewlab", "main"), entry("deweydex", "dewnote", "trunk")]]);
    expect(await listRepositories("tok")).toEqual([
      { owner: "deweydex", repo: "dewlab", defaultBranch: "main" },
      { owner: "deweydex", repo: "dewnote", defaultBranch: "trunk" },
    ]);
  });

  test("leaves out what the token cannot commit to — dewnote is there to write", async () => {
    serve([[entry("someone", "read-only", "main", false), entry("deweydex", "dewlab", "main")]]);
    expect((await listRepositories("tok")).map((choice) => choice.repo)).toEqual(["dewlab"]);
  });

  test("sorts by last push, so one request answers the common case", async () => {
    serve([[entry("deweydex", "dewlab", "main")]]);
    await listRepositories("tok");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("sort=pushed");
  });

  test("keeps reading while a page comes back full, and stops at three", async () => {
    const full = Array.from({ length: 100 }, (_, at) => entry("deweydex", `repo-${at}`, "main"));
    serve([full, full, full, full]);
    expect(await listRepositories("tok")).toHaveLength(300);
    expect(calls).toHaveLength(3);
  });

  test("a repository with no default branch named still gets one", async () => {
    serve([[{ name: "odd", owner: { login: "x" }, default_branch: "" }]]);
    expect((await listRepositories("tok"))[0]!.defaultBranch).toBe("main");
  });
});

describe("commitChanges", () => {
  const repo = { owner: "deweydex", repo: "dewlab" };
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  /** A branch holding two files, and every request made of it. */
  function branch(onPatch = () => new Response("{}", { status: 200 })) {
    const calls: { method: string; url: string; body: any }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
      if (url.includes("/git/ref/heads/")) return json({ object: { sha: "head" } });
      if (url.endsWith("/git/commits/head")) return json({ tree: { sha: "tree" } });
      if (url.includes("/git/trees/tree")) {
        return json({
          tree: [
            { path: "tutorials/a/a.md", mode: "100644", type: "blob", sha: "a-sha" },
            { path: "tutorials/a/a.svg", mode: "100644", type: "blob", sha: "svg-sha" },
          ],
        });
      }
      if (method === "POST" && url.endsWith("/git/trees")) return json({ sha: "new-tree" });
      if (method === "POST" && url.endsWith("/git/commits")) return json({ sha: "new-commit" });
      if (method === "PATCH") return onPatch();
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    return calls;
  }

  test("git's own blob name for a text", async () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(await blobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });

  test("a rename is one tree, one commit and one move of the branch, without force", async () => {
    const calls = branch();
    const shas = await commitChanges(
      repo,
      "work",
      [
        { kind: "write", path: "tutorials/b/b.md", text: "hello\n" },
        { kind: "remove", path: "tutorials/a/a.md" },
        { kind: "move", from: "tutorials/a/a.svg", to: "tutorials/b/a.svg" },
      ],
      new Map([["tutorials/a/a.md", "a-sha"]]),
      "Rename a to b",
      "tok",
    );
    const tree = calls.find((call) => call.method === "POST" && call.url.endsWith("/git/trees"))!.body;
    expect(tree).toEqual({
      base_tree: "tree",
      tree: [
        { path: "tutorials/b/b.md", mode: "100644", type: "blob", content: "hello\n" },
        { path: "tutorials/a/a.md", mode: "100644", type: "blob", sha: null },
        { path: "tutorials/b/a.svg", mode: "100644", type: "blob", sha: "svg-sha" },
        { path: "tutorials/a/a.svg", mode: "100644", type: "blob", sha: null },
      ],
    });
    const commit = calls.find((call) => call.method === "POST" && call.url.endsWith("/git/commits"))!.body;
    expect(commit).toEqual({ message: "Rename a to b", tree: "new-tree", parents: ["head"] });
    expect(calls.find((call) => call.method === "PATCH")!.body).toEqual({ sha: "new-commit", force: false });
    expect(shas).toEqual(new Map([
      ["tutorials/b/b.md", "ce013625030ba8dba906f756967f9e9ca394464a"],
      ["tutorials/b/a.svg", "svg-sha"],
    ]));
  });

  test("a file changed on the branch since it was read refuses the whole commit", async () => {
    const calls = branch();
    const refused = commitChanges(
      repo, "work",
      [{ kind: "write", path: "tutorials/a/a.md", text: "mine\n" }],
      new Map([["tutorials/a/a.md", "older-sha"]]),
      "Edit", "tok",
    );
    await expect(refused).rejects.toBeInstanceOf(CommitRefused);
    expect(calls.some((call) => call.method !== "GET")).toBe(false);
  });

  test("writing over a file dewnote never read is refused, not an overwrite", async () => {
    branch();
    await expect(
      commitChanges(repo, "work", [{ kind: "write", path: "tutorials/a/a.md", text: "x" }], new Map(), "Add", "tok"),
    ).rejects.toThrow("already exists");
  });

  test("a branch that moved during the commit is refused, and says so", async () => {
    branch(() => new Response(JSON.stringify({ message: "Update is not a fast forward" }), { status: 422 }));
    await expect(
      commitChanges(repo, "work", [{ kind: "remove", path: "tutorials/a/a.svg" }], new Map(), "Delete", "tok"),
    ).rejects.toThrow("moved on while dewnote was committing");
  });
});
