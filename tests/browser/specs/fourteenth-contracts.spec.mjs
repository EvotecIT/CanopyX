import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "fourteenth", label: "Contracts",
  columns: [{ id: "name", title: "Name", width: 320 }], source: { kind: "inline" }, roots: [] };

async function open(page, data = view) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

test("saved expansion is restored before declarative lazy defaults", async ({ page }) => {
  await open(page, { ...view, stateKey: "fourteenth-state" });
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    sessionStorage.setItem("canopyx:fourteenth-state", JSON.stringify({ expanded: [["first"]] }));
    window.loads = [];
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      if (!node) return { items: [{ id: "first", label: "First", hasChildren: true, expanded: true },
        { id: "second", label: "Second", hasChildren: true, expanded: true }] };
      loads.push(node.id);
      if (node.id === "second") throw new Error("Unwanted default load");
      return { items: [{ id: "leaf", label: "Leaf" }] };
    } } });
  });
  await page.evaluate(() => api.ready);
  await page.waitForTimeout(350);
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("canopyx:fourteenth-state")))).toEqual({ expanded: [["first"]] });
  expect(await page.evaluate(() => loads)).toEqual(["first"]);
  await expect(page.locator('[data-cx-id="first"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-cx-id="second"]')).not.toHaveAttribute("aria-expanded", "true");
});

test("slow declarative siblings cannot save a partial expansion set before a queued user choice", async ({ page }) => {
  await open(page, { ...view, stateKey: "fourteenth-defaults" });
  await page.evaluate(() => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy(); sessionStorage.removeItem("canopyx:fourteenth-defaults");
    window.calls = [];
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      if (!node) return { items: ["a", "b", "c"].map(id => ({ id, label: id, hasChildren: true, expanded: true })) };
      calls.push(node.id);
      if (node.id === "b") return new Promise(resolve => { window.finishB = resolve; });
      return { items: [{ id: node.id + "-leaf", label: "Leaf" }] };
    } } });
  });
  await page.waitForFunction(() => !!window.finishB);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => sessionStorage.getItem("canopyx:fourteenth-defaults"))).toBeNull();
  await page.locator('[data-cx-id="a"] .cx-exp').click();
  await page.evaluate(() => window.finishB({ items: [{ id: "b-leaf", label: "Leaf" }] }));
  await page.evaluate(() => api.ready);
  expect(await page.evaluate(() => calls)).toEqual(["a", "b", "c"]);
  await expect(page.locator('[data-cx-id="a"]')).toHaveAttribute("aria-expanded", "false");
  await page.waitForFunction(() => sessionStorage.getItem("canopyx:fourteenth-defaults") !== null);
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("canopyx:fourteenth-defaults"))))
    .toMatchObject({ version: 1, expanded: [["b"], ["c"]] });
});

for (const failure of ["root", "saved child"]) {
  test(`a transient ${failure} load never erases remembered paths`, async ({ page }) => {
    await open(page, { ...view, stateKey: "fourteenth-failed-" + failure });
    const key = "canopyx:fourteenth-failed-" + failure;
    await page.evaluate(async ({ failure, key }) => {
      const host = document.querySelector(".cx-host"), data = host.canopyx.view;
      host.canopyx.destroy();
      sessionStorage.setItem(key, JSON.stringify({ expanded: [["slow"]] }));
      window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
        if (failure === "root" || node) throw new Error("Temporary endpoint failure");
        return { items: [{ id: "slow", label: "Slow", hasChildren: true }] };
      } } });
      await api.ready;
    }, { failure, key });
    await page.waitForTimeout(350);
    expect(JSON.parse(await page.evaluate(key => sessionStorage.getItem(key), key))).toEqual({ expanded: [["slow"]] });
  });
}

test("user toggle during startup restoration survives the slow saved path", async ({ page }) => {
    await open(page, { ...view, stateKey: "fourteenth-user" });
    await page.evaluate(() => {
      const host = document.querySelector(".cx-host"), data = host.canopyx.view;
      host.canopyx.destroy();
      const key = "canopyx:fourteenth-user";
      sessionStorage.setItem(key, JSON.stringify({ expanded: [["slow"]] }));
      window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
        if (!node) return { items: [{ id: "slow", label: "Slow", hasChildren: true },
          { id: "other", label: "Other", hasChildren: true }] };
        if (node.id === "slow") return new Promise(resolve => { window.finishSlow = resolve; });
        return { items: [{ id: "other-leaf", label: "Other leaf" }] };
      } } });
    });
    await page.waitForFunction(() => !!window.finishSlow);
    // Exercise user intent without a pointer coordinate that changes when the slow loading row appears.
    await page.locator('[data-cx-id="other"]').press("ArrowRight");
    await page.evaluate(() => window.finishSlow({ items: [{ id: "leaf", label: "Leaf" }] }));
    await page.evaluate(() => api.ready);
    await expect(page.locator('[data-cx-id="other-leaf"]')).toBeVisible();
    await page.waitForFunction(key => {
      const state = JSON.parse(sessionStorage.getItem(key) || "null");
      return state && state.expanded.some(path => path[0] === "other");
    }, "canopyx:fourteenth-user");
});

