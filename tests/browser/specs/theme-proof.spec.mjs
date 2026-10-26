// The theme proof page: shared controls, a grid and a tree under each HtmlForgeX host palette, in light and dark.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { repo, exampleUrl } from "./support.mjs";

const hostCss = fs.readFileSync(path.join(repo, "tests/fixtures/hfx-role-host.css"), "utf8");

/** Serves the generated page with the host stylesheet in front of the runtime, as an HtmlForgeX page would. */
async function openThemeProof(page, style, mode) {
  await page.addInitScript(css => {
    const sheet = new CSSStyleSheet(); sheet.replaceSync(css);
    document.adoptedStyleSheets = [sheet, ...document.adoptedStyleSheets]; addEventListener("DOMContentLoaded", () => document.documentElement.dataset.proofHost = "true", { capture: true, once: true });
  }, hostCss);
  await page.goto(exampleUrl("theme-proof.html") + `?style=${style}&mode=${mode}`);
  await page.waitForSelector(".cx-data-grid[data-cx-ready]");
  await page.waitForSelector(".cx-tree-tools[data-cx-ready]");
}

const surfaces = { evotec: ["rgb(255, 255, 255)", "rgb(22, 24, 28)"], neutral: ["rgb(255, 255, 255)", "rgb(24, 24, 24)"],
  slate: ["rgb(255, 255, 255)", "rgb(20, 27, 38)"], warm: ["rgb(255, 253, 249)", "rgb(28, 24, 20)"], contrast: ["rgb(255, 255, 255)", "rgb(10, 10, 10)"] };

for (const style of Object.keys(surfaces)) for (const mode of ["light", "dark"]) {
  test(`the theme proof follows the ${style} ${mode} host palette in controls and views`, async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openThemeProof(page, style, mode);
    const surface = surfaces[style][mode === "dark" ? 1 : 0];
    for (const id of [".cx-data-grid", ".cx-tree-tools"]) await expect(page.locator(id)).toHaveCSS("background-color", surface);
    // The shared primary button and the grid's own toolbar button both resolve from the host's roles.
    const accent = await page.evaluate(() => {
      const probe = document.createElement("i"); probe.style.color = "var(--hfx-color-accent)"; document.body.append(probe);
      const value = getComputedStyle(probe).color; probe.remove(); return value;
    });
    await expect(page.locator('#controls .cx-btn[data-variant="primary"]').first()).toHaveCSS("background-color", accent);
    const control = await page.locator("#controls .cx-btn:not([data-variant])").first().evaluate(element => getComputedStyle(element).blockSize);
    expect(await page.locator(".cx-data-grid").getByRole("button", { name: "Filters" }).first()
      .evaluate(element => getComputedStyle(element).blockSize)).toBe(control);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("the theme proof reads correctly without a host stylesheet", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(exampleUrl("theme-proof.html") + "?mode=dark");
  await page.waitForSelector(".cx-data-grid[data-cx-ready]");
  await expect(page.locator("#proof-style")).toBeHidden();
  const body = await page.locator("body").evaluate(element => getComputedStyle(element).backgroundColor);
  await page.getByRole("combobox", { name: "Mode" }).selectOption("light");
  await page.waitForSelector(".cx-data-grid[data-cx-ready]");
  await expect.poll(() => page.locator("body").evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(body);
  await page.getByRole("button", { name: "Month" }).click();
  await expect(page.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});
