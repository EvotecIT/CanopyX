import { test, expect } from "@playwright/test";
import { runtimeAssets } from "./support.mjs";

async function open(page) {
  const { script, style } = runtimeAssets("reporting");
  await page.route("http://127.0.0.1:8996/", route => route.fulfill({ contentType: "text/html", body:
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hosted revisions</title><style>' + style + '</style><script>' + script + '</script></head><body class="cx-page"><div id="host" class="cx-host" style="height:500px"></div></body></html>' }));
  await page.goto("http://127.0.0.1:8996/");
  await page.evaluate(async () => {
    window.revision = "r1"; window.rows = Array.from({ length: 1000 }, (_, i) => ({ id: "r" + String(i).padStart(4, "0"), cells: { value: i, site: "A" } }));
    window.events = []; window.facetCalls = 0;
    window.api = CanopyX.createDataGrid(document.getElementById("host"), { view: { protocol: "canopyx/2", type: "grid", id: "revisions", label: "Servers",
      rowHeight: 34, pageSize: 50, selection: "none", search: false, source: { kind: "host" }, live: true,
      columns: [{ id: "value", title: "Value", kind: "number", sortable: true }, { id: "site", title: "Site", kind: "text" }],
      reporting: { facetColumns: ["site"] }, facets: { columns: ["site"] } }, onRowsChanged: event => window.events.push(event), source: {
      query(query) {
        const sorted = query.sort.length ? [...window.rows].sort((a, b) => (a.cells.value - b.cells.value) * (query.sort[0].direction === "desc" ? -1 : 1)) : window.rows;
        return { protocol: "canopyx/2", type: "gridPage", view: "revisions", revision: window.revision, offset: query.offset,
          total: sorted.length, matched: sorted.length, items: sorted.slice(query.offset, query.offset + query.limit) };
      },
      facet(request) {
        window.facetCalls++;
        if (request.query.revision !== window.revision) throw new Error("Snapshot expired");
        const buckets = new Map(); for (const row of window.rows) buckets.set(row.cells.site, (buckets.get(row.cells.site) || 0) + 1);
        const items = [...buckets].map(([value, count]) => ({ value, count })).sort((a, b) => a.value < b.value ? -1 : 1);
        return { protocol: "canopyx/2", type: "gridFacetPage", view: "revisions", revision: window.revision, column: request.column, search: request.search,
          includeCurrentFilter: request.includeCurrentFilter, matched: window.rows.length, totalValues: items.length, truncated: false, items };
      }
    } });
    await window.api.ready;
  });
  await expect(page.locator(".cx-facet-val")).toHaveCount(1);
  await expect(page.locator(".cx-facet-n")).toHaveText("1,000");
}

for (const change of ["add outside", "remove outside", "update outside", "add held", "metadata"]) test(`an accepted hosted revision refreshes consumers after ${change}`, async ({ page }) => {
  await open(page);
  try {
    const result = await page.evaluate(async change => {
      window.revision = "r2";
      if (change === "add outside") window.rows.push({ id: "new", cells: { value: 1000, site: "B" } });
      else if (change === "remove outside") window.rows.pop();
      else if (change === "update outside") window.rows[999] = { ...window.rows[999], cells: { ...window.rows[999].cells, site: "B" } };
      else if (change === "add held") window.rows.unshift({ id: "new", cells: { value: -1, site: "A" } });
      else window.rows[0] = { ...window.rows[0], tone: "quiet" };
      const outcome = await window.api.refreshRows();
      return { outcome, events: window.events, paging: window.api.getPaging() };
    }, change);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual(result.outcome);
    expect(result.outcome).toMatchObject({ added: [], updated: [], removed: [], missing: [], revision: "r2", source: "refresh" });
    const counts = change === "add outside" ? ["1,000", "1"] : change === "update outside" ? ["999", "1"] : change === "remove outside" ? ["999"] : change === "add held" ? ["1,001"] : ["1,000"];
    await expect(page.locator(".cx-facet-n")).toHaveText(counts);
    await expect.poll(() => page.evaluate(() => window.facetCalls)).toBe(2);
    await page.evaluate(() => window.api.refreshRows());
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => ({ events: window.events.length, facets: window.facetCalls }))).toEqual({ events: 1, facets: 2 });
  } finally { await page.evaluate(() => window.api.destroy()); }
});

test("accepting a pending hosted order refreshes facets at the accepted revision", async ({ page }) => {
  await open(page);
  try {
    await page.evaluate(() => window.api.setQuery({ ...window.api.getQuery(), sort: [{ column: "value", direction: "desc" }] }));
    await page.evaluate(async () => {
      window.rows[990] = { ...window.rows[990], cells: { value: 5000, site: "B" } }; window.revision = "r2";
      await window.api.refreshRows();
    });
    await expect.poll(() => page.evaluate(() => window.api.getLiveState().orderChanged)).toBe(true);
    await expect(page.locator(".cx-facet-error")).toBeVisible();
    await page.evaluate(() => window.api.resort());
    expect(await page.evaluate(() => window.api.getQuery().revision)).toBe("r2");
    await expect(page.locator(".cx-facet-n")).toHaveText(["999", "1"]);
    await expect(page.locator(".cx-facet-error")).toBeHidden();
  } finally { await page.evaluate(() => window.api.destroy()); }
});

test("accepting a pending hosted order retains pushed values in the grid and open record", async ({ page }) => {
  await open(page);
  try {
    await page.evaluate(async () => {
      await window.api.setQuery({ ...window.api.getQuery(), sort: [{ column: "value", direction: "desc" }] });
      window.rows[990] = { ...window.rows[990], cells: { value: 5000, site: "B" } }; window.revision = "r2";
      await window.api.refreshRows();
      await window.api.openDetails("r0999");
      await window.api.applyTransaction({ update: [{ id: "r0999", cells: { site: "Pushed" } }] });
    });
    const record = page.locator(".cx-drawer"), row = page.locator('.cx-row[data-cx-id="r0999"]');
    await expect(record).toContainText("Pushed");
    await expect(row).toContainText("Pushed");
    expect(await page.evaluate(() => window.api.getLiveState().orderChanged)).toBe(true);
    // An unchanged poll must leave both the held order and the push alone.
    await page.evaluate(() => window.api.refreshRows());
    await page.evaluate(() => window.api.resort());
    expect(await page.evaluate(() => window.api.getQuery().revision)).toBe("r2");
    await expect(row).toContainText("Pushed");
    await expect(record).toContainText("Pushed");
    expect(await page.evaluate(() => window.api.getLiveState().orderChanged)).toBe(false);
  } finally { await page.evaluate(() => window.api.destroy()); }
});

test("a query-affecting push retires a pending hosted order before re-sort", async ({ page }) => {
  await open(page);
  try {
    await page.evaluate(async () => {
      await window.api.setQuery({ ...window.api.getQuery(), sort: [{ column: "value", direction: "desc" }] });
      window.rows[990] = { ...window.rows[990], cells: { value: 5000, site: "B" } }; window.revision = "r2";
      await window.api.refreshRows();
      window.rows[999] = { ...window.rows[999], cells: { value: 6000, site: "Pushed" } }; window.revision = "r3";
      await window.api.updateRows([{ id: "r0999", cells: { value: 6000, site: "Pushed" } }]);
      await window.api.resort();
    });
    expect(await page.evaluate(() => window.api.getQuery().revision)).toBe("r3");
    const rows = page.locator(".cx-row[data-cx-id]");
    await expect(rows.first()).toHaveAttribute("data-cx-id", "r0999");
    await expect(rows.first()).toContainText("6,000Pushed");
    expect(await page.evaluate(() => window.api.getLiveState().orderChanged)).toBe(false);
  } finally { await page.evaluate(() => window.api.destroy()); }
});

test("pending hosted pages keep source membership and are replaced by a newer revision", async ({ page }) => {
  await open(page);
  try {
    const result = await page.evaluate(async () => {
      await window.api.setQuery({ ...window.api.getQuery(), sort: [{ column: "value", direction: "desc" }] });
      // The new row is only in the held snapshot; the removed row is still in the reader's old order.
      window.rows = window.rows.filter(row => row.id !== "r0998");
      window.rows.push({ id: "new", cells: { value: 6000, site: "Added" } });
      window.rows.find(row => row.id === "r0990").cells.value = 5000; window.revision = "r2";
      await window.api.refreshRows();
      const pushed = await window.api.updateRows([{ id: "r0998", cells: { site: "Removed" } }, { id: "new", cells: { site: "Missing" } }]);
      const errors = [];
      for (const change of [{ add: [{ id: "illegal", cells: { value: 1 } }] }, { remove: ["r0999"] }])
        try { await window.api.applyTransaction(change); } catch (error) { errors.push(error.message); }
      await window.api.resort();
      return { pushed, errors };
    });
    expect(result.pushed).toMatchObject({ updated: ["r0998"], missing: ["new"] });
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every(message => message.includes("at its source"))).toBe(true);
    await expect(page.locator('.cx-row[data-cx-id="r0998"]')).toHaveCount(0);
    await expect(page.locator('.cx-row[data-cx-id="new"]')).toContainText("Added");
    await page.evaluate(async () => {
      window.rows.find(row => row.id === "r0999").cells.value = 7000; window.revision = "r3";
      await window.api.refreshRows();
      await window.api.updateRows([{ id: "r0999", cells: { site: "Old push" } }]);
      window.rows.find(row => row.id === "r0990").cells.value = 8000;
      window.rows.find(row => row.id === "r0999").cells.site = "Newest"; window.revision = "r4";
      await window.api.refreshRows();
      await window.api.resort();
    });
    expect(await page.evaluate(() => window.api.getQuery().revision)).toBe("r4");
    await expect(page.locator('.cx-row[data-cx-id="r0999"]')).toContainText("Newest");
  } finally { await page.evaluate(() => window.api.destroy()); }
});
