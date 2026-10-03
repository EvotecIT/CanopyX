import { expect, test } from "@playwright/test";
import { nextFrames, row, searchIndex, viewPage } from "./support.mjs";

const baseView = (roots = []) => ({
  protocol: "canopyx/2", type: "view", id: "regression", label: "Regression",
  rowHeight: 28, pageSize: 2, selection: "multiple", deepLink: true,
  columns: [{ id: "name", title: "Name", width: 300, kind: "text", sortable: true },
    { id: "value", title: "Value", width: 180, kind: "number", sortable: true }],
  source: { kind: "inline" }, roots
});

async function openView(page, view) {
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

test("count updates re-sort loaded siblings", async ({ page }) => {
  await openView(page, baseView([{ id: "a", label: "A", cells: { value: 1 } }, { id: "b", label: "B", cells: { value: 2 } }]));
  const ids = await page.evaluate(() => {
    const api = document.querySelector(".cx-host").canopyx;
    api.sort("value", "asc");
    api.applyCounts({ protocol: "canopyx/2", type: "counts", items: [{ id: "a", cells: { value: 3 } }] });
    return api.visibleRows().map((r) => r.node.id);
  });
  expect(ids).toEqual(["b", "a"]);
});

for (const kind of ["table", "properties"]) {
  test(`${kind} detail cells preserve badges, titles, and print values`, async ({ page }) => {
    const cell = { value: "Before value", title: "Original setting", badges: [{ text: "Changed", tone: "warning" }] };
    const detail = kind === "table" ? { type: kind, height: 3, columns: ["Before"], rows: [[cell]] }
      : { type: kind, height: 3, items: [{ name: "Before", value: cell }] };
    await openView(page, baseView([{ id: "detail", label: "Detail", detail }]));
    await expect(row(page, "detail").locator(".cx-badge")).toHaveText("Changed");
    await expect(row(page, "detail").locator("[title='Original setting']")).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await expect(page.locator(".cx-outline")).toContainText("Before value");
    await expect(page.locator(".cx-outline .cx-badge")).toHaveText("Changed");
  });
}

test("group detail rows keep group styling without assigning it to ordinary details", async ({ page }) => {
  const detail = { type: "html", html: "Detail" };
  await openView(page, baseView([
    { id: "grouped", label: "Grouped", group: true, detail },
    { id: "ordinary", label: "Ordinary", detail }
  ]));
  await expect(row(page, "grouped")).toHaveClass(/\bcx-group\b/);
  await expect(row(page, "ordinary")).not.toHaveClass(/\bcx-group\b/);
});

test("Shift navigation onto show-more never selects a status node", async ({ page }) => {
  await openView(page, baseView([{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }]));
  await row(page, "a").click();
  await page.keyboard.press("Shift+End");
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.getSelected().map((n) => n.id))).toEqual(["a"]);
  expect(await page.evaluate(() => location.hash)).not.toContain("null");
});

test("later pages expand lazy nodes marked expanded", async ({ page }) => {
  await openView(page, baseView());
  const ids = await page.evaluate(async (view) => {
    const host = document.querySelector(".cx-host");
    host.canopyx.destroy();
    const api = CanopyX.createTreeGrid(host, { view, source: {
      page: async (node, cursor) => node ? { items: [{ id: "child", label: "Child" }], next: null }
        : cursor ? { items: [{ id: "lazy", label: "Lazy", hasChildren: true, expanded: true }], next: null }
          : { items: [{ id: "first", label: "First" }], next: "next" }
    } });
    await api.ready;
    await api.loadMore(null);
    return api.visibleRows().map((r) => r.node.id);
  }, { ...baseView(), source: { kind: "remote", children: "c?ref={ref}&cursor={cursor}" } });
  expect(ids).toEqual(["first", "lazy", "child"]);
});

test("sorted paging focuses a newly loaded row", async ({ page }) => {
  await openView(page, baseView(["Z", "Y", "A", "B"].map((label) => ({ id: label, label }))));
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.sort("name", "asc"));
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.visibleRows().map(r => r.node.id))).toEqual(["A", "B"]);
  await page.locator(".cx-row[data-cx-status=more]").focus();
  await page.keyboard.press("Enter");
  await expect(row(page, "Y")).toBeFocused();
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.visibleRows().map(r => r.node.id))).toEqual(["A", "B", "Y", "Z"]);
});

