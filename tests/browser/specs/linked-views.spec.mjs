// Linked views (docs/linked-views.md): external filters with removable chips, highlights, the neutral canopyx:linkchange
// payloads, host-sourced grids and trees, on desktop and phone widths, in both palettes.
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { exampleUrl, nextFrames, repo } from "./support.mjs";

const assets = path.join(repo, "CanopyX.Html/Assets");
const read = name => fs.readFileSync(path.join(assets, name), "utf8");
const linkPart = JSON.parse(read("canopyx-parts.json")).parts.find(part => part.name === "link");

const api = (page, id, call) => page.evaluate(([id, call]) => {
  const element = [...document.querySelectorAll("[data-canopyx-host]")].find(item => item.canopyx && item.canopyx.view.id === id);
  return new Function("api", "element", "return (" + call + ")(api, element);")(element.canopyx, element);
}, [id, call]);
// The example page holds the services grid, the sites tree and the incidents grid, in that order.
const view = (page, id) => page.locator("[data-canopyx-host]").nth(["linked-services", "linked-sites", "linked-incidents"].indexOf(id));
/** Rendered rows against the highlight: rows marked without being highlighted, highlighted rows left unmarked, and whether one shows. */
const marks = (page, id) => api(page, id, `(api, element) => {
  const keys = new Set(api.getHighlight()), rows = [...element.querySelectorAll(".cx-row[data-cx-id]")];
  const marked = row => row.getAttribute("data-cx-linked") === "true";
  return { wrong: rows.filter(row => marked(row) && !keys.has(row.getAttribute("data-cx-id"))).length,
    missing: rows.filter(row => !marked(row) && keys.has(row.getAttribute("data-cx-id"))).length, marked: rows.some(marked) };
}`);
const ids = (page, id) => api(page, id, "async (api, element) => { await api.ready; return [...element.querySelectorAll('.cx-row[data-cx-id]:not([data-cx-status])')].map(row => row.getAttribute('data-cx-id')); }");

async function open(page, dark = false, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(exampleUrl(dark ? "linked-views-dark.html" : "linked-views.html"));
  await page.waitForFunction(() => [...document.querySelectorAll("[data-canopyx-host]")].every(item => item.getAttribute("data-cx-ready") === "true"));
}

