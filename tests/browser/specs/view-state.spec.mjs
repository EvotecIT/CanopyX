import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "state", label: "Records", stateKey: "view-state", pageSize: 200,
  selection: "multiple", source: { kind: "inline" }, columns: [{ id: "name", title: "Name", width: 300 }, { id: "size", title: "Size", width: 120 }],
  filters: [{ id: "marked", label: "Marked", flag: "marked" }],
  roots: [{ id: "parent", label: "Parent", flags: ["marked"], children: [{ id: "child", label: "Child" }] },
    ...Array.from({ length: 150 }, (_, i) => ({ id: "n" + i, label: "Node " + i, flags: ["marked"] }))] };
async function open(page) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/"); await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => { window.api = document.querySelector(".cx-host").canopyx; });
}

test("a JSON snapshot restores columns, sort, filters, selection, expansion, timezone, focus and scroll", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    await api.expandPath(["parent"], { expandLast: true }); api.setSelection(["n60"]);
    api.setColumnWidth("name", 450); api.setColumnVisible("size", false); api.setTreeColumnPinned(true);
    api.sort("name", "desc"); api.setActiveFilters(["marked"]); api.setTimeZone("local");
    await api.expandPath(["n60"], { select: false });
  }); await nextFrames(page);
  const result = await page.evaluate(async () => {
    const saved = JSON.parse(JSON.stringify(api.getState())), host = api.element, data = api.view;
    api.destroy(); sessionStorage.removeItem("canopyx:view-state");
    window.api = CanopyX.createTreeGrid(host, { view: data }); await api.ready;
    const accepted = await api.setState(saved);
    return { accepted, saved, after: api.getState(), scroll: document.querySelector(".cx-grid").scrollTop };
  });
  expect(result.accepted).toBe(true); expect(result.after).toEqual(result.saved);
  await expect(page.locator('[data-cx-id="n60"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-cx-filter="marked"]')).toBeChecked();
  await expect(page.locator('[data-cx-column="size"]')).not.toBeChecked();
  await expect(page.locator('.cx-head [data-cx-column="size"]')).toHaveCount(0);
  expect(result.scroll).toBeGreaterThan(0);
});

test("invalid and unsupported snapshots leave every current field intact", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    api.setSelection(["parent"]); const before = api.getState(), decisions = [];
    const invalid = [ { version: 2 }, { timeZone: "Mars" }, { sort: { column: "name", direction: "sideways" } },
      { selection: [[""]] }, { columns: [{ id: "name", width: 300, hidden: true }] },
      { anchor: { path: ["n1"], offset: -1 } }, { focus: [] } ];
    for (const fields of invalid) decisions.push(await api.setState({ ...before, ...fields }));
    return { decisions, before, after: api.getState() };
  });
  expect(result.decisions).toEqual(Array(7).fill(false)); expect(result.after).toEqual(result.before);
});

test("legacy expansion-only snapshots retain other view settings", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    api.setColumnWidth("name", 400); api.setSelection(["child"]); api.setTimeZone("local");
    await api.setState({ expanded: [["parent"]] });
    const snapshot = api.getState(); await api.setState({ expanded: [] });
    return { snapshot, collapsed: api.getState() };
  });
  expect(result.snapshot.version).toBe(1); expect(result.snapshot.expanded).toEqual([["parent"]]);
  expect(result.collapsed.expanded).toEqual([]); expect(result.collapsed.columns[0].width).toBe(400);
  expect(result.collapsed.timeZone).toBe("local"); expect(result.collapsed.selection).toEqual([["parent", "child"]]);
});

test("a hidden lazy selection restores without leaving its branch open or taking toolbar focus", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = api.element, data = api.view; api.destroy(); sessionStorage.removeItem("canopyx:view-state");
    const source = { page: async node => ({ items: node ? [{ id: "child", label: "Child" }] :
      [{ id: "parent", label: "Parent", hasChildren: true }], next: null }) };
    window.api = CanopyX.createTreeGrid(host, { view: data, source }); await api.ready;
    await api.expandPath(["parent", "child"]); await api.setState({ expanded: [] });
    const saved = api.getState(); api.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, source }); await api.ready;
    document.querySelector('.cx-toolbar input').focus(); const element = document.activeElement;
    await api.setState(saved);
    return { selected: api.getSelected().map(n => n.id), expanded: api.getState().expanded,
      visible: api.visibleRows().map(r => r.node.id), sameFocus: document.activeElement === element };
  });
  expect(result).toEqual({ selected: ["child"], expanded: [], visible: ["parent"], sameFocus: true });
});

test("session state remembers presentation and selection without an expansion change", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { api.setColumnWidth("name", 410); api.setColumnVisible("size", false); api.sort("name", "desc");
    api.setActiveFilters(["marked"]); api.setTimeZone("local"); api.setSelection(["n1"]); });
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("canopyx:view-state") || "null")?.version)).toBe(1);
  const result = await page.evaluate(() => JSON.parse(sessionStorage.getItem("canopyx:view-state")));
  expect(result.columns[0].width).toBe(410); expect(result.columns[1].hidden).toBe(true);
  expect(result.sort).toEqual({ column: "name", direction: "desc" }); expect(result.filters).toEqual(["marked"]);
  expect(result.timeZone).toBe("local"); expect(result.selection).toEqual([["n1"]]);
});

test("the newest snapshot owns selection after a stalled older path", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = api.element, data = api.view; api.destroy(); sessionStorage.removeItem("canopyx:view-state");
    let finish;
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => node ?
      new Promise(resolve => { finish = resolve; }) : { items: [{ id: "slow", label: "Slow", hasChildren: true }, { id: "new", label: "New" }], next: null } } });
    await api.ready; const saved = api.getState();
    const older = api.setState({ ...saved, selection: [["slow", "old"]] });
    while (!finish) await new Promise(resolve => setTimeout(resolve, 0));
    const newer = api.setState({ ...saved, selection: [["new"]] });
    await newer; const decision = await Promise.race([older, new Promise(resolve => setTimeout(() => resolve("hung"), 100))]);
    finish({ items: [{ id: "old", label: "Old" }], next: null }); await new Promise(resolve => setTimeout(resolve, 0));
    return { decision, ids: api.getSelected().map(n => n.id), expanded: api.getState().expanded };
  });
  expect(result).toEqual({ decision: false, ids: ["new"], expanded: [] });
});

test("obsolete column and filter IDs are skipped while valid snapshot settings survive", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const saved = api.getState(); saved.columns.push({ id: "removed", width: 200, hidden: false });
    saved.filters = ["removed", "marked"]; saved.sort = { column: "removed", direction: "asc" };
    await api.setState(saved); return { filters: api.getActiveFilters(), sort: api.getState().sort };
  });
  expect(result).toEqual({ filters: ["marked"], sort: null });
});
