// A host whose max-height is relative (a percentage, calc()) keeps it as a bound while grids and trees fit their rows:
// the fit writes min(<rows>px, <bound>), so the browser goes on resolving the bound as the container changes, where a
// fixed number of pixels read from "50%" would cap a tall view at 50px.
import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

const NAMES = Array.from({ length: 80 }, (_, index) => "Row " + index);
const VIEWS = {
  grid: { protocol: "canopyx/2", type: "grid", id: "tall", label: "Tall", rowHeight: 34, pageSize: 100, selection: "none", search: false,
    source: { kind: "inline" }, columns: [{ id: "name", title: "Name", kind: "text" }], rows: NAMES.map((name, index) => ({ id: "r" + index, cells: { name } })) },
  tree: { protocol: "canopyx/2", type: "view", id: "tall-tree", label: "Tall tree", columns: [{ id: "name", title: "Name", width: 300 }],
    source: { kind: "inline" }, roots: NAMES.map((name, index) => ({ id: "n" + index, label: name })) }
};

for (const bound of ["initial", "var(--host-bound)"]) {
  test(`a short grid resolves the unbounded authored max-height ${bound} before fitting`, async ({ page }) => {
    const view = { ...VIEWS.grid, rows: VIEWS.grid.rows.slice(0, 1) };
    const html = viewPage(view).replace('<div class="cx-host"',
      `<div class="cx-host" style="--host-bound:none;max-height:${bound}"`);
    await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("https://canopyx.test/");
    await page.waitForSelector("[data-cx-ready]");
    const host = page.locator(".cx-host");
    await expect.poll(() => host.evaluate(element => element.style.maxHeight)).toMatch(/^\d+px$/);
    expect(await host.evaluate(element => element.offsetHeight)).toBeLessThan(200);
    await expect(page.locator('.cx-row[data-cx-id="r0"]')).toBeVisible();
  });
}

for (const [kind, view] of Object.entries(VIEWS)) {
  test(`a ${kind} host with a percentage max-height keeps it as its bound while fitting its rows`, async ({ page }) => {
    const html = viewPage(view).replace("<div class=\"cx-host\"", "<div id=\"box\" style=\"height:400px\"><div class=\"cx-host\" style=\"max-height:50%\"").replace("</div></body>", "</div></div></body>");
    await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("https://canopyx.test/");
    await page.waitForSelector("[data-cx-ready]");
    await nextFrames(page); await nextFrames(page);
    const host = page.locator(".cx-host");
    await expect.poll(() => host.evaluate(element => element.offsetHeight)).toBeGreaterThan(190);
    expect(await host.evaluate(element => element.offsetHeight)).toBeLessThanOrEqual(200);
    expect(await host.evaluate(element => element.style.maxHeight)).toMatch(/^min\(\d+px, 50%\)$/);
    await page.locator("#box").evaluate(element => { element.style.height = "600px"; });
    await expect.poll(() => host.evaluate(element => element.offsetHeight)).toBeGreaterThan(290);
    expect(await host.evaluate(element => element.offsetHeight)).toBeLessThanOrEqual(300);
  });
}
