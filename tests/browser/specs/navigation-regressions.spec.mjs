import { expect, test } from "@playwright/test";
import path from "node:path";
import { nextFrames, repo, viewPage } from "./support.mjs";
const view = { protocol: "canopyx/1", type: "view", id: "navigation", label: "Navigation", rowHeight: 28, pageSize: 100,
  columns: [{ id: "name", title: "Name", width: 300, sortable: true }], source: { kind: "inline" }, roots: [] };
async function open(page) {
  await page.route("https://canopyx.test/", r => r.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/"); await page.waitForSelector("[data-cx-ready]");
}
test("a 10000-level inline tree supports mounting, filtering, sorting, search, state, and outline", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message)); await open(page);
  const result = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    const data = { ...host.canopyx.view, roots: [] };
    let node = { id: "n0", label: "Root", expanded: true }; data.roots.push(node);
    for (let i = 1; i < 10000; i++) {
      const child = { id: "n" + i, label: i === 9999 ? "Unique target" : "Branch", expanded: true };
      node.children = [child]; node = child;
    }
    const api = CanopyX.createTreeGrid(host, { view: data }); await api.ready;
    api.setFilter(node => node.id === "n9999", { autoExpand: true }); api.sort("name", "asc");
    const hits = await api.search("Unique target", 20);
    return { hitDepth: hits.hits[0].path.length, expanded: api.getState().expanded.length,
      outlineRows: (api.toOutline().match(/<tr>/g) || []).length };
  });
  expect(result).toEqual({ hitDepth: 10000, expanded: 9999, outlineRows: 10001 });
  await expect(page.getByRole("treegrid")).toHaveAttribute("aria-rowcount", "10001"); expect(errors).toEqual([]);
});
for (const outcome of ["error", "continue", "end"]) for (const moved of [false, true]) {
  test(`show-more settles ${outcome} with ${moved ? "toolbar" : "row"} focus after a long request`, async ({ page }) => {
    await open(page);
    await page.evaluate(async () => {
      const host = document.querySelector(".cx-host"); const data = host.canopyx.view; host.canopyx.destroy(); let calls = 0;
      const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async () => {
        if (++calls === 1) return { items: [{ id: "existing", label: "Existing" }], next: "second" };
        return new Promise((resolve, reject) => { window.finishPage = resolve; window.failPage = reject; });
      } } }); await api.ready;
    });
    await page.locator("[data-cx-status=more]").focus(); await page.keyboard.press("Enter");
    await page.waitForFunction(() => !!window.finishPage); await nextFrames(page);
    const toolbar = page.getByRole("button", { name: "Name", exact: true }); if (moved) await toolbar.focus();
    await page.evaluate(outcome => {
      if (outcome === "error") window.failPage(new Error("Temporary failure"));
      else window.finishPage({ items: [], next: outcome === "continue" ? "third" : null });
    }, outcome); await nextFrames(page);
    await expect(moved ? toolbar : outcome === "end" ? page.locator('[data-cx-id="existing"]') :
      page.locator(`[data-cx-status=${outcome === "error" ? "error" : "more"}]`)).toBeFocused();
    if (outcome === "error" && !moved) await page.screenshot({ path: path.join(repo, "artifacts/takeover/paging-error-focus.png") });
  });
}
test("a newer search selection retains ownership when the older path finishes later", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message)); await open(page);
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"); const data = { ...host.canopyx.view, search: { minLength: 2, maxResults: 20 } }; host.canopyx.destroy();
    const api = CanopyX.createTreeGrid(host, { view: data, source: { canSearch: true,
      page: async node => !node ? { items: [{ id: "a", label: "Slow parent", hasChildren: true, childCount: 1 }, { id: "b", label: "Latest hit" }] } :
        new Promise(resolve => { window.finishOlderPath = resolve; }),
      search: async query => ({ hits: query === "older" ? [{ path: ["a", "old"], label: "Older hit" }] : [{ path: ["b"], label: "Latest hit" }] })
    } }); await api.ready;
  });
  const input = page.getByRole("combobox"); await input.fill("older"); await page.getByRole("option", { name: "Older hit" }).click();
  await page.waitForFunction(() => !!window.finishOlderPath);
  await input.fill("latest"); await page.getByRole("option", { name: "Latest hit" }).click();
  await expect(page.locator('[data-cx-id="b"]')).toBeFocused();
  await page.evaluate(() => window.finishOlderPath({ items: [{ id: "old", label: "Older hit" }] })); await nextFrames(page);
  await expect(page.locator('[data-cx-id="b"]')).toBeFocused();
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.getSelected().map(n => n.id))).toEqual(["b"]);
  expect(errors).toEqual([]); await page.screenshot({ path: path.join(repo, "artifacts/takeover/search-newer-focus.png") });
});