test("paging another branch preserves the focused show-more row", async ({ page }) => {
  const roots = ["a", "b"].map((id) => ({ id, label: id, expanded: true,
    children: [1, 2, 3].map((i) => ({ id: id + i, label: id + i })) }));
  await openView(page, baseView(roots));
  const focused = page.locator(".cx-row[data-cx-status=more]").first();
  await focused.focus();
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.loadMore("b"));
  await expect(focused).toBeFocused();
  await expect(row(page, "b3")).not.toBeFocused();
});

for (const reject of [false, true]) {
  test(`editing search invalidates an in-flight ${reject ? "error" : "result"} before debounce`, async ({ page }) => {
    await openView(page, { ...baseView(), search: { minLength: 2, maxResults: 20, placeholder: "Search" } });
    await page.evaluate(() => {
      const host = document.querySelector(".cx-host");
      const view = host.canopyx.view;
      host.canopyx.destroy();
      CanopyX.createTreeGrid(host, { view, source: {
        canSearch: true, page: async () => ({ items: [], next: null }),
        search: () => new Promise((resolve, reject) => { window.pendingSearch = { resolve, reject }; })
      } });
    });
    const input = page.getByRole("combobox");
    await input.fill("old");
    await expect.poll(() => page.evaluate(() => !!window.pendingSearch)).toBe(true);
    // Dispatch the edit and complete the old request in one browser task, before the debounce can run.
    await page.evaluate((reject) => {
      const input = document.querySelector(".cx-search input");
      input.value = "new";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (reject) window.pendingSearch.reject(new Error("Old failure"));
      else window.pendingSearch.resolve({ items: [{ label: "Old result", path: ["old"] }] });
    }, reject);
    await nextFrames(page);
    await expect(page.getByRole("option")).toHaveCount(0);
    await expect(page.locator(".cx-search")).not.toContainText("Old failure");
  });
}

test("completing a page does not steal focus moved during the request", async ({ page }) => {
  await openView(page, baseView());
  await page.evaluate(async (view) => {
    const host = document.querySelector(".cx-host");
    host.canopyx.destroy();
    const api = CanopyX.createTreeGrid(host, { view, source: {
      page: async (node, cursor) => cursor ? new Promise((resolve) => { window.finishPage = resolve; })
        : { items: [{ id: "a", label: "A" }], next: "next" }
    } });
    await api.ready;
  }, { ...baseView(), source: { kind: "remote", children: "c?ref={ref}&cursor={cursor}" } });
  await page.locator(".cx-row[data-cx-status=more]").focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => !!window.finishPage)).toBe(true);
  await row(page, "a").click();
  await page.evaluate(() => window.finishPage({ items: [{ id: "b", label: "B" }], next: null }));
  await expect(row(page, "b")).toBeVisible();
  await expect(row(page, "a")).toBeFocused();
});

test("virtual rows stay in DOM order during continuous scrolling", async ({ page }) => {
  const view = baseView(Array.from({ length: 2000 }, (_, i) => ({ id: "n" + i, label: "Node " + i })));
  view.pageSize = 10000;
  await openView(page, view);
  await row(page, "n0").focus();
  for (const top of [...Array.from({ length: 12 }, (_, i) => (i + 1) * 500), ...Array.from({ length: 12 }, (_, i) => (11 - i) * 500)]) {
    await page.locator(".cx-grid").evaluate((grid, top) => { grid.scrollTop = top; }, top);
    await nextFrames(page);
    const indexes = await page.locator(".cx-canvas > .cx-row").evaluateAll((rows) => rows.map((row) => Number(row.getAttribute("aria-rowindex"))));
    expect(indexes).toEqual(indexes.slice().sort((a, b) => a - b));
    await expect(row(page, "n0")).toBeFocused();
  }
});

test("the search box lists hits from a sidecar index", async ({ page }) => {
  const view = { ...baseView(), roots: undefined, source: { kind: "sidecar", base: "/data/" }, search: { minLength: 2, maxResults: 20, placeholder: "Search" } };
  const index = searchIndex([{ path: ["ab"], label: "Abacus" }]);
  const docs = {
    manifest: { protocol: "canopyx/2", type: "manifest", view: view.id, root: "r/0", search: index.search },
    "r/0": { protocol: "canopyx/2", type: "page", parent: null, offset: 0, next: null, items: [{ id: "ab", label: "Abacus" }] },
    ...index.docs
  };
  await page.route("https://canopyx.test/data/**", (route) => {
    const ref = new URL(route.request().url()).pathname.slice(6, -3);
    if (!docs[ref]) return route.abort();
    return route.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify([view.id, ref, docs[ref]])});` });
  });
  await openView(page, view);
  await page.getByRole("combobox").fill("ab");
  await expect(page.getByRole("option")).toContainText("Abacus");
});
