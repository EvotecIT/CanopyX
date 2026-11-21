# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flow-height.spec.mjs >> without Height the nonce flow host grows with its content
- Location: specs/flow-height.spec.mjs:18:41

# Error details

```
Error: Example page missing: /Users/przemyslawklys/Developer/Scratch/canopyx-v3-gaps/pr192/CanopyX.Examples/bin/Release/net10.0/output/flow-height/nonce-auto.html. Run ./Build.ps1 -SkipPack, or set CANOPYX_EXAMPLES.
```

# Test source

```ts
  1   | // Shared helpers for the browser tests. The tests open the pages that CanopyX.Examples generates, straight from disk.
  2   | import fs from "node:fs";
  3   | import path from "node:path";
  4   | import { fileURLToPath, pathToFileURL } from "node:url";
  5   | 
  6   | const here = path.dirname(fileURLToPath(import.meta.url));
  7   | export const repo = path.resolve(here, "../../..");
  8   | export const examples = process.env.CANOPYX_EXAMPLES
  9   |   ? path.resolve(process.env.CANOPYX_EXAMPLES)
  10  |   : path.join(repo, "CanopyX.Examples/bin/Release/net10.0/output");
  11  | 
  12  | export function exampleUrl(name) {
  13  |   const file = path.join(examples, name);
  14  |   if (!fs.existsSync(file)) {
> 15  |     throw new Error("Example page missing: " + file + ". Run ./Build.ps1 -SkipPack, or set CANOPYX_EXAMPLES.");
      |           ^ Error: Example page missing: /Users/przemyslawklys/Developer/Scratch/canopyx-v3-gaps/pr192/CanopyX.Examples/bin/Release/net10.0/output/flow-height/nonce-auto.html. Run ./Build.ps1 -SkipPack, or set CANOPYX_EXAMPLES.
  16  |   }
  17  |   return pathToFileURL(file).href;
  18  | }
  19  | 
  20  | /** Records script loads from the DOM, including file URLs browsers omit from network events. */
  21  | export async function trackScriptLoads(page) {
  22  |   await page.addInitScript(() => {
  23  |     window.__canopyxScriptLoads = [];
  24  |     new MutationObserver(records => {
  25  |       for (const record of records) for (const node of record.addedNodes) {
  26  |         if (node.nodeName === "SCRIPT" && node.src) window.__canopyxScriptLoads.push(node.src);
  27  |       }
  28  |     }).observe(document, { childList: true, subtree: true });
  29  |   });
  30  |   return () => page.evaluate(() => window.__canopyxScriptLoads.splice(0));
  31  | }
  32  | 
  33  | export function nextFrames(page) {
  34  |   return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  35  | }
  36  | 
  37  | /** Waits for visible grids, loaded fonts and unchanged grid/row/popover geometry across consecutive frames. */
  38  | export function settleGrid(page) {
  39  |   return page.evaluate(async () => {
  40  |     await document.fonts.ready;
  41  |     let previous = "", stable = 0;
  42  |     while (stable < 3) {
  43  |       await new Promise(requestAnimationFrame);
  44  |       const grids = [...document.querySelectorAll(".cx-grid")].filter(grid =>
  45  |         grid.clientWidth && grid.clientHeight && grid.checkVisibility({ visibilityProperty: true }));
  46  |       if (!grids.length || grids.some(grid => Number(getComputedStyle(grid).opacity) === 0) ||
  47  |           document.fonts.status !== "loaded") { stable = 0; continue; }
  48  |       const elements = [...grids.flatMap(grid => [grid, ...grid.querySelectorAll(".cx-head,.cx-hcell,.cx-row,.cx-detail-row")]),
  49  |         ...document.querySelectorAll("[popover]:popover-open")];
  50  |       const geometry = JSON.stringify(elements.map(element => {
  51  |         const box = element.getBoundingClientRect();
  52  |         return [box.x, box.y, box.width, box.height, element.clientWidth, element.clientHeight, element.scrollWidth, element.scrollHeight];
  53  |       }));
  54  |       stable = geometry === previous ? stable + 1 : 1;
  55  |       previous = geometry;
  56  |     }
  57  |   });
  58  | }
  59  | 
  60  | /** Layout assertions measure the open overlay after its entry motion, rather than an intermediate transform. */
  61  | export function settleOverlayMotion(overlay) {
  62  |   return overlay.evaluate(async element => {
  63  |     await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  64  |     await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
  65  |   });
  66  | }
  67  | 
  68  | /** Opens a toolbar control through its desktop button or the phone overflow. */
  69  | // A phone toolbar sheet (More) dims the page, so a tap outside it only closes it; tests that go on to the page close it first.
  70  | export async function closeGridOverflow(page) {
  71  |   const overflow = page.locator('.cx-grid-overflow');
  72  |   if (!await overflow.count() || !await overflow.first().evaluate(element => element.open)) return;
  73  |   await page.keyboard.press('Escape');
  74  |   await page.waitForFunction(() => !document.querySelector('.cx-grid-overflow')?.open);
  75  | }
  76  | 
  77  | export async function openGridControl(page, kind) {
  78  |   const control = page.locator('.cx-grid-' + kind), summary = control.locator(':scope > summary');
  79  |   // Data readiness can precede the observer that moves phone controls into More.
  80  |   await page.waitForFunction(kind => {
  81  |     const host = document.querySelector('.cx-grid-' + kind)?.closest('[data-canopyx-host]');
  82  |     return host && host.clientWidth > 0 && host.classList.contains('cx-phone') === (host.clientWidth <= 640);
  83  |   }, kind);
  84  |   if (!await summary.isVisible()) await page.locator('.cx-grid-overflow > summary').click();
  85  |   if (!await control.evaluate(element => element.open)) await summary.click();
  86  |   if (kind === 'filters') {
  87  |     // Native details toggles are queued. Wait for the newly opened panel before editing its form from a prior open.
  88  |     await control.locator(':scope > .cx-grid-panel:popover-open').waitFor();
  89  |     await control.getByRole('button', { name: 'Done', exact: true }).waitFor();
  90  |   }
  91  | }
  92  | 
  93  | /** Done flushes the live editor immediately; optionally reopen it for the next edit. */
  94  | export async function flushGridFilters(page, reopen = true) {
  95  |   await page.locator('.cx-grid-filters').getByRole('button', { name: 'Done', exact: true }).click();
  96  |   await page.getByRole('grid').and(page.locator('.cx-data-grid .cx-grid')).waitFor();
  97  |   await page.waitForFunction(() => document.querySelector('.cx-data-grid .cx-grid').getAttribute('aria-busy') === 'false');
  98  |   if (reopen) await openGridControl(page, 'filters');
  99  | }
  100 | 
  101 | /** Opens an example page and waits until the view has mounted, loaded its first page, and painted. */
  102 | export async function openExample(page, name, hash) {
  103 |   await page.goto(exampleUrl(name) + (hash || ""));
  104 |   await page.waitForSelector("[data-cx-ready]");
  105 |   await nextFrames(page);
  106 | }
  107 | 
  108 | export function row(page, id) {
  109 |   return page.locator(".cx-row[data-cx-id=\"" + id + "\"]");
  110 | }
  111 | 
  112 | /** Ids of the rendered node rows in visual order. */
  113 | export function renderedIds(page) {
  114 |   return page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")]
  115 |     .sort((a, b) => Number(a.getAttribute("aria-rowindex")) - Number(b.getAttribute("aria-rowindex")))
```