import { expect, test } from "@playwright/test";
import { nextFrames, row, viewPage } from "./support.mjs";

const view = (roots = []) => ({ protocol: "canopyx/1", type: "view", id: "lifecycle", label: "Lifecycle", rowHeight: 28,
  pageSize: 100, selection: "single", columns: [{ id: "name", title: "Name", width: 300, kind: "text" }],
  source: { kind: "inline" }, roots });
async function open(page, data) {
  await page.route("https://canopyx.test/", r => r.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

test("detail labels search and select, preserving trusted browser print HTML and indicators", async ({ page }) => {
  const data = view([{ id: "detail", label: "Ready details", detail: { type: "html", html: "<strong>Ready</strong>", height: 2 } },
    { id: "cell", label: "Cell", badges: [{ text: "Node badge" }], cells: { name: { value: "Cell", title: "Tooltip", badges: [{ text: "Cell badge" }] } } }]);
  data.search = { minLength: 2, maxResults: 20, placeholder: "Search" };
  await open(page, data);
  await page.getByRole("combobox").fill("Ready");
  await expect(page.getByRole("option")).toContainText("Ready details");
  await row(page, "detail").click();
  await expect(row(page, "detail")).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator(".cx-outline strong")).toHaveText("Ready");
  await expect(page.locator(".cx-outline")).toContainText("Node badge");
  await expect(page.locator(".cx-outline")).toContainText("Cell badge");
  await expect(page.locator(".cx-outline [title=Tooltip]")).toHaveCount(1);
});

test("restored empty expansion state collapses initially expanded nodes", async ({ page }) => {
  await open(page, view([{ id: "parent", label: "Parent", expanded: true, children: [{ id: "child", label: "Child" }] }]));
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.setState({ expanded: [] }));
  await expect(row(page, "child")).toHaveCount(0);
  await expect(row(page, "parent")).toHaveAttribute("aria-expanded", "false");
});

test("count refreshes preserve disjoint results and ignore older overlapping responses", async ({ page }) => {
  await open(page, view([{ id: "a", label: "A" }, { id: "b", label: "B" }]));
  const result = await page.evaluate(async () => {
    const host = document.querySelector(".cx-host");
    const data = host.canopyx.view;
    host.canopyx.destroy();
    const pending = [];
    const source = CanopyX.sources.inline(data);
    source.counts = () => new Promise(resolve => pending.push(resolve));
    const api = CanopyX.createTreeGrid(host, { view: data, source });
    await api.ready;
    const first = api.refreshCounts(["a"]), second = api.refreshCounts(["a"]), third = api.refreshCounts(["b"]);
    const doc = (id, value) => ({ protocol: "canopyx/1", type: "counts", items: [{ id, cells: { name: value } }] });
    pending[1](doc("a", "Newest")); await second;
    pending[0](doc("a", "Old")); await first;
    pending[2](doc("b", "Disjoint")); await third;
    return api.visibleRows().map(r => r.node.cells.name);
  });
  expect(result).toEqual(["Newest", "Disjoint"]);
});

test("remote empty children can become expandable after a count refresh", async ({ page }) => {
  await open(page, view());
  const loaded = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    let calls = 0;
    const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => node
      ? { items: ++calls === 1 ? [] : [{ id: "child", label: "Child" }], next: null }
      : { items: [{ id: "parent", label: "Parent", hasChildren: true }], next: null } } });
    await api.ready;
    await api.expandPath(["parent"], { expandLast: true });
    api.applyCounts({ protocol: "canopyx/1", type: "counts", items: [{ id: "parent", childCount: 0 }] });
    await new Promise(resolve => requestAnimationFrame(resolve));
    const zero = document.querySelector("[data-cx-id=parent]").hasAttribute("aria-expanded");
    api.applyCounts({ protocol: "canopyx/1", type: "counts", items: [{ id: "parent", childCount: 1 }] });
    await api.expandPath(["parent"], { expandLast: true });
    return { zero, calls, ids: api.visibleRows().map(r => r.node.id) };
  }, { ...view(), source: { kind: "remote", children: "c?ref={ref}&cursor={cursor}" } });
  expect(loaded).toEqual({ zero: false, calls: 2, ids: ["parent", "child"] });
});

test("pending expansion cannot emit open after collapse", async ({ page }) => {
  await open(page, view());
  const states = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    let finish;
    const states = [];
    const api = CanopyX.createTreeGrid(host, { view: data, onToggle: (_, expanded) => states.push(expanded), source: {
      page: async node => node ? new Promise(resolve => { finish = resolve; }) : { items: [{ id: "p", label: "Parent", hasChildren: true }], next: null }
    } });
    await api.ready;
    await new Promise(resolve => requestAnimationFrame(resolve));
    const expander = document.querySelector("[data-cx-id=p] .cx-exp");
    expander.click();
    expander.click();
    finish({ items: [{ id: "child", label: "Child" }], next: null });
    await new Promise(resolve => setTimeout(resolve, 0));
    return states;
  }, { ...view(), source: { kind: "remote", children: "c?ref={ref}&cursor={cursor}" } });
  expect(states).toEqual([false]);
});

test("destroyed initialization cannot mark or emit into a remounted host", async ({ page }) => {
  await open(page, view());
  const events = await page.evaluate(async data => {
    const host = document.querySelector(".cx-host"); host.canopyx.destroy();
    let finish;
    const events = [];
    const old = CanopyX.createTreeGrid(host, { view: data, onLoad: () => events.push("old load"), source: {
      page: () => new Promise(resolve => { finish = resolve; })
    } });
    old.destroy();
    const fresh = CanopyX.createTreeGrid(host, { view: { ...data, source: { kind: "inline" }, roots: [] } });
    await fresh.ready;
    host.addEventListener("canopyx:ready", () => events.push("late ready"));
    finish({ items: [{ id: "old", label: "Old" }], next: null }); await old.ready;
    return { events, rows: fresh.visibleRows(), ready: host.hasAttribute("data-cx-ready") };
  }, { ...view(), source: { kind: "remote", children: "c?ref={ref}&cursor={cursor}" } });
  expect(events).toEqual({ events: [], rows: [], ready: true });
});

for (const failAgain of [false, true]) {
  test(`keyboard retry retains focus on ${failAgain ? "another error" : "new rows"}`, async ({ page }) => {
    await open(page, view());
    await page.evaluate(async ({ data, failAgain }) => {
      const host = document.querySelector(".cx-host"); host.canopyx.destroy();
      let calls = 0;
      const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async () => {
        if (++calls === 1 || failAgain) throw new Error("Temporary failure");
        return { items: [{ id: "new", label: "New" }], next: null };
      } } });
      await api.ready;
    }, { data: { ...view(), source: { kind: "remote", children: "c?ref={ref}&cursor={cursor}" } }, failAgain });
    await page.locator(".cx-row[data-cx-status=error]").focus();
    await page.keyboard.press("Enter");
    await expect(failAgain ? page.locator(".cx-row[data-cx-status=error]") : row(page, "new")).toBeFocused();
  });
}

test("revealing a search path clears a filter hiding its target", async ({ page }) => {
  await open(page, view([{ id: "a", label: "Alpha" }, { id: "b", label: "Beta", flags: ["visible"] }]));
  await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx;
    api.setFilter(node => (node.flags || []).includes("visible"));
    await api.expandPath(["a"]);
  });
  await expect(row(page, "a")).toBeVisible();
  await expect(row(page, "a")).toBeFocused();
});
