import fs from 'node:fs';
import path from 'node:path';
import { repo } from './support.mjs';

const asset = name => fs.readFileSync(path.join(repo, 'CanopyX.Html/Assets', name), 'utf8');

/** A standalone page using the shipped loader and inert, versioned UI payloads. */
export function uiPage(markup, script = '') {
  const parts = JSON.parse(asset('canopyx-parts.json')).parts;
  const entries = Array.isArray(parts) ? parts : Object.values(parts);
  const payloads = entries.filter(part => part.name.startsWith('ui-')).map(part =>
    (part.style ? `<script type="application/x-canopyx-${part.name}-style" data-cx-version="${part.version}">${asset(part.style)}</script>` : '') +
    `<script type="application/x-canopyx-${part.name}" data-cx-version="${part.version}">${asset(part.script)}</script>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CanopyX controls</title>
    <style>${asset('canopyx.css')}</style><script>${asset('canopyx.js')}</script></head>
    <body class="cx-page"><main>${markup}</main>${payloads}<script>${script}</script></body></html>`;
}

/** Wait for controllers created by the test script or the declarative mount. */
export async function openUi(page, markup, script = '') {
  await page.route('http://canopyx.test/ui', route => route.fulfill({ contentType: 'text/html', body: uiPage(markup, script) }));
  await page.goto('http://canopyx.test/ui');
  await page.evaluate(() => Promise.all(CanopyX.mountUi(document).map(api => api.ready)));
}
