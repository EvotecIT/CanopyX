import { expect, test } from "@playwright/test";
import path from "node:path";
import { nextFrames, repo, viewPage } from "./support.mjs";
const view = { protocol: "canopyx/2", type: "view", id: "host-paging", label: "Host paging", rowHeight: 28,
  columns: [{ id: "name", title: "Name", width: 300 }, { id: "controls", title: "Controls", width: 350 }],
  source: { kind: "inline" }, roots: [] };
test.beforeEach(({ page }) => {
  page.runtimeErrors = []; page.on("pageerror", error => page.runtimeErrors.push(error.message));
});
test.afterEach(({ page }) => { expect(page.runtimeErrors).toEqual([]); });
async function open(page) {
  await page.route("https://canopyx.test/", r => r.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/"); await page.waitForSelector("[data-cx-ready]");
}

test("a focused continuation becomes the sole loading row until its request settles", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view; host.canopyx.destroy();
    let calls = 0;
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async () => {
      if (++calls === 1) return { items: [{ id: "first", label: "First" }], next: "second" };
      return new Promise(resolve => { window.finishPage = resolve; });
    } } }); window.pagingApi = api; await api.ready;
  });
  await page.locator("[data-cx-status=more]").focus(); await page.keyboard.press("Enter");
  await page.waitForFunction(() => !!window.finishPage); await nextFrames(page);
  await expect(page.locator("[data-cx-status]")).toHaveCount(1);
  await expect(page.locator("[data-cx-status=loading]")).toBeFocused();
  await page.evaluate(() => { window.repeatedPage = window.pagingApi.loadMore(); }); await nextFrames(page);
  await expect(page.locator("[data-cx-status=loading]")).toBeFocused();
  await expect(page.locator(".cx-row[tabindex='0']")).toHaveCount(1);
  const indexes = await page.locator(".cx-row").evaluateAll(rows => rows.map(r => r.getAttribute("aria-rowindex")));
  expect(new Set(indexes).size).toBe(indexes.length);
  await page.screenshot({ path: path.join(repo, "artifacts/takeover/sixth-loading-focus.png") });
  await page.evaluate(() => window.finishPage({ items: [{ id: "second", label: "Second" }], next: null }));
  await expect(page.locator('[data-cx-id="second"]')).toBeFocused();
  await expect(page.locator("[data-cx-status]")).toHaveCount(0);
});

for (const nested of [false, true]) {
  test(`restoration suppresses new inline and lazy defaults on ${nested ? "child" : "root"} continuation pages`, async ({ page }) => {
    await open(page);
    const result = await page.evaluate(async nested => {
      const host = document.querySelector(".cx-host"), data = host.canopyx.view; host.canopyx.destroy();
      const calls = [];
      const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async (node, cursor) => {
        calls.push([node && node.id, cursor]);
        if (nested && !node) return { items: [{ id: "parent", label: "Parent", hasChildren: true }] };
        if (!cursor) return { items: [{ id: "first", label: "First" }], next: "second" };
        return { items: [{ id: "target", label: "Target", children: [{ id: "target-leaf", label: "Target leaf" }] },
          { id: "inline", label: "Inline sibling", expanded: true, children: [{ id: "inline-leaf", label: "Inline leaf" }] },
          { id: "lazy", label: "Lazy sibling", expanded: true, hasChildren: true }] };
      } } }); await api.ready;
      await api.setState({ expanded: [nested ? ["parent", "target"] : ["target"]] });
      return { state: api.getState(), ids: api.visibleRows().map(r => r.node.id), calls };
    }, nested);
    expect(result.state.expanded).toEqual(nested ? [["parent"], ["parent", "target"]] : [["target"]]);
    expect(result.ids).toContain("target-leaf"); expect(result.ids).not.toContain("inline-leaf");
    expect(result.calls.some(([id]) => id === "lazy")).toBe(false);
    await expect(page.locator('[data-cx-id="inline"]')).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator('[data-cx-id="lazy"]')).toHaveAttribute("aria-expanded", "false");
  });
}

