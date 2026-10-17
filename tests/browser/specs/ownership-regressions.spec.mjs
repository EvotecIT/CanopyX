import { expect, test } from "@playwright/test";
import path from "node:path";
import { nextFrames, repo, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "ownership", label: "Ownership", rowHeight: 28,
  columns: [{ id: "name", title: "Name", width: 300, fixed: true }], source: { kind: "inline" }, roots: [] };
async function open(page, data = view) {
  await page.route("https://canopyx.test/", r => r.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/"); await page.waitForSelector("[data-cx-ready]");
}
test.beforeEach(({ page }) => { page.runtimeErrors = []; page.on("pageerror", e => page.runtimeErrors.push(e.message)); });
test.afterEach(({ page }) => { expect(page.runtimeErrors).toEqual([]); });

for (const shared of [false, true]) {
  test(`the latest restoration owns ${shared ? "a shared pending page" : "an earlier slow restoration"}`, async ({ page }) => {
    await open(page);
    await page.evaluate(async () => {
      const host = document.querySelector(".cx-host"); host.canopyx.destroy();
      window.api = CanopyX.createTreeGrid(host, { view: { ...viewForTest(), roots: [] }, source: { page: async node => {
        if (!node) return { items: [{ id: "a", label: "A", hasChildren: true },
          { id: "b", label: "B", children: [{ id: "b-leaf", label: "B leaf" }] }] };
        return new Promise(resolve => { window.finish = resolve; });
      } } }); await api.ready;
      function viewForTest() { return { protocol: "canopyx/2", type: "view", id: "restore", label: "Restore",
        columns: [{ id: "name", title: "Name", width: 300 }], source: { kind: "inline" } }; }
      window.oldRestore = api.setState({ expanded: [["a", "old"]] });
    });
    await page.waitForFunction(() => !!window.finish);
    await page.evaluate(shared => { window.newRestore = api.setState({ expanded: [shared ? ["a", "new"] : ["b"]] }); }, shared);
    await page.evaluate(async () => {
      finish({ items: [{ id: "old", label: "Old", children: [{ id: "old-leaf", label: "Old leaf" }] },
        { id: "new", label: "New", children: [{ id: "new-leaf", label: "New leaf" }] },
        { id: "default", label: "Default", expanded: true, children: [{ id: "default-leaf", label: "Default leaf" }] }] });
      await Promise.all([oldRestore, newRestore]);
    });
    const state = await page.evaluate(() => api.getState());
    expect(state.expanded).toEqual(shared ? [["a"], ["a", "new"]] : [["b"]]);
    if (!shared) await page.evaluate(() => api.expandPath(["a"], { expandLast: true, select: false, focus: false }));
    await nextFrames(page);
    await expect(page.locator('[data-cx-id="old-leaf"]')).toHaveCount(0);
    await expect(page.locator('[data-cx-id="default-leaf"]')).toHaveCount(0);
  });
}

test("a page already in flight cannot reapply declarative expansion after a new restoration", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view; host.canopyx.destroy();
    let finish; const api = CanopyX.createTreeGrid(host, { view: data, source: { page: () => new Promise(resolve => { finish = resolve; }) } });
    await api.setState({ expanded: [] });
    finish({ items: [{ id: "default", label: "Default", expanded: true, children: [{ id: "leaf", label: "Leaf" }] }] });
    await api.ready;
    return { state: api.getState(), ids: api.visibleRows().map(r => r.node.id) };
  });
  expect(result.state.expanded).toEqual([]); expect(result.ids).toEqual(["default"]);
});

for (const ending of ["pointercancel", "blur", "destroy"]) {
  test(`resize listeners stop after ${ending}`, async ({ page }) => {
    await open(page, { ...view, roots: [{ id: "one", label: "One" }] });
    const widths = await page.evaluate(ending => {
      const host = document.querySelector(".cx-host"), header = host.querySelector(".cx-hcell"), grip = host.querySelector(".cx-resize");
      const pointer = (target, type, x, id = 7) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, button: 0, clientX: x }));
      pointer(grip, "pointerdown", 100); pointer(window, "pointermove", 130);
      const during = header.style.width;
      if (ending === "destroy") host.canopyx.destroy();
      else if (ending === "blur") window.dispatchEvent(new Event("blur"));
      else pointer(window, ending, 130);
      pointer(window, "pointermove", 180);
      return { during, after: header.style.width };
    }, ending);
    expect(widths).toEqual({ during: "330px", after: "330px" });
    if (ending === "pointercancel") { await nextFrames(page); await page.screenshot({ path: path.join(repo, "artifacts/takeover/seventh-resize-cancel.png") }); }
  });
}

