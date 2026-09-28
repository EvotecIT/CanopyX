import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "nineteenth", label: "Contracts",
  columns: [{ id: "name", title: "Name", width: 300, sortable: true }, { id: "value", title: "Value", width: 160 }],
  source: { kind: "inline" }, roots: [{ id: "keep", label: "Keep" }, { id: "other", label: "Other" }] };

async function open(page, data = view) {
  await page.route("https://canopyx.test/", route => route.fulfill({ contentType: "text/html", body: viewPage(data) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

test("filtering retains a matching row's edited host control", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, renderCell(node, column, cell) {
      if (column !== "value") return false;
      const input = document.createElement("input");
      input.setAttribute("aria-label", "Host edit " + node.id);
      cell.appendChild(input);
      return true;
    } });
    await api.ready;
  });
  const edit = page.getByRole("textbox", { name: "Host edit keep" });
  await edit.fill("Unsaved");
  await page.evaluate(() => { window.originalInput = document.querySelector('[aria-label="Host edit keep"]');
    api.setFilter(node => node.id === "keep"); });
  await nextFrames(page);
  await expect(edit).toHaveValue("Unsaved");
  expect(await page.evaluate(() => originalInput === document.activeElement && originalInput.isConnected)).toBe(true);
  await expect(page.locator('[data-cx-id="other"]')).toHaveCount(0);
});

test("header sort button owns Enter and Space", async ({ page }) => {
  await open(page);
  const button = page.getByRole("button", { name: "Name" });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending");
  await page.keyboard.press("Space");
  await expect(page.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "descending");
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.getSelected())).toEqual([]);
});

test("a slow search cannot reopen results after the input blurs", async ({ page }) => {
  await open(page, { ...view, search: { minLength: 2, maxResults: 10, placeholder: "Search" } });
  await page.evaluate(async () => {
    const host = document.querySelector(".cx-host"), data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, source: { canSearch: true,
      page: async () => ({ items: [{ id: "keep", label: "Keep" }], next: null }),
      search: async () => new Promise(resolve => { window.finishSearch = resolve; })
    } });
    await api.ready;
  });
  const input = page.getByRole("combobox", { name: "Search" });
  await input.fill("keep");
  await page.waitForFunction(() => !!window.finishSearch);
  await input.press("Tab");
  await page.evaluate(() => finishSearch({ hits: [{ path: ["keep"], label: "Keep" }], total: 1, truncated: false }));
  await page.waitForTimeout(180);
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("listbox", { name: "Search results" })).toBeHidden();
});

for (const ref of ["../root", "c/./child", "c/../child"]) {
  test(`sidecar rejects dot path component ${ref} before loading`, async ({ page }) => {
    await open(page);
    let requests = 0;
    await page.route("https://canopyx.test/data/**", route => { requests++; return route.abort(); });
    const message = await page.evaluate(async ref => {
      const source = CanopyX.sources.sidecar({ id: "nineteenth", source: { kind: "sidecar", base: "/data/" } });
      try { await source.page({ id: "parent", ref }, null); return "accepted"; }
      catch (error) { return error.message; }
    }, ref);
    expect(message).toContain("dot path component");
    expect(requests).toBe(0);
  });
}
