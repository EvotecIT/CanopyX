import { expect, test } from "@playwright/test";
import { viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "inline-lifecycle", label: "Records", pageSize: 2,
  selection: "multiple", source: { kind: "inline" }, columns: [{ id: "name", title: "Name", width: 300, sortable: true }],
  roots: [{ id: "z", label: "Zulu" }, { id: "m", label: "Mike" }, { id: "a", label: "Alpha" }] };
async function open(page) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/"); await page.waitForSelector("[data-cx-ready]");
}

for (const operation of ["sort", "page"]) {
  test(`inline ${operation} preserves an outstanding count update for a surviving identity`, async ({ page }) => {
    await open(page);
    const cells = await page.evaluate(async ({ data, operation }) => {
      const host = document.querySelector(".cx-host"); host.canopyx.destroy();
      let resolve;
      const api = CanopyX.createTreeGrid(host, { view: data, source: {
        page: async () => ({ items: [{ id: "parent", label: "Parent", expanded: true, children: data.roots }], next: null }),
        counts: () => new Promise(done => { resolve = done; })
      } }); await api.ready;
      api.setSelection(["m"]); const pending = api.refreshCounts(["m"]);
      if (operation === "sort") api.sort("name", "asc"); else await api.loadMore("parent");
      resolve({ protocol: "canopyx/2", type: "counts", items: [{ id: "m", cells: { name: "Updated" } }] });
      await pending; return api.getSelected()[0].cells;
    }, { data: view, operation });
    expect(cells).toEqual({ name: "Updated" });
  });
}

for (const nested of [false, true]) {
  test(`saved focus reattaches a retained ${nested ? "ancestor" : "row"} before restoration`, async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async ({ data, nested }) => {
      const host = document.querySelector(".cx-host"); host.canopyx.destroy();
      if (nested) data.roots[0].children = [{ id: "zc", label: "Child" }];
      let api = CanopyX.createTreeGrid(host, { view: data }); await api.ready;
      api.sort("name", "asc"); await api.expandPath(nested ? ["z", "zc"] : ["z"], { select: false });
      const saved = api.getState(); api.destroy();
      api = CanopyX.createTreeGrid(host, { view: data }); await api.ready; await api.setState(saved);
      return { focus: api.getState().focus, visible: api.visibleRows().map(row => row.node.id) };
    }, { data: view, nested });
    expect(result.focus).toEqual(nested ? ["z", "zc"] : ["z"]);
    expect(result.visible).toContain(nested ? "zc" : "z");
  });
}

test("a saved scroll anchor pages to a retained row without requiring saved focus", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    data.roots = [{ id: "z", label: "Zulu" }].concat(Array.from({ length: 49 }, (_, i) => ({ id: "a" + i, label: "Alpha " + i })));
    const api = CanopyX.createTreeGrid(host, { view: data }); await api.ready;
    const state = api.getState(); state.sort = { column: "name", direction: "asc" }; state.focus = null;
    state.anchor = { path: ["z"], offset: 0 }; await api.setState(state);
    return { ids: api.visibleRows().map(row => row.node.id), top: host.querySelector(".cx-grid").scrollTop };
  }, view);
  expect(result.ids).toContain("z"); expect(result.top).toBeGreaterThan(0);
});

for (const nested of [false, true]) {
  test(`restoring expansion suppresses unrelated inline defaults on ${nested ? "child" : "root"} continuations`, async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async ({ data, nested }) => {
      const host = document.querySelector(".cx-host"); host.canopyx.destroy();
      const children = [{ id: "a", label: "A" }, { id: "b", label: "B" },
        { id: "target", label: "Target", children: [{ id: "tc", label: "Target child" }] },
        { id: "other", label: "Other", expanded: true, children: [{ id: "oc", label: "Other child" }] }];
      data.roots = nested ? [{ id: "parent", label: "Parent", children }] : children;
      const api = CanopyX.createTreeGrid(host, { view: data }); await api.ready;
      await api.setState({ expanded: [nested ? ["parent", "target"] : ["target"]] });
      return { expanded: api.getState().expanded, ids: api.visibleRows().map(row => row.node.id) };
    }, { data: view, nested });
    expect(result.expanded).toEqual(nested ? [["parent"], ["parent", "target"]] : [["target"]]);
    expect(result.ids).toContain("tc"); expect(result.ids).not.toContain("oc");
  });
}

test("restoration suppresses lazy defaults first reached in an inline continuation of a custom tree", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); const calls = [];
    const parent = { id: "parent", label: "Parent", expanded: true, children: [
      { id: "a", label: "A" }, { id: "b", label: "B" },
      { id: "target", label: "Target", children: [{ id: "tc", label: "Child" }] },
      { id: "lazy", label: "Lazy", expanded: true, hasChildren: true }] };
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      calls.push(node && node.id); return { items: node ? [{ id: "lc", label: "Lazy child" }] : [parent], next: null };
    } } }); await api.ready; await api.setState({ expanded: [["parent", "target"]] });
    return { expanded: api.getState().expanded, calls };
  }, view);
  expect(result.expanded).toEqual([["parent"], ["parent", "target"]]); expect(result.calls).toEqual([null]);
});

test("saved paths keep embedded null characters distinct from ancestor separators", async ({ page }) => {
  await open(page);
  const selected = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    data.roots = [{ id: "a\u0000b", label: "Parent", expanded: true, children: [{ id: "c", label: "Child" }] }];
    const api = CanopyX.createTreeGrid(host, { view: data }); await api.ready;
    const state = api.getState(); state.selection = [["a", "b", "c"]]; await api.setState(state);
    return api.getSelected().map(node => node.id);
  }, view);
  expect(selected).toEqual([]);
});

for (const invalid of ["duplicate", "label"]) {
test(`reload validates a retained inline replacement with an invalid ${invalid}`, async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async ({ data, invalid }) => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    const parent = { id: "parent", label: "Parent", expanded: true, children: data.roots };
    const outside = { id: "outside", label: "Outside" };
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async () => ({ items: [parent, outside], next: null }) } });
    await api.ready; api.setSelection(["z", "outside"]); const before = api.getSelected(); api.sort("name", "asc");
    parent.children = parent.children.map(node => node.id === "z" ? invalid === "duplicate" ?
      { ...node, children: [{ id: "outside", label: "Duplicate" }] } : { ...node, label: 12 } : node);
    let error = null; try { await api.reload("parent"); } catch (failure) { error = failure.message; }
    const after = api.getSelected(); api.setSelection(["outside"]);
    return { error, unchanged: after.every((node, i) => node === before[i]), outside: api.getSelected()[0].label };
  }, { data: view, invalid });
  expect(result.error).toContain(invalid === "duplicate" ? "duplicate node ID outside" : "node label must be a string");
  expect(result.unchanged).toBe(true); expect(result.outside).toBe("Outside");
});
}
