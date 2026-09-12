import { afterEach, describe, expect, test } from "bun:test";
import { createFile, openPath, setActiveStore } from "./active-store.ts";

describe("openPath", () => {
  afterEach(() => setActiveStore(null));

  test("with no store registered, resolves to false rather than throwing", async () => {
    expect(await openPath("anything.md")).toBe(false);
  });

  test("routes to whichever store is currently registered", async () => {
    const calls: string[] = [];
    setActiveStore({
      async openPath(path) {
        calls.push(path);
        return path === "real.md";
      },
    });
    expect(await openPath("real.md")).toBe(true);
    expect(await openPath("missing.md")).toBe(false);
    expect(calls).toEqual(["real.md", "missing.md"]);
  });

  test("registering a new store replaces the old one", async () => {
    setActiveStore({ async openPath() { return true; } });
    setActiveStore({ async openPath() { return false; } });
    expect(await openPath("x.md")).toBe(false);
  });

  test("registering null clears the active store", async () => {
    setActiveStore({ async openPath() { return true; } });
    setActiveStore(null);
    expect(await openPath("x.md")).toBe(false);
  });
});

describe("createFile", () => {
  afterEach(() => setActiveStore(null));

  test("with no store registered, throws a real message rather than silently doing nothing", async () => {
    await expect(createFile("x.md", "content")).rejects.toThrow(/isn't supported/i);
  });

  test("with a store registered but no createFile of its own (repo-panel.ts today), throws the same way", async () => {
    setActiveStore({ async openPath() { return true; } });
    await expect(createFile("x.md", "content")).rejects.toThrow(/isn't supported/i);
  });

  test("routes to the registered store's own createFile, forwarding path and content", async () => {
    const calls: { path: string; content: string }[] = [];
    setActiveStore({
      async openPath() {
        return true;
      },
      async createFile(path, content) {
        calls.push({ path, content });
      },
    });
    await createFile("a/b.order.yaml", "series: X\norder: []\n");
    expect(calls).toEqual([{ path: "a/b.order.yaml", content: "series: X\norder: []\n" }]);
  });

  test("a rejection from the store's own createFile propagates as-is", async () => {
    setActiveStore({
      async openPath() {
        return true;
      },
      async createFile() {
        throw new Error("\"a/b.order.yaml\" already exists.");
      },
    });
    await expect(createFile("a/b.order.yaml", "x")).rejects.toThrow('"a/b.order.yaml" already exists.');
  });
});
