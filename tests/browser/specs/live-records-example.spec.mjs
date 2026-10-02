import { expect, test } from "@playwright/test";
import { openExample } from "./support.mjs";

test("the generated host sorts records beyond the first inline page", async ({ page }) => {
  await openExample(page, "live-records.html");
  const value = page.getByRole("columnheader", { name: "Value", exact: true });
  await value.getByRole("button").click();
  await value.getByRole("button").click();
  await expect(value).toHaveAttribute("aria-sort", "descending");
  const records = page.locator('.cx-row[data-cx-id^="record-1-"]');
  await expect(records).toHaveCount(4);
  expect(await records.evaluateAll(rows => rows.map(row => row.getAttribute("data-cx-id"))))
    .toEqual(["record-1-8", "record-1-7", "record-1-6", "record-1-5"]);
});

test("the generated host reloads records and restores a saved selection and layout", async ({ page }) => {
  await openExample(page, "live-records.html");
  const record = page.locator('[data-cx-id="record-1-1"]');
  await record.click();
  await page.evaluate(() => {
    const api = document.querySelector('[data-canopyx-host]').canopyx;
    api.setColumnWidth("name", 420); api.setColumnVisible("value", false);
  });
  await page.getByRole("button", { name: "Save view", exact: true }).click();
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await page.evaluate(() => {
    const api = document.querySelector('[data-canopyx-host]').canopyx;
    api.setColumnWidth("name", 300); api.setColumnVisible("value", true);
  });
  await page.getByRole("button", { name: "Reload records", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Record snapshot 2 loaded." })).toBeVisible();
  await expect(record).toContainText("111");
  await page.getByRole("button", { name: "Restore view", exact: true }).click();
  await expect(record).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#record-selection")).toHaveText("Selected: Record 1.1");
  const state = await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.getState());
  expect(state.columns[0].width).toBe(420); expect(state.columns[1].hidden).toBe(true);
  expect(state.expanded).toContainEqual(["group-1"]);
});