test("user toggle during a later setState is replayed when restoration settles", async ({ page }) => {
  await open(page, { ...view, stateKey: "fourteenth-later" });
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      if (!node) return { items: [{ id: "slow", label: "Slow", hasChildren: true },
        { id: "other", label: "Other", hasChildren: true }] };
      if (node.id === "slow") return new Promise(resolve => { window.finishSlow = resolve; });
      return { items: [{ id: "other-leaf", label: "Other leaf" }] };
    } } });
    await api.ready;
    window.restoration = api.setState({ expanded: [["slow"]] });
  });
  await page.waitForFunction(() => !!window.finishSlow);
  // The loading row changes the following row's position. Wait for that layout before clicking its expander.
  await expect(page.locator('[data-cx-id="slow"]')).toHaveAttribute("aria-expanded", "true");
  await page.locator('[data-cx-id="other"] .cx-exp').click();
  await page.evaluate(() => window.finishSlow({ items: [{ id: "leaf", label: "Leaf" }] }));
  await page.evaluate(() => restoration);
  await expect(page.locator('[data-cx-id="other-leaf"]')).toBeVisible();
  await page.waitForFunction(() => {
    const state = JSON.parse(sessionStorage.getItem("canopyx:fourteenth-later") || "null");
    return state && state.expanded.some(path => path[0] === "other");
  });
});

test("closing a pending lazy page defers expansion of its returned descendants", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy(); window.loads = [];
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
      if (!node) return { items: [{ id: "parent", label: "Parent", hasChildren: true }] };
      loads.push(node.id);
      if (node.id === "parent") return new Promise(resolve => { window.finishParent = resolve; });
      return { items: [{ id: "leaf", label: "Leaf" }] };
    } } });
    await api.ready;
  });
  await page.locator('[data-cx-id="parent"] .cx-exp').click();
  await page.waitForFunction(() => !!window.finishParent);
  await page.locator('[data-cx-id="parent"] .cx-exp').click();
  await page.evaluate(() => window.finishParent({ items: [{ id: "child", label: "Child", hasChildren: true, expanded: true }] }));
  await nextFrames(page);
  expect(await page.evaluate(() => loads)).toEqual(["parent"]);
  await page.locator('[data-cx-id="parent"] .cx-exp').click();
  await expect(page.locator('[data-cx-id="leaf"]')).toBeVisible();
  expect(await page.evaluate(() => loads)).toEqual(["parent", "child"]);
});

test("filtered paged siblings report unknown set size until the final page", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { page: async (node, cursor) => !node
      ? { items: [{ id: "parent", label: "Parent", hasChildren: true }] }
      : cursor ? { items: [{ id: "match-2", label: "Match two" }], offset: 1, total: 2 }
        : { items: [{ id: "match-1", label: "Match one" }], offset: 0, total: 2, next: "more" } } });
    await api.ready;
    await api.expandPath(["parent"], { expandLast: true });
    api.setFilter(node => node.id.startsWith("match"));
  });
  await expect(page.locator('[data-cx-id="match-1"]')).toHaveAttribute("aria-setsize", "-1");
  await page.evaluate(() => api.loadMore("parent"));
  await expect(page.locator('[data-cx-id="match-1"]')).toHaveAttribute("aria-setsize", "2");
});

test("remote search rejects both directions of total and truncation mismatch", async ({ page }) => {
  await open(page);
  await page.route("https://canopyx.test/search?*", route => route.fulfill({ json: {
    protocol: "canopyx/2", type: "search", query: "find", hits: [{ path: ["one"], label: "One" }],
    total: Number(new URL(route.request().url()).searchParams.get("total")), truncated: false } }));
  const results = await page.evaluate(async () => {
    const out = [];
    for (const total of [0, 2]) {
      const source = CanopyX.sources.remote({ source: { kind: "remote", children: "/tree?ref={ref}&cursor={cursor}",
        search: "/search?query={query}&limit={limit}&total=" + total } });
      try { await source.search("find", 10); out.push("accepted"); }
      catch (error) { out.push(error.message); }
    }
    return out;
  });
  expect(results).toEqual([expect.stringContaining("total"), expect.stringContaining("total")]);
});

test("native summary and focusable host controls retain their keyboard and pointer behavior", async ({ page }) => {
  await open(page, { ...view, roots: [{ id: "row", label: "Row", detail: { type: "html", html: "", height: 2 } }] });
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, renderDetail(_node, cell) {
      const details = document.createElement("details");
      details.innerHTML = "<summary>Disclosure</summary><p>More</p>";
      cell.appendChild(details);
      const control = document.createElement("span"); control.tabIndex = 0; control.textContent = "Host control";
      cell.appendChild(control);
      return true;
    } });
    await api.ready;
  });
  const summary = page.getByText("Disclosure");
  await summary.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".cx-canvas details")).toHaveAttribute("open", "");
  expect(await page.evaluate(() => api.getSelected().length)).toBe(0);
  await page.getByText("Host control").dblclick();
  expect(await page.evaluate(() => api.getSelected().length)).toBe(0);
});

test("count refresh preserves an unrelated edited host control and focus", async ({ page }) => {
  await open(page, { ...view, roots: [{ id: "changed", label: "Changed" }, { id: "editor", label: "Editor" }] });
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    const render = (node, cell) => {
      if (node.id !== "editor") return false;
      const input = document.createElement("input"); input.setAttribute("aria-label", "Host edit"); cell.appendChild(input);
      return true;
    };
    window.api = CanopyX.createTreeGrid(host, { view: data, renderers: Object.fromEntries(data.columns.map(column => [column.id, render])) });
    await api.ready;
  });
  const input = page.getByRole("textbox", { name: "Host edit" });
  await input.fill("Unsaved");
  await page.evaluate(() => { window.original = document.activeElement;
    api.applyCounts({ protocol: "canopyx/2", type: "counts", items: [{ id: "changed", flags: ["new"] }] }); });
  await nextFrames(page);
  await expect(input).toBeFocused(); await expect(input).toHaveValue("Unsaved");
  expect(await page.evaluate(() => original.isConnected && document.activeElement === original)).toBe(true);
});
