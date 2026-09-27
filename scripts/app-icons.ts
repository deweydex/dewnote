// Renders the app icons in assets/branding/app/ from their two SVG
// sources, with the Chromium Playwright already uses. Run it by hand
// after changing either source, and commit the PNGs: the site build
// copies them and has no browser to draw them with.
//
//   bun scripts/app-icons.ts
//
// dewnote-app-icon.svg is the tile with a margin, for a system that
// shows an icon as it is (Chrome's app list on Windows, Linux and
// ChromeOS). dewnote-app-icon-full.svg is full bleed, for a system that
// cuts its own shape: `apple-touch-icon` (iOS, and Safari's Add to Dock
// on a Mac) and the manifest's maskable icon (Chrome on a Mac and on
// Android).
import { chromium } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join("assets", "branding", "app");
const RENDERS: { source: string; out: string; size: number }[] = [
  { source: "dewnote-app-icon.svg", out: "icon-192.png", size: 192 },
  { source: "dewnote-app-icon.svg", out: "icon-512.png", size: 512 },
  { source: "dewnote-app-icon-full.svg", out: "icon-maskable-512.png", size: 512 },
  { source: "dewnote-app-icon-full.svg", out: "apple-touch-icon.png", size: 180 },
];

const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {});
for (const { source, out, size } of RENDERS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = readFileSync(join(DIR, source), "utf8");
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: join(DIR, out), omitBackground: true });
  await page.close();
  console.log(`${out} (${size}px) from ${source}`);
}
await browser.close();
