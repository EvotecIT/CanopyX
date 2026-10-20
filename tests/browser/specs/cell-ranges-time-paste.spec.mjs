// Pasted wall times use the editor's millisecond precision and the grid's UTC or local clock.
import { test, expect } from "@playwright/test";
import { budgetView, serveGrid, rowId } from "./column-groups-support.mjs";

test.use({ timezoneId: "Europe/Warsaw" });
test.beforeEach(async ({ page }) => {
  page.pasteErrors = [];
  page.on("pageerror", error => page.pasteErrors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(page.pasteErrors).toEqual([]);
  expect(await page.evaluate(() => errors)).toEqual([]);
});

async function open(page, timeZone) {
  const view = budgetView({ rangeSelection: true, timeZone, columnGroups: [], editing: { drawer: "never" },
    columns: [{ id: "line", title: "Appointment", kind: "text", rowHeader: true },
      { id: "reviewed", title: "Reviewed", kind: "datetime", editable: true, editor: "datetime", priority: "essential" }] }, 10);
  for (const row of view.rows) row.cells = { line: row.cells.line, reviewed: row.cells.reviewed };
  await serveGrid(page, view, { lang: "pl", options: "{ onPaste(detail) { events.push({ cells: detail.cells, refused: detail.refused }); } }" });
}

for (const timeZone of ["utc", "local"]) {
  test(timeZone + " pasted wall times retain fractions through save, reload and the native editor", async ({ page }, testInfo) => {
    await open(page, timeZone);
    const texts = ["2026-03-28T12:34:56.789", "2026-03-29T12:34:56.1", "2026-03-29 12:34:56.12",
      "29.03.2026 12:34:56.789", "2026-03-29T03:30:00.001", "2026-03-29T02:30:00.456+01:00", "2026-03-29T02:30:00.789Z"];
    const expected = timeZone === "utc" ? ["2026-03-28T12:34:56.789Z", "2026-03-29T12:34:56.100Z", "2026-03-29T12:34:56.120Z",
      "2026-03-29T12:34:56.789Z", "2026-03-29T03:30:00.001Z", "2026-03-29T01:30:00.456Z", "2026-03-29T02:30:00.789Z"] :
      ["2026-03-28T11:34:56.789Z", "2026-03-29T10:34:56.100Z", "2026-03-29T10:34:56.120Z",
        "2026-03-29T10:34:56.789Z", "2026-03-29T01:30:00.001Z", "2026-03-29T01:30:00.456Z", "2026-03-29T02:30:00.789Z"];
    const result = await page.evaluate(texts => api.pasteCells(texts.join("\n"), { row: 0, column: "reviewed" }), texts);
    expect(result).toEqual({ applied: texts.length, refused: [], cancelled: false });
    expect(await page.evaluate(() => events[0].cells.map(cell => cell.value))).toEqual(expected);
    expect(await page.evaluate(() => api.getChanges().map(change => [change.id, change.values.reviewed])))
      .toEqual(expected.map((value, index) => [rowId(index), value]));
    expect((await page.evaluate(() => api.commitChanges())).saved).toBe(texts.length);
    await page.evaluate(() => api.reload());
    expect(await page.evaluate(() => api.getChanges())).toEqual([]);
    // Opening the persisted values proves that saving and requerying did not silently drop the fractions.
    // Native controls differ only in whether they retain the trailing zero of 120 milliseconds.
    for (const [row, value] of [[0, "2026-03-28T12:34:56.789"], [2, /^2026-03-29T12:34:56\.120?$/]]) {
      await page.evaluate(id => api.beginEdit(id, "reviewed"), rowId(row));
      await expect(page.locator(".cx-editor")).toHaveValue(value);
      await page.evaluate(() => api.cancelEdit());
    }
    await page.setViewportSize({ width: 390, height: 844 });
    // This test exercises the inline native control; keep its column visible and wait for the phone layout.
    await expect(page.locator("#host")).toHaveClass(/cx-phone/);
    await expect(page.locator('.cx-head [data-cx-column="reviewed"]')).toBeVisible();
    await page.evaluate(() => api.beginEdit("r0000", "reviewed"));
    await expect(page.locator(".cx-editor")).toHaveValue("2026-03-28T12:34:56.789");
    await expect(page.locator(".cx-editor")).toBeInViewport();
    await testInfo.attach(timeZone + "-persisted-phone-editor", { body: await page.screenshot(), contentType: "image/png" });
    await page.evaluate(() => api.cancelEdit());
    expect(await page.evaluate(() => api.getChanges())).toEqual([]);
  });

  test(timeZone + " fractional paste rejects rollover and retains the local DST-gap boundary", async ({ page }) => {
    await open(page, timeZone);
    const invalid = ["2026-02-30T12:34:56.789", "2026-03-29T24:00:00.001", "2026-03-29T12:60:00.123",
      "2026-03-29T12:34:60.123", "2026-03-29T12:34:56.1234", "2026-03-29T12:34:56."];
    const refused = await page.evaluate(texts => api.pasteCells(texts.join("\n"), { row: 0, column: "reviewed" }), invalid);
    expect(refused).toMatchObject({ applied: 0, cancelled: false });
    expect(refused.refused.map(cell => cell.text)).toEqual(invalid);
    expect(await page.evaluate(() => api.getChanges())).toEqual([]);
    const gap = await page.evaluate(() => api.pasteCells("2026-03-29T02:30:00.789", { row: 0, column: "reviewed" }));
    if (timeZone === "local") {
      expect(gap).toMatchObject({ applied: 0, cancelled: false });
      expect(gap.refused).toHaveLength(1);
      expect(await page.evaluate(() => api.getChanges())).toEqual([]);
      await expect(page.locator(".cx-paste-report")).toBeVisible();
    } else {
      expect(gap).toEqual({ applied: 1, refused: [], cancelled: false });
      expect(await page.evaluate(() => api.getChanges()[0].values.reviewed)).toBe("2026-03-29T02:30:00.789Z");
    }
  });
}
