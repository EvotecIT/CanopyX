// Captures the README gallery: the featured demo of every view from a built canopyx.dev site.
//
//   pwsh Website/build.ps1                      (writes Website/_site with the live demos)
//   node tests/browser/readme-images.mjs <site url> [view ids...]
//
// The site must be served over HTTP (the demos load their data with fetch). Images land in docs/images/views/.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const base = (process.argv[2] || 'http://localhost:8091').replace(/\/$/, '');
const only = process.argv.slice(3);
const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'images', 'views');

// One shot per view: the page, an optional step to put it in a telling state, and the viewport height.
const shots = [
  { id: 'files', path: '/live/files/index.html', height: 640, step: async page => {
    // The explorer opens its first branches from sidecar files; wait until they have painted.
    const row = page.getByRole('row', { name: /Finance/ }).first();
    await row.waitFor({ timeout: 15000 });
  } },
  { id: 'inventory', path: '/live/inventory.html', height: 640 },
  { id: 'pivot', path: '/live/pivot.html', height: 560 },
  { id: 'board', path: '/live/board.html', height: 640 },
  { id: 'calendar', path: '/live/calendar.html', height: 700 },
  { id: 'plan', path: '/live/plan.html', height: 460 },
  { id: 'timeline', path: '/live/timeline.html', height: 620 },
  { id: 'matrix', path: '/live/matrix.html', height: 640 },
  { id: 'changes', path: '/live/changes.html', height: 640 },
  { id: 'compare', path: '/live/compare.html', height: 600 },
  { id: 'time', path: '/live/time.html', height: 480 },
  { id: 'flow', path: '/live/flow-setup-tasks.html', height: 700 },
  { id: 'path', path: '/live/path.html', height: 560 },
  { id: 'stack', path: '/live/stack.html', height: 640 },
  { id: 'email', path: '/live/gallery/conditional-formatting-static.html', height: 600 }
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const shot of shots.filter(s => !only.length || only.includes(s.id))) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: shot.height }, deviceScaleFactor: 1, colorScheme: theme });
      const page = await context.newPage();
      // The site's slim bar belongs to canopyx.dev, not to the view; the theme comes from the page's own switch.
      await page.addInitScript(value => { try { localStorage.setItem('cnx-theme', value); } catch { /* storage unavailable */ } }, theme);
      await page.goto(base + shot.path, { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: '.cnx-livebar{display:none!important}body{padding-top:0!important}' });
      await page.evaluate(value => {
        document.documentElement.dataset.theme = value;
        document.querySelectorAll('[data-cx-theme]').forEach(host => host.setAttribute('data-cx-theme', value));
      }, theme);
      if (shot.step) await shot.step(page);
      await page.waitForTimeout(700);
      const file = join(out, `${shot.id}-${theme}.png`);
      await page.screenshot({ path: file });
      console.log(file);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
