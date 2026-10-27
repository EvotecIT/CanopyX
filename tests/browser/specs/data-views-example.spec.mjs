import { test, expect } from "@playwright/test";
import { exampleUrl } from "./support.mjs";

for (const [width, theme] of [[1440, "light"], [390, "dark"]]) {
  test(`the static comparison stays script-free and fits its email page (${theme}, ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(exampleUrl("dataset-compare-static" + (theme === "dark" ? "-dark" : "") + ".html"));
    await expect(page.locator("script")).toHaveCount(0);
    await expect(page.getByRole("table")).toContainText("24 → 32");
    await expect(page.getByRole("columnheader", { name: "Units", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader")).toHaveText(["Item", "Change", "Location", "Stage", "Units"]);
    const table = page.getByRole("table"), summary = page.getByRole("group", { name: "Dataset comparison", exact: true });
    await expect(summary).toContainText("1 Added");
    await expect(page.locator("body")).toContainText("Units: 1 changed cell");
    expect(await page.locator("body").innerText()).not.toMatch(/0 changed cell|1 changed cells/);
    expect(await summary.evaluate(element => new Set([...element.children].map(child => Math.round(child.getBoundingClientRect().top))).size)).toBe(1);
    const numeric = table.getByRole("row").filter({ hasText: "Atlas" }).getByRole("cell").last();
    const tops = await numeric.locator("del,ins").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
    expect(Math.abs(tops[0] - tops[1])).toBeLessThan(1);
    expect(await page.locator("body").evaluate(body => body.firstElementChild.tagName)).toBe("H2");
    expect(await page.getByRole("heading", { name: "Inventory changes" }).evaluate(heading => getComputedStyle(heading).color))
      .toBe(await table.evaluate(table => getComputedStyle(table).color));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (theme === "dark") expect(await page.locator("body").evaluate(body => getComputedStyle(body).backgroundColor)).toBe("rgb(22, 24, 28)");
  });

  test(`the generated host previews and applies its inventory intent (${theme}, ${width})`, async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(exampleUrl("data-views" + (theme === "dark" ? "-dark" : "") + ".html"));
    await page.evaluate(() => Promise.all([...document.querySelectorAll("[data-canopyx-host]")].map(host => host.canopyx.ready)));
    await page.getByRole("button", { name: "Preview: active items by location", exact: true }).click();
    const preview = page.getByRole("region", { name: "Proposed changes", exact: true });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Show only Stage: Active");
    await expect(preview).toContainText("Group rows by Location");
    expect(await page.evaluate(() => [...document.querySelectorAll("[data-canopyx-host]")]
      .find(host => host.canopyx.view.id === "inventory-intent").canopyx.getQuery().filters)).toEqual([]);
    await page.emulateMedia({ media: "print" });
    await expect(preview).toBeHidden();
    await expect(page.getByRole("switch", { name: "Changed only" })).toBeHidden();
    await expect(page.locator(".cx-compare-summary")).toBeVisible();
    await page.emulateMedia({ media: null });
    await preview.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(preview).toHaveCount(0);
    await expect(page.locator(".cx-sr-only[role=status]")).toHaveText("View changes applied.");
    const query = await page.evaluate(() => [...document.querySelectorAll("[data-canopyx-host]")]
      .find(host => host.canopyx.view.id === "inventory-intent").canopyx.getQuery());
    expect(query.filters).toEqual([{ column: "stage", operator: "eq", values: ["Active"] }]);
    expect(query.groupBy).toEqual([{ column: "location", direction: "asc" }]);
    expect(errors).toEqual([]);
  });
}
