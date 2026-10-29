import { expect, test } from "@playwright/test";
import { examples, nextFrames, settleOverlayMotion } from "./support.mjs";
import { serveExamples } from "../tools/example-server.mjs";

let server;
test.beforeAll(async () => { server = await serveExamples(examples); });
test.afterAll(async () => { await server?.close(); });

for (const surface of ["board", "data-views"]) test(`record section headings align with their fields in ${surface}`, async ({ page }) => {
  await page.goto(server.url + surface + "-dark.html");
  await page.waitForSelector("[data-cx-ready]"); await page.evaluate(() => document.fonts.ready); await nextFrames(page);
  if (surface === "board") await page.locator("[data-cx-board-record]").first().getByRole("button").first().click();
  else { await page.locator(".cx-row").filter({ hasText: "Atlas" }).first().click(); await page.keyboard.press("Enter"); }
  const drawer = page.locator(".cx-drawer:visible"), heading = drawer.locator(".cx-record-toggle").first();
  await expect(heading).toBeVisible();
  await settleOverlayMotion(drawer);
  const left = await heading.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element.querySelector(".cx-record-btn-label"));
    return range.getBoundingClientRect().left;
  });
  const field = await drawer.locator(".cx-record-section-b dt").first().boundingBox();
  expect(Math.abs(left - field.x)).toBeLessThanOrEqual(1);
  await expect(heading).toHaveAttribute("aria-expanded", "true");
  await heading.click(); await expect(heading).toHaveAttribute("aria-expanded", "false");
  await heading.click(); await expect(heading).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape"); await expect(drawer).toHaveCount(0);
});
