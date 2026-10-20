import { test, expect } from "@playwright/test";
import { serveGrid, cell } from "./editing-support.mjs";
import { mountContract as mountFlow } from "./flow-contract-support.mjs";

for (const [kind, failure, message] of [["Error", "new Error('Lookup unavailable')", "Lookup unavailable"], ["text", "'Lookup offline'", "Lookup offline"], ["null", "null", "null"]])
test(`a synchronous ${kind} host lookup failure is shown without an uncaught exception`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await serveGrid(page, { script: `CanopyX.configure('assets',{editing:{lookups:{owner:()=>{throw ${failure};}}}});` });
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.beginEdit("a0", "owner"));
  await cell(page, "a0", 7).getByRole("combobox").fill("Al");
  await expect(page.locator(".cx-editor-note")).toHaveText(message);
  expect(errors).toEqual([]);
});

test("a flow lookup closes on Tab and still accepts pointer selections", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await mountFlow(page, [
    { id: "owner", type: "lookup", label: "Owner", options: [{ value: "a", label: "Alex" }, { value: "b", label: "Blair" }] },
    { id: "note", type: "text", label: "Note" }
  ]);
  const input = page.getByRole("combobox", { name: "Owner" });
  await input.fill("Bl");
  await expect(page.getByRole("option", { name: "Blair", exact: true })).toBeVisible();
  await input.press("Tab");
  await expect(input).not.toBeFocused();
  await expect(page.locator(".cx-editor-list")).toBeHidden();
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await input.fill("Bl");
  await page.getByRole("option", { name: "Blair", exact: true }).click();
  await expect(input).toHaveValue("Blair");
  expect(await page.evaluate(() => window.__api.getValues().owner)).toBe("b");
  await expect(page.locator(".cx-editor-list")).toBeHidden();
  expect(errors).toEqual([]);
});

test("leaving a lookup aborts its pending host request and a late result stays closed", async ({ page }) => {
  await serveGrid(page, { script: "CanopyX.configure('assets',{editing:{lookups:{owner:request=>new Promise(resolve=>{window.__release=resolve;window.__signal=request.signal;})}}});" });
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.beginEdit("a0", "owner"));
  const input = cell(page, "a0", 7).getByRole("combobox");
  await input.fill("Al");
  await page.waitForFunction(() => !!window.__release);
  await input.blur();
  expect(await page.evaluate(() => window.__signal.aborted)).toBe(true);
  await page.evaluate(async () => {
    window.__release([{ value: "Alex", label: "Alex" }]);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  await expect(page.locator(".cx-editor-list")).toBeHidden();
});
