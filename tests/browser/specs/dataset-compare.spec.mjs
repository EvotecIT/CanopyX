// N4.1 browser contracts: consume joined rows; the C# comparer owns joining and change detection.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo, exampleUrl, nextFrames, settleGrid } from "./support.mjs";

const assets = path.join(repo, "CanopyX.Html/Assets");
const read = name => fs.readFileSync(path.join(assets, name), "utf8");
const origin = "https://dataset-compare.test";
const host = page => page.locator("[data-compare-test]");
const row = (page, id) => host(page).locator(`.cx-row[data-cx-id="${id}"]`);
const ids = page => host(page).locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.map(row => row.dataset.cxId));
const cell = (page, id, index) => row(page, id).locator(".cx-cell").nth(index);

const definition = () => ({ protocol: "canopyx/2", type: "grid", id: "compare-contract", label: "Compared inventory",
  source: { kind: "inline" }, rowHeight: 40, pageSize: 100, selection: "multiple", search: true,
  columns: [{ id: "change", title: "Change", kind: "text", sortable: true },
    { id: "name", title: "Item", kind: "text", sortable: true, presenter: { kind: "change", beforeAfter: true } },
    { id: "amount", title: "Amount", kind: "number", sortable: true, presenter: { kind: "change", beforeAfter: true } },
    { id: "date", title: "Date", kind: "datetime", presenter: { kind: "change", beforeAfter: true } }],
  compare: { statusColumn: "change", counts: { added: 1, removed: 1, changed: 2, unchanged: 1 },
    columns: { name: 2, amount: 2, date: 1 }, onlyChanges: false },
  rows: [
    { id: "typed", cells: { change: "changed", name: { value: "<new>", changes: [{ name: "Item", before: "<old>", after: { value: "<new>" }, kind: "text" }] },
      amount: { value: 12.5, changes: [{ name: "Amount", before: { value: 0 }, after: 12.5, kind: "number" }] },
      date: { value: "2026-10-25T12:00:00Z", changes: [{ name: "Date", before: "2025-01-02T12:00:00Z", after: { value: "2026-10-25T12:00:00Z" }, kind: "datetime" }] } } },
    { id: "nulls", cells: { change: "changed", name: { value: null, changes: [{ name: "Item", before: { value: "Assigned" }, after: null, kind: "text" }] },
      amount: { value: 0, changes: [{ name: "Amount", before: null, after: { value: 0 }, kind: "number" }] } } },
    { id: "removed", cells: { change: "removed", name: { value: null, changes: [{ name: "Item", before: "Retired", after: null, kind: "text" }] } } },
    { id: "added", cells: { change: "added", name: "New item", amount: 7 } },
    { id: "stable", cells: { change: "unchanged", name: "Stable item", amount: 7 } }
  ] });

// Use file-named assets like plugins.spec: the real loader discovers optional parts beside the runtime.
// Only the page/asset transport is substituted; queries, formatting, exports and state use the shipped runtime.
async function serve(page) {
  const requested = [];
  await page.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    requested.push({ url: request.url(), method: request.method() });
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dataset comparison</title>' +
      '<style>' + read("canopyx-grid.css") + '</style><script src="/canopyx-grid.js"></script></head><body></body></html>' });
    const file = url.pathname.slice(1);
    if (path.basename(file) !== file || !/^canopyx-[a-z-]+\.(js|css|json)$/.test(file) || !fs.existsSync(path.join(assets, file)))
      return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ contentType: file.endsWith("css") ? "text/css" : file.endsWith("json") ? "application/json" : "text/javascript", body: read(file) });
  });
  await page.goto(origin + "/");
  return requested;
}

async function mount(page, view) {
  await page.evaluate(async view => {
    const element = document.body.appendChild(document.createElement("div"));
    element.setAttribute("data-compare-test", ""); element.style.height = "480px";
    window.compareGrid = CanopyX.createDataGrid(element, { view });
    await compareGrid.ready;
  }, view);
  await nextFrames(page);
}

async function openCompareExample(page, name = "data-views.html") {
  await page.goto(exampleUrl(name));
  await page.waitForFunction(() => [...document.querySelectorAll("[data-canopyx-host]")].some(element => element.canopyx?.view.id === "inventory-compare"));
  await page.evaluate(async () => {
    const element = [...document.querySelectorAll("[data-canopyx-host]")].find(element => element.canopyx?.view.id === "inventory-compare");
    element.setAttribute("data-compare-test", ""); window.compareGrid = element.canopyx; await compareGrid.ready;
  });
  await nextFrames(page);
}

