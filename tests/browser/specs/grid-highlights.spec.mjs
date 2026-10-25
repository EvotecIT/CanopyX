import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { viewPage, nextFrames } from "./support.mjs";

async function open(page, reporting = false, grouped = false) {
  const view = { protocol: "canopyx/2", type: "grid", id: "highlights", label: "Highlighted records", rowHeight: "auto", pageSize: 100, rowAccents: true,
    selection: "multiple", search: false, columns: [{ id: "status", title: "Status", kind: "text", width: 240 },
      { id: "score", title: "Score", kind: "number", width: 100 }, { id: "flag", title: "Flag", kind: "text", width: 120 },
      { id: "date", title: "Date", kind: "datetime", width: 240 }], source: { kind: "inline" },
    rows: Array.from({ length: 400 }, (_, i) => ({ id: "r" + String(i).padStart(3, "0"), cells: { status: i === 0 ? { value: "FaIlEd", text: "Passed display", tone: "info" } : "Passed",
      score: i === 0 ? 5 : 1, flag: i === 0, date: "2026-01-01T00:00:00Z" }, ...(i === 0 ? { tone: "info", className: "host-row" } : {}) })),
    highlightRules: [{ column: "status", operator: "eq", values: ["failed"], tone: "danger", className: "critical" },
      { column: "status", operator: "contains", values: ["fail"], tone: "success", className: "later" },
      { column: "score", operator: "ge", values: [5], target: "cell", tone: "warning", className: "high-score" },
      { column: "score", operator: "gt", values: [3], target: "cell", className: "later-cell" },
      { column: "flag", operator: "in", values: [true], target: "cell", tone: "success" },
      { column: "date", operator: "lt", values: ["2026-02-01T00:00:00+01:00"], target: "cell", className: "old-date" }] };
  if (reporting) view.reporting = { presenters: { status: { kind: "icon", glyph: "●" } } };
  if (grouped) { view.columns[0].sortable = true; view.reporting = { grouping: { column: "status", direction: "asc" } }; }
  await page.route("http://canopyx.test/highlights", route => route.fulfill({ contentType: "text/html", body: viewPage(view)
    .replace('<body class="cx-page">', '<body class="cx-page"><main><h1>Highlights</h1>').replace("</body>", "</main></body>") }));
  await page.goto("http://canopyx.test/highlights"); await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.ready); await nextFrames(page);
}

test("raw rules win in order per target, preserve host classes, and use the existing tones", async ({ page }) => {
  await open(page);
  const row = page.locator('[data-cx-id="r000"]');
  await expect(row).toHaveClass(/host-row critical cx-tone-danger/); await expect(row).not.toHaveClass(/later/);
  await expect(row.locator('.cx-cell').nth(1)).toHaveClass(/high-score cx-tone-warning|cx-tone-warning high-score/);
  await expect(row.locator('.cx-cell').nth(1)).not.toHaveClass(/later-cell/);
  await expect(row.locator('.cx-cell').nth(2)).toHaveClass(/cx-tone-success/);
  await expect(row.locator('.cx-cell').nth(3)).toHaveClass(/old-date/);
  await expect(row).toHaveCSS("color", "rgb(22, 24, 28)");
  expect(await row.locator('.cx-cell').first().evaluate(cell => getComputedStyle(cell,'::after').backgroundColor)).toBe("rgb(184, 41, 42)");
  expect(await row.locator('.cx-cell').nth(1).evaluate(cell => getComputedStyle(cell).color)).toBe("rgb(140, 92, 5)");
  const exported = await page.evaluate(async () => { const api = document.querySelector('[data-canopyx-host]').canopyx;
    const iterator = api.prepareExport({ scope: "all", values: "raw" }).rows()[Symbol.asyncIterator](); return (await iterator.next()).value; });
  expect(exported.cells.status).toMatchObject({ value: "FaIlEd", text: "Passed display" });
  expect(exported.cells.score.value).toBe(5);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // Host roles override the built-in fallback at the point where a highlight is painted.
  await row.evaluate(element => {
    element.style.setProperty("--hfx-color-status-bad-fg", "rgb(160, 20, 30)");
    element.style.setProperty("--hfx-color-status-warn-fg", "rgb(100, 60, 0)");
  });
  expect(await row.locator('.cx-cell').first().evaluate(cell => getComputedStyle(cell, '::after').backgroundColor)).toBe("rgb(160, 20, 30)");
  await expect(row.locator('.cx-cell').nth(1)).toHaveCSS("color", "rgb(100, 60, 0)");
});

test("row and cell highlights clear after recycling, including host presenter cells", async ({ page }) => {
  await open(page, true);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.scrollToRow(300)); await nextFrames(page);
  const row = page.locator('[data-cx-id="r300"]');
  await expect(row).not.toHaveClass(/host-row|critical|cx-tone-danger/);
  await expect(row).not.toHaveAttribute("data-cx-tone");
  await expect(row.locator('.cx-cell').nth(1)).not.toHaveClass(/high-score|cx-tone-warning/);
  await expect(row.locator('.cx-cell').nth(3)).toHaveClass(/old-date/);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.scrollToRow(0)); await nextFrames(page);
  await expect(page.locator('[data-cx-id="r000"]')).toHaveClass(/critical/);
  await expect(page.locator('[data-cx-id="r000"] .cx-presenter-icon')).toHaveText("●");
});

test("invalid decorations and rules fail at the same typed filter boundary", async ({ page }) => {
  await open(page);
  const rejected = await page.evaluate(() => {
    const base = document.querySelector('[data-canopyx-host]').canopyx.view;
    return [{ column: "missing", operator: "eq", values: ["x"], tone: "danger" },
      { column: "score", operator: "eq", values: ["5"], tone: "warning" },
      { column: "status", operator: "eq", values: [], tone: "danger" },
      { column: "status", operator: ["eq"], values: ["Failed"], tone: "danger" },
      { column: "status", operator: "isNull", values: [], className: "bad\nclass" },
      { column: "status", operator: "isNull", values: [] }].map(rule => {
        try { CanopyX.createDataGrid(document.createElement("div"), { view: { ...base, highlightRules: [rule] } }); return false; }
        catch (_) { return true; }
      });
  });
  expect(rejected).toEqual([true, true, true, true, true, true]);
});

test("recycled group headings retain their own tone and collapse behavior", async ({ page }) => {
  await open(page, false, true);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.scrollToRow(300)); await nextFrames(page);
  await page.evaluate(() => document.querySelector('[data-canopyx-host]').canopyx.scrollToRow(0)); await nextFrames(page);
  expect(await page.locator('.cx-grid-group[data-cx-tone]').count()).toBe(0);
  expect(await page.locator('.cx-grid-group.critical').count()).toBe(0);
  await page.locator('.cx-grid-group-toggle').first().click();
  await expect(page.locator('.cx-grid-group-toggle').first()).toHaveAttribute("aria-expanded", "false");
});
