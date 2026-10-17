// Read-once URL work follows the grid's real cancellation/deadline; only the accepted source may publish rows.
import { expect, test } from "@playwright/test";
import { ORIGIN, ready, servePage } from "./enhance-support.mjs";

const begin = async (page, options = {}) => {
  await servePage(page, "<div id='people'></div>");
  await page.evaluate(async options => {
    window.errors = []; window.calls = []; window.aborts = []; window.releases = [];
    addEventListener("unhandledrejection", event => errors.push(event.reason?.message || String(event.reason)));
    const rows = [{ id: "a", name: "Ada", score: 2 }, { id: "g", name: "Grace", score: 1 }];
    window.create = (extra = {}) => CanopyX.grid("#people", { label: "People", rowId: "id", pageLength: 5,
      requestTimeoutMs: 100, columns: [{ data: "name", type: "text" }, { data: "score", type: "number" }],
      url: { url: "/people.json", fetch: (_url, init) => {
        const index = calls.length; calls.push({ hasSignal: !!init.signal });
        init.signal?.addEventListener("abort", () => aborts.push(index), { once: true });
        if (index === 0) return new Promise(resolve => releases.push(value => resolve(new Response(JSON.stringify(value)))));
        return Promise.resolve(new Response(JSON.stringify(rows)));
      } }, ...extra });
    window.grid = await create(options); grid.ready.catch(error => { window.initialError = error.message; });
  }, options);
};

test("a timed-out read is aborted and Retry starts a fresh URL read", async ({ page }) => {
  const pageErrors = []; page.on("pageerror", error => pageErrors.push(error.message));
  await servePage(page, "<div id='people'></div>");
  let requests = 0;
  await page.route(ORIGIN + "/people.json", route => {
    if (++requests === 1) return;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: "a", name: "Ada" }, { id: "g", name: "Grace" }]) });
  });
  await page.evaluate(async () => {
    window.errors = []; window.calls = []; window.aborts = []; window.fetchFailures = [];
    addEventListener("unhandledrejection", event => errors.push(event.reason?.message || String(event.reason)));
    window.grid = await CanopyX.grid("#people", { rowId: "id", requestTimeoutMs: 1000, columns: [{ data: "name", type: "text" }],
      url: { url: "/people.json", fetch: (url, init) => {
        const index = calls.length; calls.push(index); init.signal?.addEventListener("abort", () => aborts.push(index), { once: true });
        return fetch(url, init).catch(error => { fetchFailures.push(error.name); throw error; });
      } } });
    grid.ready.catch(() => {});
  });
  await expect(page.locator(".cx-grid-retry")).toBeVisible();
  await page.locator(".cx-grid-retry").click();
  await expect(page.locator(".cx-grid-page-range")).toHaveText("Showing 1 to 2 of 2 rows");
  expect(await page.evaluate(() => ({ calls: calls.length, aborted: aborts.includes(0), names: grid.getRows("page").map(row => row.name) })))
    .toEqual({ calls: 2, aborted: true, names: ["Ada", "Grace"] });
  expect(await page.evaluate(() => fetchFailures)).toEqual(["AbortError"]);
  expect(await page.evaluate(() => errors)).toEqual([]); expect(pageErrors).toEqual([]);
});

test("destroy aborts the active read and its late answer cannot reach a replacement grid", async ({ page }) => {
  await begin(page, { requestTimeoutMs: 5000 });
  await page.waitForFunction(() => calls.length === 1);
  await page.evaluate(() => grid.destroy());
  expect(await page.evaluate(() => aborts.includes(0))).toBe(true);
  await page.evaluate(async () => { window.grid = await create(); await grid.ready; releases[0]([{ id: "old", name: "Old", score: 0 }]); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => grid.getRows("all").map(row => row.name))).toEqual(["Ada", "Grace"]);
  expect(await page.evaluate(() => errors)).toEqual([]);
});

test("a superseded pending query retires its load and ignores late success", async ({ page }) => {
  await begin(page, { requestTimeoutMs: 5000 });
  await page.waitForFunction(() => calls.length === 1);
  await page.evaluate(() => grid.setQuery({ search: "Grace" }));
  expect(await page.evaluate(() => ({ calls: calls.length, names: grid.getRows("page").map(row => row.name) })))
    .toEqual({ calls: 2, names: ["Grace"] });
  await page.evaluate(() => releases[0]([{ id: "old", name: "Old", score: 0 }]));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => ({ all: grid.getRows("all").map(row => row.name), search: grid.getQuery().search })))
    .toEqual({ all: ["Ada", "Grace"], search: "Grace" });
  expect(await page.evaluate(() => errors)).toEqual([]);
});

