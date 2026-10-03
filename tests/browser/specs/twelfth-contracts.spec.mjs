import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "twelfth", label: "Contracts", rowHeight: 28,
  pageSize: 100, selection: "single", columns: [{ id: "name", title: "Name", width: 240 },
    { id: "value", title: "Value", width: 120 }], source: { kind: "inline" }, roots: [] };

async function open(page, data) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

test("ArrowUp starts on the last search result and wraps in both directions", async ({ page }) => {
  await open(page, { ...view, search: { minLength: 2, maxResults: 10, placeholder: "Search" }, roots:
    ["Alpha one", "Alpha two", "Alpha three"].map((label, i) => ({ id: "n" + i, label })) });
  const input = page.getByRole("combobox");
  await input.fill("alpha");
  await expect(page.getByRole("option")).toHaveCount(3);
  await input.press("ArrowUp");
  await expect(page.getByRole("option").nth(2)).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
});

test("a throwing toggle callback cannot prevent state persistence", async ({ page }) => {
  await open(page, { ...view, stateKey: "twelfth-toggle", roots: [{ id: "parent", label: "Parent", children: [{ id: "child", label: "Child" }] }] });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.evaluate(() => {
    const host = document.querySelector(".cx-host");
    const data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, onToggle() { throw new Error("host toggle failure"); } });
    return api.ready;
  });
  await page.locator('[data-cx-id="parent"] .cx-exp').click();
  await expect(page.locator('[data-cx-id="parent"]')).toHaveAttribute("aria-expanded", "true");
  await page.waitForFunction(() => sessionStorage.getItem("canopyx:twelfth-toggle") !== null, null, { timeout: 2000 });
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("canopyx:twelfth-toggle")))).toMatchObject({ version: 1, expanded: [["parent"]] });
  expect(errors.some(message => message.includes("host toggle failure"))).toBe(true);
});

test("a throwing load callback cannot prevent persistence of applied lazy expansion", async ({ page }) => {
  await open(page, { ...view, stateKey: "twelfth-lazy", roots: [] });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.evaluate(() => {
    const host = document.querySelector(".cx-host");
    const data = { ...host.canopyx.view, roots: undefined };
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data,
      source: { page: async node => node
        ? { items: [{ id: "child", label: "Child" }], next: null }
        : { items: [{ id: "lazy", label: "Lazy", hasChildren: true }], next: null } },
      onLoad(node) { if (node && node.id === "lazy") throw new Error("host load failure"); } });
    return api.ready;
  });
  await page.locator('[data-cx-id="lazy"] .cx-exp').click();
  await expect(page.locator('[data-cx-id="child"]')).toBeVisible();
  await page.waitForFunction(() => sessionStorage.getItem("canopyx:twelfth-lazy") !== null, null, { timeout: 2000 });
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("canopyx:twelfth-lazy")))).toMatchObject({ version: 1, expanded: [["lazy"]] });
  expect(errors.some(message => message.includes("host load failure"))).toBe(true);
});

test("sidecar manifest owner is checked before caching and can be retried", async ({ page }) => {
  await open(page, view);
  const result = await page.evaluate(async () => {
    const id = "manifest-owner";
    const source = CanopyX.sources.sidecar({ id, source: { base: "/data/" } });
    CanopyXSidecar.push([id, "manifest", { protocol: "canopyx/2", type: "manifest", view: "other", root: "r/0" }]);
    let error = null;
    try { await source.manifest(); } catch (caught) { error = caught.message; }
    CanopyXSidecar.push([id, "manifest", { protocol: "canopyx/2", type: "manifest", view: id, root: "r/0" }]);
    return { error, owner: (await source.manifest()).view };
  });
  expect(result.error).toContain("view");
  expect(result.owner).toBe("manifest-owner");
});

for (const mismatch of ["key", "count"]) test(`sidecar shard ${mismatch} mismatch is retryable`, async ({ page }) => {
  await open(page, view);
  const result = await page.evaluate(async mismatch => {
    const id = "shard-" + mismatch;
    const source = CanopyX.sources.sidecar({ id, source: { base: "/data/" } });
    CanopyXSidecar.push([id, "manifest", { protocol: "canopyx/2", type: "manifest", view: id,
      root: "r/0", search: { entryCount: 1, entryFiles: [0], kinds: [], shards: { ab: 1 } } }]);
    CanopyXSidecar.push([id, "s/k-ab", { protocol: "canopyx/2", type: "searchShard", key: mismatch === "key" ? "wrong" : "ab",
      words: mismatch === "count" ? ["abacus", "abbey"] : ["abacus"], postings: mismatch === "count" ? [[0], [0]] : [[0]] }]);
    let error = null;
    try { await source.search("ab", 10); } catch (caught) { error = caught.message; }
    CanopyXSidecar.push([id, "s/k-ab", { protocol: "canopyx/2", type: "searchShard", key: "ab", words: ["abacus"], postings: [[0]] }]);
    CanopyXSidecar.push([id, "e/0", { protocol: "canopyx/2", type: "searchEntries", first: 0, stem: [], entries: [[-1, 0, "found", 0, "Abacus"]] }]);
    return { error, hits: (await source.search("ab", 10)).hits };
  }, mismatch);
  expect(result.error).toContain(mismatch === "key" ? "key" : "count");
  expect(result.hits).toEqual([{ path: ["found"], label: "Abacus" }]);
});

test("an expanded empty inline node remains a leaf across state restoration", async ({ page }) => {
  await open(page, { ...view, roots: [{ id: "empty", label: "Empty", expanded: true, children: [] },
    { id: "parent", label: "Parent", expanded: true, children: [{ id: "child", label: "Child" }] }] });
  const result = await page.evaluate(async () => {
    const api = document.querySelector(".cx-host").canopyx;
    const before = api.getState();
    await api.setState(before);
    return { before, after: api.getState() };
  });
  expect(result.before.expanded).toEqual([["parent"]]);
  expect(result.after).toEqual(result.before);
  await expect(page.locator('[data-cx-id="empty"]')).not.toHaveAttribute("aria-expanded");
});

test("fallback tone preserves the class added by a host cell decorator", async ({ page }) => {
  await open(page, { ...view, roots: [{ id: "one", label: "One", cells: { value: { value: "Warn", tone: "warning" } } }] });
  await page.evaluate(() => {
    const host = document.querySelector(".cx-host");
    const data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, renderers: { value(node, element) {
      element.classList.add("host-decorator");
      return false;
    } } });
    return api.ready;
  });
  const cell = page.locator('[data-cx-id="one"] [aria-colindex="2"]');
  await expect(cell).toHaveClass(/host-decorator/);
  await expect(cell).toHaveClass(/cx-tone-warning/);
  await expect(cell).toContainText("Warn");
  await page.evaluate(() => api.sort("name", "asc"));
  await nextFrames(page);
  await expect(cell).toHaveClass(/host-decorator/);
  await expect(cell).toHaveClass(/cx-tone-warning/);
});
