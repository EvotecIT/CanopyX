// Real enhancer state restoration with delayed host persistence; no timers in the host choose write ordering.
import { expect, test } from "@playwright/test";
import { ready, servePage } from "./enhance-support.mjs";

const create = async page => {
  await servePage(page, "<div id='list'></div><div id='other'></div>");
  await page.evaluate(() => {
    window.errors = [];
    addEventListener("unhandledrejection", event => errors.push(event.reason?.message || String(event.reason)));
    window.persisted = new Map(); window.writes = []; window.active = 0; window.maximum = 0; window.loads = 0;
    window.first = new Promise(resolve => { window.releaseFirst = resolve; });
    window.save = async ({ key, state }) => {
      const index = writes.length;
      writes.push({ key, search: state.current.query.search, sort: state.current.query.sort, views: state.views.map(item => item.name) });
      maximum = Math.max(maximum, ++active);
      if (index === 0) await first;
      persisted.set(key, structuredClone(state)); active--;
    };
    window.mount = async (target = "#list", key = "ordered", save = window.save) => {
      const grid = await CanopyX.grid(target, { id: target.slice(1), rowId: "id", label: "Saved people", pageLength: 5,
        data: [{ id: "a", name: "Ada", score: 2 }, { id: "g", name: "Grace", score: 1 }],
        stateSave: { key, load: ({ key }) => { loads++; return persisted.get(key); }, save } });
      await grid.ready; return grid;
    };
    return mount().then(grid => { window.grid = grid; });
  });
  await ready(page);
};

test("delayed host saves preserve the newest query and named-view changes when restored", async ({ page }) => {
  const pageErrors = []; page.on("pageerror", error => pageErrors.push(error.message));
  await create(page);
  await page.evaluate(async () => { await grid.sort([{ column: "score", direction: "asc" }]); grid.saveView("first"); });
  await page.waitForFunction(() => writes.length >= 1);
  await page.evaluate(async () => {
    await grid.sort([{ column: "score", direction: "desc" }]); grid.saveView("latest"); grid.removeSavedView("first"); grid.destroy();
    releaseFirst();
  });
  await expect.poll(() => page.evaluate(() => {
    const state = [...persisted.values()][0];
    return active === 0 && state && { sort: state.current.query.sort, views: state.views.map(item => item.name) };
  })).toEqual({ sort: [{ column: "score", direction: "desc" }], views: ["latest"] });
  expect(await page.evaluate(() => maximum)).toBe(1);
  await page.evaluate(async () => { window.grid = await mount(); });
  await ready(page);
  expect(await page.evaluate(() => ({ sort: grid.getQuery().sort, views: grid.getSavedViews(), names: grid.getRows("page").map(row => row.name) })))
    .toEqual({ sort: [{ column: "score", direction: "desc" }], views: ["latest"], names: ["Ada", "Grace"] });
  expect(await page.evaluate(() => errors)).toEqual([]); expect(pageErrors).toEqual([]);
});

test("destroy and immediate remount wait for the same key's final save while another key stays usable", async ({ page }) => {
  await create(page);
  await page.evaluate(async () => { await grid.sort([{ column: "score", direction: "asc" }]); grid.saveView("first"); });
  await page.waitForFunction(() => writes.length >= 1);
  await page.evaluate(async () => {
    await grid.sort([{ column: "score", direction: "desc" }]); grid.destroy();
    window.remounted = false; window.recreated = mount().then(value => { window.grid = value; remounted = true; });
    window.other = await mount("#other", "independent", ({ key, state }) => persisted.set(key, structuredClone(state)));
    other.saveView("independent");
  });
  expect(await page.evaluate(() => ({ remounted, independent: [...persisted.values()].some(state => state.views.some(item => item.name === "independent")) })))
    .toEqual({ remounted: false, independent: true });
  await page.evaluate(() => releaseFirst());
  await page.evaluate(() => recreated);
  expect(await page.evaluate(() => ({ sort: grid.getQuery().sort, names: grid.getRows("page").map(row => row.name) })))
    .toEqual({ sort: [{ column: "score", direction: "desc" }], names: ["Ada", "Grace"] });
  expect(await page.evaluate(() => errors)).toEqual([]);
});

