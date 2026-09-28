import { expect, test } from "@playwright/test";
import path from "node:path";
import { nextFrames, repo, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "sixteenth", label: "Contracts",
  columns: [{ id: "name", title: "Name", width: 320 }], source: { kind: "inline" }, roots: [] };

async function open(page, data = view) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

for (const kind of ["cell", "detail"]) {
  test(`moving row focus preserves an edited host ${kind}`, async ({ page }) => {
    const first = { id: "first", label: "First", ...(kind === "detail" ? { detail: { type: "html", html: "", height: 1 } } : {}) };
    await open(page, { ...view, roots: [first, { id: "second", label: "Second" }] });
    await page.evaluate(async kind => {
      const host = document.querySelector(".cx-host"), data = host.canopyx.view;
      host.canopyx.destroy();
      const render = (node, element) => {
        if (node.id !== "first") return false;
        const input = document.createElement("input");
        input.setAttribute("aria-label", "Host edit");
        element.appendChild(input);
        return true;
      };
      window.api = CanopyX.createTreeGrid(host, { view: data,
        ...(kind === "cell" ? { renderCell: (node, _column, element) => render(node, element) } : { renderDetail: render }) });
      await api.ready;
    }, kind);
    const input = page.getByRole("textbox", { name: "Host edit" });
    await input.fill("Unsaved text");
    await page.locator('[data-cx-id="first"]').focus();
    await page.evaluate(() => { window.originalInput = document.querySelector('[aria-label="Host edit"]'); });
    await page.keyboard.press("ArrowDown");
    await nextFrames(page);
    await expect(page.locator('[data-cx-id="second"]')).toBeFocused();
    await expect(input).toHaveValue("Unsaved text");
    expect(await page.evaluate(() => originalInput.isConnected && originalInput === document.querySelector('[aria-label="Host edit"]'))).toBe(true);
    await page.locator('[data-cx-id="first"]').focus();
    await nextFrames(page);
    await expect(page.locator('.cx-row[tabindex="0"]')).toHaveCount(1);
    await expect(input).toHaveValue("Unsaved text");
    await page.screenshot({ path: path.join(repo, `artifacts/takeover/sixteenth-focus-${kind}.png`) });
  });
}

test("path expansion stops when empty page cursors cycle", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    let calls = 0;
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async (_node, cursor) => {
      calls++;
      if (calls > 3) throw new Error("too many page requests");
      return { items: [], next: cursor === null ? "A" : cursor === "A" ? "B" : "A" };
    } } });
    await api.ready;
    try { await api.expandPath(["missing"], { select: false, focus: false }); return { calls, error: null }; }
    catch (error) { return { calls, error: error.message }; }
  });
  expect(result.calls).toBe(3);
  expect(result.error).toContain("no progress");
});

test("new child counts make a terminal remote cache reloadable", async ({ page }) => {
  await open(page, { ...view, deepLink: true });
  const result = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    let childLoads = 0;
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      if (!node) return { items: [{ id: "parent", label: "Parent", hasChildren: true }] };
      childLoads++;
      return childLoads === 1
        ? { items: [{ id: "old", label: "Old", children: [{ id: "grandchild", label: "Grandchild" }] }], total: 1, next: null }
        : { items: [{ id: "old", label: "Old", children: [{ id: "grandchild", label: "Grandchild" }] }, { id: "new", label: "New" }], total: 2, next: null };
    } } });
    await api.ready;
    await api.expandPath(["parent"], { select: false, focus: false, expandLast: true });
    await api.expandPath(["parent", "old"]);
    api.applyCounts({ protocol: "canopyx/1", type: "counts", items: [{ id: "parent", childCount: 2 }] });
    const staleSelection = api.getSelected().length || location.hash.includes("old");
    try { await api.expandPath(["parent", "new"], { select: false, focus: false }); return { childLoads, found: true, staleSelection }; }
    catch (error) { return { childLoads, found: false, error: error.message }; }
  });
  expect(result).toEqual({ childLoads: 2, found: true, staleSelection: false });
  await expect(page.locator('[data-cx-id="new"]')).toBeVisible();
});

