import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";

for (const overflow of [false, true]) for (const width of [1440, 1280, 1024, 390]) {
  test(`grid layout settles at ${width}px with ${overflow ? "overflowing" : "fitted"} columns`, async ({ page }) => {
    await page.setViewportSize({ width: width + 100, height: 900 });
    await page.addInitScript(() => {
      window.gridResizePasses = 0; window.gridContentWidth = 0;
      const NativeObserver = ResizeObserver;
      window.ResizeObserver = class extends NativeObserver {
        constructor(callback) {
          super((entries, observer) => {
            if (entries.some(entry => entry.target.matches('.cx-grid,.cx-head'))) window.gridResizePasses++;
            const grid = entries.find(entry => entry.target.matches('.cx-grid'));
            if (grid) window.gridContentWidth = grid.contentRect.width;
            callback(entries, observer);
          });
        }
      };
    });
    const columns = ["Name", "Location", "State", "Last check", "Last result", "Latency (ms)", "Details"].map((title, index) => ({
      id: "c" + index, title, kind: "text", ...(overflow ? { width: 320, fixed: true, priority: "essential" } : {})
    }));
    const view = { protocol: "canopyx/2", type: "grid", id: "settles", label: "Records", rowHeight: 28, density: "compact",
      pageSize: 100, selection: "single", search: true, source: { kind: "inline" }, columns, rows: Array.from({ length: 7 }, (_, row) => ({
        id: "r" + row, cells: Object.fromEntries(columns.map((column, index) => [column.id, index === 0 ? "Record " + row : "Value " + index]))
      })) };
    // Fractional space is common in nested flex layouts and browser zoom. Classic scrollbars must still fit.
    const html = viewPage(view).replace('</head>', `<style>
      body.cx-page > .cx-host { width:calc(100% - .333333px);height:320px; }
      ${width === 1280 ? 'body.cx-page { zoom:1.5; }.cx-data-grid .cx-grid { border:.8px solid transparent; }' : ''}
      .cx-data-grid .cx-grid { scrollbar-width:thin;${width === 1024 ? 'box-sizing:content-box;padding-inline:.4px;border:.8px solid transparent;' : ''} }
      .cx-grid::-webkit-scrollbar { width:10px;height:10px; }
    </style></head>`);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://canopyx.test/settles", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("http://canopyx.test/settles");
    await page.waitForSelector("[data-cx-ready]");
    await page.evaluate(() => document.fonts.ready);
    await page.setViewportSize({ width, height: 900 });
    const sample = await page.locator(".cx-grid").evaluate(grid => new Promise(resolve => {
      const signature = () => JSON.stringify([grid.clientWidth, grid.clientHeight, grid.scrollWidth, grid.scrollHeight,
        grid.parentElement.getBoundingClientRect().height, [...grid.querySelectorAll(".cx-hcell")].map(cell => cell.getBoundingClientRect().width)]);
      let previous = signature(), changes = 0, frames = 0, resizePasses;
      const start = performance.now(), until = start + 4000;
      function measure() {
        const next = signature();
        if (performance.now() >= start + 1000) {
          resizePasses ??= window.gridResizePasses;
          frames++; if (next !== previous) changes++;
        }
        previous = next;
        if (performance.now() < until) requestAnimationFrame(measure);
        else resolve({ changes, frames, resizePasses: window.gridResizePasses - resizePasses, clientWidth: grid.clientWidth, scrollWidth: grid.scrollWidth,
          columnsRight: grid.querySelector('.cx-hrow').getBoundingClientRect().right, viewportRight: grid.getBoundingClientRect().right,
          filled: parseFloat(getComputedStyle(grid.querySelector('.cx-hrow')).width), available: window.gridContentWidth,
          horizontalGutter: grid.offsetHeight - grid.clientHeight - parseFloat(getComputedStyle(grid).borderTopWidth) - parseFloat(getComputedStyle(grid).borderBottomWidth) });
      }
      requestAnimationFrame(measure);
    }));
    expect(sample.frames).toBeGreaterThan(1);
    expect(sample.changes, "column widths and scroll dimensions must stop changing after load").toBe(0);
    expect(sample.resizePasses, "grid resize delivery must stop after layout settles").toBe(0);
    if (overflow) expect(sample.scrollWidth).toBeGreaterThan(sample.clientWidth);
    else {
      expect(sample.columnsRight, "fitted columns must stay inside the fractional viewport").toBeLessThanOrEqual(sample.viewportRight + .01);
      expect(sample.filled).toBeLessThanOrEqual(sample.available + .01);
      expect(sample.available - sample.filled, "flexible columns fill the content box once").toBeLessThan(1.1);
      expect(sample.horizontalGutter, "fitting must not introduce a classic horizontal scrollbar").toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });
}
