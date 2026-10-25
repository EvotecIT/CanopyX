import { test, expect } from "@playwright/test";
import { exampleUrl } from "./support.mjs";

for (const [width, theme] of [[1440, "light"], [390, "dark"]]) {
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
    await preview.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(preview.getByRole("status")).toHaveText("View changes applied.");
    const query = await page.evaluate(() => [...document.querySelectorAll("[data-canopyx-host]")]
      .find(host => host.canopyx.view.id === "inventory-intent").canopyx.getQuery());
    expect(query.filters).toEqual([{ column: "stage", operator: "eq", values: ["Active"] }]);
    expect(query.groupBy).toEqual([{ column: "location", direction: "asc" }]);
    expect(errors).toEqual([]);
  });
}
