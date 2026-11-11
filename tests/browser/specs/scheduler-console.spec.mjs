import fs from "node:fs";
import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";
import { exampleUrl, nextFrames } from "./support.mjs";

// The scheduler console example composes host cards, tabs, three grids, the record panel and a flow drawer. These checks
// cover what the page promises its reader: a card filters the jobs grid through the linked-views API, a row action
// round-trips through the page's mock scheduler, a row opens its record with sections, and a history row expands its log.
// #instant makes the mock scheduler answer at once.
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function open(page, name = "scheduler-console.html") {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(exampleUrl(name) + "#instant");
  await page.waitForSelector("#sc-jobs[data-cx-ready]", { state: "attached" });
  await page.evaluate(() => document.getElementById("sc-jobs").canopyx.ready);
  return errors;
}
const jobRow = (page, id) => page.locator('#sc-jobs [data-cx-id="' + id + '"]');
// The jobs grid scrolls inside its frame; a search brings a job into view as a reader would.
const reveal = (page, name) => page.locator("#sc-jobs").getByRole("searchbox").fill(name);

for (const [width, height] of [[1440, 900], [390, 844]]) {
  for (const theme of ["light", "dark"]) {
    test(`the console has no serious axe findings at ${width} in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const errors = await open(page, theme === "dark" ? "scheduler-console-dark.html" : "scheduler-console.html");
      await page.evaluate(() => document.fonts.ready);
      await nextFrames(page);
      await page.addScriptTag({ content: AXE });
      const violations = await page.evaluate(tags => axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] })
        .then(result => result.violations.filter(item => item.impact === "serious" || item.impact === "critical").map(item => item.id + ": " + item.nodes[0].target.join(" "))), TAGS);
      expect(violations).toEqual([]);
      // Nothing overflows the page sideways, also on a phone.
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }
}

test("a summary card filters the jobs grid and shows its selected state", async ({ page }) => {
  await open(page);
  const paused = page.locator('[data-sc-card="paused"]');
  await paused.click();
  await expect(paused).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-sc-card="all"]')).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.evaluate(() => document.getElementById("sc-jobs").canopyx.getExternalFilters().map(filter => filter.values.join()))).toEqual(["Paused"]);
  await expect(page.locator("#sc-jobs .cx-row:not(.cx-detail)")).toHaveCount(3);
  // Removing the chip in the grid returns the cards to Total jobs.
  await page.locator("#sc-jobs").getByRole("button", { name: /Remove the filter from Summary/ }).click();
  await expect(page.locator('[data-sc-card="all"]')).toHaveAttribute("aria-pressed", "true");
});

test("a row action is a proposal the page's scheduler answers", async ({ page }) => {
  await open(page);
  const before = Number(await page.locator('[data-sc-count="paused"]').textContent());
  await reveal(page, "Tax rate");
  await jobRow(page, "billing-tax").locator('[data-cx-row-action="pause"]').click();
  await expect(jobRow(page, "billing-tax")).toContainText("Paused");
  await expect(page.locator('[data-sc-count="paused"]')).toHaveText(String(before + 1));
  // A refusal keeps the job as it was and says why.
  await reveal(page, "Partner SFTP");
  await jobRow(page, "int-sftp").locator('[data-cx-row-action="run"]').click();
  await expect(page.locator("#sc-jobs")).toContainText("refused the sign-in");
  await expect(jobRow(page, "int-sftp")).toContainText("Error");
});

test("a job opens in the record drawer with its sections and record navigation", async ({ page }) => {
  await open(page);
  await page.evaluate(() => document.getElementById("sc-jobs").canopyx.openRecord("int-crm"));
  const drawer = page.locator(".cx-drawer[open], dialog.cx-drawer").filter({ hasText: "CRM contacts sync" }).first();
  await expect(drawer).toBeVisible();
  for (const section of ["Recent runs", "Triggers", "Job data"]) await expect(drawer.getByRole("button", { name: section, exact: true })).toBeVisible();
  await expect(drawer.locator(".cx-record-footer")).toContainText("Run now");
  await expect(drawer.getByRole("button", { name: /Next/ }).first()).toBeEnabled();
});

test("a history row expands to show its run log", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: /History/ }).click();
  await page.waitForSelector("#sc-history[data-cx-ready]", { state: "attached" });
  const first = page.locator("#sc-history .cx-row:not(.cx-detail)").first();
  await first.locator("[aria-expanded]").first().click();
  const detail = page.locator("#sc-history .cx-detail-row").first();
  await expect(detail).toContainText("INFO");
  await expect(detail).toContainText(/started on worker-\d/);
  // The summary row reads the whole query, medians and percentiles included.
  await expect(page.locator('#sc-history [data-cx-footer="all"]')).toContainText(/P95: [\d.,]+ s/);
});
