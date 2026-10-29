import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { examples, openGridControl, settleGrid } from "./support.mjs";
import { serveExamples } from "../tools/example-server.mjs";
import { inspectFinishQuality } from "../tools/finish-quality.mjs";

let server;
test.beforeAll(async () => { server = await serveExamples(examples); });
test.afterAll(async () => { await server?.close(); });

for (const { width, theme } of [{ width: 1440, theme: "light" }, { width: 390, theme: "dark" }]) {
  test.describe(`N1 review ${width} ${theme}`, () => {
    test.use({ viewport: { width, height: 900 }, colorScheme: theme, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce" });
    for (const state of ["export-menu", "print", "cards", "sticky-header", "card-print"]) test(state, async ({ page }, info) => {
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.clock.setFixedTime(new Date("2026-10-25T15:00:00Z"));
      if (state === "print" || state === "card-print") await page.addInitScript(() => {
        window.print = () => { window.parent.__printedDocument = "<!doctype html>" + document.documentElement.outerHTML; };
      });
      const name = state === "cards" || state === "card-print" ? "template-cards" : state === "sticky-header" ? "sticky-grid" : "office-export";
      await page.goto(server.url + name + (theme === "dark" ? "-dark" : "") + ".html");
      await page.waitForSelector('[data-cx-ready]'); await settleGrid(page);
      if (state === "export-menu") {
        await openGridControl(page, "export");
        await expect(page.getByRole('button', { name: 'Excel workbook (.xlsx)', exact: true })).toBeVisible();
        await expect(page.locator('.cx-grid-export').getByRole('button', { name: 'Print', exact: true })).toBeVisible();
      } else if (state === "print" || state === "card-print") {
        const html = await page.evaluate(async () => {
          await document.querySelector('[data-canopyx-host]').canopyx.print({ scope: "filtered" });
          return window.__printedDocument;
        });
        const file = info.outputPath('print.html'); await fs.writeFile(file, html);
        await info.attach('script-free-print', { path: file, contentType: 'text/html' });
        await page.route(server.url + '__print-review.html', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
        await page.goto(server.url + '__print-review.html'); await page.emulateMedia({ media: 'screen' });
        if (width === 1440 && info.project.name === "chromium") {
          const pdf = info.outputPath(state === "card-print" ? "card-print-pages.pdf" : "print-pages.pdf");
          await page.emulateMedia({ media: "print" });
          if (state === "card-print") expect(await page.locator('.cx-print-cards').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
          await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
          await info.attach("browser-print-pages", { path: pdf, contentType: "application/pdf" });
          await page.emulateMedia({ media: "screen" });
        }
        if (state === "card-print") {
          const cards = page.locator('.cx-print-card'), first = cards.first();
          await expect(cards).toHaveCount(40);
          await expect(first.getByRole('heading')).toHaveText('Item 1');
          await expect(first.locator('.cx-print-card-status')).toHaveText('Needs review');
          await expect(first.locator('dt')).toHaveText(['Owner', 'Team', 'Priority']);
          await expect(first.locator('footer')).toContainText('Due');
          await expect(first).toHaveCSS('break-inside', 'avoid');
          expect(await page.locator('.cx-print-cards').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(width === 390 ? 1 : 3);
          expect(await first.locator('dl').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
        } else {
          await expect(page.locator('tbody tr[data-cx-print-record]')).toHaveCount(60);
          await expect(page.locator('thead th')).toHaveCount(5);
        }
        await expect(page.locator('script')).toHaveCount(0);
      } else if (state === "cards") {
        await expect(page.locator('.cx-card-slot').first()).toHaveText('Item 1');
        await expect(page.locator('.cx-row[data-cx-id="item-000"] .p-pill')).toContainText('Needs review');
      } else {
        await page.locator('.cx-grid').evaluate(grid => window.scrollTo(0, grid.getBoundingClientRect().top + scrollY + 120));
        await expect(page.locator('[data-cx-page-header]')).toBeVisible();
        await expect(page.locator('.cx-head')).toHaveCSS('position', 'fixed');
      }
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
      expect(errors).toEqual([]);
      expect(await page.evaluate(inspectFinishQuality)).toEqual([]);
      const frame = info.outputPath(`${state}-${width}-${theme}.png`);
      await page.screenshot({ path: frame });
      await info.attach('review-frame', { path: frame, contentType: 'image/png' });
    });
  });
}
