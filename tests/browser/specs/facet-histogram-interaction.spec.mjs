// A reader can hold a histogram bar while a host refresh or pending field submission repaints the same distribution.
import { test, expect } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "grid", id: "histogram-input", label: "Histogram input", source: { kind: "inline" },
  pageSize: 200, rowHeight: 28, selection: "none", search: false,
  facets: { columns: [{ column: "age", kind: "range", bins: 16 }] },
  columns: [{ id: "name", title: "Name", kind: "text" }, { id: "age", title: "Age", kind: "number" }, { id: "category", title: "Category", kind: "text" }],
  rows: Array.from({ length: 101 }, (_, age) => ({ id: "r" + age, cells: { name: "Record " + age, age, category: age <= 50 ? "Low" : "High" } })) };
const age = page => page.locator('.cx-facet[data-cx-facet="age"]');
const api = page => page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getQuery().filters);

async function open(page) {
  await page.route("http://canopyx.test/histogram-input", route => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("http://canopyx.test/histogram-input");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.ready);
  await expect(age(page).locator(".cx-facet-bar")).toHaveCount(16); await nextFrames(page);
}

test("a histogram choice survives an equivalent query repaint between pointer press and release", async ({ page }) => {
  await open(page);
  await age(page).getByLabel("From", { exact: true }).fill("30");
  await age(page).getByLabel("To", { exact: true }).fill("60");
  await age(page).getByLabel("To", { exact: true }).press("Enter");
  await expect.poll(() => api(page)).toEqual([{ column: "age", operator: "ge", values: [30] }, { column: "age", operator: "le", values: [60] }]);
  await age(page).getByLabel("From", { exact: true }).fill("90");
  await age(page).getByLabel("From", { exact: true }).press("Enter");
  await expect(age(page).locator('.cx-facet-note:not(.cx-facet-custom):not(.cx-facet-error)')).toHaveText("From must not be after To.");
  const box = await age(page).locator(".cx-facet-bar").nth(2).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  try { await page.evaluate(() => { const grid = document.querySelector("[data-canopyx-host]").canopyx; return grid.setQuery(grid.getQuery()); }); }
  finally { await page.mouse.up(); }
  await expect.poll(() => api(page)).toEqual([{ column: "age", operator: "ge", values: [12.5] }, { column: "age", operator: "lt", values: [18.75] }]);
});

test("changed histogram bounds retain shift selection and the last inclusive bar", async ({ page }) => {
  await open(page);
  await age(page).locator(".cx-facet-bar").nth(2).click();
  await expect.poll(() => api(page)).toEqual([{ column: "age", operator: "ge", values: [12.5] }, { column: "age", operator: "lt", values: [18.75] }]);
  await age(page).locator(".cx-facet-bar").nth(4).click({ modifiers: ["Shift"] });
  await expect.poll(() => api(page)).toEqual([{ column: "age", operator: "ge", values: [12.5] }, { column: "age", operator: "lt", values: [31.25] }]);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setQuery({ filters: [{ column: "category", operator: "eq", values: ["Low"] }] }));
  await expect(age(page).locator(".cx-facet-axis span").last()).toHaveText("50");
  await age(page).locator(".cx-facet-bar").nth(2).click();
  await expect.poll(() => api(page)).toEqual([{ column: "category", operator: "eq", values: ["Low"] }, { column: "age", operator: "ge", values: [6.25] }, { column: "age", operator: "lt", values: [9.375] }]);
  await age(page).locator(".cx-facet-bar").last().click();
  await expect.poll(() => api(page)).toEqual([{ column: "category", operator: "eq", values: ["Low"] }, { column: "age", operator: "ge", values: [46.875] }, { column: "age", operator: "le", values: [50] }]);
  await age(page).locator(".cx-facet-bar").last().click();
  await expect.poll(() => api(page)).toEqual([{ column: "category", operator: "eq", values: ["Low"] }]);
});
