import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "reload", label: "Records", pageSize: 2, selection: "multiple",
  source: { kind: "inline" }, columns: [{ id: "name", title: "Name", width: 300 }], roots: [] };
async function open(page) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/"); await page.waitForSelector("[data-cx-ready]");
}

test("same-count child replacement preserves surviving identity, expansion, selection and focus", async ({ page }) => {
  await open(page);
  await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); window.revision = 0;
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => node ? {
      items: revision ? [{ id: "keep", label: "Changed", children: [{ id: "grandchild", label: "Grandchild" }] }, { id: "new", label: "New" }] :
        [{ id: "keep", label: "Original", children: [{ id: "grandchild", label: "Grandchild" }] }, { id: "old", label: "Old" }], total: 2, next: null
    } : { items: [{ id: "parent", label: "Parent", hasChildren: true }], next: null } } });
    await api.ready; await api.expandPath(["parent", "keep"], { expandLast: true });
    api.setSelection(["keep", "old"]); revision = 1;
  }, view);
  await nextFrames(page); await page.locator('[data-cx-id="keep"]').focus();
  expect(await page.evaluate(() => api.reload("parent"))).toBe(true);
  await expect(page.locator('[data-cx-id="keep"]')).toContainText("Changed");
  await expect(page.locator('[data-cx-id="keep"]')).toBeFocused();
  await expect(page.locator('[data-cx-id="grandchild"]')).toBeVisible();
  await expect(page.locator('[data-cx-id="old"]')).toHaveCount(0);
  expect(await page.evaluate(() => api.getSelected().map(n => [n.id, n.label]))).toEqual([["keep", "Changed"]]);
});

test("a reload reads the loaded range and continues from the replacement cursor", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); let changed = false; const calls = [];
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async (_, cursor) => {
      calls.push([changed, cursor]); const offset = cursor ? Number(cursor) : 0;
      return { items: [0, 1].map(i => ({ id: "n" + (i + offset), label: (changed ? "New " : "Old ") + (i + offset) })),
        total: 6, offset, next: offset < 4 ? String(offset + 2) : null };
    } } }); await api.ready; await api.loadMore(null); api.setSelection(["n3"]); changed = true;
    await api.reload(); const after = api.visibleRows().map(r => r.node.label); await api.loadMore(null);
    return { calls, after, count: api.visibleRows().length, selected: api.getSelected()[0].label };
  }, view);
  expect(result).toEqual({ calls: [[false, null], [false, "2"], [true, null], [true, "2"], [true, "4"]],
    after: ["New 0", "New 1", "New 2", "New 3"], count: 6, selected: "New 3" });
});

test("invalid reload pages cannot partially replace data or selection", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); let bad = false;
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async (_, cursor) => {
      if (!bad) return { items: [{ id: "old", label: "Original" }], next: null };
      return cursor ? { items: [{ id: "new", label: "Duplicate" }], offset: 1, next: null } :
        { items: [{ id: "new", label: "New" }], next: "next" };
    } } }); await api.ready; api.setSelection(["old"]); bad = true;
    let error; try { await api.reload(); } catch (e) { error = e.message; }
    return { error, ids: api.visibleRows().map(r => r.node.id), selected: api.getSelected().map(n => n.id) };
  }, view);
  expect(result.error).toContain("duplicate"); expect(result.ids).toEqual(["old"]); expect(result.selected).toEqual(["old"]);
});

test("a newer reload promptly supersedes a stalled custom request and discards its eventual result", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); let calls = 0, finish;
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async () => {
      if (++calls === 2) return new Promise(resolve => { finish = resolve; });
      return { items: [{ id: "keep", label: calls === 1 ? "Original" : "Newest" }], next: null };
    } } }); await api.ready; const older = api.reload(); const newer = await api.reload();
    const stale = await Promise.race([older, new Promise(resolve => setTimeout(() => resolve("hung"), 100))]);
    finish({ items: [{ id: "old", label: "Stale" }], next: null }); await new Promise(resolve => setTimeout(resolve, 0));
    return { newer, stale, labels: api.visibleRows().map(r => r.node.label) };
  }, view);
  expect(result).toEqual({ newer: true, stale: false, labels: ["Newest"] });
});

for (const cancel of ["signal", "destroy"]) test(cancel + " settles a stalled reload without replacing data", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async ({ data, cancel }) => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); let calls = 0;
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async () => ++calls === 1 ?
      { items: [{ id: "keep", label: "Original" }], next: null } : new Promise(() => {}) } });
    await api.ready; const controller = new AbortController(); const pending = api.reload(null, { signal: controller.signal });
    if (cancel === "signal") controller.abort(); else api.destroy();
    return Promise.race([pending, new Promise(resolve => setTimeout(() => resolve("hung"), 100))]);
  }, { data: view, cancel });
  expect(result).toBe(false);
});

test("reload discards an older continuation and permits a fresh one", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy(); let calls = 0, finish;
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async (_, cursor) => {
      if (++calls === 2) return new Promise(resolve => { finish = resolve; });
      return cursor ? { items: [{ id: "new", label: "New" }], next: null, offset: 1 } :
        { items: [{ id: "keep", label: "Keep" }], next: "next" };
    } } }); await api.ready; const old = api.loadMore(); await api.reload();
    finish({ items: [{ id: "stale", label: "Stale" }], next: null, offset: 1 }); await old;
    await api.loadMore(); return api.visibleRows().map(r => r.node.id);
  }, view);
  expect(result).toEqual(["keep", "new"]);
});

test("inline reload rereads replacements and keeps scroll anchored to a surviving row", async ({ page }) => {
  await open(page);
  await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    data.pageSize = 200; data.roots = Array.from({ length: 150 }, (_, i) => ({ id: "n" + i, label: "Node " + i }));
    window.api = CanopyX.createTreeGrid(host, { view: data }); await api.ready;
  }, view); await nextFrames(page);
  await page.evaluate(() => { document.querySelector(".cx-grid").scrollTop = 60 * 28 + 7; }); await nextFrames(page);
  const result = await page.evaluate(async () => {
    const grid = document.querySelector(".cx-grid"), before = grid.scrollTop;
    api.view.roots.unshift({ id: "inserted", label: "Inserted" }); await api.reload();
    return { before, after: grid.scrollTop };
  });
  expect(result.after).toBe(result.before + 28);
});

test("reload detects in-place payload edits and preserves an unchanged host control", async ({ page }) => {
  await open(page);
  await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    data.roots = [{ id: "changed", label: "Original" }, { id: "control", label: "Control" }];
    window.api = CanopyX.createTreeGrid(host, { view: data, renderers: { name: (node, element) => {
      if (node.id !== "control") return false;
      const input = document.createElement("input"); input.value = "Original value"; element.append(input); return true;
    } } }); await api.ready;
  }, view); await nextFrames(page);
  await page.locator('[data-cx-id="control"] input').fill("User edit");
  await page.evaluate(async () => { window.control = document.querySelector('[data-cx-id="control"] input');
    api.view.roots[0].label = "Changed in place"; api.view.roots[0].cells = { name: "Changed cell" };
    await api.reload(); }); await nextFrames(page);
  await expect(page.locator('[data-cx-id="changed"]')).toContainText("Changed cell");
  await expect(page.locator('[data-cx-id="control"] input')).toHaveValue("User edit");
  expect(await page.evaluate(() => document.querySelector('[data-cx-id="control"] input') === control)).toBe(true);
});
