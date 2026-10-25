import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { examples, openGridControl } from "./support.mjs";
import { serveExamples } from "../tools/example-server.mjs";

let server;
test.beforeAll(async () => { server = await serveExamples(examples); });
test.afterAll(async () => { await server?.close(); });

test("Office writers stay inert until first use and generate offline artifacts for every scope", async ({ page, context }, info) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.url + "office-export.html");
  await page.waitForSelector("[data-cx-ready]");
  expect(await page.evaluate(() => typeof globalThis.OfficeIMO)).toBe("undefined");
  await openGridControl(page, "export");
  await expect(page.locator(".cx-grid-export .cx-grid-panel button:not([hidden])")).toHaveText(["Download CSV", "Download Excel", "Download PDF", "Copy", "Print"]);
  await context.setOffline(true);
  for (const [format, scope, count] of [["xlsx", "filtered", 30], ["xlsx", "selected", 2], ["xlsx", "all", 60], ["pdf", "all", 60]]) {
    const result = await page.evaluate(async ({ format, scope }) => {
      const grid = document.querySelector("[data-canopyx-host]").canopyx;
      await grid.setQuery({ search: "North" }); grid.setSelection(["resource-000", "resource-001"]);
      const capture = grid.prepareExport({ scope, values: "raw" }), rows = [];
      for await (const row of capture.rows()) rows.push(row);
      const progress = [], output = await grid.exportAs(format, { scope, download: false, onProgress: value => progress.push(value) });
      return { bytes: [...new Uint8Array(await output.blob.arrayBuffer())], request: capture.request, rows, progress, fileName: output.fileName };
    }, { format, scope });
    expect(result.rows).toHaveLength(count);
    expect(result.progress.at(-1)).toMatchObject({ phase: "ready", completed: count, total: count });
    const file = info.outputPath(scope + "." + format), contract = file + ".json";
    await fs.writeFile(file, Buffer.from(result.bytes));
    await fs.writeFile(contract, JSON.stringify({ ...result.request, expectedCount: count, rows: result.rows,
      requirements: { leadingPinnedColumns: 1, outlineAndSummary: scope === "filtered", landscape: true,
        recordIdentityPattern: "Compute\\s+node\\s+\\d{2}" } }, null, 2));
    await info.attach(scope + "-" + format, { path: file });
    await info.attach(scope + "-contract", { path: contract, contentType: "application/json" });
    expect(Buffer.from(result.bytes.slice(0, format === "xlsx" ? 2 : 5)).toString()).toBe(format === "xlsx" ? "PK" : "%PDF-");
  }
  expect(errors).toEqual([]);
});

test("the real Office writer reports progress and cancels a pending record window from the menu", async ({ page, context }) => {
  const errors = [], downloads = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("download", download => downloads.push(download));
  await page.goto(server.url + "office-export.html"); await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(async () => {
    const host = document.querySelector('[data-canopyx-host]'), original = host.canopyx;
    const view = JSON.parse(JSON.stringify(original.view));
    view.id = "office-cancel"; view.source = { kind: "host" }; view.reporting = {}; delete view.rows;
    view.columns = view.columns.filter(column => ['name', 'cost'].includes(column.id));
    for (const column of view.columns) delete column.presenter;
    view.formatRules = [];
    original.destroy(); host.replaceChildren(); host.style.height = "450px";
    window.officePending = 0; window.officeAborted = false;
    const grid = CanopyX.createDataGrid(host, { view, onError: detail => { throw detail.error; }, source: {
      query(query, { signal }) {
        if (window.officeArmed && query.offset >= 1000) {
          window.officePending++;
          return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
            window.officeAborted = true; reject(signal.reason);
          }, { once: true }));
        }
        return { protocol: "canopyx/2", type: "gridPage", view: query.view, revision: "office", offset: query.offset,
          total: 6000, matched: 6000, items: Array.from({ length: Math.min(query.limit, 6000 - query.offset) }, (_, index) => ({
            id: "r" + (query.offset + index), cells: { name: "Resource " + (query.offset + index), cost: index + 1 }
          })) };
      }
    } });
    await grid.ready; window.officeArmed = true;
  });
  await context.setOffline(true);
  await openGridControl(page, "export");
  const panel = page.locator('.cx-grid-export .cx-grid-panel');
  await panel.getByRole('button', { name: 'Download Excel', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.officePending)).toBeGreaterThan(0);
  await expect(panel.locator('progress')).toBeVisible();
  await expect(panel.locator('.cx-grid-delivery-status')).toHaveText('1,000 of 6,000 records');
  await panel.getByRole('button', { name: 'Cancel export', exact: true }).click();
  await expect(panel.locator('.cx-grid-delivery-status')).toHaveText('Export cancelled');
  await expect(panel.getByRole('button', { name: 'Download Excel', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.officeAborted)).toBe(true);
  expect(downloads).toHaveLength(0); expect(errors).toEqual([]);
});
