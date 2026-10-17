// The fixture is serialized by NestedTreeDetailExample through the public .NET view/detail APIs.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { examples } from "./support.mjs";
import { serveGrid } from "./column-groups-support.mjs";

test.use({ timezoneId: "America/New_York" });
const fixture = local => JSON.parse(fs.readFileSync(path.join(examples, `nested-tree-detail${local ? "-local" : ""}.json`), "utf8"));
const detail = page => page.locator('.cx-detail-row[data-cx-detail="north"]');
const node = (page, id) => detail(page).locator(`.cx-detail-view .cx-row[data-cx-id="${id}"]`);
const text = (page, id, column = 0) => node(page, id).locator(".cx-cell").nth(column).locator(".cx-text");
async function open(page, view, { theme = "light", labels = "" } = {}) {
  await serveGrid(page, view, { runtime: "canopyx-reporting", lang: "pl",
    options: `{onPrint:({snapshot})=>{window.printed=snapshot;},${labels ? "labels:" + labels + "," : ""}}` });
  await page.locator("#host").evaluate((host, theme) => host.setAttribute("data-cx-theme", theme), theme);
  await page.evaluate(() => api.expandDetail("north"));
  await expect(detail(page).locator('.cx-detail-view [role="treegrid"]')).toBeVisible();
}

test.beforeEach(({ page }) => { page.pageErrors = []; page.on("pageerror", error => page.pageErrors.push(error.message)); });
test.afterEach(async ({ page }) => { expect(page.pageErrors).toEqual([]); expect(await page.evaluate(() => window.errors)).toEqual([]); });

for (const local of [false, true]) test(`native nested tree mounts, expands and retains its ${local ? "local" : "UTC"} context in export and print`, async ({ page }) => {
  const view = fixture(local);
  expect(view.reporting.detail.view.type).toBe("view");
  expect(view.rows[0].detail.type).toBe("tree");
  await open(page, view);
  await expect(text(page, "services")).toHaveText("Operations & Support");
  await expect(node(page, "shared")).toHaveCount(0);
  await node(page, "services").focus(); await page.keyboard.press("ArrowRight");
  await expect(text(page, "compute")).toBeInViewport({ ratio: 1 });
  await expect(text(page, "shared")).toHaveText("Shared services");
  await expect(text(page, "restricted")).toHaveText("");
  const number = await page.evaluate(() => new Intl.NumberFormat("pl").format(2000));
  await expect(text(page, "compute")).toHaveText(number);
  await expect(text(page, "services", 1)).toHaveText("Available");
  await expect(text(page, "shared", 1)).toHaveText("Unavailable");
  const moment = local ? "2026-10-15 08:30" : "2026-10-15 12:30 service UTC";
  await expect(text(page, "services", 2)).toHaveText(moment);
  const rows = await page.evaluate(async () => { const rows = []; for await (const row of api.prepareExport({ scope: "filtered" }).rows()) rows.push(row); return rows; });
  expect(rows[0].detail).toEqual({ type: "table", columns: ["Service / capacity", "Availability", "Checked"], rows: [
    ["Operations & Support", "Available", moment], ["  Shared services", "Unavailable", moment],
    ["  ", "Unavailable", moment], ["  " + number, "Unavailable", moment] ] });
  await page.evaluate(() => api.print({ scope: "filtered", maxRows: 10 }));
  expect(await page.evaluate(() => window.printed.rows[0].detail)).toEqual(rows[0].detail);
  expect(await page.evaluate(() => api.view.rows)).toEqual(view.rows);
});

test("nested detail export uses host label overrides in the same order as the mounted tree", async ({ page }) => {
  await open(page, fixture(false), { labels: "{yes:'Host available',utcTime:'{time} host UTC'}" });
  await expect(text(page, "services", 1)).toHaveText("Host available");
  await expect(text(page, "services", 2)).toHaveText("2026-10-15 12:30 host UTC");
  const result = await page.evaluate(async () => { for await (const row of api.prepareExport({ scope: "filtered" }).rows()) return row.detail; });
  expect(result.rows[0]).toEqual(["Operations & Support", "Host available", "2026-10-15 12:30 host UTC"]);
});

for (const theme of ["light", "dark"]) for (const width of [1440, 390]) test(`native nested tree stays inside its detail at ${width} in ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await open(page, fixture(false), { theme });
  await node(page, "services").focus(); await page.keyboard.press("ArrowRight");
  await expect(text(page, "compute")).toBeInViewport({ ratio: 1 });
  await expect(text(page, "shared")).toBeVisible(); await expect(text(page, "restricted")).toHaveText("");
  const bounds = await detail(page).locator(".cx-detail-body").evaluate(body => {
    const box = body.getBoundingClientRect(), grid = document.querySelector("#host > .cx-data-grid .cx-grid") || document.querySelector("#host .cx-grid"), outer = grid.getBoundingClientRect();
    return { left: box.left - outer.left, right: outer.right - box.right };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(-1); expect(bounds.right).toBeGreaterThanOrEqual(-1);
  await expect(detail(page).locator(".cx-detail-view")).toHaveAttribute("data-cx-theme", theme);
  await page.screenshot({ path: test.info().outputPath(`nested-tree-${theme}-${width}.png`) });
});
