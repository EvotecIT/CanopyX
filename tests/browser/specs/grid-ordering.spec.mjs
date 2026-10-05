import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo, viewPage } from "./support.mjs";

const cases = JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/grid-ordering.json"), "utf8"));
const base = { protocol: "canopyx/2", type: "grid", id: "ordering", label: "Ordered report", source: { kind: "inline" },
  rowHeight: 28, pageSize: 2, presentation: "paged", pageLength: 2, selection: "none", search: true,
  columns: [{ id: "name", title: "Name", kind: "text", width: 220, sortable: true }] };

async function open(page, view) {
  await page.route("http://canopyx.test/ordering", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/ordering");
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready);
}

for (const [index, fixture] of cases.entries()) test(`shared ordering fixture ${index}: full-query sorting, paging and export`, async ({ page }) => {
  const policy = { text: fixture.text, ...(fixture.categories ? { categories: fixture.categories } : {}) };
  await open(page, { ...base, reporting: { ordering: { name: policy } },
    rows: fixture.values.map((value, index) => ({ id: "row-" + index, cells: { name: value } })) });
  for (const [direction, expected] of [["asc", fixture.ascending], ["desc", fixture.descending]]) {
    const result = await page.evaluate(async direction => {
      const grid = document.querySelector('[data-canopyx-host]').canopyx;
      await grid.setQuery({ sort: [{ column: "name", direction }] });
      const rows = []; for await (const row of grid.prepareExport({ scope: "all" }).rows()) rows.push(row.id);
      const first = [...document.querySelectorAll('.cx-row[data-cx-id]')].map(row => row.dataset.cxId);
      await grid.nextPage();
      const second = [...document.querySelectorAll('.cx-row[data-cx-id]')].map(row => row.dataset.cxId);
      return { rows, first, second };
    }, direction);
    const ids = expected.map(id => "row-" + id);
    expect(result.rows).toEqual(ids); expect(result.first).toEqual(ids.slice(0, 2)); expect(result.second).toEqual(ids.slice(2, 4));
  }
});

test("ordinary entry points reject reporting policies instead of silently changing their meaning", async ({ page }) => {
  await open(page, { ...base, rows: [] });
  const error = await page.evaluate(view => {
    const host = document.createElement("div"); document.body.append(host);
    try { CanopyX.createDataGrid(host, { view }); return null; }
    catch (error) { return error.message; } finally { host.remove(); }
  }, { ...base, id: "reporting-required", reporting: { ordering: { name: { text: "natural" } } }, rows: [] });
  expect(error).toBe("CanopyX: this view needs the reporting runtime.");
});

test("numeric raw cells reject magnitudes which the native writer cannot preserve", async ({ page }) => {
  await open(page, { ...base, rows: [] });
  const results = await page.evaluate(() => [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, -(Number.MAX_SAFE_INTEGER + 1)].map((value, index) => {
    const host = document.createElement("div"); document.body.append(host);
    try {
      const grid = CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "precision" + index, label: "Precision",
        source: { kind: "inline" }, rowHeight: 28, pageSize: 2, selection: "none", search: false,
        columns: [{ id: "value", title: "Value", kind: "number", width: 140 }], rows: [{ id: "row", cells: { value } }] } });
      grid.destroy(); return null;
    } catch (error) { return error.message; } finally { host.remove(); }
  }));
  expect(results[0]).toBeNull(); expect(results.slice(1).every(error => error && error.includes("safe integer magnitude"))).toBe(true);
});

test("reporting order rejects undeclared columns and categories colliding after frozen folding", async ({ page }) => {
  await open(page, { ...base, reporting: {}, rows: [] });
  const errors = await page.evaluate(() => {
    const policies = [{ unknown: { text: "ordinal" } }, { name: { text: "foldedNatural", categories: ["ŁÓDŹ", "łódź"] } }];
    return policies.map(ordering => {
      const host = document.createElement("div"); document.body.append(host);
      try { CanopyX.createDataGrid(host, { view: { protocol: "canopyx/2", type: "grid", id: "invalid", label: "Invalid",
        source: { kind: "inline" }, rowHeight: 28, pageSize: 2, selection: "none", search: false,
        columns: [{ id: "name", title: "Name", kind: "text", width: 120, sortable: true }], rows: [], reporting: { ordering } } });
        return null; } catch (error) { return error.message; } finally { host.remove(); }
    });
  });
  expect(errors[0]).toContain("sortable text column"); expect(errors[1]).toContain("repeated category after case folding");
});

test("date ordering compares instants at millisecond precision and keeps raw export values", async ({ page }) => {
  const dates = ["2026-10-04T10:00:00.0001000Z", "2026-10-04T12:00:00.000+02:00", "2026-10-04T10:00:00.001Z"];
  await open(page, { ...base, columns: [{ id: "date", title: "Date", kind: "datetime", width: 240, sortable: true }],
    rows: dates.map((date, index) => ({ id: ["z", "a", "m"][index], cells: { date } })) });
  const result = await page.evaluate(async () => {
    const grid = document.querySelector('[data-canopyx-host]').canopyx;
    await grid.setQuery({ sort: [{ column: "date", direction: "asc" }] });
    const rows = []; for await (const row of grid.prepareExport({ scope: "all" }).rows()) rows.push(row.id);
    await grid.setQuery({ filters: [{ column: "date", operator: "eq", values: ["2026-10-04T10:00:00.000Z"] }] });
    return { rows, filtered: grid.getPaging().matched, csv: await grid.toCsv({ scope: "all", values: "raw" }) };
  });
  expect(result.rows).toEqual(["a", "z", "m"]); expect(result.filtered).toBe(2);
  for (const date of dates) expect(result.csv).toContain(date);
});