test("a count received during a stale terminal page invalidates that page", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    let childLoads = 0;
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      if (!node) return { items: [{ id: "parent", label: "Parent", hasChildren: true }] };
      childLoads++;
      if (childLoads === 1) return new Promise(resolve => { window.finishOldPage = resolve; });
      return { items: [{ id: "old", label: "Old" }, { id: "new", label: "New" }], total: 2, next: null };
    } } });
    await api.ready;
    const first = api.expandPath(["parent"], { select: false, focus: false, expandLast: true }).catch(() => null);
    await new Promise(resolve => { const untilStarted = () => window.finishOldPage ? resolve() : setTimeout(untilStarted, 0); untilStarted(); });
    api.applyCounts({ protocol: "canopyx/1", type: "counts", items: [{ id: "parent", childCount: 2 }] });
    finishOldPage({ items: [{ id: "old", label: "Old" }], total: 1, next: null });
    await first;
    try { await api.expandPath(["parent", "new"], { select: false, focus: false }); return { childLoads, found: true }; }
    catch (error) { return { childLoads, found: false, error: error.message }; }
  });
  expect(result).toEqual({ childLoads: 2, found: true });
});

test("a detached child load cannot reinsert orphan IDs after a parent count refresh", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    let parentLoads = 0, childLoads = 0;
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      if (!node) return { items: [{ id: "parent", label: "Parent", hasChildren: true }] };
      if (node.id === "parent") {
        parentLoads++;
        return parentLoads === 1
          ? { items: [{ id: "child", label: "Child", hasChildren: true }], total: 1, next: null }
          : { items: [{ id: "child", label: "Child", hasChildren: true }, { id: "new", label: "New" }], total: 2, next: null };
      }
      childLoads++;
      if (childLoads === 1) return new Promise(resolve => { window.finishDetachedChild = resolve; });
      return { items: [{ id: "grand", label: "Grandchild" }], total: 1, next: null };
    } } });
    await api.ready;
    await api.expandPath(["parent"], { select: false, focus: false, expandLast: true });
    const oldExpansion = api.expandPath(["parent", "child"], { select: false, focus: false, expandLast: true }).catch(error => error.message);
    await new Promise(resolve => { const started = () => window.finishDetachedChild ? resolve() : setTimeout(started, 0); started(); });
    api.applyCounts({ protocol: "canopyx/1", type: "counts", items: [{ id: "parent", childCount: 2 }] });
    finishDetachedChild({ items: [{ id: "grand", label: "Grandchild" }], total: 1, next: null });
    await oldExpansion;
    try {
      await api.expandPath(["parent", "child", "grand"], { select: false, focus: false });
      return { parentLoads, childLoads, found: true };
    } catch (error) {
      return { parentLoads, childLoads, found: false, error: error.message };
    }
  });
  expect(result).toEqual({ parentLoads: 2, childLoads: 2, found: true });
});

test("a count refresh reports when it removes the selected subtree", async ({ page }) => {
  await open(page, { ...view, deepLink: true });
  const result = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    const callbacks = [], events = [];
    host.addEventListener("canopyx:select", event => events.push(event.detail.nodes.map(node => node.id)));
    const api = CanopyX.createTreeGrid(host, { view: data, onSelect: (_node, nodes) => callbacks.push(nodes.map(node => node.id)), source: { page: async node =>
      node ? { items: [{ id: "old", label: "Old" }], total: 1, next: null }
        : { items: [{ id: "parent", label: "Parent", hasChildren: true }] } } });
    await api.ready;
    await api.expandPath(["parent", "old"]);
    api.applyCounts({ protocol: "canopyx/1", type: "counts", items: [{ id: "parent", childCount: 2 }] });
    return { callbacks, events, selected: api.getSelected().map(node => node.id), hash: location.hash };
  });
  expect(result).toEqual({ callbacks: [["old"], []], events: [["old"], []], selected: [], hash: "" });
});

test("composition keys do not choose or dismiss search results", async ({ page }) => {
  await open(page, { ...view, search: { minLength: 2, maxResults: 10, placeholder: "Search" }, roots:
    [{ id: "first", label: "Alpha one" }, { id: "second", label: "Alpha two" }] });
  const input = page.getByRole("combobox");
  await input.fill("alpha");
  await expect(page.getByRole("option")).toHaveCount(2);
  const prevented = await page.evaluate(() => {
    const input = document.querySelector('[role="combobox"]');
    return ["ArrowDown", "Enter", "Escape"].map(key => {
      const event = new KeyboardEvent("keydown", { key, isComposing: true, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      return event.defaultPrevented;
    });
  });
  expect(prevented).toEqual([false, false, false]);
  await expect(page.getByRole("option")).toHaveCount(2);
  await expect(input).toHaveValue("alpha");
  await expect(page.locator('[data-cx-id="first"]')).not.toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: path.join(repo, "artifacts/takeover/sixteenth-ime.png") });
});
