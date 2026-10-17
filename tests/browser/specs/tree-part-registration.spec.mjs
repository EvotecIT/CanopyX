// Interactive tree wrappers share their view kind's lazy part registry. Installing tree tools (which adds Export)
// must retain declared highlight/layout parts in standalone trees and trees inside grid detail definitions.
import { test, expect } from "@playwright/test";
import { open } from "./view-modes-support.mjs";

const leaf = () => ({ protocol: "canopyx/2", type: "view", id: "leaf", label: "Nested tree", rowHeight: 28,
  pageSize: 100, selection: "single", columns: [{ id: "name", title: "Name", kind: "text" }],
  source: { kind: "inline" }, roots: [{ id: "needle", label: "Needle" }], searchHighlight: true, layout: {} });

function nested(depth) {
  let view = leaf(), payload = { type: "tree", roots: view.roots };
  view.roots = [];
  for (let level = depth; level > 0; level--) {
    const row = { id: "row-" + level, cells: { name: "Level " + level }, detail: payload };
    view = { protocol: "canopyx/2", type: "grid", id: "level-" + level, label: "Level " + level, rowHeight: 34,
      pageSize: 100, selection: "none", columns: [{ id: "name", title: "Name", kind: "text" }],
      source: { kind: "inline" }, reporting: { detail: { view } }, rows: [] };
    payload = { type: "grid", rows: [row] };
  }
  view.rows = payload.rows;
  return view;
}

async function verifyModes(host) {
  const result = await host.evaluate(async host => {
    await host.canopyx.ready;
    await host.canopyx.setSearchHighlight(true);
    await host.canopyx.setLayout({ mode: "scroll", density: "compact" });
    return { matches: host.canopyx.getMatches(), layout: host.canopyx.getLayout() };
  });
  expect(result.matches).toMatchObject({ enabled: true, complete: true });
  expect(result.layout).toMatchObject({ mode: "scroll", density: "compact" });
  await expect(host).toHaveAttribute("data-cx-layout", "scroll");
  await expect(host.locator('.cx-row[data-cx-id="needle"]')).toBeVisible();
  // The registry remains available for repeated public API use after both parts have installed.
  await host.evaluate(async host => { await host.canopyx.setSearchHighlight(false); await host.canopyx.setLayout({ mode: "fit" }); });
  expect(await host.evaluate(host => host.canopyx.getMatches().enabled)).toBe(false);
  await expect(host).not.toHaveAttribute("data-cx-layout", /./);
}

for (const runtime of ["tree", "interactive", "grid", "reporting"]) test(`standalone tree retains highlight and layout after lazy tree tools install in the ${runtime} runtime`, async ({ page }) => {
  await open(page, leaf(), { runtime, script: "window.runtimeErrors=[];document.addEventListener('canopyx:error',e=>runtimeErrors.push(String(e.detail.error)),true);" });
  await verifyModes(page.locator("[data-canopyx-host]").first());
  expect(await page.evaluate(() => runtimeErrors)).toEqual([]);
  expect(page.errors).toEqual([]);
});

for (const depth of [1, 3]) test(`tree at detail depth ${depth} retains highlight and layout after lazy tree tools install in the reporting runtime`, async ({ page }) => {
  const runtime = "reporting";
  await open(page, nested(depth), { runtime, height: 750,
    script: "window.runtimeErrors=[];document.addEventListener('canopyx:error',e=>runtimeErrors.push(String(e.detail.error)),true);" });
  let host = page.locator("[data-canopyx-host]").first();
  for (let level = 1; level <= depth; level++) {
    await host.evaluate((host, id) => host.canopyx.expandDetail(id), "row-" + level);
    host = host.locator(":scope > .cx-grid .cx-detail-view").first();
    await expect(host).toBeVisible();
    await host.evaluate(host => host.canopyx.ready);
  }
  await verifyModes(host);
  expect(await page.evaluate(() => runtimeErrors)).toEqual([]);
  expect(page.errors).toEqual([]);
});
