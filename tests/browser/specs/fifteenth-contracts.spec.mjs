import { expect, test } from "@playwright/test";
import path from "node:path";
import { nextFrames, repo, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "fifteenth", label: "Contracts",
  columns: [{ id: "name", title: "Name", width: 320 }], source: { kind: "inline" }, roots: [] };

async function open(page, data = view) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

async function waitForLoad(page, id, completion) {
  await page.waitForFunction(name => typeof window[name] === "function", completion);
  await expect(page.locator(`[data-cx-id="${id}"]`)).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(`[data-cx-id="${id}"]`)).toHaveAttribute("aria-expanded", "true");
  // Restoration inserts a loading row on its next paint; click the requested row after that movement.
  await nextFrames(page);
}

for (const kind of ["remote", "sidecar"]) for (const shape of ["missing", "null"]) {
  test(`${kind} rejects a terminal page with ${shape} items`, async ({ page }) => {
    await open(page);
    const doc = { protocol: "canopyx/2", type: "page", parent: null, offset: 0, total: 0, next: null };
    if (shape === "null") doc.items = null;
    await page.route("https://canopyx.test/page", route => route.fulfill({ json: doc }));
    await page.route("https://canopyx.test/data/**", route => {
      const ref = new URL(route.request().url()).pathname.slice("/data/".length, -3);
      const value = ref === "manifest" ? { protocol: "canopyx/2", type: "manifest", view: view.id, root: "r/0" } : doc;
      return route.fulfill({ contentType: "application/javascript", body:
        `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify([view.id, ref, value])});` });
    });
    const result = await page.evaluate(async kind => {
      const data = { id: "fifteenth", source: kind === "remote" ? { kind, children: "/page" } : { kind, base: "/data/" } };
      const source = CanopyX.sources[kind](data);
      try { await source.page(null, null); return null; } catch (error) { return error.message; }
    }, kind);
    expect(result).toContain("page items must be an array");
  });
}

test("custom page validation rejects missing items before changing the tree", async ({ page }) => {
  await open(page);
  const visible = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async () => ({ total: 0, next: null }) } });
    await api.ready;
    return api.visibleRows().length;
  });
  await expect(page.locator('[data-cx-status="error"]')).toContainText("page items must be an array");
  expect(visible).toBe(0);
  await page.screenshot({ path: path.join(repo, "artifacts/takeover/fifteenth-invalid-page.png") });
});

test("Enter expands an expandable row even when onSelect throws", async ({ page }) => {
  await open(page, { ...view, roots: [{ id: "parent", label: "Parent", children: [{ id: "child", label: "Child" }] }] });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.evaluate(() => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, onSelect() {
      window.expandedAtCallback = api.getState().expanded;
      throw new Error("host selection failure");
    } });
    return api.ready;
  });
  await page.locator('[data-cx-id="parent"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-cx-id="parent"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-cx-id="child"]')).toBeVisible();
  expect(await page.evaluate(() => expandedAtCallback)).toEqual([["parent"]]);
  await expect.poll(() => errors).toContain("host selection failure");
  await page.screenshot({ path: path.join(repo, "artifacts/takeover/fifteenth-enter.png") });
});

test("newer user choice supersedes a queued toggle while another replay loads", async ({ page }) => {
  await open(page, { ...view, stateKey: "fifteenth-queue" });
  await page.evaluate(() => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    sessionStorage.setItem("canopyx:fifteenth-queue", JSON.stringify({ expanded: [["a"]] }));
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      if (!node) return { items: ["a", "x", "b"].map(id => ({ id, label: id, hasChildren: true })) };
      if (node.id === "a") return new Promise(resolve => { window.finishA = resolve; });
      if (node.id === "x") return new Promise(resolve => { window.finishX = resolve; });
      return { items: [{ id: "b-leaf", label: "Leaf" }] };
    } } });
  });
  await waitForLoad(page, "a", "finishA");
  await page.locator('[data-cx-id="x"] .cx-exp').click();
  await page.locator('[data-cx-id="b"] .cx-exp').click();
  await page.locator('[data-cx-id="b"] .cx-exp').click();
  await page.evaluate(() => finishA({ items: [{ id: "a-leaf", label: "Leaf" }] }));
  await waitForLoad(page, "x", "finishX");
  await page.locator('[data-cx-id="b"] .cx-exp').click();
  await page.evaluate(() => finishX({ items: [{ id: "x-leaf", label: "Leaf" }] }));
  await page.evaluate(() => api.ready);
  await expect(page.locator('[data-cx-id="b"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-cx-id="b-leaf"]')).toBeVisible();
});

