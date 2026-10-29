import { expect, test } from "@playwright/test";
import { examples, settleGrid, openGridControl } from "./support.mjs";
import { serveExamples } from "../tools/example-server.mjs";

let server;
test.beforeAll(async () => { server = await serveExamples(examples); });
test.afterAll(async () => { await server?.close(); });

for (const width of [1440, 390]) test(`header selection matches row checkbox geometry at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(server.url + `office-export${width === 390 ? "-dark" : ""}.html`);
  await page.waitForSelector("[data-cx-ready]"); await settleGrid(page);
  const header = page.locator(".cx-header-check"), row = page.locator(".cx-grid-row-select:not(.cx-grid-group-select)").first();
  const actual = await header.boundingBox(), reference = await row.boundingBox();
  expect(actual.width).toBeCloseTo(reference.width, 0);
  expect(actual.height).toBeCloseTo(reference.height, 0);
  expect(actual.x).toBeCloseTo(reference.x, 0);
  const positions = await page.locator(".cx-grid-row-select:not(.cx-grid-group-select)").evaluateAll(inputs => inputs
    .filter(input => input.getClientRects().length).map(input => input.getBoundingClientRect().left));
  for (const left of positions) expect(left).toBeCloseTo(actual.x, 0);
  expect(await row.evaluate(element => getComputedStyle(element).appearance)).toBe("none");
  await header.click();
  await expect(page.locator(".cx-header-selection")).toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "Clear selection", exact: true })).toBeDisabled();
  await header.press("Escape");
  await expect(header).toBeFocused();
});

test("phone overflow entries occupy separate rows and Print appears only in Export", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(server.url + "office-export-dark.html");
  await page.waitForSelector("[data-cx-ready]"); await settleGrid(page);
  await openGridControl(page, "export");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toHaveCount(1);
  const views = await page.locator(".cx-grid-views > summary").boundingBox();
  const exported = await page.locator(".cx-grid-export > summary").boundingBox();
  expect(views.x).toBeCloseTo(exported.x, 0);
  expect(exported.y).toBeGreaterThanOrEqual(views.y + views.height);
});