test("resizing belongs to one pointer and a new drag replaces the old one", async ({ page }) => {
  await open(page, { ...view, roots: [{ id: "one", label: "One" }] });
  const result = await page.evaluate(() => {
    const grip = document.querySelector(".cx-resize"), header = document.querySelector(".cx-hcell");
    const send = (target, type, id, x) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, button: 0, clientX: x }));
    send(grip, "pointerdown", 1, 100); send(window, "pointermove", 2, 150);
    const unrelated = header.style.width;
    send(grip, "pointerdown", 2, 100); send(window, "pointermove", 1, 160);
    const replaced = header.style.width;
    send(window, "pointermove", 2, 120); send(window, "pointerup", 2, 120);
    send(window, "pointermove", 2, 180);
    return { unrelated, replaced, final: header.style.width };
  });
  expect(result).toEqual({ unrelated: "300px", replaced: "300px", final: "320px" });
});

for (const source of ["remote", "sidecar"]) for (const nested of [false, true]) for (const wrong of [false, true]) {
  test(`${source} ${wrong ? "rejects foreign" : "accepts matching"} ${nested ? "parent" : "root"} pages`, async ({ page }) => {
    const data = { ...view, source: source === "remote" ? { kind: source, children: "https://canopyx.test/page?ref={ref}" } :
      { kind: source, base: "https://canopyx.test/data/" } };
    const parent = { id: "parent", label: "Parent", ref: "page", hasChildren: true, expanded: true };
    await page.route("https://canopyx.test/page?*", route => {
      const child = new URL(route.request().url()).searchParams.get("ref");
      const doc = { protocol: "canopyx/2", type: "page", parent: nested && !child ? null : wrong ? "wrong" : nested ? "parent" : null,
        offset: 0, total: 1, items: nested && !child ? [parent] : [{ id: "foreign", label: "Foreign" }], next: null };
      return route.fulfill({ json: doc });
    });
    await page.route("https://canopyx.test/data/**", route => {
      const ref = new URL(route.request().url()).pathname.slice("/data/".length).replace(/\.js$/, "");
      const doc = ref === "manifest" ? { protocol: "canopyx/2", type: "manifest", view: data.id, root: "r/0" } :
        { protocol: "canopyx/2", type: "page", parent: nested && ref === "r/0" ? null : wrong ? "wrong" : nested ? "parent" : null,
          offset: 0, total: 1, items: nested && ref === "r/0" ? [parent] : [{ id: "foreign", label: "Foreign" }], next: null };
      return route.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify([data.id, ref, doc])});` });
    });
    await open(page, data); await nextFrames(page);
    await expect(page.locator('[data-cx-id="foreign"]')).toHaveCount(wrong ? 0 : 1);
    await expect(page.locator('[data-cx-status="error"]')).toHaveCount(wrong ? 1 : 0);
    if (source === "remote" && nested && wrong) await page.screenshot({ path: path.join(repo, "artifacts/takeover/seventh-page-ownership.png") });
  });
}

test("browser dates retain the protocol's four-digit early years and explicit text", async ({ page }) => {
  await open(page, { ...view, columns: [{ id: "name", title: "Name", width: 300 }, { id: "date", title: "Date", width: 200, kind: "datetime" }],
    roots: ["0001", "0099", "0999", "2026"].map(year => ({ id: year, label: year, cells: { date: { value: year + "-01-02T00:00:00Z" } } }))
      .concat([{ id: "override", label: "Override", cells: { date: { value: "0001-01-02T00:00:00Z", text: "Unknown" } } }]) });
  for (const year of ["0001", "0099", "0999", "2026"]) {
    await expect(page.locator(`[data-cx-id="${year}"]`)).toContainText(year + "-01-02 00:00 UTC");
  }
  await expect(page.locator('[data-cx-id="override"]')).toContainText("Unknown");
  await page.screenshot({ path: path.join(repo, "artifacts/takeover/seventh-datetime.png") });
});