test("queued expansions persist together after their final lazy page settles", async ({ page }) => {
  await open(page, { ...view, stateKey: "fifteenth-batch" });
  await page.evaluate(() => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    sessionStorage.setItem("canopyx:fifteenth-batch", JSON.stringify({ expanded: [["a"]] }));
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      if (!node) return { items: ["a", "x", "b"].map(id => ({ id, label: id, hasChildren: true })) };
      if (node.id === "a") return new Promise(resolve => { window.finishA = resolve; });
      if (node.id === "b") return new Promise(resolve => { window.finishB = resolve; });
      return { items: [{ id: "x-leaf", label: "Leaf" }] };
    } } });
  });
  await waitForLoad(page, "a", "finishA");
  await page.locator('[data-cx-id="x"] .cx-exp').click();
  await page.locator('[data-cx-id="b"] .cx-exp').click();
  await page.evaluate(() => finishA({ items: [{ id: "a-leaf", label: "Leaf" }] }));
  await waitForLoad(page, "b", "finishB");
  await page.waitForTimeout(350);
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("canopyx:fifteenth-batch")))).toEqual({ expanded: [["a"]] });
  await page.evaluate(() => finishB({ items: [{ id: "b-leaf", label: "Leaf" }] }));
  await page.evaluate(() => api.ready);
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("canopyx:fifteenth-batch") || "null")?.expanded.length === 3);
});

test("newer setState discards queued choices from an older restoration", async ({ page }) => {
  await open(page, { ...view, stateKey: "fifteenth-new-state" });
  await page.evaluate(() => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    sessionStorage.setItem("canopyx:fifteenth-new-state", JSON.stringify({ expanded: [["a"]] }));
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      if (!node) return { items: ["a", "b", "c"].map(id => ({ id, label: id, hasChildren: true })) };
      if (node.id === "a") return new Promise(resolve => { window.finishA = resolve; });
      if (node.id === "b") return new Promise(resolve => { window.finishB = resolve; });
      window.loadedC = true;
      return { items: [{ id: "c-leaf", label: "Leaf" }] };
    } } });
  });
  await waitForLoad(page, "a", "finishA");
  await page.locator('[data-cx-id="b"] .cx-exp').click();
  await page.locator('[data-cx-id="c"] .cx-exp').click();
  await page.evaluate(() => finishA({ items: [{ id: "a-leaf", label: "Leaf" }] }));
  await waitForLoad(page, "b", "finishB");
  await page.evaluate(() => { window.newState = api.setState({ expanded: [] }); });
  await page.evaluate(() => finishB({ items: [{ id: "b-leaf", label: "Leaf" }] }));
  await page.evaluate(() => Promise.all([api.ready, newState]));
  await expect(page.locator('[data-cx-id="c"]')).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => [api.getState().expanded, !!window.loadedC])).toEqual([[], false]);
});

test("a click after newer setState still replays after the older load", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      if (!node) return { items: ["a", "b", "c"].map(id => ({ id, label: id, hasChildren: true })) };
      if (node.id === "a") return new Promise(resolve => { window.finishA = resolve; });
      if (node.id === "b") return new Promise(resolve => { window.finishB = resolve; });
      return { items: [{ id: "c-leaf", label: "Leaf" }] };
    } } });
  });
  await page.evaluate(() => api.ready);
  await page.evaluate(() => { window.oldState = api.setState({ expanded: [["a"]] }); });
  await waitForLoad(page, "a", "finishA");
  await page.locator('[data-cx-id="b"] .cx-exp').click();
  await page.evaluate(() => finishA({ items: [{ id: "a-leaf", label: "Leaf" }] }));
  await waitForLoad(page, "b", "finishB");
  await page.evaluate(() => { window.newState = api.setState({ expanded: [] }); });
  await page.locator('[data-cx-id="c"] .cx-exp').click();
  await page.evaluate(() => finishB({ items: [{ id: "b-leaf", label: "Leaf" }] }));
  await page.evaluate(() => Promise.all([oldState, newState]));
  await expect(page.locator('[data-cx-id="c"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-cx-id="c-leaf"]')).toBeVisible();
});

test("an explicitly empty state key persists and restores expansion", async ({ page }) => {
  await open(page, { ...view, stateKey: "", roots: [{ id: "parent", label: "Parent", children: [{ id: "child", label: "Child" }] }] });
  await page.locator('[data-cx-id="parent"] .cx-exp').click();
  await page.waitForFunction(() => sessionStorage.getItem("canopyx:") !== null);
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data });
    await api.ready;
  });
  await expect(page.locator('[data-cx-id="parent"]')).toHaveAttribute("aria-expanded", "true");
});
