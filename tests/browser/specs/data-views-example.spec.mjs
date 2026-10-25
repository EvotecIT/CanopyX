import { test, expect } from "@playwright/test";
import { exampleUrl } from "./support.mjs";

for (const [width, theme] of [[1440, "light"], [390, "dark"]]) {
  test(`the static comparison stays script-free and fits its email page (${theme}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(exampleUrl("dataset-compare-static" + (theme === "dark" ? "-dark" : "") + ".html"));
    await expect(page.locator("script")).toHaveCount(0);
    await expect(page.getByRole("table")).toContainText("Before: 24 → After: 32");
    await expect(page.getByRole("columnheader", { name: "Units · 1", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (theme === "dark") expect(await page.locator("body").evaluate(body => getComputedStyle(body).backgroundColor)).toBe("rgb(22, 24, 28)");
  });

  test(`the generated host previews and applies its inventory intent (${theme}, ${width})`, async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(exampleUrl("data-views" + (theme === "dark" ? "-dark" : "") + ".html"));
    await page.evaluate(() => Promise.all([...document.querySelectorAll("[data-canopyx-host]")].map(host => host.canopyx.ready)));
    await page.getByRole("button", { name: "Preview: active items by location", exact: true }).click();
    const preview = page.getByRole("region", { name: "Preview view changes", exact: true });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Stage = Active");
    await expect(preview).toContainText("Group by: Location");
    expect(await page.evaluate(() => [...document.querySelectorAll("[data-canopyx-host]")]
      .find(host => host.canopyx.view.id === "inventory-intent").canopyx.getQuery().filters)).toEqual([]);
    await page.emulateMedia({ media: "print" });
    await expect(preview).toBeHidden();
    await expect(page.getByRole("switch", { name: "Only changes" })).toBeHidden();
    await expect(page.locator(".cx-compare-summary")).toBeVisible();
    await page.emulateMedia({ media: null });
    await preview.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(preview.getByRole("status")).toHaveText("View changes applied.");
    const query = await page.evaluate(() => [...document.querySelectorAll("[data-canopyx-host]")]
      .find(host => host.canopyx.view.id === "inventory-intent").canopyx.getQuery());
    expect(query.filters).toEqual([{ column: "stage", operator: "eq", values: ["Active"] }]);
    expect(query.groupBy).toEqual([{ column: "location", direction: "asc" }]);
    expect(errors).toEqual([]);
  });
}
