import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "thirteenth", label: "Contracts",
  columns: [{ id: "name", title: "Name", width: 240 }, { id: "value", title: "Value", width: 120 }],
  source: { kind: "inline" }, roots: [] };

async function open(page, data = view) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

test("a matching paged parent keeps the known sibling count under a filter", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => node
      ? { items: [{ id: "child-1", label: "First" }, { id: "child-2", label: "Second" }], total: 4, next: "later" }
      : { items: [{ id: "parent", label: "Parent", hasChildren: true }], total: 1 } } });
    await api.ready;
    await api.expandPath(["parent"], { expandLast: true });
    api.setFilter(node => node.id === "parent");
  });
  await expect(page.locator('[data-cx-id="child-1"]')).toHaveAttribute("aria-setsize", "4");
  await expect(page.locator('[data-cx-id="child-2"]')).toHaveAttribute("aria-posinset", "2");
  await page.evaluate(() => api.setFilter(node => node.id === "child-1"));
  await expect(page.locator('[data-cx-id="child-1"]')).toHaveAttribute("aria-setsize", "-1");
  await page.evaluate(() => api.setFilter(null));
  await expect(page.locator('[data-cx-id="child-1"]')).toHaveAttribute("aria-setsize", "4");
});

test("outline and live renderCell callbacks use the same original column index when one is hidden", async ({ page }) => {
  await open(page, { ...view, columns: [{ id: "name", title: "Name", width: 240 },
    { id: "hidden", title: "Hidden", width: 100, hidden: true }, { id: "shown", title: "Shown", width: 120 }],
  roots: [{ id: "one", label: "One", cells: { shown: "Value" } }] });
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, renderCell(node, column, cell, context) {
      if (column !== "shown") return false;
      cell.textContent = "index=" + context.index;
      return true;
    } });
    await api.ready;
  });
  await nextFrames(page);
  const result = await page.evaluate(() => {
    const host = document.querySelector(".cx-host");
    const outline = document.createElement("div"); outline.innerHTML = api.toOutline();
    return { live: host.querySelector('[data-cx-id="one"] [aria-colindex="2"]')?.textContent,
      outline: outline.querySelector("tbody tr td:nth-child(2)")?.textContent };
  });
  expect(result).toEqual({ live: "index=2", outline: "index=2" });
});

test("a failed lazy expansion is saved and reopened as an error row", async ({ page }) => {
  await open(page, { ...view, stateKey: "thirteenth-lazy" });
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.source = { page: async node => {
      if (node) throw new Error("source unavailable");
      return { items: [{ id: "lazy", label: "Lazy", hasChildren: true }], total: 1 };
    } };
    window.api = CanopyX.createTreeGrid(host, { view: data, source });
    await api.ready;
  });
  await page.locator('[data-cx-id="lazy"] .cx-exp').click();
  await expect(page.locator('[data-cx-status="error"]')).toBeVisible();
  await page.waitForFunction(() => sessionStorage.getItem("canopyx:thirteenth-lazy") !== null);
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("canopyx:thirteenth-lazy"))))
    .toEqual({ expanded: [["lazy"]] });
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, source });
    await api.ready;
  });
  await expect(page.locator('[data-cx-id="lazy"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-cx-status="error"]')).toBeVisible();
});

test("an empty lazy page removes the expander from an already painted row", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => node
      ? new Promise(resolve => { window.finishEmpty = resolve; })
      : { items: [{ id: "lazy", label: "Lazy", hasChildren: true }], total: 1 } } });
    await api.ready;
  });
  const row = page.locator('[data-cx-id="lazy"]');
  await row.locator(".cx-exp").click();
  await expect(row).toHaveAttribute("aria-busy", "true");
  await nextFrames(page);
  await page.evaluate(() => window.finishEmpty({ items: [], total: 0, next: null }));
  await expect(row).not.toHaveAttribute("aria-expanded");
  await expect(row).not.toHaveAttribute("aria-busy");
  await expect(row.locator(".cx-exp")).toHaveClass(/cx-leaf/);
  await expect(page.locator("[data-cx-status]")).toHaveCount(0);
});
