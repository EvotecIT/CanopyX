// Facet panel (docs/facets.md): value lists with counts and ranges with histograms that filter each other, beside or above the
// grid, collapsible and kept in saved views, a sheet on phones, and remote counts through gridFacetQuery.
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { exampleUrl, nextFrames, viewPage } from "./support.mjs";

const api = (page, call, arg) => page.evaluate(([call, arg]) => {
  const element = document.querySelector("[data-canopyx-host]");
  return new Function("api", "element", "arg", "return (" + call + ")(api, element, arg);")(element.canopyx, element, arg);
}, [call, arg]);
const facet = (page, column) => page.locator('.cx-facet[data-cx-facet="' + column + '"]');
const counts = (page, column) => facet(page, column).locator(".cx-facet-val").evaluateAll(rows => rows.map(row => [row.querySelector(".cx-facet-text").textContent, Number(row.querySelector(".cx-facet-n").textContent.replace(/\D/g, ""))]));

async function open(page, { name = "facets.html", dark = false, width = 1440 } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(exampleUrl(name.replace(".html", dark ? "-dark.html" : ".html")));
  await page.waitForSelector("[data-cx-ready]");
  await api(page, "api => api.ready");
  await page.waitForFunction(() => document.querySelector(".cx-facet .cx-facet-val, .cx-facet-sheet, .cx-facets-open:not([hidden])"));
  await nextFrames(page);
}

