import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";
import { serveGrid } from "./editing-support.mjs";

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
      let start;
      function measure() {
        start ??= performance.now();
        const next = signature();
        if (performance.now() >= start + 1000) {
          resizePasses ??= window.gridResizePasses;
          frames++; if (next !== previous) changes++;
        }
        previous = next;
        if (performance.now() < start + 4000 || frames < 10) requestAnimationFrame(measure);
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

// Empty-state chrome must have a stable minimum independent of the flexible space it fills.
for (const filtered of [false, true]) for (const height of [220, 520]) {
  test(`empty grid settles at ${height}px after ${filtered ? "filtering" : "initial load"}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: height === 220 ? 390 : 1440, height: 900 });
    const view = { protocol: "canopyx/2", type: "grid", id: "empty-settles", label: "Records", pageSize: 50,
      selection: "multiple", search: true, source: { kind: "inline" },
      emptyReason: "This data view has no records to display. Import or connect records before using the table. The explanation remains fully readable in a narrow panel.",
      labels: { gridNoMatchesReason: "Search: {search}. Active filters: {count}. The current filters do not match any records in this data view. Clear the filters to restore every available record." },
      columns: [{ id: "name", title: "Last delivery status", kind: "text", width: 100, fixed: true }, { id: "site", title: "Email preview", kind: "text", width: 100, fixed: true }],
      rows: filtered ? [{ id: "one", cells: { name: "Alpha", site: "Berlin" } }] : [] };
    await serveGrid(page, { view, height });
    if (filtered) await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setExternalFilter("sites", { field: "site", values: ["Missing"] }));
    await expect(page.locator(".cx-grid-notice h4")).toBeVisible();
    await expect.poll(() => page.locator(".cx-grid").evaluate(grid => grid.clientHeight - grid.querySelector(".cx-head").getBoundingClientRect().height),
      { message: "the empty grid viewport must contain its complete header" }).toBeGreaterThanOrEqual(0);
    const sample = await page.locator(".cx-host").evaluate(async host => {
      await document.fonts.ready;
      const heights = [];
      for (let frame = 0; frame < 60; frame++) {
        await new Promise(requestAnimationFrame);
        if (frame >= 20) heights.push(host.getBoundingClientRect().height);
      }
      const notice = host.querySelector(".cx-grid-notice"), first = notice.firstElementChild.getBoundingClientRect(), last = notice.lastElementChild.getBoundingClientRect(), bounds = host.getBoundingClientRect();
      return { changes: new Set(heights).size, first: first.top, last: last.bottom, top: bounds.top, bottom: bounds.bottom };
    });
    expect(sample.changes, "empty-state sizing must stop changing across consecutive frames").toBe(1);
    expect(sample.first).toBeGreaterThanOrEqual(sample.top);
    expect(sample.last, "the complete empty-state action must remain inside the host").toBeLessThanOrEqual(sample.bottom);
    await page.screenshot({ path: testInfo.outputPath("empty-state.png") });
    if (filtered) {
      await page.locator(".cx-grid-notice .acts button").click();
      expect(await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getExternalFilters())).toEqual([]);
      await expect.poll(async () => (await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getPaging())).matched).toBe(1);
      await expect(page.locator('.cx-row[data-cx-id="one"]')).toBeVisible();
      await expect(page.locator('.cx-row[data-cx-id="one"]')).toContainText("Alpha");
      await expect.poll(() => page.locator(".cx-host").evaluate(host => host.getBoundingClientRect().height), { message: "clearing the filter must release the empty-state minimum" }).toBeLessThanOrEqual(height);
    }
  });
}
