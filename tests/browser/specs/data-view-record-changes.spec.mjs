import { test, expect } from "@playwright/test";
import { api, definition, open, drawer } from "./record-panel-fixtures.mjs";

for (const timeline of [false, true]) test(`before/after ${timeline ? "timeline" : "diff"} endpoints retain record links and scalar decoration`, async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const view = definition({}, 3), before = { value: "Alex", ref: { id: "c001" }, title: "Previous owner", tone: "warning" },
    after = { value: "Blair", ref: { id: "c002" }, title: "Current owner", tone: "success" };
  const changes = [{ name: "Owner", before, after },
    { name: "Status", before: { value: "Old", title: "Previous status", tone: "warning", badges: [{ text: "Review", tone: "info" }] }, after: "New" }];
  const field = timeline ? "history" : "changes";
  view.rows[0].fields[field] = timeline ? { events: [{ time: "2026-10-25T12:00:00Z", summary: "Updated", changes }] } : { changes };
  await open(page, view); await page.evaluate(`${api}.openDetails('c000')`);
  await drawer(page).getByRole("tab", { name: "History", exact: true }).click();
  const diff = drawer(page).locator(`[data-cx-field="${field}"] .cx-record-diff`);
  const oldLink = diff.getByRole("button", { name: "Alex", exact: true }), newLink = diff.getByRole("button", { name: "Blair", exact: true });
  await expect(oldLink).toHaveAttribute("title", "Previous owner");
  await expect(oldLink).toHaveClass(/cx-tone-warning/);
  await expect(newLink).toHaveAttribute("title", "Current owner");
  await expect(diff.locator('[title="Previous status"]')).toHaveText("Old");
  await expect(diff.locator('[title="Previous status"]')).toHaveClass(/cx-tone-warning/);
  await expect(diff).toContainText("Review");
  await oldLink.click();
  await expect(drawer(page)).toHaveAttribute("data-cx-record", "c001");
  await drawer(page).getByRole("button", { name: "Back to host0.example.test", exact: true }).click();
  await expect(drawer(page)).toHaveAttribute("data-cx-record", "c000");
  await drawer(page).getByRole("tab", { name: "History", exact: true }).click();
  await newLink.click();
  await expect(drawer(page)).toHaveAttribute("data-cx-record", "c002");
  expect(errors).toEqual([]);
});
