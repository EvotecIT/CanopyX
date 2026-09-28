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

test("outline respects owned custom cells and fallback badge order", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    data.roots = [{ id: "owned", label: "Owned", badges: [{ text: "Suppressed" }] },
      { id: "fallback", label: "Fallback", badges: [{ text: "Node badge" }], cells: { name: { value: "Fallback", badges: [{ text: "Cell badge" }] } } }];
    const api = CanopyX.createTreeGrid(host, { view: data, renderCell(node, column, el) {
      if (node.id === "owned") { el.textContent = "Host only"; return true; }
      return false;
    } });
    await api.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const div = document.createElement("div"); div.innerHTML = api.toOutline();
    return { live: [...host.querySelectorAll(".cx-row")].map(el => el.textContent), outline: [...div.querySelectorAll("tbody tr")].map(el => el.textContent) };
  }, view);
  expect(result.outline).toEqual(result.live);
  expect(result.outline[0]).not.toContain("Suppressed");
  expect(result.outline[1]).toContain("Node badgeCell badge");
});

test("sidecar search retains paths whose newline-joined strings collide", async ({ page }) => {
  await open(page);
  const data = { ...view, source: { kind: "sidecar", base: "/data/" } };
  const entries = [{ path: ["a\nb", "c"], label: "Abacus one" }, { path: ["a", "b\nc"], label: "Abacus two" }];
  const docs = { manifest: { protocol: "canopyx/1", type: "manifest", view: data.id, root: "r/0", search: { prefix: "k-", shards: { ab: 2 } } },
    "s/k-ab": { protocol: "canopyx/1", type: "searchShard", key: "ab", entries } };
  await page.route("https://canopyx.test/data/**", route => {
    const ref = new URL(route.request().url()).pathname.slice(6, -3);
    return route.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify([data.id, ref, docs[ref]])});` });
  });
  const paths = await page.evaluate(async ({ data, entries }) => {
    const sidecar = await CanopyX.sources.sidecar(data).search("ab", 20);
    const inline = await CanopyX.sources.inline({ ...data, roots: entries.map(e => ({ id: e.path[0], label: "Parent", children: [{ id: e.path[1], label: e.label }] })) }).search("ab", 20);
    return { sidecar: sidecar.hits.map(h => h.path), inline: inline.hits.map(h => h.path) };
  }, { data, entries });
  expect(paths.sidecar).toEqual(paths.inline);
  expect(paths.sidecar).toHaveLength(2);
});
