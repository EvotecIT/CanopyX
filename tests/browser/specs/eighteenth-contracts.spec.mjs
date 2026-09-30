import { expect, test } from "@playwright/test";
import path from "node:path";
import { nextFrames, repo, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "eighteenth", label: "Contracts",
  columns: [{ id: "name", title: "Name", width: 320 }, { id: "value", title: "Value", width: 180 }],
  source: { kind: "inline" }, roots: [] };

async function open(page, data = view) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

test("a terminal count retires the error from a failed continuation", async ({ page }) => {
  await open(page);
  const state = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async (node, cursor) => {
      if (!node) return { items: [{ id: "parent", label: "Parent", hasChildren: true }] };
      if (!cursor) return { items: [{ id: "child", label: "Child" }], total: 2, next: "more" };
      throw new Error("temporary failure");
    } } });
    await api.ready;
    await api.expandPath(["parent"], { expandLast: true, select: false, focus: false });
    await api.loadMore("parent");
    await new Promise(resolve => requestAnimationFrame(resolve));
    const errorBefore = host.querySelectorAll("[data-cx-status=error]").length;
    api.applyCounts({ protocol: "canopyx/1", type: "counts", items: [{ id: "parent", childCount: 1 }] });
    await new Promise(resolve => requestAnimationFrame(resolve));
    return { errorBefore, statusAfter: host.querySelectorAll("[data-cx-status]").length,
      ids: api.visibleRows().map(row => row.node.id) };
  }, view);
  expect(state).toEqual({ errorBefore: 1, statusAfter: 0, ids: ["parent", "child"] });
});

test("a user collapse cancels a waiting path expansion", async ({ page }) => {
  await open(page, { ...view, deepLink: true });
  await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => node
      ? new Promise(resolve => { window.finishChildren = resolve; })
      : { items: [{ id: "parent", label: "Parent", hasChildren: true }] } } });
    await api.ready;
    window.navigation = api.expandPath(["parent", "child"]);
  }, { ...view, deepLink: true });
  await page.waitForFunction(() => !!window.finishChildren);
  const parent = page.locator('[data-cx-id="parent"]');
  await parent.locator('.cx-exp').click();
  await expect(parent).toHaveAttribute("aria-expanded", "false");
  await page.evaluate(() => finishChildren({ items: [{ id: "child", label: "Child" }], total: 1, next: null }));
  expect(await page.evaluate(async () => ({ result: await navigation, selected: api.getSelected().map(node => node.id),
    hash: location.hash }))).toEqual({ result: null, selected: [], hash: "" });
  await expect(parent).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('[data-cx-id="child"]')).toHaveCount(0);
});

for (const detail of [false, true]) {
  test(`column resize retains an edited host ${detail ? "detail" : "cell"}`, async ({ page }) => {
    const node = { id: "row", label: "Row", ...(detail ? { detail: { type: "html", html: "", height: 1 } } : {}) };
    await open(page, { ...view, roots: [node] });
    await page.evaluate(async detail => {
      const host = document.querySelector(".cx-host"), data = host.canopyx.view; host.canopyx.destroy();
      const render = (node, _column, cell) => {
        if (node.id !== "row" || (!detail && _column !== "value")) return false;
        const input = document.createElement("input"); input.setAttribute("aria-label", "Host edit");
        cell.appendChild(input); return true;
      };
      window.api = CanopyX.createTreeGrid(host, { view: data,
        ...(detail ? { renderDetail: (node, cell) => render(node, null, cell) }
          : { renderers: Object.fromEntries(data.columns.map(column => [column.id, (node, cell) => render(node, column.id, cell)])) }) });
      await api.ready;
    }, detail);
    const input = page.getByRole("textbox", { name: "Host edit" });
    await input.fill("Unsaved host text");
    await page.evaluate(() => { window.originalInput = document.querySelector('[aria-label="Host edit"]'); });
    const grip = page.getByRole("separator", { name: "Resize Name" });
    await grip.focus(); await page.keyboard.press("ArrowRight"); await nextFrames(page);
    await expect(input).toHaveValue("Unsaved host text");
    expect(await page.evaluate(() => originalInput.isConnected && originalInput === document.querySelector('[aria-label="Host edit"]'))).toBe(true);
    expect(await page.locator('[data-cx-id="row"]').evaluate(row => ({ row: row.style.width,
      cells: [...row.querySelectorAll(":scope > .cx-cell")].map(cell => cell.style.width) })))
      .toEqual({ row: "510px", cells: detail ? ["510px"] : ["330px", "180px"] });
    await page.screenshot({ path: path.join(repo, `artifacts/takeover/eighteenth-resize-${detail ? "detail" : "cell"}.png`) });
  });
}

for (const ref of ["c/a?b#c", "c/a%25b", "c/a#fragment"]) {
  test(`sidecar reference URL preserves ${ref}`, async ({ page }) => {
    await open(page);
    const requested = [];
    await page.route("https://canopyx.test/data/**", route => {
      requested.push(route.request().url());
      return route.fulfill({ contentType: "text/javascript", body: `CanopyXSidecar.push(["eighteenth",${JSON.stringify(ref)},{"protocol":"canopyx/1","type":"page","parent":"parent","offset":0,"items":[{"id":"child","label":"Child"}],"next":null}]);` });
    });
    const result = await page.evaluate(async ref => {
      const source = CanopyX.sources.sidecar({ id: "eighteenth", source: { kind: "sidecar", base: "/data/" } });
      return (await source.page({ id: "parent", ref }, null)).items.map(item => item.id);
    }, ref);
    expect(result).toEqual(["child"]);
    expect(new URL(requested[0]).pathname).toBe("/data/" + ref.split("/").map(encodeURIComponent).join("/") + ".js");
  });
}
