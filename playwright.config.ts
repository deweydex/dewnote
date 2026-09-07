import { defineConfig, devices } from "@playwright/test";

// The browser surface — decision 9's "Playwright drives the built app for
// anything with a cursor in it," because dewlab's own Milkdown traps were
// invisible from the API and found only by actually clicking. This runs
// against the real single-file build (`bun run build`), opened straight
// off disk with file://, which is also the mode the build is meant to
// support — not a dev server standing in for it.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    // Pinned to this sandbox's pre-installed Chromium rather than letting
    // Playwright resolve one by its own revision lookup, which can miss a
    // pre-baked browser that does not exactly match this package version.
    launchOptions: {
      executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