test("a throwing load callback preserves the applied page, continuation and default expansion", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view; host.canopyx.destroy();
    const cursors = []; let fail = false; let sourceErrors = 0;
    host.addEventListener("canopyx:error", () => sourceErrors++);
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async (node, cursor) => {
      if (node) return { items: [{ id: "leaf", label: "Leaf" }] };
      cursors.push(cursor);
      return cursor === "third" ? { items: [{ id: "third", label: "Third" }] } : cursor === "second" ?
        { items: [{ id: "second", label: "Second", hasChildren: true, expanded: true }], next: "third" } :
        { items: [{ id: "first", label: "First" }], next: "second" };
    } }, onLoad() { if (fail) { fail = false; throw new Error("Host callback failure"); } } }); await api.ready;
    fail = true; let callbackError;
    try { await api.loadMore(); } catch (error) { callbackError = error.message; }
    const after = api.visibleRows().map(r => r.node.id);
    const errorRows = host.querySelectorAll("[data-cx-status=error]").length;
    await api.loadMore();
    return { callbackError, after, errorRows, sourceErrors, cursors, final: api.visibleRows().map(r => r.node.id) };
  });
  expect(result.callbackError).toBe("Host callback failure"); expect(result.after).toContain("leaf");
  expect(result.errorRows).toBe(0); expect(result.sourceErrors).toBe(0);
  expect(result.cursors).toEqual([null, "second", "third"]); expect(result.final).toContain("third");
});

test("ordinary custom controls retain click and keyboard ownership without row selection or expansion", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = { ...host.canopyx.view, roots: [
      { id: "parent", label: "Parent", children: [{ id: "leaf", label: "Leaf" }] }, { id: "other", label: "Other" }] };
    host.canopyx.destroy(); window.activations = 0;
    const api = CanopyX.createTreeGrid(host, { view: data, renderers: { controls(node, el) {
      if (node.id !== "parent") return false;
      const button = document.createElement("button"); button.textContent = "Host action";
      button.onclick = () => window.activations++; el.appendChild(button);
      const input = document.createElement("input"); input.setAttribute("aria-label", "Host input"); el.appendChild(input);
      const editor = document.createElement("span"); editor.contentEditable = "true";
      editor.setAttribute("aria-label", "Host editor"); editor.textContent = "Editable"; el.appendChild(editor);
      return true;
    } } }); await api.ready;
  });
  await page.locator('[data-cx-id="other"]').click();
  const button = page.getByRole("button", { name: "Host action" });
  await button.click(); await expect(button).toBeFocused(); await page.keyboard.press("Enter");
  await page.keyboard.press("Space"); await button.dblclick(); await expect(button).toBeFocused();
  expect(await page.evaluate(() => window.activations)).toBe(5);
  const input = page.getByRole("textbox", { name: "Host input" }); await input.fill("Text"); await page.keyboard.press("ArrowLeft");
  await expect(input).toBeFocused();
  const editor = page.locator('[aria-label="Host editor"]'); await editor.click(); await page.keyboard.press("ArrowDown");
  await expect(editor).toBeFocused();
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.getSelected().map(n => n.id))).toEqual(["other"]);
  await expect(page.locator('[data-cx-id="parent"]')).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: path.join(repo, "artifacts/takeover/sixth-host-control-focus.png") });
  await page.locator('[data-cx-id="parent"] .cx-text').click();
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.getSelected().map(n => n.id))).toEqual(["parent"]);
});

test("public focus enters an initially or filtered empty grid", async ({ page }) => {
  await open(page);
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.focus());
  await expect(page.getByRole("treegrid")).toBeFocused();
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = { ...host.canopyx.view, roots: [{ id: "row", label: "Row" }] };
    host.canopyx.destroy(); const api = CanopyX.createTreeGrid(host, { view: data }); await api.ready;
    api.focus(); api.setFilter(() => false); api.focus();
  });
  await expect(page.getByRole("treegrid")).toBeFocused();
});
