import { expect, test } from "@playwright/test";
import path from "node:path";
import { repo, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "twentysecond", label: "Contracts",
  columns: [{ id: "name", title: "Name", width: 280 }],
  source: { kind: "remote", children: "/children?ref={ref}&cursor={cursor}",
    search: "/search?q={query}&limit={limit}", counts: "/counts?ids={ids}" } };

for (const [field, hasChildren] of [["ref", undefined], ["ref", false], ["childCount", undefined], ["childCount", false]]) {
  test(`remote lazy ${field} rejects hasChildren ${hasChildren}`, async ({ page }) => {
    const node = { id: "parent", label: "Parent", [field]: field === "ref" ? "children" : 1 };
    if (hasChildren !== undefined) node.hasChildren = hasChildren;
    await page.route("https://canopyx.test/children?*", route => route.fulfill({ json: {
      protocol: "canopyx/1", type: "page", parent: null, offset: 0, total: 1, next: null, items: [node] } }));
    await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
    await page.goto("https://canopyx.test/");
    await expect(page.locator('[data-cx-status="error"]')).toContainText("hasChildren");
    await expect(page.locator('[data-cx-id="parent"]')).toHaveCount(0);
    if (field === "ref" && hasChildren === undefined) {
      await page.screenshot({ path: path.join(repo, "artifacts/takeover/twentysecond-lazy-error.png") });
    }
  });
}

test("remote search rejects malformed hit paths and labels before navigation", async ({ page }) => {
  let hit;
  await page.route("https://canopyx.test/children?*", route => route.fulfill({ json: {
    protocol: "canopyx/1", type: "page", parent: null, offset: 0, total: 0, next: null, items: [] } }));
  await page.route("https://canopyx.test/search?*", route => route.fulfill({ json: {
    protocol: "canopyx/1", type: "search", query: "ab", hits: [hit], total: 1, truncated: false } }));
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  const errors = [];
  for (hit of [
    { path: "ab", label: "B" },
    { path: ["a", "a"], label: "B" },
    { path: ["a", "\ud800"], label: "B" },
    { path: ["a"], label: null }
  ]) {
    errors.push(await page.evaluate(async () => {
      try { await document.querySelector(".cx-host").canopyx.search("ab"); return null; }
      catch (error) { return error.message; }
    }));
  }
  expect(errors.every(error => error?.includes("search hit"))).toBe(true);
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
});

test("custom source search rejects malformed hits at both API and toolbar boundaries", async ({ page }) => {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage({
    ...view, source: { kind: "inline" }, roots: [{ id: "b", label: "Actual B" }],
    search: { minLength: 2, maxResults: 10, placeholder: "Search" }
  }) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(async () => {
    const host = document.createElement("div");
    host.id = "custom-search";
    document.body.appendChild(host);
    window.customHit = { path: "b", label: "Misleading A" };
    window.customApi = CanopyX.createTreeGrid(host, {
      view: document.querySelector(".cx-host").canopyx.view,
      source: { canSearch: true, page: async () => ({ items: [{ id: "b", label: "Actual B" }], next: null }),
        search: async () => ({ hits: [window.customHit], total: 1, truncated: false }) }
    });
    await window.customApi.ready;
  });
  const message = await page.evaluate(async () => {
    try { await window.customApi.search("ab"); return null; }
    catch (error) { return error.message; }
  });
  expect(message).toContain("search hit");
  await page.locator("#custom-search .cx-search-input").fill("ab");
  await expect(page.locator("#custom-search .cx-search .cx-sr-only")).toContainText("Search failed: CanopyX: search hit");
  await expect(page.locator("#custom-search .cx-result")).toHaveCount(0);
  await expect(page.locator('#custom-search [data-cx-id="b"]')).not.toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => { window.customHit = { path: ["b"], label: "Actual B" }; });
  expect((await page.evaluate(() => window.customApi.search("ab"))).hits).toEqual([{ path: ["b"], label: "Actual B" }]);
});

test("a malformed sidecar search hit is rejected and a corrected shard can retry", async ({ page }) => {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage({
    ...view, source: { kind: "inline" }, roots: [] }) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  const result = await page.evaluate(async () => {
    const id = "bad-shard";
    const source = CanopyX.sources.sidecar({ id, source: { kind: "sidecar", base: "/data/" } });
    CanopyXSidecar.push([id, "manifest", { protocol: "canopyx/1", type: "manifest", view: id,
      root: "r/0", search: { shards: { ab: 1 } } }]);
    CanopyXSidecar.push([id, "s/ab", { protocol: "canopyx/1", type: "searchShard", key: "ab",
      entries: [{ path: "ab", label: "Abacus" }] }]);
    let error = null;
    try { await source.search("ab", 10); } catch (caught) { error = caught.message; }
    CanopyXSidecar.push([id, "s/ab", { protocol: "canopyx/1", type: "searchShard", key: "ab",
      entries: [{ path: ["found"], label: "Abacus" }] }]);
    return { error, hits: (await source.search("ab", 10)).hits };
  });
  expect(result.error).toContain("search hit");
  expect(result.hits).toEqual([{ path: ["found"], label: "Abacus" }]);
});

test("remote counts preserve comma, percent, and Unicode IDs after ordinary query parsing", async ({ page }) => {
  const received = [];
  await page.route("https://canopyx.test/children?*", route => route.fulfill({ json: {
    protocol: "canopyx/1", type: "page", parent: null, offset: 0, total: 0, next: null, items: [] } }));
  await page.route("https://canopyx.test/counts?*", route => {
    const parsed = new URL(route.request().url()).searchParams.get("ids");
    received.push(parsed.split(",").map(decodeURIComponent));
    return route.fulfill({ json: { protocol: "canopyx/1", type: "counts", items: [] } });
  });
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.refreshCounts(["a,b", "c", "a%b", "é"]));
  expect(received).toEqual([["a,b", "c", "a%b", "é"]]);
});
