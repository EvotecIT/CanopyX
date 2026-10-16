import { expect, test } from "@playwright/test";
import { viewPage } from "./support.mjs";

test("initial tree height stays fitted throughout a pressed expander on a scrolled page", async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "view", id: "height-background", label: "Background",
    columns: [{ id: "name", title: "Name", width: 320 }], source: { kind: "inline" }, roots: [] };
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(async () => {
    const id = "height-sidecar", base = { protocol: "canopyx/2" };
    CanopyXSidecar.push([id, "manifest", { ...base, type: "manifest", view: id, root: "r/0" }]);
    CanopyXSidecar.push([id, "r/0", { ...base, type: "page", parent: null, offset: 0, total: 1, next: null,
      items: [{ id: "parent", label: "Parent", hasChildren: true }] }]);
    CanopyXSidecar.push([id, "parent", { ...base, type: "page", parent: "parent", offset: 0, total: 1, next: null,
      items: [{ id: "child", label: "Child" }] }]);
    const host = document.createElement("div"); host.id = "height-sidecar"; document.body.appendChild(host);
    window.heightPress = {};
    const observer = new MutationObserver(() => {
      if (host.querySelector('[data-cx-id="parent"]')) {
        heightPress.firstRowsHeight = host.getBoundingClientRect().height;
        observer.disconnect();
      }
    });
    observer.observe(host, { childList: true, subtree: true });
    for (const type of ["pointerdown", "pointerup"]) document.addEventListener(type, event => {
      if (event.button !== 0) return;
      heightPress[type] = { scroll: scrollY, height: host.getBoundingClientRect().height,
        target: event.target.closest(".cx-exp")?.closest(".cx-row")?.dataset.cxId };
    }, true);
    const api = CanopyX.createTreeGrid(host, { view: { ...document.querySelector(".cx-host").canopyx.view,
      id, source: { kind: "sidecar", base: "/data/" } } });
    await api.ready;
  });
  const parent = page.locator('#height-sidecar [data-cx-id="parent"]');
  // A held press spans the old deferred initial fit, as an ordinary pointer press can.
  await parent.locator(".cx-exp").click({ delay: 80 });
  await expect(page.locator('#height-sidecar [data-cx-id="child"]')).toBeVisible();
  await expect(parent).toHaveAttribute("aria-expanded", "true");
  await expect(parent).toBeFocused();
  const result = await page.evaluate(() => heightPress);
  expect(result.pointerdown.scroll).toBeGreaterThan(0);
  expect(result.pointerdown.target).toBe("parent");
  expect(result.pointerup.target).toBe("parent");
  expect(result.firstRowsHeight).toBe(result.pointerdown.height);
  expect(result.pointerup.height).toBe(result.pointerdown.height);
  expect(result.pointerup.scroll).toBe(result.pointerdown.scroll);
});

test("a loading placeholder leaves the first data rows free to fit before they appear", async ({ page }) => {
  const view = { protocol: "canopyx/2", type: "view", id: "height-loading", label: "Loading height",
    columns: [{ id: "name", title: "Name", width: 320 }], source: { kind: "inline" }, roots: [] };
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => {
    const host = document.createElement("div"); host.id = "height-loading"; document.body.appendChild(host);
    const api = CanopyX.createTreeGrid(host, { view: { ...document.querySelector(".cx-host").canopyx.view,
      id: "height-delayed-data" }, source: { page: () => new Promise(resolve => { window.resolveHeightRoots = resolve; }) } });
    window.heightLoadingReady = api.ready;
  });
  await expect(page.locator('#height-loading [data-cx-status="loading"]')).toBeVisible();
  const firstData = await page.evaluate(async () => {
    const host = document.querySelector("#height-loading");
    const firstRows = new Promise(resolve => {
      const observer = new MutationObserver(() => {
        const last = host.querySelector('[data-cx-id="third"]');
        if (!last) return;
        const grid = host.querySelector(".cx-grid"), rowBox = last.getBoundingClientRect(), gridBox = grid.getBoundingClientRect();
        observer.disconnect();
        resolve({ allRowsFit: rowBox.bottom <= gridBox.bottom - grid.clientTop + 1,
          dataRows: host.querySelectorAll("[data-cx-id]").length });
      });
      observer.observe(host, { childList: true, subtree: true });
    });
    resolveHeightRoots({ items: [{ id: "first", label: "First" }, { id: "second", label: "Second" },
      { id: "third", label: "Third" }], total: 3, next: null });
    await heightLoadingReady;
    return firstRows;
  });
  expect(firstData).toEqual({ allRowsFit: true, dataRows: 3 });
});