test.beforeEach(async ({ page }) => {
  page.compareErrors = []; page.on("pageerror", error => page.compareErrors.push(error.message));
});
test.afterEach(async ({ page }) => {
  // Playwright owns and tears down the page/context, including when an assertion fails.
  expect(page.compareErrors).toEqual([]);
});

for (const [width, file, theme] of [[1440, "data-views.html", "light"], [390, "data-views-dark.html", "dark"]]) {
  test(`the generated comparison preserves keyed statuses and exposes its counts and toggle (${theme}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openCompareExample(page, file);
    expect((await ids(page)).sort()).toEqual(["a", "b", "c", "d", "e"]);
    for (const [id, status] of [["a", "Changed"], ["b", "Changed"], ["c", "Unchanged"], ["d", "Removed"], ["e", "Added"]])
      await expect(row(page, id).locator(".cx-compare-status")).toHaveText(status);
    const summary = host(page).locator(".cx-compare-summary");
    await expect(summary).toBeVisible();
    for (const [status, count] of [["added", 1], ["removed", 1], ["changed", 2]])
      await expect(summary.locator(".cx-compare-" + status + " strong")).toHaveText(String(count));
    if (width > 640) {
      const titles = await host(page).getByRole("columnheader").allTextContents();
      expect(titles.some(title => title.includes("Stage · 1"))).toBe(true);
      expect(titles.some(title => title.includes("Units · 1"))).toBe(true);
      await expect(row(page, "a").locator("del")).toHaveText("24");
      await expect(row(page, "a").locator("ins")).toHaveText("32");
      await expect(row(page, "b").locator("del")).toHaveText("Paused");
      await expect(row(page, "b").locator("ins")).toHaveText("Active");
    } else {
      // Responsive omission is a layout decision, not a saved hidden-column setting.
      expect(await page.evaluate(() => compareGrid.getState().columns.filter(column => ["stage", "units"].includes(column.id))
        .map(column => ({ id: column.id, hidden: column.hidden })))).toEqual([{ id: "stage", hidden: false }, { id: "units", hidden: false }]);
      expect(await page.evaluate(() => compareGrid.view.compare.columns)).toMatchObject({ stage: 1, units: 1 });
      const columns = host(page).locator(".cx-grid-columns"), summary = columns.locator(":scope > summary");
      if (!await summary.isVisible()) await host(page).locator(".cx-grid-overflow > summary").click();
      await summary.click();
      await expect(columns.getByRole("checkbox", { name: "Stage · 1", exact: true })).toBeChecked();
      await expect(columns.getByRole("checkbox", { name: "Units · 1", exact: true })).toBeChecked();
      await page.evaluate(() => compareGrid.closeMenus());
      // Structured change cells open the record panel's labelled Before/After table in the native drawer.
      const disclosure = row(page, "a").locator(".cx-hidden-fields");
      await expect(disclosure).toHaveAttribute("title", /Units · 1/);
      await disclosure.click();
      const drawer = page.locator("dialog.cx-drawer[open]");
      await expect(drawer).toBeVisible();
      const changes = drawer.locator('.cx-record-block-b[data-cx-field="units"] .cx-record-diff');
      await expect(changes.getByRole("columnheader")).toHaveText(["Field", "Before", "After"]);
      const units = changes.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Units", exact: true }) });
      await expect(units.getByRole("cell")).toHaveText(["24", "32"]);
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
      await expect(row(page, "b").locator(".cx-phone-field del")).toHaveText("Paused");
      await expect(row(page, "b").locator(".cx-phone-field ins")).toHaveText("Active");
    }
    const toggle = summary.getByRole("switch", { name: "Only changes" });
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect.poll(() => ids(page)).toEqual(["a", "b", "d", "e"]);
    expect(await page.evaluate(() => compareGrid.getOnlyChanges())).toBe(true);
    await expect(toggle).toBeEnabled();
    await toggle.uncheck();
    await expect.poll(async () => (await ids(page)).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
}

test("before-after cells preserve text, typed numbers and dates, null endpoints and escaping", async ({ page }) => {
  await serve(page); await mount(page, definition());
  await expect(cell(page, "typed", 1).locator("del")).toHaveText("<old>");
  await expect(cell(page, "typed", 1).locator("ins")).toHaveText("<new>");
  await expect(cell(page, "typed", 1).locator("old,new")).toHaveCount(0);
  await expect(cell(page, "typed", 2).locator("del")).toHaveText("0");
  await expect(cell(page, "typed", 2).locator("ins")).toHaveText("12.5");
  await expect(cell(page, "typed", 3).locator("del")).toContainText("2025");
  await expect(cell(page, "typed", 3).locator("ins")).toContainText("2026");
  await expect(cell(page, "nulls", 1).locator("del")).toHaveText("Assigned");
  await expect(cell(page, "nulls", 1).locator("ins")).toHaveText("—");
  await expect(cell(page, "nulls", 2).locator("del")).toHaveText("—");
  await expect(cell(page, "nulls", 2).locator("ins")).toHaveText("0");
  await expect(cell(page, "removed", 1).locator("del")).toHaveText("Retired");
  await expect(cell(page, "removed", 1).locator("ins")).toHaveText("—");
  await expect(cell(page, "added", 1)).toHaveText("New item");
  await expect(cell(page, "stable", 1)).toHaveText("Stable item");
});

test("reset view restores declared only-changes mode after mounting and after revealing unchanged rows", async ({ page }) => {
  await serve(page);
  const view = definition(); view.compare.onlyChanges = true;
  await mount(page, view);
  const changedIds = ["added", "nulls", "removed", "typed"];
  const toggle = host(page).getByRole("switch", { name: "Only changes" });
  await expect.poll(async () => (await ids(page)).sort()).toEqual(changedIds);
  await page.evaluate(() => compareGrid.resetView());
  await expect.poll(async () => (await ids(page)).sort()).toEqual(changedIds);
  expect(await page.evaluate(() => compareGrid.getOnlyChanges())).toBe(true);
  await expect(toggle).toBeChecked();
  await page.evaluate(() => compareGrid.setOnlyChanges(false));
  await expect.poll(async () => (await ids(page)).sort()).toEqual(["added", "nulls", "removed", "stable", "typed"]);
  expect(await page.evaluate(() => compareGrid.getOnlyChanges())).toBe(false);
  await expect(toggle).not.toBeChecked();
  await page.evaluate(() => compareGrid.resetView());
  await expect.poll(async () => (await ids(page)).sort()).toEqual(changedIds);
  expect(await page.evaluate(() => compareGrid.getOnlyChanges())).toBe(true);
  await expect(toggle).toBeChecked();
});

test("change endpoints distinguish missing, explicit null, empty text, zero and false in cells and the native drawer", async ({ page }) => {
  const explicitNull = { value: null, text: "" };
  // Boolean false follows the ordinary English cell formatter (No); it must never collapse to missing/null.
  const cases = [
    { id: "missing-to-null", before: null, after: explicitNull, text: ["—", "null"] },
    { id: "null-to-missing", before: explicitNull, after: null, text: ["null", "—"] },
    { id: "empty-to-null", before: "", after: explicitNull, text: ['""', "null"] },
    { id: "null-to-empty", before: explicitNull, after: "", text: ["null", '""'] },
    { id: "zero-to-null", before: 0, after: explicitNull, text: ["0", "null"] },
    { id: "null-to-zero", before: explicitNull, after: 0, text: ["null", "0"] },
    { id: "false-to-null", before: false, after: explicitNull, text: ["No", "null"] },
    { id: "null-to-false", before: explicitNull, after: false, text: ["null", "No"] }
  ];
  const view = definition();
  view.rowHeight = 32;
  view.columns = [view.columns[0], { id: "name", title: "Item", kind: "text" },
    { id: "endpoint", title: "Endpoint", kind: "text", alwaysVisible: true, width: 240, presenter: { kind: "change", beforeAfter: true } },
    { id: "numeric", title: "Numeric endpoint", kind: "number", alwaysVisible: true, width: 240, presenter: { kind: "change", beforeAfter: true } }];
  view.compare = { statusColumn: "change", counts: { added: 0, removed: 0, changed: cases.length, unchanged: 0 },
    columns: { endpoint: cases.length - 2, numeric: 2 }, onlyChanges: false };
  view.rows = cases.map(item => {
    item.numeric = typeof item.before === "number" || typeof item.after === "number";
    return { id: item.id, cells: { change: "changed", name: item.id,
      [item.numeric ? "numeric" : "endpoint"]: { value: item.after && typeof item.after === "object" ? item.after.value : item.after,
        changes: [{ name: "Endpoint", before: item.before, after: item.after, kind: item.numeric ? "number" : "text" }] } } };
  });
  await serve(page); await mount(page, view);
  for (const item of cases) {
    await test.step(item.id, async () => {
      const endpoint = cell(page, item.id, item.numeric ? 3 : 2);
      await expect(endpoint.locator("del")).toHaveText(item.text[0]);
      await expect(endpoint.locator("ins")).toHaveText(item.text[1]);
      await expect(endpoint.locator(".cx-before-after")).toHaveText(item.text.join("→"));
      await page.evaluate(id => compareGrid.openDetails(id), item.id);
      const drawer = page.locator("dialog.cx-drawer[open]");
      await expect(drawer).toBeVisible();
      const changes = drawer.locator('.cx-record-block-b[data-cx-field="' + (item.numeric ? "numeric" : "endpoint") + '"] .cx-record-diff');
      await expect(changes.locator("caption")).toHaveText("Changed fields: 1");
      await expect(changes.getByRole("columnheader")).toHaveText(["Field", "Before", "After"]);
      const change = changes.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Endpoint", exact: true }) });
      await expect(change.getByRole("cell")).toHaveText(item.text);
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
    });
  }
});

test("the generated Units comparison fits on one line inside its fixed desktop row", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCompareExample(page);
  await settleGrid(page);
  const value = row(page, "a").locator(".cx-before-after");
  await expect(value.locator("del")).toHaveText("24");
  await expect(value.locator("ins")).toHaveText("32");
  const geometry = await value.evaluate(element => {
    const rect = node => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height }; };
    const row = element.closest(".cx-row"), cell = element.closest(".cx-cell");
    return { row: rect(row), fixedHeight: Number.parseFloat(row.style.height), cell: rect(cell), value: rect(element),
      parts: [...element.children].map(rect) };
  });
  expect(geometry.fixedHeight).toBeGreaterThan(0);
  expect(Math.abs(geometry.row.height - geometry.fixedHeight)).toBeLessThanOrEqual(1);
  expect(geometry.parts).toHaveLength(3);
  // Overlapping vertical bounds and ordered horizontal bounds prove before, arrow and after share one line.
  expect(Math.max(...geometry.parts.map(part => part.top))).toBeLessThan(Math.min(...geometry.parts.map(part => part.bottom)));
  for (let i = 1; i < geometry.parts.length; i++) expect(geometry.parts[i].left).toBeGreaterThanOrEqual(geometry.parts[i - 1].right - 1);
  for (const part of [geometry.value, ...geometry.parts]) {
    expect(part.right).toBeGreaterThan(part.left);
    expect(part.left).toBeGreaterThanOrEqual(geometry.cell.left - 1);
    expect(part.right).toBeLessThanOrEqual(geometry.cell.right + 1);
    expect(part.top).toBeGreaterThanOrEqual(geometry.row.top - 1);
    expect(part.bottom).toBeLessThanOrEqual(geometry.row.bottom + 1);
  }
});

test("only-changes roundtrips through query and state and exports the same filtered rows", async ({ page }) => {
  await openCompareExample(page);
  await page.evaluate(async () => {
    await compareGrid.setQuery({ search: "North", sort: [{ column: "name", direction: "desc" }],
      filters: [{ column: "location", operator: "eq", values: ["North"] }] });
    compareGrid.setSelection(["a"]); await compareGrid.setOnlyChanges(true);
  });
  await expect.poll(() => ids(page)).toEqual(["a"]);
  const saved = await page.evaluate(() => compareGrid.getState());
  expect(saved.query.search).toBe("North");
  expect(saved.query.sort).toEqual([{ column: "name", direction: "desc" }]);
  expect(saved.query.filters).toEqual([{ column: "location", operator: "eq", values: ["North"] },
    { column: "change", operator: "ne", values: ["unchanged"] }]);
  const exported = await page.evaluate(async () => {
    const read = async scope => {
      const prepared = compareGrid.prepareExport({ scope, values: "raw" }), rows = [];
      for await (const row of prepared.rows()) rows.push({ id: row.id, status: row.cells.change.value });
      return { rows, count: prepared.request.recordCount };
    };
    return { filtered: await read("filtered"), all: await read("all"), csv: await compareGrid.toCsv({ scope: "filtered", values: "raw" }) };
  });
  expect(exported.filtered).toEqual({ count: 1, rows: [{ id: "a", status: "changed" }] });
  expect(exported.all.count).toBe(5);
  expect(exported.all.rows.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
    { id: "a", status: "changed" }, { id: "b", status: "changed" }, { id: "c", status: "unchanged" },
    { id: "d", status: "removed" }, { id: "e", status: "added" }
  ]);
  expect(exported.csv).toContain("Atlas"); expect(exported.csv).not.toContain("Cedar");
  await page.evaluate(() => compareGrid.setOnlyChanges(false));
  await expect.poll(() => ids(page)).toEqual(["c", "a"]);
  expect(await page.evaluate(() => compareGrid.getQuery().filters)).toEqual([{ column: "location", operator: "eq", values: ["North"] }]);
  await page.evaluate(() => compareGrid.setQuery({ search: "Elm", filters: [] }));
  await page.evaluate(state => compareGrid.setState(state), JSON.parse(JSON.stringify(saved)));
  await expect.poll(() => ids(page)).toEqual(["a"]);
  expect(await page.evaluate(() => ({ only: compareGrid.getOnlyChanges(), selected: compareGrid.getSelection(), query: compareGrid.getState().query })))
    .toEqual({ only: true, selected: ["a"], query: saved.query });
  await expect(host(page).getByRole("switch", { name: "Only changes" })).toBeChecked();
});

test("the static comparison example includes every status and before-after value without scripts", async ({ page }) => {
  await page.goto(exampleUrl("dataset-compare-static.html"));
  await expect(page.locator("script")).toHaveCount(0);
  expect(await page.evaluate(() => [...document.querySelectorAll("*")].some(element => [...element.attributes]
    .some(attribute => /^on/i.test(attribute.name) || /^(href|src)$/i.test(attribute.name) && /^javascript:/i.test(attribute.value))))).toBe(false);
  const rows = page.getByRole("row");
  for (const [item, status] of [["Atlas", "Changed"], ["Birch", "Changed"], ["Cedar", "Unchanged"], ["Delta", "Removed"], ["Elm", "Added"]])
    await expect(rows.filter({ hasText: item })).toContainText(status);
  await expect(rows.filter({ hasText: "Atlas" })).toContainText(/24.*→.*32/);
  await expect(rows.filter({ hasText: "Birch" })).toContainText(/Paused.*→.*Active/);
  await expect(rows.filter({ hasText: "Delta" })).toContainText(/Delta.*→.*—/);
});

test("the optional compare part stays off ordinary grids and comparisons make only runtime asset requests", async ({ page }) => {
  const requested = await serve(page), plain = definition(); delete plain.compare;
  plain.columns.forEach(column => delete column.presenter);
  plain.rows = [{ id: "plain", cells: { name: "Ordinary item" } }];
  await mount(page, plain);
  await expect(row(page, "plain")).toContainText("Ordinary item");
  expect(requested.some(request => new URL(request.url).pathname.startsWith("/canopyx-compare"))).toBe(false);
  await page.evaluate(() => { compareGrid.destroy(); document.querySelector("[data-compare-test]").remove(); });
  const compared = definition(); compared.compare.onlyChanges = true;
  await mount(page, compared);
  expect(await page.evaluate(() => compareGrid.getOnlyChanges())).toBe(true);
  expect((await ids(page)).sort()).toEqual(["added", "nulls", "removed", "typed"]);
  await expect(host(page).getByRole("switch", { name: "Only changes" })).toBeChecked();
  expect(requested.filter(request => new URL(request.url).pathname === "/canopyx-compare.js")).toHaveLength(1);
  await page.evaluate(async () => { await compareGrid.setOnlyChanges(false); await compareGrid.setOnlyChanges(true); });
  expect(requested.every(request => request.method === "GET" && new URL(request.url).origin === origin &&
    (new URL(request.url).pathname === "/" || /^\/canopyx-[a-z-]+\.(js|css|json)$/.test(new URL(request.url).pathname)))).toBe(true);
});

test("invalid compare metadata rejects ready instead of showing misleading controls", async ({ page }) => {
  await serve(page);
  const rejected = [];
  for (const invalid of [{ statusColumn: "missing" }, { counts: { added: -1, removed: 1, changed: 2, unchanged: 1 } },
    { columns: { missing: 1 } }, { onlyChanges: "yes" }]) {
    const view = definition(); view.compare = { ...view.compare, ...invalid };
    rejected.push(await page.evaluate(async view => {
      const element = document.body.appendChild(document.createElement("div")); let api;
      try { api = CanopyX.createDataGrid(element, { view }); await api.ready; return "accepted"; }
      catch (error) { return error.message; }
      finally { api?.destroy(); element.remove(); }
    }, view));
  }
  expect(rejected).toEqual(Array(4).fill("CanopyX: invalid dataset comparison."));
  await expect(page.locator(".cx-compare-summary")).toHaveCount(0);
});
