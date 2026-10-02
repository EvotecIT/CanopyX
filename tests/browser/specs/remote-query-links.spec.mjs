import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "query-links", title: "Records", pageSize: 2,
  deepLink: true, columns: [{ id: "name", title: "Name", width: 230, sortable: true }],
  source: { kind: "inline" }, roots: [] };

async function open(page) {
  await page.route("https://query.test/", route => route.fulfill({ contentType: "text/html", body: viewPage({ ...view, deepLink: false }) }));
  await page.goto("https://query.test/"); await page.waitForSelector("[data-cx-ready]");
}

test("a replacement query retires link parsing before it can navigate the new snapshot", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); let resolvePath;
    const api = CanopyX.createTreeGrid(host, { view: data, formatLink: () => null,
      parseLink: fragment => fragment ? new Promise(resolve => { resolvePath = resolve; }) : null,
      source: { queryAware: true, page: async (node, cursor, request) => ({
        items: [{ id: "a", label: request.query.sort ? "New A" : "Old A" }], next: null,
        revision: request.query.sort ? "r2" : "r1"
      }) } }); await api.ready;
    history.replaceState(null, "", "#record/a"); const opening = api.readLocation();
    await api.sort("name", "desc"); resolvePath(["a"]); await opening;
    const selected = api.getSelected().map(node => node.id);
    // Retirement permits an explicit retry of the same address against the accepted snapshot.
    const retry = api.readLocation(); resolvePath(["a"]); await retry;
    return { selected, retried: api.getSelected().map(node => node.id), label: api.visibleRows()[0].node.label };
  }, view);
  expect(result).toEqual({ selected: [], retried: ["a"], label: "New A" });
});

for (const retirement of ["query", "fragment", "destroy"]) {
  test(`a stalled link parser settles when its ${retirement} lifetime is retired`, async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async ({ data, retirement }) => {
      const host = document.querySelector(".cx-host"); host.canopyx.destroy();
      const api = CanopyX.createTreeGrid(host, { view: data, formatLink: () => null,
        parseLink: fragment => fragment === "stalled" ? new Promise(() => {}) : null,
        source: { queryAware: true, page: async (node, cursor, request) => ({
          items: [{ id: "a", label: "A" }], next: null, revision: request.query.sort ? "r2" : "r1"
        }) } }); await api.ready;
      history.replaceState(null, "", "#stalled"); const opening = api.readLocation();
      if (retirement === "query") await api.sort("name", "desc");
      else if (retirement === "fragment") { history.replaceState(null, "", "#other"); await api.readLocation(); }
      else api.destroy();
      return Promise.race([opening.then(() => "settled"), new Promise(resolve => setTimeout(() => resolve("pending"), 150))]);
    }, { data: view, retirement });
    expect(result).toBe("settled");
  });
}

test("a replacement query releases ready when initial link parsing is stalled", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    history.replaceState(null, "", "#stalled"); let parsed;
    const reached = new Promise(resolve => { parsed = resolve; });
    const api = CanopyX.createTreeGrid(host, { view: data, formatLink: () => null,
      parseLink: () => { parsed(); return new Promise(() => {}); },
      source: { queryAware: true, page: async (node, cursor, request) => ({
        items: [{ id: "a", label: "A" }], next: null, revision: request.query.sort ? "r2" : "r1"
      }) } }); await reached; const opening = api.readLocation(); await api.sort("name", "desc");
    return Promise.race([Promise.all([api.ready, opening]).then(() => "settled"), new Promise(resolve => setTimeout(() => resolve("pending"), 150))]);
  }, view);
  expect(result).toBe("settled");
});
