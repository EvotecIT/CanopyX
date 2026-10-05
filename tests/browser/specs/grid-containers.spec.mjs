import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { exampleUrl, nextFrames } from "./support.mjs";

async function open(page, name) {
  await page.goto(exampleUrl(name));
  await page.evaluate(() => Promise.all([...document.querySelectorAll("[data-canopyx-host]")].map(host => host.canopyx.ready)));
  await nextFrames(page);
}

test("hidden tabs, accordion and details defer row rendering until their first size", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await open(page, "contained-grids.html");
  await expect(page.locator(".cx-canvas .cx-row")).toHaveCount(0);
  for (const [selector, opener] of [["#records-panel", "#records-tab"], ["#accordion-panel", "#accordion-toggle"], ["#record-details", "#record-details > summary"]]) {
    await page.locator(opener).click();
    const container = page.locator(selector);
    await expect(container.locator('.cx-row[data-cx-id="record-0"]')).toBeVisible();
    const width = await container.locator(".cx-hrow").evaluate(element => element.offsetWidth);
    await container.evaluate(element => element.style.width = "320px"); await nextFrames(page);
    await expect.poll(() => container.locator(".cx-hrow").evaluate(element => element.offsetWidth)).toBeLessThan(width);
    await container.evaluate(element => element.style.width = "");
  }
  expect(errors).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a hidden restored grid keeps its requested scroll position through reveal and repeated resize", async ({ page }) => {
  await open(page, "contained-grids-dark.html");
  await page.locator("#records-panel [data-canopyx-host]").evaluate(async host => {
    const state = host.canopyx.getState(); state.scrollTop = 2800;
    await host.canopyx.setState(state);
  });
  await page.locator("#records-tab").click();
  const grid = page.locator("#records-panel .cx-grid");
  await expect.poll(() => grid.evaluate(element => element.scrollTop)).toBe(2800);
  await page.locator("#intro-tab").click(); await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#records-tab").click();
  await expect.poll(() => grid.evaluate(element => element.scrollTop)).toBe(2800);
  const index = await page.locator('#records-panel script.cx-config').evaluate(script => {
    const view = JSON.parse(script.textContent); return Math.floor(2800 / view.rowHeight) + 2;
  });
  await expect(page.locator(`#records-panel .cx-row[aria-rowindex="${index}"][data-cx-id]`)).toBeVisible();
});