test.describe("linked views", () => {
  test("a pick filters a grid and a host source with a chip, and highlights a tree", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /^Berlin:/ }).click();
    const services = view(page, "linked-services");
    const chip = services.locator(".cx-link-chip");
    await expect(chip).toHaveText("Filtered by Site picker: Berlin ×");
    await expect(chip).toHaveAccessibleName("Remove the filter from Site picker: Berlin");
    await expect(services.locator(".cx-grid-result-count")).toContainText("12 of 40");
    const sites = await api(page, "linked-services", "(api, element) => [...element.querySelectorAll('.cx-row[data-cx-id]')].map(row => row.children[1].textContent)");
    expect(new Set(sites)).toEqual(new Set(["Berlin"]));
    // The reader's own Filters button counts only the reader's conditions.
    await expect(services.locator(".cx-grid-filters > summary .badge")).toHaveCount(0);
    // A host source receives the external filter as an ordinary condition of its query.
    const last = await page.evaluate(() => window.linkedQueries.at(-1));
    expect(last.filters).toEqual([{ column: "site", operator: "eq", values: ["Berlin"] }]);
    await expect(view(page, "linked-incidents").locator(".cx-link-chip")).toHaveText("Filtered by Site picker: Berlin ×");
    // The tree marks the picked site's services and opens the branch of the first one.
    expect(await api(page, "linked-sites", "api => api.getHighlight().length")).toBe(12);
    await expect.poll(() => marks(page, "linked-sites")).toEqual({ wrong: 0, missing: 0, marked: true });
    await expect(view(page, "linked-sites").locator(".cx-live")).toHaveText("12 rows highlighted from Site picker");
    await expect(services.locator(".cx-live")).toHaveText("Filtered by Site picker: 12 rows");
  });

  test("the chip, the API and Clear all remove an external filter, and saved state leaves it out", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: /^Madrid:/ }).click();
    const services = view(page, "linked-services");
    await expect(services.locator(".cx-link-chip")).toBeVisible();
    // Combined with the reader's own search; the state for saved views carries only the reader's conditions.
    await services.getByRole("searchbox").fill("auth");
    await expect.poll(() => api(page, "linked-services", "api => api.getQuery().search")).toBe("auth");
    expect(await api(page, "linked-services", "api => api.getQuery().filters")).toEqual([{ column: "site", operator: "eq", values: ["Madrid"] }]);
    expect(await api(page, "linked-services", "api => api.getState().query.filters")).toEqual([]);
    await expect(services.locator(".cx-link-chip")).toBeVisible();
    // Keyboard: Enter on the chip removes it, the picker hears canopyx:externalfilter and clears its pick.
    await services.locator(".cx-link-chip").focus();
    await page.keyboard.press("Enter");
    await expect(services.locator(".cx-link-chip")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Madrid:/ })).toHaveAttribute("aria-pressed", "false");
    await expect(services.locator(".cx-live")).toHaveText("Linked filters removed");
    expect(await api(page, "linked-services", "api => api.getQuery().filters")).toEqual([]);
    expect(await api(page, "linked-services", "api => api.getQuery().search")).toBe("auth");
    // The API sets and clears one source; persist keeps a filter in saved state.
    await api(page, "linked-services", "api => api.setExternalFilter('limits', { field: 'latency', range: [50, 120], sourceLabel: 'Latency band', persist: true })");
    await expect(services.locator(".cx-link-chip")).toHaveText("Filtered by Latency band: 50 – 120 ×");
    expect(await api(page, "linked-services", "api => api.getState().query.filters")).toEqual([
      { column: "latency", operator: "ge", values: [50] }, { column: "latency", operator: "le", values: [120] }]);
    // Clear all removes the reader's search and every external filter.
    await services.locator('[data-cx-condition="clear"]').click();
    await expect(services.locator(".cx-link-chip")).toHaveCount(0);
    expect(await api(page, "linked-services", "api => [api.getQuery().filters, api.getQuery().search, api.getExternalFilters()]")).toEqual([[], "", []]);
  });

  test("invalid external filters are refused without changing the view", async ({ page }) => {
    await open(page);
    const errors = await api(page, "linked-services", `async api => {
      const out = [];
      for (const filter of [{ field: "missing", values: ["x"] }, { field: "site", values: [] }, { field: "latency", values: ["fast"] }, { field: "site", range: [1, 2] }, { field: "site" }])
        try { await api.setExternalFilter("bad", filter); out.push("accepted"); } catch (error) { out.push(error.message); }
      try { await api.setExternalFilter("no spaces allowed", null); } catch (error) { out.push(error.message); }
      return out;
    }`);
    expect(errors.every(message => message.startsWith("CanopyX:"))).toBe(true);
    expect(await api(page, "linked-services", "api => api.getExternalFilters()")).toEqual([]);
  });

  test("highlight marks rows without filtering and scrolls to the first", async ({ page }) => {
    await open(page);
    await page.getByRole("radio", { name: "Highlight" }).check();
    await page.getByRole("button", { name: /^Lisbon:/ }).click();
    const services = view(page, "linked-services");
    await expect(services.locator(".cx-link-chip")).toHaveCount(0);
    await expect(services.locator(".cx-grid-query-summary")).toBeHidden();
    expect(await api(page, "linked-services", "api => api.getHighlight().length")).toBe(4);
    await expect.poll(() => marks(page, "linked-services")).toEqual({ wrong: 0, missing: 0, marked: true });
    const tone = await api(page, "linked-services", "(api, element) => getComputedStyle(element.querySelector('.cx-row[data-cx-linked=\"true\"]')).backgroundColor");
    expect(tone).not.toBe("rgba(0, 0, 0, 0)");
    await api(page, "linked-services", "api => api.clearHighlight()");
    await expect(services.locator('.cx-row[data-cx-linked="true"]')).toHaveCount(0);
    // A key the grid has not loaded is kept, and a later paint marks it.
    await api(page, "linked-services", "api => api.setHighlight(['svc-39'], { source: 'Test' })");
    await expect(services.locator('.cx-row[data-cx-id="svc-39"]')).toHaveAttribute("data-cx-linked", "true");
  });

  test("selection reports neutral payloads that another view follows", async ({ page }) => {
    await open(page);
    const events = [];
    await page.exposeFunction("recordLink", detail => events.push(detail));
    await api(page, "linked-services", "(api, element) => element.addEventListener('canopyx:linkchange', event => window.recordLink(event.detail))");
    await api(page, "linked-services", "api => api.setSelection(['svc-00', 'svc-01'])");
    await expect.poll(() => events.length).toBe(1);
    expect(events[0]).toMatchObject({ view: "linked-services", action: "select", scope: "select", keys: ["svc-00", "svc-01"] });
    expect(events[0].values.site.sort()).toEqual(["Berlin", "Warsaw"]);
    expect(events[0].label).toContain("api-gateway-1");
    await expect(page.locator('.site-bar.is-linked')).toHaveCount(2);
    // External filters and highlights never report, so views that follow each other do not echo.
    await api(page, "linked-services", "api => api.setExternalFilter('picker', { field: 'site', values: ['Warsaw'] })");
    await api(page, "linked-services", "api => api.setHighlight(['svc-02'])");
    await nextFrames(page);
    expect(events.length).toBe(1);
    // The reader's own conditions report as a filter; clearing the selection reports clear.
    await api(page, "linked-services", "api => api.setQuery({ ...api.getQuery(), filters: [{ column: 'status', operator: 'in', values: ['Down', 'Degraded'] }] })");
    await expect.poll(() => events.at(-1).scope).toBe("filter");
    expect(events.at(-1)).toMatchObject({ action: "filter", values: { status: ["Down", "Degraded"] } });
    expect(await api(page, "linked-services", "api => api.getQuery().filters.length")).toBe(2);
    await api(page, "linked-services", "api => api.clearSelection()");
    await expect.poll(() => events.at(-1)).toMatchObject({ action: "clear", scope: "select", keys: [] });
  });

  test("a tree matches external filters against its nodes and shows its chips on their own line", async ({ page }) => {
    await open(page);
    const tree = view(page, "linked-sites");
    await api(page, "linked-sites", "api => api.setExternalFilter('status-chart', { field: 'status', values: ['Down'], sourceLabel: 'Status chart' })");
    await expect(tree.locator(".cx-link-bar .cx-link-chip")).toHaveText("Filtered by Status chart: Down ×");
    const rows = await ids(page, "linked-sites");
    const statuses = await api(page, "linked-sites", "(api, element) => [...element.querySelectorAll('.cx-row[data-cx-id^=\"svc\"]')].map(row => row.children[2].textContent)");
    expect(statuses.length).toBeGreaterThan(0);
    expect(new Set(statuses)).toEqual(new Set(["Down"]));
    expect(rows.some(id => id.startsWith("site-"))).toBe(true);
    // The tree column links by its label.
    await api(page, "linked-sites", "api => api.setExternalFilter('status-chart', { field: 'name', values: ['auth-1'] })");
    await expect.poll(() => ids(page, "linked-sites")).toEqual(["site-berlin", "svc-01"]);
    await tree.locator(".cx-link-chip").click();
    await expect(tree.locator(".cx-link-bar")).toHaveCount(0);
    await expect.poll(() => ids(page, "linked-sites").then(list => list.length)).toBeGreaterThan(4);
  });

  test("phones keep the chips readable and the page without sideways scroll", async ({ page }) => {
    await open(page, false, 390);
    await page.getByRole("button", { name: /^Warsaw:/ }).click();
    const services = view(page, "linked-services");
    await expect(services.locator(".cx-link-chip")).toBeVisible();
    const box = await services.locator(".cx-link-chip").boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("the dark palette tones chips and highlighted rows", async ({ page }) => {
    await open(page, true);
    await page.getByRole("radio", { name: "Highlight" }).check();
    await page.getByRole("button", { name: /^Berlin:/ }).click();
    const background = await api(page, "linked-services", "(api, element) => { const row = element.querySelector('.cx-row[data-cx-linked=\"true\"]'); return [getComputedStyle(row).backgroundColor, getComputedStyle(element).backgroundColor]; }");
    expect(background[0]).not.toBe(background[1]);
    await page.getByRole("radio", { name: "Filter" }).check();
    await expect(view(page, "linked-services").locator(".cx-link-chip")).toBeVisible();
  });

  test("the link part loads from files beside a plain or content-hashed runtime only when a view needs it", async ({ page }) => {
    const grid = { protocol: "canopyx/2", type: "grid", id: "parts", label: "Parts", pageSize: 100, selection: "multiple", search: false, source: { kind: "inline" },
      columns: [{ id: "name", title: "Name", kind: "text" }, { id: "site", title: "Site", kind: "text" }],
      rows: [{ id: "a", cells: { name: "A", site: "Berlin" } }, { id: "b", cells: { name: "B", site: "Madrid" } }] };
    for (const [runtime, served, missing] of [["canopyx-grid", "canopyx-grid.js", false], ["canopyx-grid", "canopyx-grid.0123456789abcdef.js", false], ["canopyx-grid", "canopyx-grid.js", true]]) {
      const requested = [];
      await page.unrouteAll();
      await page.route("https://link.test/**", route => {
        const file = new URL(route.request().url()).pathname.slice(1);
        if (!file) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Parts</title><style>' + read(runtime + ".css") +
          '</style><script src="/' + served + '"></script></head><body><div class="cx-host" data-canopyx-host style="height:300px"><script type="application/json" class="cx-config">' + JSON.stringify(grid) + "</script></div></body></html>" });
        if (file === served) return route.fulfill({ contentType: "text/javascript", body: read(runtime + ".js") });
        requested.push(file);
        const local = file.startsWith("canopyx-link.") ? (file.endsWith(".css") ? "canopyx-link.css" : "canopyx-link.js") : file;
        if (missing && file === "canopyx-link.js" || !fs.existsSync(path.join(assets, local))) return route.fulfill({ status: 404, body: "" });
        return route.fulfill({ contentType: file.endsWith(".css") ? "text/css" : "text/javascript", body: read(local) });
      });
      await page.goto("https://link.test/");
      await page.waitForSelector("[data-cx-ready]");
      expect(requested.filter(file => file.startsWith("canopyx-link"))).toEqual([]);
      const result = await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setExternalFilter("s", { field: "site", values: ["Berlin"] }).then(() => "ok", error => error.message));
      const hashed = served.includes(".0123456789abcdef.");
      const linkFiles = requested.filter(file => file.startsWith("canopyx-link")).sort();
      if (hashed) expect(linkFiles.map(file => file.replace(/\.[a-f0-9]{16}\./, ".")).sort()).toEqual([linkPart.style, linkPart.script].sort());
      else expect(linkFiles).toEqual(["canopyx-link.css", "canopyx-link.js"]);
      if (missing) {
        expect(result).toBe("CanopyX: linked views script unavailable.");
        await expect(page.locator('.cx-row[data-cx-id="b"]')).toBeVisible();
      } else {
        expect(result).toBe("ok");
        await expect(page.locator('.cx-row[data-cx-id="b"]')).toHaveCount(0);
      }
    }
  });

  test("a tree-only runtime loads the part for linkEvents and reports a selection", async ({ page }) => {
    const tree = { protocol: "canopyx/2", type: "view", id: "tree-events", label: "Sites", rowHeight: 28, pageSize: 100, selection: "multiple", source: { kind: "inline" },
      columns: [{ id: "name", title: "Name", width: 200, kind: "text" }, { id: "site", title: "Site", width: 120, kind: "text" }],
      roots: [{ id: "s1", label: "Server 1", cells: { site: "Berlin" } }, { id: "s2", label: "Server 2", cells: { site: "Madrid" } }] };
    const requested = [];
    await page.route("https://tree.test/**", route => {
      const file = new URL(route.request().url()).pathname.slice(1);
      if (!file) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tree</title><style>' + read("canopyx.css") +
        '</style><script src="/canopyx.js"></script></head><body><script>window.links=[];CanopyX.configure("tree-events",{linkEvents:true});</script><div class="cx-host" data-canopyx-host style="height:300px"><script type="application/json" class="cx-config">' +
        JSON.stringify(tree) + '</script></div><script>document.querySelector("[data-canopyx-host]").addEventListener("canopyx:linkchange",e=>links.push(e.detail));</script></body></html>' });
      requested.push(file);
      return fs.existsSync(path.join(assets, file)) ? route.fulfill({ contentType: file.endsWith(".css") ? "text/css" : "text/javascript", body: read(file) }) : route.fulfill({ status: 404, body: "" });
    });
    await page.goto("https://tree.test/");
    await page.waitForSelector("[data-cx-ready]");
    await expect.poll(() => requested.includes("canopyx-link.js")).toBe(true);
    await page.locator('.cx-row[data-cx-id="s2"]').click();
    await expect.poll(() => page.evaluate(() => window.links.length)).toBe(1);
    expect(await page.evaluate(() => window.links[0])).toEqual({ view: "tree-events", action: "select", scope: "select", keys: ["s2"], values: { name: ["Server 2"], site: ["Madrid"] }, label: "Server 2" });
  });

  for (const dark of [false, true]) test("axe finds no violations with chips and highlighted rows (" + (dark ? "dark" : "light") + ")", async ({ page }) => {
    await open(page, dark);
    await page.getByRole("button", { name: /^Berlin:/ }).click();
    await expect(view(page, "linked-services").locator(".cx-link-chip")).toBeVisible();
    await api(page, "linked-services", "api => api.setHighlight(['svc-01', 'svc-05'], { scroll: false })");
    await nextFrames(page);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).include("[data-canopyx-host]").analyze();
    expect(result.violations.map(item => item.id + ": " + item.nodes.slice(0, 3).map(node => node.target.join(" ")).join(", "))).toEqual([]);
  });

  test("a reader condition equal to an external one stays the reader's, and views, resets and the empty state keep or clear them as documented", async ({ page }) => {
    await open(page);
    const services = view(page, "linked-services");
    await api(page, "linked-services", "api => api.setQuery({ filters: [{ column: 'site', operator: 'eq', values: ['Berlin'] }] })");
    await api(page, "linked-services", "api => api.setExternalFilter('picker', { field: 'site', values: ['Berlin'], sourceLabel: 'Picker' })");
    await api(page, "linked-services", "api => api.sort([{ column: 'latency', direction: 'desc' }])");
    expect(await api(page, "linked-services", "api => api.getState().query.filters")).toEqual([{ column: "site", operator: "eq", values: ["Berlin"] }]);
    await api(page, "linked-services", "api => api.clearExternalFilters()");
    expect(await api(page, "linked-services", "api => api.getQuery().filters")).toEqual([{ column: "site", operator: "eq", values: ["Berlin"] }]);
    await expect(services.locator(".cx-grid-filters > summary .badge")).toHaveText("1");
    // Saved views and Reset view leave the external filters applied.
    await api(page, "linked-services", "async api => { await api.setQuery({ filters: [] }); await api.setExternalFilter('picker', { field: 'site', values: ['Madrid'] }); api.saveView('mine'); await api.applySavedView('mine'); }");
    expect(await api(page, "linked-services", "api => api.getQuery().filters")).toEqual([{ column: "site", operator: "eq", values: ["Madrid"] }]);
    await api(page, "linked-services", "api => api.resetView()");
    expect(await api(page, "linked-services", "api => api.getExternalFilters().map(filter => filter.values)")).toEqual([["Madrid"]]);
    // The empty state's Clear all removes the external filter that left no rows.
    await api(page, "linked-services", "api => api.setExternalFilter('picker', { field: 'site', values: ['Nowhere'], sourceLabel: 'Picker' })");
    const reasons = [];
    await page.exposeFunction("recordReason", reason => reasons.push(reason));
    await api(page, "linked-services", "(api, element) => element.addEventListener('canopyx:externalfilter', event => window.recordReason(event.detail.reason))");
    await services.locator(".cx-grid-notice .acts button").click();
    await expect(services.locator(".cx-link-chip")).toHaveCount(0);
    await expect.poll(() => reasons).toEqual(["user"]);
    expect(await api(page, "linked-services", "api => api.getQuery().filters")).toEqual([]);
  });

  test("removing a chip moves focus to the next chip, and a tree highlight keeps the reader's tree filter", async ({ page }) => {
    await open(page);
    const services = view(page, "linked-services");
    await api(page, "linked-services", "async api => { await api.setExternalFilter('a', { field: 'site', values: ['Berlin', 'Warsaw'], sourceLabel: 'First' }); await api.setExternalFilter('b', { field: 'status', values: ['Healthy'], sourceLabel: 'Second' }); }");
    await services.locator('[data-cx-link-source="a"]').focus();
    await page.keyboard.press("Enter");
    await expect(services.locator(".cx-link-chip")).toHaveCount(1);
    await expect(services.locator('[data-cx-link-source="b"]')).toBeFocused();
    // A host predicate hides most services; highlighting a hidden one leaves the predicate in place.
    await api(page, "linked-sites", "api => api.setFilter(node => !node.id.startsWith('svc') || node.label.startsWith('auth'))");
    const before = await ids(page, "linked-sites");
    await api(page, "linked-sites", "api => api.setHighlight(['svc-02'], { source: 'Test' })");
    await nextFrames(page);
    expect(await ids(page, "linked-sites")).toEqual(before);
  });

  test("a host query that fails puts back the filters the grid showed", async ({ page }) => {
    const grid = { protocol: "canopyx/2", type: "grid", id: "failing", label: "Failing", pageSize: 50, selection: "none", search: true, source: { kind: "host" },
      columns: [{ id: "name", title: "Name", kind: "text" }, { id: "site", title: "Site", kind: "text" }] };
    await page.route("https://fail.test/**", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fail</title><style>' +
      read("canopyx-grid.css") + "</style><script>" + read("canopyx-grid.js") + "</script></head><body><script>" + read("canopyx-link.js") + "</script><style>" + read("canopyx-link.css") +
      "</style><script>window.failNext=false;const rows=[{id:'a',cells:{name:'A',site:'Berlin'}},{id:'b',cells:{name:'B',site:'Madrid'}}];" +
      "CanopyX.configure('failing',{source:{query(q){if(window.failNext){window.failNext=false;throw new Error('host down');}const items=rows.filter(r=>q.filters.every(f=>f.values.includes(r.cells[f.column]))).filter(r=>!q.search||r.cells.name.includes(q.search));" +
      "return {protocol:'canopyx/2',type:'gridPage',view:'failing',revision:'r1',offset:q.offset,total:rows.length,matched:items.length,items:items.slice(q.offset,q.offset+q.limit)};}}});</script>" +
      '<div class="cx-host" data-canopyx-host style="height:300px"><script type="application/json" class="cx-config">' + JSON.stringify(grid) + "</script></div></body></html>" }));
    await page.goto("https://fail.test/");
    await page.waitForSelector("[data-cx-ready]");
    const call = script => page.evaluate(script);
    await call("document.querySelector('[data-canopyx-host]').canopyx.setExternalFilter('s', { field: 'site', values: ['Berlin'], sourceLabel: 'Sites' })");
    await expect(page.locator(".cx-link-chip")).toHaveText("Filtered by Sites: Berlin ×");
    const failed = await call("(window.failNext = true, document.querySelector('[data-canopyx-host]').canopyx.setExternalFilter('s', { field: 'site', values: ['Madrid'], sourceLabel: 'Sites' }).then(() => 'ok', error => error.message))");
    expect(failed).toBe("host down");
    await expect(page.locator(".cx-link-chip")).toHaveText("Filtered by Sites: Berlin ×");
    expect(await call("document.querySelector('[data-canopyx-host]').canopyx.getExternalFilters().map(filter => filter.values)")).toEqual([["Berlin"]]);
    // The next query of the reader carries the filter the grid showed, not the one that failed.
    await page.locator(".cx-search-input").fill("A");
    await expect(page.locator('.cx-row[data-cx-id="a"]')).toBeVisible();
    expect(await call("document.querySelector('[data-canopyx-host]').canopyx.getQuery().filters")).toEqual([{ column: "site", operator: "eq", values: ["Berlin"] }]);
  });
});