test("reset and removed saved views persist after rejected synchronous or asynchronous host saves", async ({ page }) => {
  const pageErrors = []; page.on("pageerror", error => pageErrors.push(error.message));
  await create(page);
  await page.evaluate(() => { releaseFirst(); grid.destroy(); });
  for (const failure of ["throw", "reject"]) {
    await page.evaluate(async failure => {
      let calls = 0;
      window.grid = await mount("#list", failure, ({ key, state }) => {
        if (++calls === 1) { if (failure === "throw") throw new Error("Host blocked"); return Promise.reject(new Error("Host offline")); }
        persisted.set(key, structuredClone(state));
      });
      await grid.sort([{ column: "score", direction: "asc" }]); grid.saveView("remove me");
      await grid.resetView(); grid.removeSavedView("remove me"); grid.destroy();
      window.grid = await mount("#list", failure);
    }, failure);
    expect(await page.evaluate(() => ({ sort: grid.getQuery().sort, views: grid.getSavedViews() }))).toEqual({ sort: [], views: [] });
    await page.evaluate(() => grid.destroy());
  }
  expect(await page.evaluate(() => errors)).toEqual([]); expect(pageErrors).toEqual([]);
});

test("async state and init observers report failures without unhandled rejections or calls after destroy", async ({ page }) => {
  const pageErrors = [], messages = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") messages.push(message.text()); });
  await create(page);
  await page.evaluate(async () => {
    releaseFirst(); window.observed = 0; window.reported = [];
    const report = console.error.bind(console);
    console.error = (...args) => { reported.push(args.map(value => value?.message || String(value)).join(" ")); report(...args); };
    grid.on("state", async () => { observed++; throw new Error("State observer failed"); });
    grid.on("init", async () => { observed++; throw new Error("Late init observer failed"); });
    await grid.sort([{ column: "score", direction: "asc" }]);
  });
  await page.waitForFunction(() => observed >= 2);
  await expect.poll(() => messages.length).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => reported.some(message => message.includes("State observer failed")))).toBe(true);
  expect(await page.evaluate(() => reported.some(message => message.includes("Late init observer failed")))).toBe(true);
  await page.evaluate(() => {
    const canceled = () => { throw new Error("Removed observer ran"); };
    grid.on("init", canceled); grid.off("init", canceled);
    grid.on("init", () => { throw new Error("Destroyed observer ran"); }); grid.destroy();
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => reported.some(message => /Removed observer ran|Destroyed observer ran/.test(message)))).toBe(false);
  expect(await page.evaluate(() => errors)).toEqual([]); expect(pageErrors).toEqual([]);
});

for (const mode of ["records", "table"]) for (const search of [false, true]) {
  test(`all excluded search columns mount as ${mode} with search ${search ? "enabled" : "disabled"}`, async ({ page }) => {
    await servePage(page, mode === "records" ? "<div id='people'></div>" :
      "<table id='people'><caption>People</caption><thead><tr><th data-searchable='false'>Name</th><th data-searchable='false'>Team</th></tr></thead>" +
      "<tbody><tr><td>Ada</td><td>Core</td></tr><tr><td>Grace</td><td>Compiler</td></tr></tbody></table>");
    await page.evaluate(async ({ mode, search }) => {
      const options = { search, searchText: search ? "Ada" : "", label: "People", ...(mode === "records" ? {
        data: [{ name: "Ada", team: "Core" }, { name: "Grace", team: "Compiler" }],
        columns: [{ data: "name", searchable: false }, { data: "team", searchable: false }] } : {}) };
      window.grid = await (mode === "records" ? CanopyX.grid("#people", options) : CanopyX.enhance("#people", options));
    }, { mode, search });
    await ready(page);
    expect(await page.evaluate(() => grid.getRows("page").length)).toBe(search ? 0 : 2);
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await page.evaluate(() => grid.setQuery({ ...grid.getQuery(), search: "Ada", revision: undefined }));
    expect(await page.evaluate(() => grid.getRows("filtered").length)).toBe(0);
    await page.evaluate(() => grid.setQuery({ ...grid.getQuery(), search: "", revision: undefined }));
    expect(await page.evaluate(() => grid.getRows("page").length)).toBe(2);
    await expect(page.locator(".cx-grid-page-range")).toContainText("2");
  });
}
