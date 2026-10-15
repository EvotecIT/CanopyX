// The editing.html example: an asset register with every editor type, checks, undo and a batch save to a mock service.
// Set CANOPYX_EVIDENCE to a folder to keep screenshots of each state.
import { test, expect } from "@playwright/test";
import path from "node:path";
import { openExample } from "./support.mjs";

const evidence = process.env.CANOPYX_EVIDENCE;
const shot = (page, name) => evidence ? page.screenshot({ path: path.join(evidence, name + ".png") }) : Promise.resolve();
const grid = "document.querySelector('[data-canopyx-host]').canopyx";
const cell = (page, id, column) => page.locator('.cx-row[data-cx-id="' + id + '"] .cx-cell[aria-colindex="' + column + '"]');

for (const [width, theme] of [[1440, "light"], [1440, "dark"]]) {
  test(`the asset register edits, checks, undoes and saves through the mock service (${theme}, ${width})`, async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await openExample(page, theme === "dark" ? "editing-dark.html" : "editing.html");
    await page.evaluate(`${grid}.ready`);
    const name = cell(page, "asset-001", 2), cost = cell(page, "asset-002", 4);
    // A refused value keeps its editor open with the message beside it.
    await cost.click(); await page.keyboard.press("F2");
    await cost.locator("input").fill("-12");
    await page.keyboard.press("Enter");
    await expect(page.locator(".cx-edit-tip")).toHaveText("Cost (EUR) must be at least 0.");
    await shot(page, `editing-${theme}-${width}-refused`);
    await cost.locator("input").fill("2450,5".replace(",", "."));
    await page.keyboard.press("Enter");
    // The lookup suggests owners from the register as the reader types.
    const owner = cell(page, "asset-004", 9);
    await owner.click(); await page.keyboard.press("Enter");
    await owner.getByRole("combobox").fill("a");
    await expect(page.getByRole("listbox", { name: "Owner" })).toBeVisible();
    await shot(page, `editing-${theme}-${width}-lookup`);
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
    // The service will refuse an expensive purchase, and asset 003 changes behind the reader's back.
    await page.evaluate(`${grid}.setCellValue("asset-006", "cost", 72000)`);
    await page.evaluate(`${grid}.setCellValue("asset-003", "status", "In use")`);
    await page.evaluate(`${grid}.setCellValue("asset-008", "insured", true)`);
    // A name another asset has fails the page's asynchronous check; the cell is marked and describes it.
    await name.click(); await page.keyboard.press("F2");
    await name.locator("input").fill("Server 05");
    await page.keyboard.press("Enter");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await name.click();
    await expect(page.locator(".cx-edit-tip")).toHaveText("Another asset already has this name.");
    await expect(page.locator(".cx-editbar-text")).toHaveText("Unsaved changes: 6 · Errors: 1");
    await shot(page, `editing-${theme}-${width}-changes`);
    // Undo takes the invalid name back; Save sends the rest in one gridCommit.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(name).not.toHaveAttribute("aria-invalid", "true");
    await page.locator(".cx-editbar").getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#register-log")).toContainText("Mock service answered at revision r2: 3 saved, 2 not saved.");
    await expect(page.locator('.cx-row[data-cx-id="asset-003"]')).toHaveClass(/cx-row-invalid/);
    await expect(cell(page, "asset-006", 4)).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator(".cx-editbar-text")).toHaveText("Unsaved changes: 2 · Errors: 2");
    await cell(page, "asset-006", 4).click();
    await expect(page.locator(".cx-edit-tip")).toHaveText("Purchases above 50,000 need approval.");
    await shot(page, `editing-${theme}-${width}-saved`);
    expect(errors).toEqual([]);
  });
}

for (const theme of ["light", "dark"]) {
  test(`on a phone the asset register edits in the drawer form (${theme}, 390)`, async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await openExample(page, theme === "dark" ? "editing-dark.html" : "editing.html");
    await page.evaluate(`${grid}.ready`);
    await shot(page, `editing-${theme}-390-list`);
    await page.locator('.cx-row[data-cx-id="asset-001"]').click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toHaveClass(/cx-edit-form/);
    await drawer.getByRole("textbox", { name: "Edit Asset tag" }).fill("bad");
    await drawer.getByRole("textbox", { name: "Edit Name" }).fill("");
    await drawer.getByRole("button", { name: "Save" }).click();
    await expect(drawer.getByRole("alert")).toHaveText("Errors: 2");
    await expect(drawer.getByText("Use two capital letters, a hyphen and four digits, like AS-1042.")).toBeVisible();
    await shot(page, `editing-${theme}-390-form-errors`);
    await drawer.getByRole("textbox", { name: "Edit Asset tag" }).fill("AS-2001");
    await drawer.getByRole("textbox", { name: "Edit Name" }).fill("Monitor 02 (spare)");
    await drawer.getByRole("button", { name: "Save" }).click();
    await expect(drawer).toBeHidden();
    await expect(page.locator(".cx-editbar-text")).toHaveText("Unsaved changes: 1");
    await shot(page, `editing-${theme}-390-after-form`);
    expect(errors).toEqual([]);
  });
}
