// Editing: full-row mode, read-only rules, custom editors from plugins, the phone edit form and accessibility.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { serveGrid, assetView, cell } from "./editing-support.mjs";

test.beforeEach(async ({ page }) => {
  page.pageErrors = [];
  page.on("pageerror", error => page.pageErrors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(page.pageErrors).toEqual([]); });

const grid = "document.querySelector('[data-canopyx-host]').canopyx";

test("full-row mode edits every editable cell of a row, Tab moves between them and Enter applies the row as one step", async ({ page }) => {
  await serveGrid(page, { script: `CanopyX.configure("assets", { editing: { mode: "row" }, onRowCommit: detail => { events.push(detail.values); } });` });
  await cell(page, "a0", 1).click();
  await page.keyboard.press("F2");
  const row = page.locator('.cx-row[data-cx-id="a0"]');
  await expect(row.locator(".cx-editor-host")).toHaveCount(8);
  await expect(cell(page, "a0", 1).locator("input")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.type("Row name");
  await page.keyboard.press("Tab");
  await expect(cell(page, "a0", 2).locator("input")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.type("1500");
  await page.keyboard.press("Enter");
  await expect(row.locator(".cx-editor-host")).toHaveCount(0);
  // Enter moves down in the column of the editor it was pressed in.
  await expect(cell(page, "a1", 2)).toBeFocused();
  expect(await page.evaluate(() => events)).toEqual([{ name: "Row name", cost: 1500 }]);
  // One undo takes the whole row back; Escape leaves a row without changes.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(cell(page, "a0", 1)).toHaveText("Laptop 0");
  await expect(cell(page, "a0", 2)).toHaveText("900");
  await page.keyboard.press("F2");
  await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.type("Discarded");
  await page.keyboard.press("Escape");
  await expect(cell(page, "a1", 1)).toHaveText("Laptop 1");
  expect(await page.evaluate(`${grid}.getChanges()`)).toEqual([]);
});

test("read-only rules: the whole grid, a row through isEditable, and setReadOnly", async ({ page }) => {
  await serveGrid(page, { script: `CanopyX.configure("assets", { editing: { isEditable: (row, column) => row.cells.status !== "Retired" || column === "status" } });` });
  // a3 is retired: only its status can change.
  await cell(page, "a3", 1).click();
  await page.keyboard.press("F2");
  await expect(cell(page, "a3", 1).locator("input")).toHaveCount(0);
  await expect(cell(page, "a3", 1)).toHaveAttribute("aria-readonly", "true");
  expect(await page.evaluate(`${grid}.beginEdit("a3", "status")`)).toBe(true);
  await page.keyboard.press("Escape");
  await page.evaluate(`${grid}.setReadOnly(true)`);
  await expect(cell(page, "a0", 1)).toHaveAttribute("aria-readonly", "true");
  expect(await page.evaluate(`${grid}.beginEdit("a0", "name")`)).toBe(false);
  await cell(page, "a0", 1).dblclick();
  await expect(page.locator(".cx-editor-host")).toHaveCount(0);
  await page.evaluate(`${grid}.setReadOnly(false)`);
  expect(await page.evaluate(`${grid}.beginEdit("a0", "name")`)).toBe(true);
});

test("a read-only view stays read-only until the host allows editing", async ({ page }) => {
  await serveGrid(page, { view: assetView({ editing: { readOnly: true } }) });
  expect(await page.evaluate(`${grid}.beginEdit("a0", "name")`)).toBe(false);
});

test("plugins and hosts register custom editors that columns choose by name", async ({ page }) => {
  await serveGrid(page, { view: assetView({}, { cost: { editor: { type: "stars" } } }), script: `CanopyX.use({ name: "stars-editor", editors: { stars: { create(context) {
    const select = document.createElement("select");
    for (let i = 0; i <= 5; i++) select.add(new Option("★".repeat(i) || "none", String(i)));
    select.value = String(Math.min(5, Math.round(context.value / 500)));
    return { element: select, getValue: () => Number(select.value) * 500 };
  } } } });` });
  const cost = cell(page, "a0", 2);
  await cost.click(); await page.keyboard.press("Enter");
  await cost.locator("select").selectOption("4");
  await page.keyboard.press("Enter");
  expect((await page.evaluate(`${grid}.getChanges()`))[0].values).toEqual({ cost: 2000 });
});

test("an unknown editor name is reported and editing stays off", async ({ page }) => {
  await serveGrid(page, { view: assetView({}, { cost: { editor: "nothing" } }) });
  expect(await page.evaluate(() => window.errors)).toEqual(["CanopyX: column cost names an editor nobody registered."]);
});

for (const theme of ["light", "dark"]) {
  test(`on a phone the record drawer is an edit form with the same checks (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await serveGrid(page, { theme, height: 700, script: `CanopyX.configure("assets", { onRowCommit: detail => { events.push(detail.values); return { status: "saved" }; } });` });
    await page.locator('.cx-row[data-cx-id="a0"]').click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveClass(/cx-edit-form/);
    const name = drawer.getByRole("textbox", { name: "Edit Name" });
    await name.fill("");
    await drawer.getByRole("button", { name: "Save" }).click();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(drawer.getByText("Name is required.")).toBeVisible();
    await expect(drawer.getByRole("alert")).toHaveText("Errors: 1");
    expect(await page.evaluate(id => document.getElementById(id).textContent, await name.getAttribute("aria-describedby"))).toBe("Name is required.");
    await name.fill("Phone edit");
    await drawer.getByRole("combobox", { name: "Edit Owner" }).fill("chen");
    await page.getByRole("option", { name: "Chen Wu" }).click();
    await drawer.getByRole("button", { name: "Save" }).click();
    await expect(drawer).toBeHidden();
    expect(await page.evaluate(() => events)).toEqual([{ name: "Phone edit", owner: "Chen Wu" }]);
    await expect(cell(page, "a0", 0)).toBeVisible();
    const results = await new AxeBuilder({ page }).include(".cx-host").analyze();
    expect(results.violations.map(item => item.id)).toEqual([]);
  });
}

for (const [width, theme] of [[1440, "light"], [1440, "dark"], [390, "light"], [390, "dark"]]) {
  test(`an open editor, a changed cell, an invalid cell and the edit bar pass the accessibility checks (${theme}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await serveGrid(page, { theme, script: `CanopyX.configure("assets", { editing: { validators: { name: value => value === "Taken" ? "That name is taken." : null } } });` });
    await page.evaluate(`${grid}.setCellValue("a1", "name", "Taken")`);
    await page.evaluate(`${grid}.setCellValue("a2", "cost", 1)`);
    // A phone shows fewer columns; the lookup column is edited in the drawer there.
    expect(await page.evaluate(`${grid}.beginEdit("a0", "${width > 640 ? "owner" : "name"}")`)).toBe(true);
    if (width > 640) { await page.getByRole("combobox").fill("a"); await expect(page.getByRole("listbox")).toBeVisible(); }
    else await page.keyboard.type("!");
    await expect(page.locator(".cx-editbar")).toBeVisible();
    const results = await new AxeBuilder({ page }).include(".cx-host").analyze();
    expect(results.violations.map(item => item.id + ": " + item.nodes.map(node => node.target.join(" ")).join(", "))).toEqual([]);
  });
}

test.describe("touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  test("a tap opens the edit form, and plugin events see the changes it saves", async ({ page }) => {
    await serveGrid(page, { height: 700, script: `CanopyX.use({ name: "audit-log", events: { cellValueChanged: event => events.push(event.detail.column + "=" + event.detail.value + ":" + event.detail.source) } });` });
    await page.locator('.cx-row[data-cx-id="a2"]').tap();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toHaveClass(/cx-edit-form/);
    await drawer.getByRole("checkbox", { name: "Edit Insured" }).tap();
    await drawer.getByRole("button", { name: "Save" }).tap();
    await expect(drawer).toBeHidden();
    expect(await page.evaluate(() => events)).toEqual(["insured=false:form"]);
    // Cancel closes the form without applying anything.
    await page.locator('.cx-row[data-cx-id="a3"]').tap();
    await drawer.getByRole("textbox", { name: "Edit Name" }).fill("Not kept");
    await drawer.getByRole("button", { name: "Cancel" }).tap();
    await expect(drawer).toBeHidden();
    expect(await page.evaluate(`${grid}.getChanges().map(change => change.id)`)).toEqual(["a2"]);
  });
});
