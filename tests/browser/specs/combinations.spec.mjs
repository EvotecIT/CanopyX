// Features that meet in the record drawer: the record panel, the edit form, conditional formatting and linked views, on
// one grid. Each extends the drawer through the grid's drawer hooks and the panel's contract (cx-drawer-paint,
// dialog._cxRecord, drawerFields), so they apply together and in a fixed order, also after a related-record jump.
import { test, expect } from "@playwright/test";
import { serveGrid, assetView } from "./editing-support.mjs";

test.beforeEach(async ({ page }) => {
  page.pageErrors = [];
  page.on("pageerror", error => page.pageErrors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(page.pageErrors).toEqual([]); });

const grid = "document.querySelector('[data-canopyx-host]').canopyx";
const drawer = page => page.locator("dialog.cx-drawer");

/** The asset register with a record panel (a related-assets collection), the edit form on every width and two drawer rules. */
function combinedView() {
  const view = assetView({
    editing: { drawer: "always" },
    formatRules: [
      { id: "repair", label: "In repair", when: { operator: "and", filters: [{ column: "status", operator: "eq", values: ["Repair"] }] }, column: "status", details: true, style: { tone: "danger", icon: "warning" } },
      { id: "costly", label: "Costly", when: { operator: "and", filters: [{ column: "cost", operator: "gt", values: [1000] }] }, column: "cost", details: true, style: { tone: "warning", badge: "high" } }
    ],
    record: {
      fields: [{ id: "serial", title: "Serial number" }, { id: "related", title: "Related assets" }],
      sections: [{ id: "asset", label: "Asset", fields: ["name", "cost", "status", "owner"] }, { id: "links", label: "Related", fields: ["related"] }],
      tabs: [{ id: "overview", label: "Overview", sections: ["asset"] }, { id: "related", label: "Related", sections: ["links"] }]
    }
  });
  view.rows.forEach((row, i) => {
    if (i === 8) Object.assign(row.cells, { owner: "", status: "Repair" });
    const others = [5, 9].map(k => (i + k) % view.rows.length);
    row.fields = { serial: "SN-" + (5000 + i), related: { records: { columns: [{ id: "tag", title: "Tag", kind: "text" }, { id: "name", title: "Name", kind: "text" }],
      target: { view: "assets", column: "tag", values: others.map(k => "AS-" + (1000 + k)) }, rows: others.map(k => ({ id: "a" + k, cells: { tag: "AS-" + (1000 + k), name: "Laptop " + k } })) } } };
  });
  return view;
}

test("the record drawer is an edit form whose fields keep their formatting, also after a related-record jump", async ({ page }) => {
  await serveGrid(page, { view: combinedView() });
  await page.evaluate(`${grid}.openDetails("a8")`);
  await expect(drawer(page).locator(".cx-drawer-h h4")).toHaveText("AS-1008");
  // Editing builds its editors first (hook 10), formatting decorates the same fields after it (hook 20).
  const status = drawer(page).locator('dd[data-cx-field="status"]');
  await expect(status.locator("select")).toHaveCount(1);
  await expect(status).toHaveClass(/cx-fmt/);
  await expect(drawer(page).locator('dd[data-cx-field="cost"] input')).toHaveCount(1);
  await expect(drawer(page).locator('dd[data-cx-field="cost"]')).toContainText("high");
  // An empty editable field stays in the panel (recordKeepField) with its editor.
  await expect(drawer(page).locator('dd[data-cx-field="owner"] input')).toHaveCount(1);
  // A related record opens in place: the drawer it replaces closes after the new form is built and must not dispose it.
  await drawer(page).getByRole("tab", { name: "Related" }).click();
  await drawer(page).locator(".cx-record-nested .cx-row[data-cx-id]").first().focus();
  await page.keyboard.press("Enter");
  await expect(drawer(page).locator(".cx-drawer-h h4")).toHaveText("AS-1013");
  await expect(drawer(page)).toHaveCount(1);
  await drawer(page).getByRole("tab", { name: "Overview" }).click();
  await expect.poll(() => drawer(page).locator("[data-cx-field] input, [data-cx-field] select").count()).toBeGreaterThanOrEqual(3);
  await expect(drawer(page).locator('dd[data-cx-field="name"] input')).toHaveValue("Laptop 13");
});

test("Open all in grid filters through the external filter API once the link part is in", async ({ page }) => {
  await serveGrid(page, { view: combinedView() });
  // Any link method loads the link part; until then Open all replaces the query's filters (record-panel-navigation spec).
  await page.evaluate(`${grid}.setHighlight([])`);
  await page.evaluate(`${grid}.openDetails("a0")`);
  await drawer(page).getByRole("tab", { name: "Related" }).click();
  await drawer(page).getByRole("button", { name: "Open all in grid" }).click();
  await expect(drawer(page)).toHaveCount(0);
  const chip = page.locator(".cx-link-chip");
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText("AS-1000 · Related assets");
  expect(await page.evaluate(`${grid}.getExternalFilters().map(filter => [filter.field, filter.values])`)).toEqual([["tag", ["AS-1005", "AS-1009"]]]);
  await expect(page.locator(".cx-row[data-cx-id]")).toHaveCount(2);
  // The reader's own conditions stay; removing the chip brings every row back.
  await chip.click();
  await expect.poll(() => page.locator(".cx-row[data-cx-id]").count()).toBeGreaterThan(2);
});
