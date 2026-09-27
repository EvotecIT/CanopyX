import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "hosts", label: "Hosts", rowHeight: 28, pageSize: 100,
  columns: [{ id: "name", title: "Name", width: 300, kind: "text" }, { id: "value", title: "Value", width: 150, kind: "text" }],
  source: { kind: "inline" }, roots: [] };
async function open(page) {
  await page.route("https://canopyx.test/", r => r.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
}

test("custom sources override inline roots and paths cross empty advancing pages", async ({ page }) => {
  await open(page);
  const ids = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    const data = { ...viewForTest(), roots: [{ id: "ignored", label: "Ignored" }] };
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async (node, cursor) => ({
      items: cursor === "third" ? [{ id: "target", label: "Target" }] : [],
      next: cursor === "third" ? null : cursor === "second" ? "third" : "second"
    }) } });
    await api.ready;
    await api.expandPath(["target"]);
    return api.visibleRows().map(r => r.node.id);
    function viewForTest() { return { protocol: "canopyx/1", type: "view", id: "custom", label: "Custom",
      source: { kind: "inline" }, columns: [{ id: "name", title: "Name", width: 300 }] }; }
  });
  expect(ids).toEqual(["target"]);
});

test("custom renderers get fresh containers and their decorators precede fallback text", async ({ page }) => {
  await open(page);
  await page.evaluate(data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    const seen = new WeakSet(); window.reusedContainers = 0;
    data.roots = Array.from({ length: 100 }, (_, i) => ({ id: "n" + i, label: "Label" + i, cells: { value: "Value" + i } }));
    window.api = CanopyX.createTreeGrid(host, { view: data, renderCell(node, column, element) {
      if (seen.has(element)) window.reusedContainers++;
      seen.add(element);
      const prefix = document.createElement("span"); prefix.textContent = "Prefix";
      element.replaceChildren(prefix);
      if (node.id === "n0") element.setAttribute("data-host-mark", "only-first");
      return false;
    } });
    return window.api.ready;
  }, view);
  await expect(page.locator('[data-cx-id="n0"]')).toContainText("PrefixLabel0");
  await expect(page.locator('[data-cx-id="n0"]')).toContainText("PrefixValue0");
  await page.locator(".cx-grid").evaluate(el => { el.scrollTop = el.scrollHeight; });
  await nextFrames(page);
  expect(await page.evaluate(() => window.reusedContainers)).toBe(0);
  await expect(page.locator("[data-host-mark]")).toHaveCount(0);
  const outline = await page.evaluate(() => window.api.toOutline());
  expect(outline).toContain("Prefix");
  expect(outline).toContain("Label99");
});

test("slow restoration cannot overwrite the saved expansion set", async ({ page }) => {
  await open(page);
  const saved = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    data.stateKey = "slow-restore";
    data.source = { kind: "remote", children: "c?ref={ref}&cursor={cursor}" }; delete data.roots;
    const expected = { expanded: [["b"]] };
    sessionStorage.setItem("canopyx:slow-restore", JSON.stringify(expected));
    let finish;
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      if (!node) return { items: [{ id: "a", label: "A", hasChildren: true, expanded: true }, { id: "b", label: "B", hasChildren: true }], next: null };
      if (node.id === "b") return new Promise(resolve => { finish = resolve; });
      return { items: [{ id: "a1", label: "A1" }], next: null };
    } } });
    while (!finish) await new Promise(resolve => setTimeout(resolve, 10));
    await new Promise(resolve => setTimeout(resolve, 350));
    const stored = JSON.parse(sessionStorage.getItem("canopyx:slow-restore"));
    finish({ items: [{ id: "b1", label: "B1" }], next: null }); await api.ready;
    return stored;
  }, view);
  expect(saved).toEqual({ expanded: [["b"]] });
});
