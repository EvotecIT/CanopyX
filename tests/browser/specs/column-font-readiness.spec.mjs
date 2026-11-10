import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { viewPage, settleGrid } from "./support.mjs";

const font = fs.readFileSync(new URL("../fonts/Inter-latin.woff2", import.meta.url));

for (const [type, delayedRows, pendingQuery] of [["grid", false], ["view", false], ["grid", true], ["grid", false, true]]) test(`${type} automatic columns recover after a delayed web font${delayedRows ? " requested by late initial rows" : pendingQuery ? " while a hosted query is pending" : ""} without changing reader widths`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const columns = [
    { id: "name", title: "Name", kind: "text" },
    { id: "details", title: "Details", kind: "text" },
    { id: "amount", title: "Value", kind: "number" },
    { id: "fixed", title: "Fixed", kind: "text", width: 117, fixed: true },
    { id: "manual", title: "Reader", kind: "text" }
  ];
  const rows = Array.from({ length: 3 }, (_, index) => ({ id: "r" + index, label: "iiiiiiiiiiiiiiiiiiiiiiii",
    cells: { name: "iiiiiiiiiiiiiiiiiiiiiiii", details: "WWWWWWWWWW", amount: 111111111111111, fixed: "Fixed", manual: "Reader" } }));
  if (pendingQuery) {
    for (let index = 0; index < 6; index++) {
      const id = "optional" + index;
      columns.push({ id, title: "Optional " + index, kind: "text", priority: "optional" });
      for (const row of rows) row.cells[id] = "W".repeat(60);
    }
  }
  const view = { protocol: "canopyx/2", type, id: "late-font", label: "Records", selection: "single", pageSize: 100,
    source: { kind: "inline" }, columns, ...(type === "grid" ? { rows } : { roots: rows }) };
  const css = `<style>
    @font-face { font-family: "Delayed Grid Font"; src: url("/delayed.woff2") format("woff2"); font-display: swap; ${delayedRows ? "unicode-range: U+0057;" : ""} }
    .cx-host { width: 1200px; height: 260px; }
    .cx-host, .cx-host * { font-family: "Delayed Grid Font", monospace !important; }
    .cx-cell { font-variant-numeric: tabular-nums; }
  </style>`;
  let releaseFont;
  const held = new Promise(resolve => { releaseFont = resolve; });
  await page.route("https://canopyx.test/delayed.woff2", async route => {
    await held;
    await route.fulfill({ contentType: "font/woff2", body: font });
  });
  const delayedView = { ...view, source: { kind: "host" } }; delete delayedView.rows;
  const setup = delayedRows || pendingQuery ? `<script>CanopyX.configure("late-font", { source: { async query(query) {
    if (${delayedRows ? "true" : "false"} || window.initialQueryDone) await new Promise(resolve => { window.releaseRows = resolve; });
    window.initialQueryDone = true;
    return { protocol: "canopyx/2", type: "gridPage", view: "late-font", revision: "r1", offset: 0,
      total: 3, matched: 3, items: ${JSON.stringify(rows)} };
  } } });</script>` : "";
  await page.route("https://canopyx.test/columns", route => route.fulfill({ contentType: "text/html",
    body: viewPage(delayedRows || pendingQuery ? delayedView : view).replace("</head>", css + setup + "</head>") }));
  const widths = host => host.locator(".cx-hcell").evaluateAll(cells => cells.map(cell => Math.round(cell.getBoundingClientRect().width)));
  const original = page.locator(".cx-host").first();
  let control;
  try {
    await page.goto("https://canopyx.test/columns", { waitUntil: "domcontentloaded" });
    if (delayedRows) {
      await page.waitForFunction(() => typeof window.releaseRows === "function");
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame); });
      expect(await page.evaluate(() => document.fonts.status)).toBe("loaded");
      await page.evaluate(() => window.releaseRows());
    }
    await page.waitForSelector("[data-cx-ready]");
    await original.evaluate(async host => { await host.canopyx.ready; host.canopyx.setColumnWidth("manual", 173); });
    expect(await page.evaluate(() => document.fonts.status)).toBe("loading");
    const fallback = await widths(original);
    if (pendingQuery) {
      await expect(original.locator(".cx-hcell")).not.toHaveCount(columns.length);
      await original.evaluate(host => {
        window.queryResult = host.canopyx.reload();
      });
      await page.waitForFunction(() => typeof window.releaseRows === "function");
    }
    releaseFont();
    if (pendingQuery) {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
      });
    } else await settleGrid(page);
    // A separate document also starts with fresh tabular-advance caches. Mount its view only after the font loads.
    control = await page.context().newPage();
    const controlHtml = viewPage({ ...view, id: "loaded-font" }).replace("</head>", css + "</head>")
      .replace('class="cx-host" data-canopyx-host', 'class="cx-host" data-deferred-host');
    await control.route("https://canopyx.test/delayed.woff2", route => route.fulfill({ contentType: "font/woff2", body: font }));
    await control.route("https://canopyx.test/columns", route => route.fulfill({ contentType: "text/html", body: controlHtml }));
    await control.goto("https://canopyx.test/columns");
    await control.evaluate(async () => {
      await document.fonts.load('14px "Delayed Grid Font"', "W");
      const host = document.querySelector("[data-deferred-host]");
      host.setAttribute("data-canopyx-host", "");
      await CanopyX.mount(host); await host.canopyx.ready; host.canopyx.setColumnWidth("manual", 173);
    });
    await settleGrid(control);
    const loaded = await widths(control.locator(".cx-host"));
    expect(fallback, "the delayed font must actually change the automatic sizing inputs").not.toEqual(loaded);
    expect(await widths(original), "font arrival must produce the same widths as mounting with that font ready").toEqual(loaded);
    const shown = await original.locator(".cx-hcell").evaluateAll(cells => cells.map(cell => cell.dataset.cxColumn));
    expect(loaded[shown.indexOf("fixed")]).toBe(117);
    expect(loaded[shown.indexOf("manual")]).toBe(173);
    expect(errors).toEqual([]);
    if (pendingQuery) {
      await page.evaluate(() => window.releaseRows());
      await page.evaluate(() => window.queryResult);
      await settleGrid(page);
      expect(await widths(original)).toEqual(loaded);
    }
  } finally {
    releaseFont();
    if (pendingQuery && !page.isClosed()) await page.evaluate(() => window.releaseRows?.());
    await control?.close();
  }
});
