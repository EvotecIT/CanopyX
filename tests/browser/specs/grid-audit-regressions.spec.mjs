import { test, expect } from "@playwright/test";
import { openExample } from "./support.mjs";

test("grouped example row checkbox toggles selection and its visible state", async ({ page }) => {
  await openExample(page, "grouped-grid.html");
  const record = page.locator(".cx-row[data-cx-id]").first(), check = record.locator(".cx-grid-row-select");
  const id = await record.getAttribute("data-cx-id");
  await check.evaluate(input => input.addEventListener("change", () => window.checkboxChanges = (window.checkboxChanges || 0) + 1));
  await check.click();
  await expect(check).toBeChecked();
  await expect(record).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getSelection())).toEqual([id]);
  expect(await page.evaluate(() => window.checkboxChanges)).toBe(1);
  await check.click();
  await expect(check).not.toBeChecked();
  await expect(record).toHaveAttribute("aria-selected", "false");
  await check.focus();
  await check.press("Space");
  await expect(check).toBeChecked();
  await expect(record).toHaveAttribute("aria-selected", "true");
});

test("compact grouped example header filters can be clicked and return focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openExample(page, "grouped-grid.html");
  const filters = page.locator(".cx-grid-header-filter");
  for (let index = 0; index < await filters.count(); index++) {
    const button = filters.nth(index);
    await button.click({ timeout: 4000 });
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const columnFilter=page.locator('.cx-column-filter');
    await expect(columnFilter).toBeVisible();
    await expect(page.locator('.cx-grid-filters')).not.toHaveAttribute('open','');
    await columnFilter.locator('input:visible,select:visible').first().focus();
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
  }
});

test("compact reporting example header filters remain reachable while scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openExample(page, "reporting-grid.html");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setColumnWidth("reference", 64));
  const buttons = page.locator(".cx-grid-header-filter");
  for (let index = 0; index < await buttons.count(); index++) {
    const geometry = await buttons.nth(index).evaluate(button => {
      const box = button.getBoundingClientRect(), cell = button.closest(".cx-hcell").getBoundingClientRect();
      return { left: box.left - cell.left, right: cell.right - box.right };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeGreaterThanOrEqual(0);
    await buttons.nth(index).click({ timeout: 4000 });
    await expect(page.locator('.cx-column-filter')).toBeVisible();
    await page.locator('.cx-column-filter').locator('input:visible,select:visible').first().focus();
    await page.keyboard.press("Escape");
  }
});

test("grouped example recycled checkboxes still toggle the current record", async ({ page }) => {
  await openExample(page, "grouped-grid-continuous.html");
  for (const offset of [70, 100, 10, 0]) {
    await page.evaluate(index => document.querySelector("[data-canopyx-host]").canopyx.scrollToRow(index), offset);
    const visibleId = await page.locator(".cx-row[data-cx-id]").evaluateAll(rows => rows.find(row => {
      const box = row.getBoundingClientRect(), grid = row.closest(".cx-grid"), head = grid.querySelector(".cx-head").getBoundingClientRect();
      return box.top >= head.bottom && box.bottom <= grid.getBoundingClientRect().bottom;
    })?.dataset.cxId);
    const record = page.locator('.cx-row[data-cx-id="' + visibleId + '"]');
    const id = await record.getAttribute("data-cx-id"), check = record.locator(".cx-grid-row-select");
    await check.click();
    await expect(record).toHaveAttribute("aria-selected", "true");
    await expect(check).toBeChecked();
    expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getSelection())).toContain(id);
  }
});
