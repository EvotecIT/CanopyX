// A flow-only page for field tests: the slim flow entry point with the forms, flow and named feature parts as inert payloads.
import fs from 'node:fs';
import path from 'node:path';
import { repo } from './support.mjs';

const asset = name => fs.readFileSync(path.join(repo, 'CanopyX.Html/Assets', name), 'utf8');

/** Opens a flow of one form step and a review page; window.flow is its API and window.submitted the submitted answers. */
export async function openFieldFlow(page, fields, { parts = [], extra = {} } = {}) {
  const manifest = JSON.parse(asset('canopyx-parts.json')).parts;
  const payloads = (Array.isArray(manifest) ? manifest : Object.values(manifest)).filter(part => ['forms', 'flow', ...parts].includes(part.name)).map(part =>
    (part.style ? `<script type="application/x-canopyx-${part.name}-style" data-cx-version="${part.version}">${asset(part.style)}</script>` : '') +
    `<script type="application/x-canopyx-${part.name}" data-cx-version="${part.version}">${asset(part.script)}</script>`).join('');
  const doc = Object.assign({ kind: 'flow', version: 1, id: 'fields', title: 'Fields', steps: [
    { id: 'answers', title: 'Answers', fields }, { id: 'review', type: 'review' }] }, extra);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fields</title><style>${asset('canopyx-flow-entry.css')}</style>
    <script>${asset('canopyx-flow-entry.js')}</script></head><body><main><div id="host"></div></main>${payloads}
    <script>window.submitted = []; window.flow = CanopyX.createFlow(document.getElementById('host'), { flow: ${JSON.stringify(doc)},
      onSubmit: detail => { window.submitted.push(detail.values); return { status: 'saved', message: 'Thanks.' }; } });</script></body></html>`;
  await page.route('http://canopyx.test/flow', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://canopyx.test/flow');
  await page.evaluate(() => window.flow.ready);
}
