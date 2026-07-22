/**
 * Capture the README/docs UI screenshots with headless Playwright Chromium.
 *
 * Prereqs (installed globally on this host — see docs):
 *   npm  install -g playwright
 *   playwright install chromium
 *
 * Usage:
 *   node scripts/screenshots.mjs
 *
 * Config (env vars, all optional):
 *   BASE_URL   app origin              (default http://localhost:5173)
 *   WORLD_ID   world to feature        (default "A peaceful planet")
 *   STORY_ID   story to feature        (default "Bella goes for broke")
 *   OUT_DIR    output directory        (default <repo>/docs/assets)
 *
 * Auth is a client-side localStorage flag, so we seed it and skip the login screen.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Resolve the *global* playwright install (this repo intentionally has no local copy).
const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require(path.join(globalRoot, 'playwright')));
} catch {
  console.error(
    'Could not load global Playwright. Install it with:\n' +
    '  npm install -g playwright && playwright install chromium'
  );
  process.exit(1);
}

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const WORLD = process.env.WORLD_ID || 'dcae0e95-3084-4853-a28c-21ebd0d0e603';
const STORY = process.env.STORY_ID || 'ab6179d2-9cd6-4dfc-bee2-8907f2ad793f';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT_DIR || path.join(repoRoot, 'docs', 'assets');

const shots = [
  { path: '/', file: 'ui-worlds-gallery.png' },
  { path: `/worlds/${WORLD}`, file: 'ui-world-detail.png' },
  { path: `/stories/${STORY}`, file: 'ui-story-detail.png' },
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
await context.addInitScript(() => localStorage.setItem('marcus_auth', 'true'));
const page = await context.newPage();

for (const { path: route, file } of shots) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const out = path.join(OUT, file);
  await page.screenshot({ path: out });
  console.log('captured', pathToFileURL(out).pathname);
}

await browser.close();
console.log('done');
