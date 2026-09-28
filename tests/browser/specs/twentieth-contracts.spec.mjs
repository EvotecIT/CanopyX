import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "twentieth", label: "Contracts",
  columns: [{ id: "name", title: "Name", width: 300, sortable: true }, { id: "value", title: "Value", width: 160 }],
  source: { kind: "inline" }, roots: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] };

async function open(page, data = view, html = viewPage(data)) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

test("selection and sorting retain edited controls in surviving rows", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, renderCell(node, column, cell) {
      if (column !== "value") return false;
      const input = document.createElement("input"); input.setAttribute("aria-label", "Edit " + node.id);
      cell.appendChild(input); return true;
    } });
    await api.ready;
  });
  const edit = page.getByRole("textbox", { name: "Edit a" });
  await edit.fill("Unsaved");
  await page.evaluate(() => { window.originalEdit = document.querySelector('[aria-label="Edit a"]'); });
  await page.locator('[data-cx-id="a"] .cx-tree').click();
  await nextFrames(page);
  await expect(page.locator('[data-cx-id="a"]')).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Name" }).click();
  await nextFrames(page);
  await page.locator('[data-cx-id="b"] .cx-tree').click();
  await nextFrames(page);
  await expect(page.locator('[data-cx-id="a"]')).toHaveAttribute("aria-selected", "false");
  await expect(edit).toHaveValue("Unsaved");
  expect(await page.evaluate(() => originalEdit.isConnected && originalEdit === document.querySelector('[aria-label="Edit a"]'))).toBe(true);
});

test("pointer and keyboard resize align pooled rows with the header", async ({ page }) => {
  await open(page, { ...view, roots: Array.from({ length: 150 }, (_, i) => ({ id: "r" + i, label: "Row " + i })) });
  const grid = page.getByRole("treegrid"), grip = page.getByRole("separator", { name: "Resize Name" });
  await grid.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await nextFrames(page);
  await page.evaluate(() => {
    const grip = document.querySelector(".cx-resize");
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 7, clientX: 100 }));
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 7, clientX: 115 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, clientX: 115 }));
  });
  await grip.focus(); await page.keyboard.press("ArrowRight");
  await grid.evaluate(element => { element.scrollTop = 0; });
  await nextFrames(page);
  await expect(grip).toHaveAttribute("aria-valuenow", "325");
  const widths = await page.locator('[data-cx-id="r0"]').evaluate(row => [...row.children].map(cell => cell.style.width));
  expect(widths).toEqual(["325px", "160px"]);
});

test("direct counts supersede an older pending refresh", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    const api = CanopyX.createTreeGrid(host, { view: data, source: {
      page: async () => ({ items: [{ id: "parent", label: "Parent", hasChildren: true }], next: null }),
      counts: async () => new Promise(resolve => { window.finishOldCount = resolve; })
    } });
    await api.ready;
    const pending = api.refreshCounts(["parent"]);
    api.applyCounts({ protocol: "canopyx/1", type: "counts", items: [{ id: "parent", childCount: 2 }] });
    finishOldCount({ protocol: "canopyx/1", type: "counts", items: [{ id: "parent", childCount: 1 }] });
    await pending;
    return api.visibleRows()[0].node.childCount;
  }, view);
  expect(result).toBe(2);
});

test("malformed persisted paths leave declarative expansion and ready intact", async ({ page }) => {
  const data = { ...view, stateKey: "twentieth-invalid", roots: [{ id: "parent", label: "Parent", expanded: true,
    children: [{ id: "child", label: "Child" }] }] };
  const html = viewPage(data).replace('<div class="cx-host"',
    '<script>sessionStorage.setItem("canopyx:twentieth-invalid", JSON.stringify({expanded:[null]}));</script><div class="cx-host"');
  await open(page, data, html);
  await expect(page.locator('[data-cx-id="parent"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-cx-id="child"]')).toHaveCount(1);
});

test("paged grid reports an unknown flattened row count", async ({ page }) => {
  await open(page);
  const count = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async () => ({
      items: Array.from({ length: 10 }, (_, i) => ({ id: "r" + i, label: "Row " + i })), total: 100, next: "more"
    }) } });
    await api.ready;
    return host.querySelector('[role="treegrid"]').getAttribute("aria-rowcount");
  }, view);
  expect(count).toBe("-1");
});

test("Armenian capitals match lowercase inline queries", async ({ page }) => {
  await open(page, { ...view, search: { minLength: 2, maxResults: 10, placeholder: "Search" }, roots: [{ id: "armenian", label: "Ար" }] });
  const hits = await page.evaluate(async () => (await document.querySelector(".cx-host").canopyx.search("ար", 10)).hits.map(hit => hit.path));
  expect(hits).toEqual([["armenian"]]);
});
