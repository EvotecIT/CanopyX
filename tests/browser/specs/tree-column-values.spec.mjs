import { test, expect } from "@playwright/test";
import { viewPage } from "./support.mjs";

async function open(page, view) {
  await page.route("https://canopyx.test/column-values", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/column-values");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => { window.api = () => document.querySelector(".cx-host").canopyx; });
  await page.evaluate(() => api().ready);
}

for (const pageSize of [2, 100]) test(`tree declared categories sort typed raw tokens before paging and export (${pageSize})`, async ({ page }) => {
  const entries = [["a", { value: "a", sort: "000" }], ["z2", "z"], ["B", "B"], ["null", null],
    ["z1", { value: "z", sort: "zzz" }], ["A", "A"], ["boolean", true], ["string", "true"], ["empty", ""]];
  const view = { protocol: "canopyx/2", type: "view", id: "categories", label: "Categories", pageSize, source: { kind: "inline" },
    columns: [{ id: "name", title: "Record", kind: "text", width: 260 },
      { id: "state", title: "State", kind: "text", sortable: true, width: 180,
        valueOrder: ["z", "a", "true", ""], valueLabels: { z: "First", a: "Second", true: "String true", "": "Empty token" } }],
    roots: entries.map(([id, state]) => ({ id, label: id, cells: { state } })) };
  await open(page, view);
  const ascending = ["z2", "z1", "a", "string", "empty", "boolean", "A", "B", "null"];
  await page.evaluate(() => api().sort("state", "asc"));
  expect(await page.evaluate(() => api().visibleRows().map(row => row.node.id))).toEqual(ascending.slice(0, pageSize));
  const exported = await page.evaluate(async () => {
    const rows = []; for await (const row of api().prepareExport({ scope: "all", values: "raw" }).rows()) rows.push(row); return rows;
  });
  expect(exported.map(row => row.id)).toEqual(ascending);
  expect(exported.find(row => row.id === "z1").cells.state.value).toBe("z");
  expect(exported.find(row => row.id === "boolean").cells.state.value).toBe(true);
  if (pageSize === 2) {
    await page.evaluate(() => api().loadMore());
    expect(await page.evaluate(() => api().visibleRows().map(row => row.node.id))).toEqual(ascending.slice(0, 4));
  }
  await page.evaluate(() => api().sort("state", "desc"));
  const descending = ["B", "A", "boolean", "empty", "string", "a", "z2", "z1", "null"];
  expect(await page.evaluate(() => api().visibleRows().map(row => row.node.id))).toEqual(descending.slice(0, pageSize === 2 ? 4 : pageSize));
  expect(await page.evaluate(() => api().view.roots.map(node => node.id))).toEqual(entries.map(([id]) => id));
});

for (const rich of [false, true]) for (const theme of ["light", "dark"]) test(`tree category and first-match numeric tones reach cells and ${rich ? "rich" : "plain"} drawers (${theme})`, async ({ page }, testInfo) => {
  const rules = [{ operator: "below", value: 0, tone: "danger", label: "Overdue" },
    { operator: "atMost", value: 14, tone: "warning", label: "Review soon" }];
  const view = { protocol: "canopyx/2", type: "view", id: "tones", label: "Tones", source: { kind: "inline" },
    columns: [{ id: "name", title: "Record", kind: "text", width: 260 },
      { id: "state", title: "State", kind: "text", width: 160, valueLabels: { z: "First" }, valueTones: { z: "warning" } },
      { id: "days", title: "Days", kind: "number", width: 160, numericTones: rules }],
    ...(rich ? { record: { fields: [{ id: "extra", title: "Extra", kind: "number", numericTones: rules }] } } : {}),
    roots: [{ id: "negative", label: "Negative", cells: { state: "z", days: -1 }, fields: { extra: -2 } },
      { id: "positive", label: "Positive", cells: { state: "unknown", days: 40 } }] };
  await open(page, view);
  await page.locator('.cx-host').evaluate((host, theme) => host.setAttribute('data-cx-theme', theme), theme);
  const row = page.locator('[data-cx-id="negative"]');
  await expect(row.locator('[aria-colindex="2"]')).toHaveClass(/cx-tone-warning/);
  await expect(row.locator('[aria-colindex="2"]')).toHaveText("First");
  await expect(row.locator('[aria-colindex="3"]')).toHaveClass(/cx-tone-danger/);
  await expect(row.locator('[aria-colindex="3"]')).toHaveAttribute("title", "Overdue");
  await expect(row.locator('[aria-colindex="3"]')).toHaveAttribute("aria-description", "Overdue");
  await expect(page.locator('[data-cx-id="positive"] [aria-colindex="3"]')).not.toHaveAttribute("aria-description");
  await page.evaluate(() => api().openDetails("negative"));
  await expect(page.locator('.cx-drawer dd[data-cx-field="state"] .cx-drawer-text')).toHaveClass(/cx-tone-warning/);
  const number = page.locator('.cx-drawer dd[data-cx-field="days"]');
  await expect(number.locator('.cx-drawer-text')).toHaveClass(/cx-tone-danger/);
  await expect(number.locator('.p-sub')).toHaveText("Overdue");
  if (rich) await expect(page.locator('.cx-drawer dd[data-cx-field="extra"] .p-sub')).toHaveText("Overdue");
  await page.screenshot({ path: testInfo.outputPath(`tree-tones-${rich ? "rich" : "plain"}-${theme}.png`) });
  const raw = await page.evaluate(async () => { for await (const row of api().prepareExport({ scope: "all", values: "raw" }).rows()) return row.cells; });
  expect(raw.days.value).toBe(-1); expect(raw.state.value).toBe("z");
});
