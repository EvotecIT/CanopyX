import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo, viewPage, nextFrames } from "./support.mjs";
import { definition, api } from "./grid-grouping-fixtures.mjs";

const assets = path.join(repo, "CanopyX.Html/Assets");
const parts = () => ["buckets", "values", "pivot"].map(name => fs.readFileSync(path.join(assets, "canopyx-" + name + ".js"), "utf8")).join("\n");
for (const [width, height, theme] of [[390, 440, "dark"], [390, 300, "dark"], [1440, 440, "light"]]) {
  test(`an embedded ${height}px pivot at ${width}px keeps a complete data row reachable without expanding its host`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const view = definition(); delete view.reporting.detail; view.reporting.groupBy = []; view.reporting.pivotable = true;
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const html = viewPage(view, theme).replace('<div class="cx-host"', '<section><div class="cx-host" style="height:' + height + 'px;max-height:' + height + 'px"')
      .replace('</div></body>', '</div></section></body>').replace('</head>', () => '<script>' + parts() + '</script><style>' +
        fs.readFileSync(path.join(assets, "canopyx-pivot.css"), "utf8") + '</style></head>');
    await page.route("http://127.0.0.1/pivot-fragment", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("http://127.0.0.1/pivot-fragment"); await page.waitForSelector("[data-cx-ready]");
    await page.evaluate(api + ".setState({..." + api + ".getState(),pivot:{rows:[{column:'region',direction:'asc'},{column:'status',direction:'asc'}],columns:[{column:'placed',direction:'asc',bucket:{kind:'month'}}],values:['total','orders'],active:true,collapsedRows:[],collapsedColumns:[]}})");
    await nextFrames(page);
    const geometry = () => page.evaluate(() => {
      const host = document.querySelector("[data-canopyx-host]"), panel = host.querySelector(".cx-pivot"), scroll = panel.querySelector(".cx-pivot-scroll"),
        table = scroll.querySelector("table"), row = table.querySelector("tbody tr"), bounds = [host, panel, scroll].map(node => node.getBoundingClientRect()),
        head = table.tHead.getBoundingClientRect(), foot = table.tFoot.getBoundingClientRect(), box = row.getBoundingClientRect();
      const top = Math.max(...bounds.map(rect => rect.top), head.bottom), bottom = Math.min(...bounds.map(rect => rect.bottom), foot.top);
      return { visible: Math.max(0, Math.min(box.bottom, bottom) - Math.max(box.top, top)), rowHeight: box.height,
        hostHeight: bounds[0].height, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    await expect.poll(async () => { const box = await geometry(); return box.visible >= box.rowHeight - 1; }).toBe(true);
    expect((await geometry()).hostHeight).toBeLessThanOrEqual(height + 1);
    expect((await geometry()).overflow).toBe(false);
    // Each scroll container can be reached by keyboard, including controls above a short fragment's table.
    await page.locator(".cx-pivot-scroll").focus(); await expect(page.locator(".cx-pivot-scroll")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    expect(errors).toEqual([]);
  });
}

for (const [width, theme] of [[390, "dark"], [1440, "light"]]) {
  test(`a standalone auto-height pivot at ${width}px uses available room for multiple complete rows`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const view = definition(); delete view.reporting.detail; view.reporting.groupBy = []; view.reporting.pivotable = true;
    view.reporting.pivot = { rows: [{ column: "region", direction: "asc" }, { column: "status", direction: "asc" }],
      columns: [{ column: "placed", direction: "asc", bucket: { kind: "month" } }], values: ["total", "orders"] };
    const html = viewPage(view, theme).replace('</head>', () => '<script>' + parts() + '</script><style>' +
      fs.readFileSync(path.join(assets, "canopyx-pivot.css"), "utf8") + '</style></head>');
    await page.route("http://127.0.0.1/pivot-page", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("http://127.0.0.1/pivot-page"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
    await expect.poll(() => page.locator(".cx-pivot-table").evaluate(table => {
      const head = table.tHead.getBoundingClientRect(), foot = table.tFoot.getBoundingClientRect(),
        scroll = table.parentElement.getBoundingClientRect(), panel = table.closest(".cx-pivot").getBoundingClientRect();
      const top = Math.max(head.bottom, scroll.top, panel.top), bottom = Math.min(foot.top, scroll.bottom, panel.bottom, innerHeight);
      return [...table.tBodies[0].rows].filter(row => { const box = row.getBoundingClientRect(); return box.top >= top - 1 && box.bottom <= bottom + 1; }).length;
    })).toBeGreaterThanOrEqual(3);
  });
}
