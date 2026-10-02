import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "count-source-contracts", label: "Contracts",
  columns: [{ id: "name", title: "Name", width: 320 }], source: { kind: "inline" }, roots: [] };

async function open(page) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

test("a lower count replaces a stale terminal child cache", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    let loads = 0;
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      if (!node) return { items: [{ id: "parent", label: "Parent", hasChildren: true }] };
      loads++;
      return loads === 1
        ? { items: ["a", "b", "c"].map(id => ({ id, label: id })), total: 3, next: null }
        : { items: ["a", "b"].map(id => ({ id, label: id })), total: 2, next: null };
    } } });
    await api.ready;
    await api.expandPath(["parent"], { select: false, focus: false, expandLast: true });
    api.applyCounts({ protocol: "canopyx/2", type: "counts", items: [{ id: "parent", childCount: 2 }] });
    const afterCount = api.visibleRows().map(row => row.node.id);
    await api.expandPath(["parent", "b"], { select: false, focus: false });
    return { loads, afterCount, final: api.visibleRows().map(row => row.node.id) };
  }, view);
  expect(result).toEqual({ loads: 2, afterCount: ["parent"], final: ["parent", "a", "b"] });
});

test("a lower count received during paging wins over the stale page", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    let loads = 0;
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async (node, cursor) => {
      if (!node) return { items: [{ id: "parent", label: "Parent", hasChildren: true }] };
      loads++;
      if (cursor) return new Promise(resolve => { window.finishOldContinuation = resolve; });
      return loads === 1
        ? { items: ["a", "b", "c"].map(id => ({ id, label: id })), total: 4, next: "more" }
        : { items: ["a", "b"].map(id => ({ id, label: id })), total: 2, next: null };
    } } });
    await api.ready;
    await api.expandPath(["parent"], { select: false, focus: false, expandLast: true });
    const loading = api.loadMore("parent");
    await new Promise(resolve => { const started = () => window.finishOldContinuation ? resolve() : setTimeout(started, 0); started(); });
    api.applyCounts({ protocol: "canopyx/2", type: "counts", items: [{ id: "parent", childCount: 2 }] });
    finishOldContinuation({ items: [{ id: "d", label: "d" }], total: 4, next: null });
    await loading;
    const afterOldPage = api.visibleRows().map(row => row.node.id);
    await api.expandPath(["parent", "b"], { select: false, focus: false });
    return { loads, afterOldPage, final: api.visibleRows().map(row => row.node.id) };
  }, view);
  expect(result).toEqual({ loads: 3, afterOldPage: ["parent"], final: ["parent", "a", "b"] });
});

test("discarded in-flight child pages do not announce or notify a host", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    const callbacks = [], events = [];
    host.addEventListener("canopyx:load", event => { if (event.detail.node?.id === "parent") events.push(event.detail.count); });
    const api = CanopyX.createTreeGrid(host, { view: data, onLoad(node, info) {
      if (node?.id === "parent") callbacks.push(info.count);
    }, source: { page: async node => node
      ? new Promise(resolve => { window.finishDiscardedPage = resolve; })
      : { items: [{ id: "parent", label: "Parent", hasChildren: true }] } } });
    await api.ready;
    host.querySelector(".cx-live").textContent = "";
    const liveBefore = host.querySelector(".cx-live").textContent;
    const pending = api.expandPath(["parent"], { select: false, focus: false, expandLast: true }).catch(() => null);
    await new Promise(resolve => { const started = () => window.finishDiscardedPage ? resolve() : setTimeout(started, 0); started(); });
    api.applyCounts({ protocol: "canopyx/2", type: "counts", items: [{ id: "parent", childCount: 0 }] });
    finishDiscardedPage({ items: [{ id: "stale", label: "Stale" }], total: 1, next: null });
    await pending;
    return { callbacks, events, liveBefore, liveAfter: host.querySelector(".cx-live").textContent,
      rows: api.visibleRows().map(row => row.node.id) };
  }, view);
  expect(result).toEqual({ callbacks: [], events: [], liveBefore: "", liveAfter: "", rows: ["parent"] });
});

test("remote search requires hits and truncated in every response", async ({ page }) => {
  await open(page);
  await page.route("https://canopyx.test/children?*", route => route.fulfill({ json: { protocol: "canopyx/2", type: "page", parent: null, offset: 0, items: [] } }));
  await page.route("https://canopyx.test/search?*", route => {
    const query = new URL(route.request().url()).searchParams.get("q");
    const response = { protocol: "canopyx/2", type: "search", query, hits: [], truncated: false };
    if (query === "missing-hits") delete response.hits;
    if (query === "null-hits") response.hits = null;
    if (query === "missing-flag") delete response.truncated;
    if (query === "null-flag") response.truncated = null;
    return route.fulfill({ json: response });
  });
  const errors = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    const api = CanopyX.createTreeGrid(host, { view: data }); await api.ready;
    const result = [];
    for (const query of ["missing-hits", "null-hits", "missing-flag", "null-flag"]) {
      try { await api.search(query); result.push(null); } catch (error) { result.push(error.message); }
    }
    return result;
  }, { ...view, source: { kind: "remote", children: "/children?ref={ref}&cursor={cursor}", search: "/search?q={query}&limit={limit}" } });
  expect(errors.slice(0, 2).every(error => error?.includes("hits must be an array"))).toBe(true);
  expect(errors.slice(2).every(error => error?.includes("truncated must be a boolean"))).toBe(true);
});

test("remote and host counts reject a missing items array", async ({ page }) => {
  await open(page);
  await page.route("https://canopyx.test/children?*", route => route.fulfill({ json: { protocol: "canopyx/2", type: "page", parent: null, offset: 0, items: [{ id: "a", label: "A" }] } }));
  await page.route("https://canopyx.test/counts?*", route => {
    const response = { protocol: "canopyx/2", type: "counts" };
    if (new URL(route.request().url()).searchParams.get("ids") === "null") response.items = null;
    return route.fulfill({ json: response });
  });
  const errors = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    const api = CanopyX.createTreeGrid(host, { view: data }); await api.ready;
    const result = [];
    for (const id of ["a", "null"]) {
      try { await api.refreshCounts([id]); result.push(null); } catch (error) { result.push(error.message); }
    }
    for (const items of [undefined, null]) {
      const document = { protocol: "canopyx/2", type: "counts" };
      if (items === null) document.items = null;
      try { api.applyCounts(document); result.push(null); } catch (error) { result.push(error.message); }
    }
    return result;
  }, { ...view, source: { kind: "remote", children: "/children?ref={ref}&cursor={cursor}", counts: "/counts?ids={ids}" } });
  expect(errors.every(error => error?.includes("items must be an array"))).toBe(true);
});
