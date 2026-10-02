import { expect, test } from "@playwright/test";
import { viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "inline-order", label: "Records", pageSize: 2,
  selection: "multiple", source: { kind: "inline" }, columns: [{ id: "name", title: "Name", width: 300, sortable: true }],
  roots: [{ id: "z", label: "Zulu" }, { id: "m", label: "Mike" }, { id: "a", label: "Alpha" }] };
async function open(page) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/"); await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => { window.api = document.querySelector(".cx-host").canopyx; });
}

test("inline sorting orders every sibling before paging without mutating host data", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    api.sort("name", "asc"); const first = api.visibleRows().map(row => row.node.id);
    await api.loadMore(); const all = api.visibleRows().map(row => row.node.id);
    return { first, all, original: api.view.roots.map(node => node.id) };
  });
  expect(result).toEqual({ first: ["a", "m"], all: ["a", "m", "z"], original: ["z", "m", "a"] });
});

test("a selected sibling outside the sorted prefix retains identity when its page is reached", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    api.setSelection(["z"]); const selected = api.getSelected()[0]; api.sort("name", "asc");
    const hidden = { visible: api.visibleRows().map(row => row.node.id), selected: api.getSelected().map(node => node.id) };
    await api.expandPath(["z"], { select: false });
    return { hidden, same: api.getSelected()[0] === selected, final: api.visibleRows().map(row => row.node.id) };
  });
  expect(result).toEqual({ hidden: { visible: ["a", "m"], selected: ["z"] }, same: true, final: ["a", "m", "z"] });
});

test("clearing sort restores original paging while retaining a hidden selection", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    api.sort("name", "asc"); api.setSelection(["a"]); api.sort("name", null);
    const first = api.visibleRows().map(row => row.node.id), selected = api.getSelected().map(node => node.id);
    await api.loadMore(); return { first, selected, final: api.visibleRows().map(row => row.node.id) };
  });
  expect(result).toEqual({ first: ["z", "m"], selected: ["a"], final: ["z", "m", "a"] });
});

test("an expanded inline branch remains open after moving outside and back into the page prefix", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = api.element; api.destroy(); data.roots[0].children = [{ id: "zc", label: "Child" }];
    window.api = CanopyX.createTreeGrid(host, { view: data }); await api.ready; await api.expandPath(["z"], { expandLast: true });
    api.sort("name", "asc"); const hidden = api.visibleRows().map(row => row.node.id); await api.expandPath(["z"], { select: false });
    return { hidden, final: api.visibleRows().map(row => row.node.id), expanded: api.getState().expanded };
  }, view);
  expect(result.hidden).toEqual(["a", "m"]); expect(result.final).toEqual(["a", "m", "z", "zc"]);
  expect(result.expanded).toContainEqual(["z"]);
});

test("nested inline children use the global sibling order and stable ties", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = api.element; api.destroy(); data.roots = [{ id: "parent", label: "Parent", children: [
      { id: "z", label: "Zulu" }, { id: "m", label: "Mike" }, { id: "a1", label: "Alpha" }, { id: "a2", label: "Alpha" }] }];
    window.api = CanopyX.createTreeGrid(host, { view: data }); await api.ready; api.sort("name", "asc");
    await api.expandPath(["parent"], { expandLast: true }); const first = api.visibleRows().map(row => row.node.id);
    await api.loadMore("parent"); api.sort("name", "desc"); return { first, descending: api.visibleRows().map(row => row.node.id) };
  }, view);
  expect(result).toEqual({ first: ["parent", "a1", "a2"], descending: ["parent", "z", "m", "a1", "a2"] });
});

test("retained node memory can discard unpinned pages while preserving a selected identity", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = api.element; api.destroy(); data.pageSize = 20;
    data.columns = Array.from({ length: 10 }, (_, index) => ({ id: "c" + index, title: "Column " + index, width: 100, kind: "number", sortable: true }));
    data.roots = Array.from({ length: 400 }, (_, index) => ({ id: "n" + index, label: "Node " + index,
      cells: Object.fromEntries(Array.from({ length: 10 }, (_, column) => ["c" + column, (index - column * 40 + 400) % 400])) }));
    window.api = CanopyX.createTreeGrid(host, { view: data, retainedNodeLimit: 0 }); await api.ready; api.setSelection(["n0"]);
    for (let column = 1; column < 10; column++) api.sort("c" + column, "asc");
    const preserved = api.getSelected().map(node => node.id); api.selectAll({ scope: "loaded" });
    return { preserved, loaded: api.getSelected().map(node => node.id), visible: api.visibleRows().map(row => row.node.id) };
  }, view);
  expect(result.preserved).toEqual(["n0"]); expect(result.loaded).toHaveLength(21);
  expect(result.visible).toEqual(Array.from({ length: 20 }, (_, index) => "n" + (360 + index)));
  expect(result.loaded).toContain("n0");
});

test("reload updates and then removes an identity retained outside the sorted prefix", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    api.setSelection(["z"]); api.sort("name", "asc");
    api.view.roots = api.view.roots.map(node => node.id === "z" ? { ...node, label: "Zulu changed" } : node);
    await api.reload(); const changed = api.getSelected().map(node => node.label);
    api.view.roots = api.view.roots.filter(node => node.id !== "z"); await api.reload();
    return { changed, selected: api.getSelected().map(node => node.id), visible: api.visibleRows().map(row => row.node.id) };
  });
  expect(result).toEqual({ changed: ["Zulu changed"], selected: [], visible: ["a", "m"] });
});

test("a child can move out of a retained branch without duplicating its identity or selection", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = api.element; api.destroy(); data.roots[0].children = [{ id: "child", label: "Child" }];
    window.api = CanopyX.createTreeGrid(host, { view: data }); await api.ready; await api.expandPath(["z", "child"]);
    api.sort("name", "asc"); api.view.roots = api.view.roots.map(node => node.id === "z" ? { id: "z", label: "Zulu" } :
      node.id === "a" ? { ...node, children: [{ id: "child", label: "Moved child" }] } : node);
    await api.reload(); await api.expandPath(["a"], { expandLast: true, select: false });
    return { selected: api.getSelected().map(node => node.id), paths: api.getState().selection,
      children: api.visibleRows().filter(row => row.node.id === "child").map(row => row.path) };
  }, view);
  expect(result).toEqual({ selected: ["child"], paths: [["a", "child"]], children: [["a", "child"]] });
});

test("count cell updates rebuild the complete inline sibling order", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    api.sort("name", "asc"); api.applyCounts({ protocol: "canopyx/2", type: "counts", items: [{ id: "z", cells: { name: "Aaron" } }] });
    return api.visibleRows().map(row => row.node.id);
  });
  expect(result).toEqual(["z", "a"]);
});
