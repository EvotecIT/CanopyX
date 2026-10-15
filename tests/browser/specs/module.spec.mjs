import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { repo, row, nextFrames } from "./support.mjs";

const assets = path.join(repo, "CanopyX.Html/Assets");
const runtime = fs.readFileSync(path.join(assets, "canopyx-module.mjs"), "utf8");
const style = fs.readFileSync(path.join(assets, "canopyx-interactive.css"), "utf8");
const view = { protocol: "canopyx/2", type: "view", id: "module", label: "Module files", rowHeight: 28,
  pageSize: 100, selection: "multiple", checkboxes: "hierarchical", columns: [{ id: "name", title: "Name", kind: "text", width: 320, editable: true },
    { id: "size", title: "Size", kind: "number", width: 120 }],
  source: { kind: "inline" }, roots: [{ id: "a", label: "Atlas" }, { id: "b", label: "Beacon" }] };

async function serve(page, script, body = '<div id="tree" class="cx-host"></div>', classic = "") {
  await page.route("https://module.test/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/runtime.mjs") return route.fulfill({ contentType: "text/javascript", body: runtime });
    if (pathname === "/classic.js") return route.fulfill({ contentType: "text/javascript", body: classic });
    // The tree tools part loads from beside the module, as a host serves it.
    if (/^\/canopyx-tree-tools\.(js|css)$/.test(pathname)) return route.fulfill({ contentType: pathname.endsWith(".css") ? "text/css" : "text/javascript", body: fs.readFileSync(path.join(assets, pathname.slice(1)), "utf8") });
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Module host</title><style>'
      + style + '</style>' + (classic ? '<script src="/classic.js"></script>' : "")
      + '</head><body class="cx-page">' + body + '<script type="module">' + script + '</script></body></html>' });
  });
  await page.goto("https://module.test/");
}

test("module exports mount a complete interactive tree and reuse its host", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await serve(page, `import CanopyX, {createTreeGrid,protocol,labels} from '/runtime.mjs';
    window.api=createTreeGrid(document.getElementById('tree'),{view:${JSON.stringify(view)},
      renderers:{name(node,element,context){window.rendererColumn=context.column;return false}},
      onEdit(proposal,context){window.editContext={query:context.query,revision:context.revision};return true}});
    await api.ready;
    window.moduleState={same:api===CanopyX.createTreeGrid(api.element,{view:api.view}),global:CanopyX===window.CanopyX,protocol,save:labels.saveEdit};`);
  await expect.poll(() => page.evaluate(() => window.moduleState)).toEqual({ same: true, global: true, protocol: "canopyx/2", save: "Save" });
  await row(page, "a").press("Space");
  expect(await page.evaluate(() => api.getCheckState("a"))).toBe(true);
  await row(page, "a").press("Alt+Enter");
  await expect(page.getByRole("dialog", { name: "Edit Name" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row(page, "a")).toBeFocused();
  expect(await page.evaluate(() => window.rendererColumn)).toBe("name");
  expect(await page.evaluate(() => { api.toOutline(); return window.rendererColumn; })).toBe("name");
  expect(await page.evaluate(() => api.requestEdit("a", "name", "Updated"))).toBe(true);
  expect(await page.evaluate(() => window.editContext)).toEqual({ query: null, revision: null });
  expect(errors).toEqual([]);
});

test("module hosts configure automatic fragments before the document mount", async ({ page }) => {
  const body = `<div class="cx-host" data-canopyx-host><script type="application/json" class="cx-config">${JSON.stringify(view)}</script></div>`;
  await serve(page, `import CanopyX from '/runtime.mjs'; CanopyX.configure('module',{labels:{columns:'Choose fields'}});`, body);
  await page.waitForSelector("[data-cx-ready]");
  await expect(page.getByText("Choose fields", { exact: true })).toBeVisible();
  await expect(page.getByRole("treegrid", { name: "Module files" })).toBeVisible();
});

test("module reuse retains the complete classic runtime and its existing mounted grid", async ({ page }) => {
  const classic = fs.readFileSync(path.join(assets, "canopyx-interactive.js"), "utf8");
  await serve(page, `const original=CanopyX;
    const first=original.createTreeGrid(document.getElementById('tree'),{view:${JSON.stringify(view)}}); await first.ready;
    const imported=await import('/runtime.mjs');
    window.identity={runtime:imported.default===original,grid:imported.createTreeGrid(first.element,{view:first.view})===first};`, undefined, classic);
  await expect.poll(() => page.evaluate(() => window.identity)).toEqual({ runtime: true, grid: true });
  await nextFrames(page);
  await expect(page.locator(".cx-grid")).toHaveCount(1);
});

test("an earlier core script fails module import without replacing its runtime", async ({ page }) => {
  const classic = fs.readFileSync(path.join(assets, "canopyx.js"), "utf8");
  await serve(page, `const original=CanopyX;
    try { await import('/runtime.mjs'); window.imported=true; }
    catch(error) { window.failure={message:error.message,same:CanopyX===original}; }`, undefined, classic);
  await expect.poll(() => page.evaluate(() => window.failure)).toEqual({ same: true,
    message: "CanopyX: load the interactive runtime or module before the core script." });
  expect(await page.evaluate(() => window.imported)).toBeUndefined();
});

test("the module and complete stylesheet retain the interactive asset budget", () => {
  expect(gzipSync(runtime).length + gzipSync(style).length).toBeLessThanOrEqual(64 * 1024);
});
