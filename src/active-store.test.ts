import { afterEach, describe, expect, test } from "bun:test";
import { openPath, setActiveStore } from "./active-store.ts";

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
