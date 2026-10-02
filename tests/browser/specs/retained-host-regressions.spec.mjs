import { expect, test } from "@playwright/test";
import path from "node:path";
import { nextFrames, repo, viewPage } from "./support.mjs";
const view = { protocol: "canopyx/2", type: "view", id: "retained-host", label: "Retained host",
  columns: [{ id: "name", title: "Name", width: 500 }], source: { kind: "inline" }, roots: [] };
async function open(page) {
  await page.route("https://canopyx.test/", r => r.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/"); await page.waitForSelector("[data-cx-ready]");
}
for (const [level, detail] of [["root", false], ["root", true], ["child", false], ["child", true], ["parent", false]]) {
  test(`settling ${level} paging preserves an edited ${detail ? "detail" : "cell"} control and updates ARIA metadata`, async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message)); await open(page);
    await page.evaluate(async ({ level, detail }) => {
      const host = document.querySelector(".cx-host"), data = host.canopyx.view; host.canopyx.destroy(); let calls = 0;
      const editorId = level === "parent" ? "parent" : "existing";
      const render = (node, el) => {
        if (node.id !== editorId) return false;
        const input = document.createElement("input"); input.setAttribute("aria-label", "Host input"); el.appendChild(input); return true;
      };
      const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async node => {
        if (level !== "root" && !node) return { items: [{ id: "parent", label: "Parent", hasChildren: true, expanded: true }] };
        if (++calls === 1) return { items: [{ id: "existing", label: "Existing", ...(detail ? { detail: { type: "html", html: "", height: 1 } } : {}) }], next: "second" };
        return new Promise(resolve => { window.finishPage = resolve; });
      } }, renderers: Object.fromEntries(data.columns.map(column => [column.id, render])), renderDetail: render }); await api.ready;
    }, { level, detail });
    await page.locator("[data-cx-status=more]").focus(); await page.keyboard.press("Enter");
    await page.waitForFunction(() => !!window.finishPage);
    const input = page.getByRole("textbox", { name: "Host input" }); await input.fill("Unsaved host text");
    await page.evaluate(() => { window.originalControl = document.activeElement; window.finishPage({ items: [{ id: "new", label: "New" }], next: null }); });
    await expect(page.locator('[data-cx-id="new"]')).toBeVisible(); await nextFrames(page);
    await expect(input).toBeFocused(); await expect(input).toHaveValue("Unsaved host text");
    expect(await page.evaluate(() => document.activeElement === window.originalControl && window.originalControl.isConnected)).toBe(true);
    await expect(page.locator('[data-cx-id="existing"]')).toHaveAttribute("aria-setsize", "2");
    if (level !== "root") await expect(page.locator('[data-cx-id="parent"]')).not.toHaveAttribute("aria-busy", "true");
    await expect(page.locator("[data-cx-status]")).toHaveCount(0); expect(errors).toEqual([]);
    if (level === "child" && detail) await page.screenshot({ path: path.join(repo, "artifacts/takeover/sixth-retained-detail-control.png") });
  });
}
for (const callback of ["event", "onLoad"]) {
  test(`public focus from a ${callback} handler enters a visible row after the final page`, async ({ page }) => {
    await open(page);
    await page.evaluate(async callback => {
      const host = document.querySelector(".cx-host"), data = host.canopyx.view; host.canopyx.destroy(); let calls = 0;
      const api = CanopyX.createTreeGrid(host, { view: data, source: { page: async () => {
        if (++calls === 1) return { items: [{ id: "first", label: "First" }], next: "second" };
        return new Promise(resolve => { window.finishPage = resolve; });
      } }, ...(callback === "onLoad" ? { onLoad() { if (calls > 1) host.canopyx.focus(); } } : {}) }); await api.ready;
      if (callback === "event") host.addEventListener("canopyx:load", () => api.focus());
    }, callback);
    await page.locator("[data-cx-status=more]").focus(); await page.keyboard.press("Enter");
    await page.waitForFunction(() => !!window.finishPage);
    await page.evaluate(() => window.finishPage({ items: [{ id: "second", label: "Second" }], next: null })); await nextFrames(page);
    await expect(page.locator('[data-cx-id="first"]')).toBeFocused();
    await expect(page.locator("[data-cx-status]")).toHaveCount(0);
    await expect(page.locator(".cx-row[tabindex='0']")).toHaveCount(1);
  });
}
