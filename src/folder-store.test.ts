import { describe, expect, test } from "bun:test";
import { listMarkdownFiles, type DirectoryLike } from "./folder-store.ts";

/** A hand-built fake — no real FileSystemDirectoryHandle needed to
 * verify the walk itself, the same split github.ts's own truncation
 * fallback test uses against a mocked fetch rather than a real API. */
function fakeDir(entries: Record<string, DirectoryLike | { kind: "file" }>): DirectoryLike {
  return {
    async *entries() {
      for (const [name, value] of Object.entries(entries)) {
        yield [name, value as unknown as FileSystemHandle];
      }
    },
  };
}

describe("listMarkdownFiles", () => {
  test("finds markdown files at the root, ignoring non-markdown ones", async () => {
    const root = fakeDir({
      "README.md": { kind: "file" },
      "logo.png": { kind: "file" },
    });
    const files = await listMarkdownFiles(root);
    expect(files.map((f) => f.path)).toEqual(["README.md"]);
  });

  test("walks nested directories, building a full relative path", async () => {
    const root = fakeDir({
      "README.md": { kind: "file" },
      content: fakeDir({
        "a.md": { kind: "file" },
        sub: fakeDir({
          "b.md": { kind: "file" },
        }),
      }),
    });
    const files = await listMarkdownFiles(root);
    expect(files.map((f) => f.path).sort()).toEqual(["README.md", "content/a.md", "content/sub/b.md"]);
  });

  test("an empty folder yields no files", async () => {
    expect(await listMarkdownFiles(fakeDir({}))).toEqual([]);
  });
});
