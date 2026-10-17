import { test, expect } from "@playwright/test";
import { viewPage, runtimeAssets, openGridControl } from "./support.mjs";

const definition = reporting => ({ protocol: "canopyx/2", type: "grid", id: "capabilities", label: "Records",
  source: { kind: "inline" }, pageSize: 50, selection: "multiple", search: true,
  ...(reporting ? { reporting: { headerFilters: true } } : {}),
  columns: [{ id: "name", title: "Name", kind: "text", sortable: true },
    { id: "display", title: "Display only", kind: "text", filterable: false, exportable: false },
    { id: "amount", title: "Amount", kind: "number", sortable: true }],
  rows: [{ id: "one", cells: { name: "Alpha", display: "Visible detail", amount: 12 } }] });
async function open(page, view, { runtime, setup = "" } = {}) {
  let html = viewPage(view);
  if (runtime === "reporting" && !view.reporting) {
    const ordinary = runtimeAssets("grid"), reporting = runtimeAssets("reporting");
    html = html.replace(ordinary.script, reporting.script).replace(ordinary.style, reporting.style);
  }
  if (setup) html = html.replace("</head>", "<script>" + setup + "</script></head>");
  await page.route("http://canopyx.test/capabilities", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/capabilities"); await page.waitForSelector("[data-cx-ready]");
}

for (const reporting of [false, true]) test(`${reporting ? "reporting" : "ordinary"} grids retain display-only cells and omit unsupported filter and export choices`, async ({ page }) => {
  await open(page, definition(reporting));
  await expect(page.locator('.cx-row[data-cx-id="one"]')).toContainText("Visible detail");
  await openGridControl(page, "filters");
  await page.getByRole("button", { name: "+ Condition", exact: true }).click();
  await expect(page.locator('.cx-condition-column select option')).toHaveText(["Name", "Amount"]);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.locator('[data-cx-column-menu="display"]').click();
  await expect(page.getByRole("menuitem", { name: "Filter…", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  const result = await page.evaluate(async () => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx;
    grid.setColumnOrder(["amount", "display", "name"]); grid.setColumnVisible("name", false);
    const rejected = async action => { try { await action(); return null; } catch (error) { return error.message; } };
    return { columns: grid.prepareExport({ scope: "all" }).request.columns.map(column => column.id),
      csv: await grid.toCsv({ scope: "all" }),
      explicit: await rejected(() => grid.prepareExport({ scope: "all", columns: ["name", "display"] })),
      flat: await rejected(() => grid.setQuery({ filters: [{ column: "display", operator: "eq", values: ["Visible detail"] }] })),
      grouped: await rejected(() => grid.setQuery({ filterGroup: { operator: "or", filters: [{ column: "display", operator: "isNull", values: [] }], groups: [] } })) };
  });
  expect(result.columns).toEqual(["amount"]); expect(result.csv).toBe("Amount\r\n12\r\n");
  expect(result.explicit).toContain("export"); expect(result.flat).toContain("predicate"); expect(result.grouped).toContain("predicate");
});

test("Print follows exportable columns after visibility changes and restored state without reopening Export", async ({ page }) => {
  const view = definition(true); view.columns[0].exportable = false;
  await open(page, view, { setup: "window.prints=[];CanopyX.configure('capabilities',{onPrint:event=>window.prints.push(event.snapshot.request.columns.map(column=>column.id))});" });
  await openGridControl(page, "columns"); await page.getByRole("checkbox", { name: "Amount", exact: true }).uncheck();
  await page.evaluate(() => window.hiddenState = document.querySelector('[data-canopyx-host]').canopyx.getState());
  await page.locator(".cx-grid-columns > summary").click(); await openGridControl(page, "export");
  await expect(page.getByRole("button", { name: "Download CSV", exact: true })).toBeDisabled();
  await page.locator(".cx-grid-export > summary").click();
  await openGridControl(page, "columns"); await page.getByRole("checkbox", { name: "Amount", exact: true }).check();
  await page.locator(".cx-grid-columns > summary").click(); await page.locator(".cx-grid-overflow > summary").click();
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.prepareExport({ scope: "all" }).request.columns.map(column => column.id))).toEqual(["amount"]);
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.prints)).toEqual([["amount"]]);
  await page.evaluate(async () => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx;
    window.shownState = grid.getState(); await grid.setState(window.hiddenState);
  });
  await expect(page.locator(".cx-grid-print")).toBeDisabled();
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.setState(window.shownState));
  await expect(page.locator(".cx-grid-print")).toBeEnabled();
});

test("an ordinary definition on the reporting runtime shares its export projection with phone menu availability", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const view = definition(false);
  view.columns = [{ id: "name", title: "Name", kind: "text", width: 260, minWidth: 260, exportable: false },
    { id: "amount", title: "Amount", kind: "number", width: 200, minWidth: 200 }];
  view.rows = [{ id: "one", cells: { name: "Visible", amount: 12 } }];
  await open(page, view, { runtime: "reporting", setup: "window.copies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copies.push(text)}});" });
  await expect(page.locator(".cx-hcell")).toHaveCount(1);
  const csv = await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.toCsv({ scope: "all" }));
  expect(csv).toBe("Amount\r\n12\r\n");
  await openGridControl(page, "export");
  await expect(page.getByRole("button", { name: "Download CSV", exact: true })).toBeEnabled();
  await expect(page.locator(".cx-grid-delivery-status")).toBeEmpty();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.copies)).toEqual(["Amount\r\n12\r\n"]);
});

test("a grid with no allowed columns disables export actions and keeps a clear API error", async ({ page }) => {
  const view = definition(false); for (const column of view.columns) { column.filterable = false; column.exportable = false; }
  await open(page, view); await expect(page.locator(".cx-grid-filters")).toHaveCount(0);
  await openGridControl(page, "export");
  await expect(page.getByRole("button", { name: "Download CSV", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeDisabled();
  await expect(page.locator(".cx-grid-delivery-status")).toHaveText("No visible columns allow export.");
  expect(await page.evaluate(() => { try { document.querySelector('[data-canopyx-host]').canopyx.prepareExport({ scope: "all" }); return null; } catch (error) { return error.message; } })).toContain("No visible columns allow export");
});

test("capability flags are booleans and do not prohibit presentation highlights", async ({ page }) => {
  const view = definition(false); view.highlightRules = [{ column: "display", operator: "eq", values: ["Visible detail"], tone: "success" }];
  await open(page, view); await expect(page.locator('.cx-row[data-cx-id="one"]')).toHaveAttribute("data-cx-tone", "success");
  const invalid = await page.evaluate(() => {
    const host = document.querySelector('[data-canopyx-host]'), view = JSON.parse(host.querySelector('.cx-config').textContent), errors = [];
    for (const key of ["filterable", "exportable"]) { const target = document.createElement("div"); document.body.appendChild(target);
      try { CanopyX.createDataGrid(target, { view: { ...view, id: key, columns: view.columns.map(column => ({ ...column, [key]: "false" })) } }).destroy(); errors.push(null); } catch (error) { errors.push(error.message); } target.remove(); }
    return errors;
  });
  expect(invalid).toHaveLength(2); for (const error of invalid) expect(error).toContain("column");
});
