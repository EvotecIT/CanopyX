import { expect, test } from "@playwright/test";
import { examples, settleGrid } from "./support.mjs";
import { serveExamples } from "../tools/example-server.mjs";

let server;
test.beforeAll(async () => { server = await serveExamples(examples); });
test.afterAll(async () => { await server?.close(); });

for (const width of [1440, 390]) test(`header selection matches row checkbox geometry at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(server.url + `office-export${width === 390 ? "-dark" : ""}.html`);
  await page.waitForSelector("[data-cx-ready]"); await settleGrid(page);
  const header = page.locator(".cx-header-check"), row = page.locator(".cx-grid-row-select").first();
  const actual = await header.boundingBox(), reference = await row.boundingBox();
  expect(actual.width).toBeCloseTo(reference.width, 0);
  expect(actual.height).toBeCloseTo(reference.height, 0);
  await header.click();
  await expect(page.locator(".cx-header-selection")).toHaveAttribute("open", "");
  await header.press("Escape");
  await expect(header).toBeFocused();
});