test.describe("facet panel", () => {
  test("value lists count the result without their own column and filter each other", async ({ page }) => {
    await open(page);
    const panel = page.getByRole("complementary", { name: "Filter by" });
    await expect(panel).toBeVisible();
    const before = await counts(page, "category");
    expect(before.reduce((sum, [, count]) => sum + count, 0)).toBe(240);
    // Choosing a priority narrows the category counts, and the priority list still shows every priority.
    await facet(page, "priority").getByRole("checkbox", { name: /^Urgent, \d+ rows$/ }).check();
    await expect.poll(() => api(page, "api => api.getQuery().filters")).toEqual([{ column: "priority", operator: "in", values: ["Urgent"] }]);
    const matched = await api(page, "api => api.getPaging().matched");
    await expect.poll(async () => (await counts(page, "category")).reduce((sum, [, count]) => sum + count, 0)).toBe(matched);
    expect((await counts(page, "priority")).length).toBe(4);
    await expect(panel.locator(":scope > p.cx-sr-only")).toHaveText(matched + " matching rows");
    // A second value of the same facet widens; the badge counts the chosen values.
    await facet(page, "priority").getByRole("checkbox", { name: /^High, \d+ rows$/ }).check();
    await expect.poll(() => api(page, "api => api.getQuery().filters[0].values.slice().sort()")).toEqual(["High", "Urgent"]);
    await expect(facet(page, "priority").locator(".cx-facet-badge")).toHaveText("2");
    // The empty value is its own bucket.
    await facet(page, "region").getByRole("checkbox", { name: /^\(Empty\), \d+ rows$/ }).check();
    await expect.poll(() => api(page, "api => api.getQuery().filters.find(filter => filter.column === 'region')")).toEqual({ column: "region", operator: "isNull", values: [] });
    // Clear all removes every facet's conditions and keeps the search.
    await api(page, "api => api.setQuery({ ...api.getQuery(), search: 'sign' })");
    await panel.getByRole("button", { name: "Clear all" }).click();
    await expect.poll(() => api(page, "api => [api.getQuery().filters.length, !!api.getQuery().filterGroup, api.getQuery().search]")).toEqual([0, false, "sign"]);
  });

  test("ranges draw a histogram and filter by From and To or a bar", async ({ page }) => {
    await open(page);
    const age = facet(page, "age");
    await expect(age.locator(".cx-facet-bar")).toHaveCount(16);
    await expect(age.getByRole("img", { name: "Distribution of Age (days)" })).toBeVisible();
    await age.getByLabel("From").fill("30");
    await age.getByLabel("To").fill("60");
    await age.getByLabel("To").press("Enter");
    await expect.poll(() => api(page, "api => api.getQuery().filters")).toEqual([{ column: "age", operator: "ge", values: [30] }, { column: "age", operator: "le", values: [60] }]);
    await expect(age.locator(".cx-facet-bar.cx-facet-in").first()).toBeVisible();
    // A reversed range is refused with a message and changes nothing.
    await age.getByLabel("From").fill("90");
    await age.getByLabel("From").press("Enter");
    await expect(age.locator(".cx-facet-note:not(.cx-facet-custom):not(.cx-facet-error)")).toHaveText("From must not be after To.");
    expect((await api(page, "api => api.getQuery().filters"))[0].values).toEqual([30]);
    // A bar chooses its span, up to the next bar's start; the last bar includes the maximum; dates filter whole days in the grid's time zone.
    await age.locator(".cx-facet-bar").nth(2).click();
    await expect.poll(() => api(page, "api => api.getQuery().filters.map(filter => filter.operator)")).toEqual(["ge", "lt"]);
    await age.locator(".cx-facet-bar").last().click();
    await expect.poll(() => api(page, "api => api.getQuery().filters.map(filter => filter.operator)")).toEqual(["ge", "le"]);
    // A click on the chosen bar clears it.
    await age.locator(".cx-facet-bar").last().click();
    await expect.poll(() => api(page, "api => api.getQuery().filters")).toEqual([]);
    const opened = facet(page, "opened");
    await opened.getByLabel("From").fill("2026-08-01");
    await opened.getByLabel("From").press("Enter");
    await expect.poll(() => api(page, "api => api.getQuery().filters.find(filter => filter.column === 'opened')")).toEqual({ column: "opened", operator: "ge", values: ["2026-08-01T00:00:00.000Z"] });
  });

  test("the panel collapses, keeps its state in saved views, and Clear works per facet", async ({ page }) => {
    await open(page);
    const panel = page.getByRole("complementary", { name: "Filter by" });
    await facet(page, "category").getByRole("checkbox").first().check();
    await expect(facet(page, "category").getByRole("button", { name: "Clear Category" })).toBeVisible();
    await panel.getByRole("button", { name: "Hide the filter panel" }).click();
    await expect(panel).toHaveClass(/cx-facets-closed/);
    expect(await api(page, "api => api.getFacetPanel()")).toMatchObject({ open: false, active: 1 });
    expect(await api(page, "api => api.getState().facets")).toEqual({ open: false });
    await api(page, "api => api.saveView('Collapsed')");
    await panel.getByRole("button", { name: "Show the filter panel" }).click();
    await api(page, "api => api.applySavedView('Collapsed')");
    await expect(panel).toHaveClass(/cx-facets-closed/);
    await api(page, "api => api.setFacetPanelOpen(true)");
    await facet(page, "category").getByRole("button", { name: "Clear Category" }).click();
    await expect.poll(() => api(page, "api => api.getQuery().filters")).toEqual([]);
    // A facet collapses to its heading, which names the column and how many values are chosen.
    const heading = facet(page, "team").getByRole("button", { name: "Team", exact: true });
    await expect(heading).toHaveAttribute("title", "Collapse Team");
    await heading.click();
    await expect(facet(page, "team").locator(".cx-facet-b")).toBeHidden();
    await expect(heading).toHaveAttribute("aria-expanded", "false");
    await facet(page, "priority").getByRole("checkbox").first().check();
    await expect(facet(page, "priority").getByRole("button", { name: /^Priority\s*, 1 selected$/ })).toBeVisible();
  });

  test("keyboard: arrows move inside a list, Space ticks, and a condition the panel cannot show is said", async ({ page }) => {
    await open(page);
    const list = facet(page, "category").locator(".cx-facet-values");
    const first = list.getByRole("checkbox").first();
    await first.focus();
    await page.keyboard.press("ArrowDown");
    await expect(list.getByRole("checkbox").nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(list.getByRole("checkbox").last()).toBeFocused();
    await page.keyboard.press("Space");
    await expect.poll(() => api(page, "api => api.getQuery().filters.length")).toBe(1);
    await expect(list.getByRole("checkbox").last()).toBeFocused();
    // Exactly one checkbox of a list is in the Tab order.
    expect(await list.getByRole("checkbox").evaluateAll(boxes => boxes.filter(box => box.tabIndex === 0).length)).toBe(1);
    await api(page, "api => api.setQuery({ ...api.getQuery(), filters: [{ column: 'team', operator: 'contains', values: ['desk'] }] })");
    await expect(facet(page, "team").locator(".cx-facet-custom")).toHaveText("Another condition filters this column.");
  });

  test("on a phone the panel is a sheet opened from the toolbar", async ({ page }) => {
    await open(page, { width: 390 });
    await expect(page.getByRole("complementary", { name: "Filter by" })).toBeHidden();
    const button = page.locator(".cx-facets-open");
    await expect(button).toBeVisible();
    expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await button.click();
    const sheet = page.getByRole("dialog", { name: "Filter by" });
    await expect(sheet).toBeVisible();
    await sheet.locator('.cx-facet[data-cx-facet="priority"]').getByRole("checkbox").first().check();
    await expect.poll(() => api(page, "api => api.getQuery().filters.length")).toBe(1);
    await expect(button.locator(".badge")).toHaveText("1");
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toBeHidden();
    await expect(button).toBeFocused();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(violation => ["serious", "critical"].includes(violation.impact))).toEqual([]);
  });

  test("a hosted grid counts through gridFacetQuery with includeCurrentFilter off", async ({ page }) => {
    const rows = Array.from({ length: 90 }, (_, i) => ({ id: "h" + i, cells: { name: "Host " + i, site: ["Oslo", "Rome", "Lyon"][i % 3], load: i % 50 } }));
    const view = { protocol: "canopyx/2", type: "grid", id: "hosted", label: "Hosted", rowHeight: 34, pageSize: 100, selection: "none", search: true,
      columns: [{ id: "name", title: "Name", kind: "text", sortable: true }, { id: "site", title: "Site", kind: "text", sortable: true }, { id: "load", title: "Load", kind: "number", sortable: true }],
      source: { kind: "host" }, reporting: { facetColumns: ["site", "load"] }, facets: { columns: ["site", "load"] } };
    await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view).replace("</head>", `<script>
      const rows = ${JSON.stringify(rows)}; window.facetRequests = [];
      const keep = (row, filters) => filters.every(f => f.operator === "in" ? f.values.includes(row.cells[f.column]) : f.operator === "ge" ? row.cells[f.column] >= f.values[0] : f.operator === "le" ? row.cells[f.column] <= f.values[0] : true);
      CanopyX.configure("hosted", { source: {
        query(query) { const matched = rows.filter(row => keep(row, query.filters)); return { protocol: "canopyx/2", type: "gridPage", view: "hosted", revision: "r1", offset: query.offset, total: rows.length, matched: matched.length, items: matched.slice(query.offset, query.offset + query.limit) }; },
        facet(request) { window.facetRequests.push(request);
          const filters = request.includeCurrentFilter ? request.query.filters : request.query.filters.filter(f => f.column !== request.column), matched = rows.filter(row => keep(row, filters)), buckets = new Map();
          for (const row of matched) buckets.set(row.cells[request.column], (buckets.get(row.cells[request.column]) || 0) + 1);
          const items = [...buckets].map(([value, count]) => ({ value, count })).sort((a, b) => a.value < b.value ? -1 : 1);
          return { protocol: "canopyx/2", type: "gridFacetPage", view: "hosted", revision: "r1", column: request.column, search: request.search, includeCurrentFilter: request.includeCurrentFilter, matched: matched.length, totalValues: items.length, truncated: false, items }; } } });
      </script></head>`) }));
    await page.goto("https://canopyx.test/");
    await page.waitForSelector(".cx-facet .cx-facet-val");
    expect(await page.evaluate(() => window.facetRequests.every(request => request.includeCurrentFilter === false && request.limit === 200))).toBe(true);
    await facet(page, "site").getByRole("checkbox", { name: /^Rome/ }).check();
    await expect.poll(() => api(page, "api => api.getPaging().matched")).toBe(30);
    await expect(facet(page, "load").locator(".cx-facet-bar").first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.facetRequests.at(-1).query.filters)).toEqual([{ column: "site", operator: "in", values: ["Rome"] }]);
    // Sorting and paging count the same rows, so they ask for no counts.
    const asked = await page.evaluate(() => window.facetRequests.length);
    await api(page, "api => api.sort([{ column: 'name', direction: 'desc' }])");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.facetRequests.length)).toBe(asked);
  });

  // An inline page with many values, dates and host options.
  const cities = Array.from({ length: 20 }, (_, i) => "City " + String(i + 1).padStart(2, "0"));
  const inlinePage = (facets, options = "{}", seen = i => new Date(Date.UTC(2026, 0, 1 + i)).toISOString()) => viewPage({ protocol: "canopyx/2", type: "grid", id: "places", label: "Places",
    rowHeight: 34, pageSize: 100, selection: "none", search: true, source: { kind: "inline" }, ...(facets ? { facets } : {}),
    columns: [{ id: "name", title: "Name", kind: "text" }, { id: "city", title: "City", kind: "text" }, { id: "team", title: "Team", kind: "text" }, { id: "seen", title: "Seen", kind: "datetime" }],
    rows: Array.from({ length: 40 }, (_, i) => ({ id: "p" + i, cells: { name: "Place " + i, city: cities[i % 20], team: ["Red", "Blue"][i % 2], seen: seen(i) } })) })
    .replace("</head>", "<script>CanopyX.configure(\"places\", " + options + ");</script></head>");
  const openInline = async (page, ...args) => {
    await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: inlinePage(...args) }));
    await page.goto("https://canopyx.test/");
    await page.waitForSelector(".cx-facet .cx-facet-val, .cx-facet .cx-facet-bar");
  };

  test("an inline list's search filters as it draws, and clearing it brings every value back", async ({ page }) => {
    await openInline(page, { columns: ["city", "team"] });
    const city = facet(page, "city"), search = city.getByRole("searchbox");
    await search.fill("City 1");
    await expect(city.getByRole("checkbox")).toHaveCount(8);
    await city.getByRole("checkbox", { name: /^City 12,/ }).check();
    await expect.poll(() => api(page, "api => api.getQuery().filters")).toEqual([{ column: "city", operator: "in", values: ["City 12"] }]);
    await search.fill("");
    await expect(search).toBeVisible();
    await city.getByRole("button", { name: /^Show \d+ more$/ }).click();
    await expect(city.getByRole("checkbox")).toHaveCount(20);
  });

  test("a single date and the last date bar keep their rows", async ({ page }) => {
    await openInline(page, { columns: [{ column: "seen", kind: "range" }] }, "{}", () => "2026-03-04T05:06:07.000Z");
    await facet(page, "seen").locator(".cx-facet-bar").first().click();
    await expect.poll(() => api(page, "api => api.getQuery().filters.map(filter => filter.operator)")).toEqual(["ge", "le"]);
    expect(await api(page, "api => api.getPaging().matched")).toBe(40);
    await page.unrouteAll();
    await openInline(page, { columns: [{ column: "seen", kind: "range", bins: 4 }] });
    await facet(page, "seen").locator(".cx-facet-bar").last().click();
    await expect.poll(() => api(page, "api => api.getQuery().filters.find(filter => filter.operator === 'le')?.values[0]")).toBe("2026-02-09T00:00:00.000Z");
    expect(await api(page, "api => api.getPaging().matched")).toBe(10);
  });

  test("a condition group across columns locks its facets, and Clear all still clears the others", async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await openInline(page, { columns: ["city", "team"] });
    await api(page, "api => api.setQuery({ ...api.getQuery(), filters: [{ column: 'team', operator: 'in', values: ['Red'] }], filterGroup: { operator: 'or', filters: [{ column: 'city', operator: 'eq', values: ['City 01'] }, { column: 'name', operator: 'contains', values: ['1'] }], groups: [] } })");
    const city = facet(page, "city");
    await expect(city.locator(".cx-facet-custom")).toBeVisible();
    await expect(city.getByRole("checkbox").first()).toBeDisabled();
    await expect(city.locator(".cx-facet-clear")).toBeHidden();
    await page.getByRole("complementary", { name: "Filter by" }).locator(".cx-facets-clear").click();
    await expect.poll(() => api(page, "api => [api.getQuery().filters.length, api.getQuery().filterGroup?.operator]")).toEqual([0, "or"]);
    expect(errors).toEqual([]);
  });

  test("facets from host options keep the open state in the grid state", async ({ page }) => {
    await openInline(page, null, "{ facets: { columns: [\"city\"], position: \"top\" } }");
    await page.getByRole("button", { name: "Hide the filter panel" }).click();
    expect(await api(page, "api => api.getState().facets")).toEqual({ open: false });
    await api(page, "api => api.resetView()");
    await expect.poll(() => api(page, "api => api.getFacetPanel().open")).toBe(true);
  });
});

test.describe("facet panel appearance and accessibility", () => {
  for (const name of ["facets.html", "facets-top.html"]) for (const dark of [false, true]) for (const width of [1440, 390]) {
    test(`${name} reads well and passes axe (${dark ? "dark" : "light"}, ${width})`, async ({ page }) => {
      await open(page, { name, dark, width });
      if (width > 640) {
        await facet(page, "priority").getByRole("checkbox").first().check();
        await facet(page, "age").getByLabel("From").fill("20");
        await facet(page, "age").getByLabel("From").press("Enter");
        await expect.poll(() => api(page, "api => api.getQuery().filters.length")).toBe(2);
      } else {
        await page.locator(".cx-facets-open").click();
        await expect(page.getByRole("dialog", { name: "Filter by" })).toBeVisible();
      }
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter(violation => ["serious", "critical"].includes(violation.impact))).toEqual([]);
      if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: process.env.CANOPYX_EVIDENCE + "/" + name.replace(".html", "") + `-${dark ? "dark" : "light"}-${width}.png`, fullPage: true });
    });
  }
});