test("malformed decoded records do not poison a later Retry", async ({ page }) => {
  await servePage(page, "<div id='people'></div>");
  await page.evaluate(async () => {
    window.calls = 0;
    window.grid = await CanopyX.grid("#people", { rowId: "id", columns: [{ data: "name", type: "text" }],
      url: { url: "/people.json", dataSrc: "items", fetch: () => Promise.resolve(new Response(JSON.stringify({ items: ++calls === 1 ? {} : [{ id: "a", name: "Ada" }] }))) } });
    grid.ready.catch(() => {});
  });
  await expect(page.locator(".cx-grid-retry")).toBeVisible();
  await page.locator(".cx-grid-retry").click();
  await expect(page.locator(".cx-row[data-cx-id='a']")).toContainText("Ada");
  expect(await page.evaluate(() => calls)).toBe(2);
});

test("setData retires the pending URL and late success cannot overwrite local rows", async ({ page }) => {
  await begin(page, { requestTimeoutMs: 5000 });
  await page.waitForFunction(() => calls.length === 1);
  await page.evaluate(() => {
    const replacement = grid.setData([{ id: "local", name: "Local", score: 4 }]);
    releases[0]([{ id: "old", name: "Old", score: 0 }]); return replacement;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => ({ names: grid.getRows("all").map(row => row.name), aborted: aborts.includes(0), calls: calls.length })))
    .toEqual({ names: ["Local"], aborted: true, calls: 1 });
  expect(await page.evaluate(() => errors)).toEqual([]);
});

test("early append and removal wait for the URL and preserve the fetched records", async ({ page }) => {
  await begin(page, { requestTimeoutMs: 5000 });
  await page.waitForFunction(() => calls.length === 1);
  await page.evaluate(() => {
    window.append = grid.addRows([{ id: "n", name: "New", score: 3 }]); append.catch(() => {});
    window.remove = grid.removeRows(["g"]); remove.catch(() => {});
    releases[0]([{ id: "a", name: "Ada", score: 2 }, { id: "g", name: "Grace", score: 1 }]);
  });
  // The later refresh may supersede the earlier refresh, but both mutations must be kept.
  await page.evaluate(() => Promise.allSettled([append, remove]));
  await ready(page);
  expect(await page.evaluate(() => grid.getRows("all").map(row => row.name))).toEqual(["Ada", "New"]);
  expect(await page.evaluate(() => calls.length)).toBe(1);
  expect(await page.evaluate(() => errors)).toEqual([]);
});

test("an inferred-column timeout aborts preparation and a later call can enhance the intact table", async ({ page }) => {
  await servePage(page, "<table id='people'><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Original</td></tr></tbody></table>");
  await page.evaluate(() => {
    window.calls = 0; window.aborts = 0; window.outcome = null;
    window.options = { requestTimeoutMs: 100, rowId: "id", columns: [{ data: "name" }], url: { url: "/people.json", fetch: (_url, init) => {
      calls++; init.signal?.addEventListener("abort", () => aborts++, { once: true });
      return calls === 1 ? new Promise(() => {}) : Promise.resolve(new Response(JSON.stringify([{ id: "a", name: "Ada" }])));
    } } };
    CanopyX.enhance("#people", options).then(() => { outcome = "unexpected success"; }, error => { outcome = error.message; });
  });
  await expect.poll(() => page.evaluate(() => outcome), { timeout: 2000 }).toContain("timed out");
  expect(await page.evaluate(() => aborts)).toBe(1);
  await expect(page.locator("#people td")).toHaveText("Original");
  await page.evaluate(async () => { window.grid = await CanopyX.enhance("#people", options); });
  await ready(page);
  await expect(page.locator(".cx-row[data-cx-id='a']")).toContainText("Ada");
  expect(await page.evaluate(() => calls)).toBe(2);
});

test("accepted URL rows stay cached through search, paging, reset and reload after async state load", async ({ page }) => {
  await servePage(page, "<div id='people'></div>");
  await page.evaluate(() => {
    window.calls = 0; window.releaseState = null; window.mounted = false;
    window.created = CanopyX.grid("#people", { rowId: "id", pageLength: 1, columns: [{ data: "name", type: "text" }],
      stateSave: { load: () => new Promise(resolve => { releaseState = resolve; }), save() {} },
      url: { url: "/people.json", fetch: () => { calls++; return Promise.resolve(new Response(JSON.stringify([{ id: "a", name: "Ada" }, { id: "g", name: "Grace" }]))); } } })
      .then(value => { window.grid = value; mounted = true; });
  });
  await page.waitForFunction(() => releaseState);
  expect(await page.evaluate(() => calls)).toBe(0);
  await page.evaluate(() => { releaseState(null); return created; });
  await ready(page);
  await page.evaluate(async () => { await grid.setQuery({ search: "Grace" }); await grid.resetView(); await grid.goToPage(1); await grid.reload(); });
  expect(await page.evaluate(() => ({ calls, names: grid.getRows("all").map(row => row.name) }))).toEqual({ calls: 1, names: ["Ada", "Grace"] });
});
